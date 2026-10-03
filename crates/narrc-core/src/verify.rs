//! The read-back verifier: what the browser *actually* exposes, against what
//! the identity claimed.
//!
//! # Why this exists
//!
//! Everything else in this crate is a claim about data. The generator decides
//! what a machine looks like, the coherence layer keeps the decision
//! self-consistent, and the engine bridge hands it to Camoufox correctly — all
//! of which can be unit-tested without a browser, and all of which can still be
//! wrong about what the browser does with the config. A value that never
//! reaches the page, a key the engine spells differently, a fallback that
//! quietly wins: none of those are visible in the identity, and all of them are
//! visible to any site the profile visits.
//!
//! So this module closes the loop the only way it can be closed. It serves a
//! page on a loopback port, launches the engine at it with the profile's own
//! launch plan, and the page reads back the values a site would read — then
//! posts them to the verifier, which diffs them against the identity that was
//! actually handed to the engine.
//!
//! # The three design choices worth knowing
//!
//! * **The claim side is read out of the plan's environment**, through
//!   [`identity_from_env`], not from the profile. A launch plan is what the
//!   engine receives; a profile is what the user asked for. When they differ —
//!   the coherence layer dropped a conflicting value, say — the plan is the
//!   truth, and diffing against the profile would report the repair as a
//!   mismatch.
//! * **The parameter ids come from the identity.** The page is told which GL
//!   constants to read, so a covered GPU is compared value by value with no
//!   noise; a GPU with *no* recorded table is instead asked for the whole
//!   corpus's id set, which is how the host's real limits get printed next to
//!   the spoofed renderer.
//! * **The probe runs with a window.** Headless Firefox falls back to software
//!   WebGL, and a software renderer's limits say nothing about what the profile
//!   presents to a site with a GPU. A window is the point, so the probe is not
//!   headless and it closes itself when it is done.
//!
//! # What it cannot tell you
//!
//! A match here means the engine exposed what the config asked for. It does not
//! mean the values are *plausible* — that is the corpus's job, and the corpus
//! is recordings. It also says nothing about TLS, HTTP/2, or anything else
//! outside the page's reach.

use std::collections::{BTreeMap, BTreeSet};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use thiserror::Error;

use crate::engine::{identity_from_env, LaunchPlan};
use crate::identity::Identity;
use crate::schema::keys;

/// The probe page, compiled in.
pub const PROBE_PAGE: &str = include_str!("../resources/fingerprint-probe.html");

/// How long a probe run waits for the report.
///
/// A cold profile start is seconds on a warm disk and can be much longer behind
/// a virus scanner, so this is generous: the cost of waiting too long is a slow
/// answer, and the cost of not waiting long enough is a false "the browser
/// never reported".
pub const DEFAULT_PROBE_TIMEOUT: Duration = Duration::from_secs(120);

/// How long the browser is given to close itself before it is killed.
const CLOSE_GRACE: Duration = Duration::from_secs(10);

/// What went wrong on the way to a report.
#[derive(Debug, Error)]
pub enum VerifyError {
    /// No engine binary at the planned path, so nothing can be launched.
    #[error("no engine binary at {program}; install the engine before verifying")]
    NoEngine { program: String },
    /// The loopback listener could not be set up.
    #[error("could not listen on a loopback port: {0}")]
    Listen(#[source] std::io::Error),
    /// The engine could not be started.
    #[error("could not start {program}: {source}")]
    Spawn {
        /// The program that failed to start.
        program: String,
        /// The underlying failure.
        #[source]
        source: std::io::Error,
    },
    /// The browser never posted a report.
    #[error("the browser did not report back within {}s; it either did not start, could not reach the loopback page, or was still starting", seconds)]
    Timeout {
        /// The timeout that elapsed.
        seconds: u64,
    },
    /// The report arrived but was not what the probe page sends.
    #[error("the probe page's report was not valid: {0}")]
    Report(#[source] serde_json::Error),
    /// The profile directory for the probe run could not be prepared.
    #[error("could not prepare the probe profile: {0}")]
    Profile(#[source] std::io::Error),
    /// The launch plan's environment did not reassemble into an identity.
    #[error("the launch plan could not be read back: {0}")]
    Plan(#[from] crate::error::Error),
}

// ------------------------------------------------------------------ observation

/// One WebGL context, as the page read it back.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextObservation {
    /// The context could not be created at all.
    #[serde(default)]
    pub absent: bool,
    /// `getParameter`, keyed by the GL constant id as a string — the same
    /// keying the engine's config uses, so the diff is a plain key join.
    #[serde(default)]
    pub parameters: BTreeMap<String, Value>,
    /// `getSupportedExtensions`, sorted.
    #[serde(default)]
    pub extensions: Vec<String>,
    /// `getShaderPrecisionFormat`, keyed `"<shaderType>,<precisionType>"`.
    #[serde(default)]
    pub precision: BTreeMap<String, Option<PrecisionFormat>>,
    /// `getContextAttributes`.
    #[serde(default)]
    pub context_attributes: Option<Value>,
    /// `UNMASKED_VENDOR_WEBGL`, when the debug extension is available.
    #[serde(default)]
    pub unmasked_vendor: Option<String>,
    /// `UNMASKED_RENDERER_WEBGL`, when the debug extension is available.
    #[serde(default)]
    pub unmasked_renderer: Option<String>,
    /// Anything the page could not read, kept so a partial read is visible.
    #[serde(default)]
    pub errors: Vec<String>,
}

/// A shader precision format, in the engine's own field names.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct PrecisionFormat {
    /// `rangeMin`.
    #[serde(rename = "rangeMin")]
    pub range_min: i64,
    /// `rangeMax`.
    #[serde(rename = "rangeMax")]
    pub range_max: i64,
    /// `precision`.
    pub precision: i64,
}

/// Everything the probe page read.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Observation {
    /// `navigator.*`, keyed by the trailing name.
    #[serde(default)]
    pub navigator: BTreeMap<String, Value>,
    /// `screen.*` plus `devicePixelRatio`.
    #[serde(default)]
    pub screen: BTreeMap<String, Value>,
    /// `window.innerWidth` and friends.
    #[serde(default)]
    pub window: BTreeMap<String, Value>,
    /// `Intl.DateTimeFormat().resolvedOptions()`.
    #[serde(default)]
    pub intl: BTreeMap<String, Value>,
    /// The WebGL1 context.
    #[serde(default)]
    pub webgl1: Option<ContextObservation>,
    /// The WebGL2 context.
    #[serde(default)]
    pub webgl2: Option<ContextObservation>,
}

// ------------------------------------------------------------------ report

/// What the comparison concluded about one property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Verdict {
    /// The browser exposed exactly what the identity claimed.
    Match,
    /// The same value in a different representation — a signed 32-bit reading
    /// of an unsigned limit, or an unspecified `doNotTrack` for `"0"`. The
    /// `note` says which.
    Equivalent,
    /// The browser exposed a different value.
    Mismatch,
    /// The identity claims a value the probe could not read at all.
    Unread,
    /// The browser exposed a value the identity does not claim. With no
    /// recorded table this is the host's own value, which is the leak the
    /// corpus exists to close.
    Unclaimed,
    /// The identity asked for the query to be refused and it was.
    Refused,
}

impl Verdict {
    /// Whether this verdict is a success.
    pub fn is_agreement(self) -> bool {
        matches!(self, Verdict::Match | Verdict::Equivalent | Verdict::Refused)
    }
}

/// One property, its claim, its observation, and the verdict.
#[derive(Debug, Clone, Serialize)]
pub struct Difference {
    /// The identity key, so a mismatch names the field to edit.
    pub property: String,
    /// What the comparison concluded.
    pub verdict: Verdict,
    /// What the identity claimed, when it claimed anything.
    pub expected: Option<Value>,
    /// What the browser exposed, when it exposed anything.
    pub observed: Option<Value>,
    /// A short explanation, when the verdict needs one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// The result of one verification run.
#[derive(Debug, Clone, Serialize)]
pub struct Report {
    /// The engine binary that was launched.
    pub program: String,
    /// How long the run took, in milliseconds.
    pub elapsed_ms: u64,
    /// How many properties were compared.
    pub checked: usize,
    /// How many of them agreed.
    pub agreed: usize,
    /// Every comparison that did not agree, plus the ones that did when the
    /// caller asks for them — see [`Report::differences`].
    pub differences: Vec<Difference>,
    /// The request headers the browser sent for the probe page, which is the
    /// only place the wire-level claims can be observed from inside the run.
    pub headers: BTreeMap<String, String>,
    /// The renderer the page read back through `WEBGL_debug_renderer_info`.
    pub unmasked_renderer: Option<String>,
}

impl Report {
    /// Whether every comparison agreed.
    ///
    /// Not "no differences listed": a report built with `keep_agreements` lists
    /// the agreements too, and a run where everything matched is still clean.
    pub fn is_clean(&self) -> bool {
        self.mismatches().next().is_none()
    }

    /// The mismatches alone, for a UI that wants to lead with the problems.
    pub fn mismatches(&self) -> impl Iterator<Item = &Difference> {
        self.differences
            .iter()
            .filter(|difference| !difference.verdict.is_agreement())
    }
}

// ------------------------------------------------------------------ comparison

/// Collects comparisons and counts them.
struct Comparator {
    checked: usize,
    agreed: usize,
    differences: Vec<Difference>,
    /// Differences that agree are kept only when the caller wants a full
    /// listing; the default report is the problems.
    keep_agreements: bool,
}

impl Comparator {
    fn new(keep_agreements: bool) -> Self {
        Self {
            checked: 0,
            agreed: 0,
            differences: Vec::new(),
            keep_agreements,
        }
    }

    fn push(&mut self, difference: Difference) {
        self.checked += 1;
        if difference.verdict.is_agreement() {
            self.agreed += 1;
        }
        if self.keep_agreements || !difference.verdict.is_agreement() {
            self.differences.push(difference);
        }
    }

    /// Compares one claimed value against one observed value.
    ///
    /// The `note` is attached to whichever verdict needs explaining; for an
    /// equivalence it *is* the explanation.
    fn scalar(
        &mut self,
        property: &str,
        expected: Option<&Value>,
        observed: Option<&Value>,
        note: Option<&str>,
    ) {
        let (verdict, note) = match (expected, observed) {
            // Nothing claimed and nothing observed: not a comparison at all,
            // so it does not count towards `checked`.
            (None, None) => return,
            // Nothing claimed and the browser exposed nothing. This is not a
            // finding: an unset property that reads back as null leaked
            // nothing. (For a WebGL parameter a null reading is different —
            // it means the engine did not apply the value — but that arrives
            // as a claimed value read back as null, below.)
            (None, Some(Value::Null)) => return,
            // Observed but unclaimed. For a scalar this means the identity does
            // not override the property and the browser answered from the host;
            // for a WebGL parameter it is the host's limit, which is exactly
            // the leak the corpus exists to close.
            (None, Some(_)) => (Verdict::Unclaimed, note),
            // Claimed but unreadable. The probe page reads what it can, so this
            // means the browser refused or the context was missing.
            (Some(_), None) => (Verdict::Unread, note),
            (Some(expected), Some(observed)) => {
                if expected == observed {
                    (Verdict::Match, None)
                } else if let Some(explanation) = equivalence(expected, observed) {
                    (Verdict::Equivalent, Some(explanation))
                } else {
                    (Verdict::Mismatch, note)
                }
            }
        };
        self.push(Difference {
            property: property.to_owned(),
            verdict,
            expected: expected.cloned(),
            observed: observed.cloned(),
            note: note.map(str::to_owned),
        });
    }
}

/// Whether two unequal values are the same reading of the same fact.
///
/// Only two cases, both observed in real runs and both documented:
///
/// * **Signed versus unsigned 32-bit.** The corpus records a few limits
///   unsigned (`4294967295`), and WebGL returns them as signed `-1` through
///   `getParameter`. The value is the same bits either way.
/// * **`doNotTrack`.** Firefox reports `null` for the tri-state default and the
///   identity stores `"0"` for it, because the config has no way to express
///   "unspecified".
fn equivalence(expected: &Value, observed: &Value) -> Option<&'static str> {
    if let (Some(expected), Some(observed)) = (as_i128(expected), as_i128(observed)) {
        if expected as i64 == observed as i64
            || expected.rem_euclid(1 << 32) == observed.rem_euclid(1 << 32)
        {
            return Some("the same 32-bit value, recorded unsigned and read back signed");
        }
    }
    if let (Value::String(expected), Value::Null) = (expected, observed) {
        if expected == "0" {
            return Some("an unset doNotTrack is reported as null, which is what \"0\" means");
        }
    }
    None
}

/// An integer reading of a JSON number, widening so the sign comparison above
/// can see both spellings.
fn as_i128(value: &Value) -> Option<i128> {
    if let Some(number) = value.as_i64() {
        return Some(number as i128);
    }
    if let Some(number) = value.as_u64() {
        return Some(number as i128);
    }
    let number = value.as_f64()?;
    if number.fract() == 0.0 && number.abs() < 9.2e18 {
        return Some(number as i128);
    }
    None
}

/// Compares an observation against the identity the engine was given.
///
/// `keep_agreements` decides whether the returned report lists the properties
/// that matched. The count in `checked`/`agreed` is the same either way.
pub fn compare(
    identity: &Identity,
    observation: &Observation,
    headers: &BTreeMap<String, String>,
    keep_agreements: bool,
) -> Result<Report, VerifyError> {
    // The claim side is the config payload itself — exactly the JSON the engine
    // is handed — so the comparison cannot drift from what was launched.
    let config: Value = serde_json::from_str(&identity.to_config_json())
        .map_err(crate::error::Error::from)?;
    let claimed: Map<String, Value> = match config {
        Value::Object(map) => map,
        other => {
            return Err(VerifyError::Plan(crate::error::Error::InvalidConfig(
                format!("a config payload was not a JSON object: {other}"),
            )))
        }
    };
    let get = |key: &str| claimed.get(key);

    let mut comparator = Comparator::new(keep_agreements);

    // ------------------------------------------------------------- navigator
    for (key, field) in [
        (keys::USER_AGENT, "userAgent"),
        (keys::APP_VERSION, "appVersion"),
        (keys::PLATFORM, "platform"),
        (keys::OSCPU, "oscpu"),
        (keys::LANGUAGE, "language"),
        (keys::HARDWARE_CONCURRENCY, "hardwareConcurrency"),
        (keys::MAX_TOUCH_POINTS, "maxTouchPoints"),
        (keys::BUILD_ID, "buildID"),
        (keys::DO_NOT_TRACK, "doNotTrack"),
        (keys::GLOBAL_PRIVACY_CONTROL, "globalPrivacyControl"),
    ] {
        comparator.scalar(key, get(key), observation.navigator.get(field), None);
    }

    // ---------------------------------------------------------------- screen
    for (key, field) in [
        (keys::SCREEN_WIDTH, "width"),
        (keys::SCREEN_HEIGHT, "height"),
        (keys::SCREEN_AVAIL_WIDTH, "availWidth"),
        (keys::SCREEN_AVAIL_HEIGHT, "availHeight"),
        (keys::SCREEN_AVAIL_TOP, "availTop"),
        (keys::SCREEN_AVAIL_LEFT, "availLeft"),
        (keys::COLOR_DEPTH, "colorDepth"),
        (keys::PIXEL_DEPTH, "pixelDepth"),
        (keys::DEVICE_PIXEL_RATIO, "devicePixelRatio"),
    ] {
        comparator.scalar(key, get(key), observation.screen.get(field), None);
    }

    // ---------------------------------------------------------------- window
    // The coherence layer repairs the viewport to fit the screen, so these are
    // compared against the *plan's* values, which are the post-repair ones.
    for (key, field) in [
        (keys::INNER_WIDTH, "innerWidth"),
        (keys::INNER_HEIGHT, "innerHeight"),
        (keys::OUTER_WIDTH, "outerWidth"),
        (keys::OUTER_HEIGHT, "outerHeight"),
        (keys::SCREEN_X, "screenX"),
        (keys::SCREEN_Y, "screenY"),
    ] {
        comparator.scalar(key, get(key), observation.window.get(field), None);
    }

    // ------------------------------------------------------------ timezone
    comparator.scalar(
        keys::TIMEZONE,
        get(keys::TIMEZONE),
        observation.intl.get("timeZone"),
        None,
    );

    // ------------------------------------------------------------- headers
    // The identity stores the wire-level claims under `headers.*`, and the
    // verifier sees the real ones on the probe request — so this is the one
    // part of the run that is not mediated by the page at all.
    for (key, header) in [
        (keys::HEADER_USER_AGENT, "user-agent"),
        (keys::HEADER_ACCEPT_LANGUAGE, "accept-language"),
        (keys::HEADER_ACCEPT_ENCODING, "accept-encoding"),
    ] {
        let observed = headers.get(header).cloned().map(Value::String);
        comparator.scalar(key, get(key), observed.as_ref(), None);
    }

    // ---------------------------------------------------------------- WebGL
    for (label, context_key, observation) in [
        ("webGl", keys::WEBGL_PARAMETERS, observation.webgl1.as_ref()),
        ("webGl2", keys::WEBGL2_PARAMETERS, observation.webgl2.as_ref()),
    ] {
        compare_context(&mut comparator, &claimed, label, context_key, observation);
    }

    // The renderer is the one value worth reporting twice: once as a
    // comparison, and once on its own so a UI can lead with "this is what the
    // page saw".
    let unmasked_vendor = observation
        .webgl1
        .as_ref()
        .and_then(|context| context.unmasked_vendor.clone())
        .map(Value::String);
    comparator.scalar(
        keys::WEBGL_VENDOR,
        get(keys::WEBGL_VENDOR),
        unmasked_vendor.as_ref(),
        None,
    );
    let unmasked_renderer = observation
        .webgl1
        .as_ref()
        .and_then(|context| context.unmasked_renderer.clone());
    comparator.scalar(
        keys::WEBGL_RENDERER,
        get(keys::WEBGL_RENDERER),
        unmasked_renderer.clone().map(Value::String).as_ref(),
        None,
    );

    Ok(Report {
        program: String::new(),
        elapsed_ms: 0,
        checked: comparator.checked,
        agreed: comparator.agreed,
        differences: comparator.differences,
        headers: headers.clone(),
        unmasked_renderer,
    })
}

/// Launches the plan at a probe page, compares, and returns the report.
///
/// The whole verification in one call: the two halves are separate functions
/// because the comparison is pure and worth testing without a browser, but
/// every caller wants them together.
pub fn run(
    plan: &LaunchPlan,
    timeout: Duration,
    keep_agreements: bool,
) -> Result<Report, VerifyError> {
    let (observation, headers, elapsed) = probe(plan, timeout)?;
    let identity = identity_from_env(&plan.env)?;
    let mut report = compare(&identity, &observation, &headers, keep_agreements)?;
    report.program = plan.program.clone();
    report.elapsed_ms = elapsed.as_millis().min(u64::MAX as u128) as u64;
    Ok(report)
}

/// Compares one WebGL context: extensions, attributes, parameters, precisions.
fn compare_context(
    comparator: &mut Comparator,
    claimed: &Map<String, Value>,
    label: &str,
    parameters_key: &str,
    observation: Option<&ContextObservation>,
) {
    let (extensions_key, attributes_key, precision_key, block_key) = match label {
        "webGl" => (
            keys::WEBGL_EXTENSIONS,
            keys::WEBGL_CONTEXT_ATTRS,
            keys::WEBGL_PRECISION,
            keys::WEBGL_SHADER_PRECISION_BLOCK,
        ),
        _ => (
            keys::WEBGL2_EXTENSIONS,
            keys::WEBGL2_CONTEXT_ATTRS,
            keys::WEBGL2_PRECISION,
            keys::WEBGL2_SHADER_PRECISION_BLOCK,
        ),
    };

    let Some(observation) = observation.filter(|context| !context.absent) else {
        // The context could not be created. Anything claimed about it is
        // unread, which is a real finding: a spoofed WebGL2 that cannot be
        // constructed is not a spoofed WebGL2.
        for key in [extensions_key, attributes_key, precision_key, parameters_key] {
            if claimed.get(key).is_some() {
                comparator.push(Difference {
                    property: key.to_owned(),
                    verdict: Verdict::Unread,
                    expected: claimed.get(key).cloned(),
                    observed: None,
                    note: Some(format!("the browser could not create a {label} context")),
                });
            }
        }
        return;
    };

    // Extensions: one comparison for the list, with the difference named.
    let claimed_extensions = claimed
        .get(extensions_key)
        .and_then(Value::as_array)
        .map(|list| {
            let mut names: Vec<String> = list
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect();
            names.sort();
            names
        });
    if let Some(claimed_extensions) = &claimed_extensions {
        let mut observed = observation.extensions.clone();
        observed.sort();
        let expected = Value::Array(
            claimed_extensions
                .iter()
                .map(|name| Value::String(name.clone()))
                .collect(),
        );
        let note = if claimed_extensions == &observed {
            None
        } else {
            let missing: Vec<&String> = claimed_extensions
                .iter()
                .filter(|name| !observed.contains(name))
                .collect();
            let extra: Vec<&String> = observed
                .iter()
                .filter(|name| !claimed_extensions.contains(name))
                .collect();
            Some(format!(
                "claimed but not exposed: {missing:?}; exposed but not claimed: {extra:?}"
            ))
        };
        let observed_value = Value::Array(
            observed
                .iter()
                .map(|name| Value::String(name.clone()))
                .collect(),
        );
        let verdict = if claimed_extensions == &observed {
            Verdict::Match
        } else {
            Verdict::Mismatch
        };
        comparator.push(Difference {
            property: extensions_key.to_owned(),
            verdict,
            expected: Some(expected),
            observed: Some(observed_value),
            note: note.map(|note| note.to_owned()),
        });
    }

    // Context attributes. Compared as a subset on purpose: the recorded
    // corpus carries fields (`desynchronized`, `xrCompatible`) that this
    // Firefox's `getContextAttributes()` does not return at all, and a field
    // the browser never reports cannot be a mismatch — it is a field the
    // browser has no way to answer. The ones it does report are compared
    // strictly, and the unreturned ones are named so the gap is visible rather
    // than assumed away.
    if let Some(claimed_attributes) = claimed.get(attributes_key).and_then(Value::as_object) {
        match observation.context_attributes.as_ref().and_then(Value::as_object) {
            Some(observed_attributes) => {
                let unreturned: Vec<&String> = claimed_attributes
                    .keys()
                    .filter(|key| !observed_attributes.contains_key(*key))
                    .collect();
                let differing: Vec<&String> = claimed_attributes
                    .iter()
                    .filter(|(key, expected)| {
                        observed_attributes
                            .get(*key)
                            .is_some_and(|observed| observed != *expected)
                    })
                    .map(|(key, _)| key)
                    .collect();
                let verdict = if differing.is_empty() {
                    Verdict::Match
                } else {
                    Verdict::Mismatch
                };
                let note = if differing.is_empty() && unreturned.is_empty() {
                    None
                } else {
                    Some(format!(
                        "differs: {differing:?}; claimed but not returned by getContextAttributes: \
                         {unreturned:?}"
                    ))
                };
                comparator.push(Difference {
                    property: attributes_key.to_owned(),
                    verdict,
                    expected: Some(Value::Object(claimed_attributes.clone())),
                    observed: observation.context_attributes.clone(),
                    note,
                });
            }
            None => comparator.push(Difference {
                property: attributes_key.to_owned(),
                verdict: Verdict::Unread,
                expected: Some(Value::Object(claimed_attributes.clone())),
                observed: None,
                note: Some(format!("the {label} context reported no attributes")),
            }),
        }
    }

    // Parameters, key by key. When the identity claims no table at all, every
    // observed parameter is the host's — so the report says that once, with a
    // sample, instead of printing a hundred rows that all mean the same thing.
    match claimed.get(parameters_key).and_then(Value::as_object) {
        Some(table) if !table.is_empty() => {
            for (id, expected) in table {
                comparator.scalar(
                    &format!("{parameters_key}[{id}]"),
                    Some(expected),
                    observation.parameters.get(id),
                    None,
                );
            }
        }
        _ => {
            if !observation.parameters.is_empty() {
                let mut sample: Vec<String> = observation
                    .parameters
                    .iter()
                    .take(8)
                    .map(|(id, value)| format!("{id}={value}"))
                    .collect();
                let total = observation.parameters.len();
                if total > sample.len() {
                    sample.push(format!("… and {} more", total - sample.len()));
                }
                comparator.push(Difference {
                    property: parameters_key.to_owned(),
                    verdict: Verdict::Unclaimed,
                    expected: None,
                    observed: Some(Value::Object(
                        observation
                            .parameters
                            .iter()
                            .map(|(id, value)| (id.clone(), value.clone()))
                            .collect(),
                    )),
                    note: Some(format!(
                        "no recorded table for this GPU, so all {total} values below come from the \
                         host machine and contradict the spoofed renderer: {}",
                        sample.join(", ")
                    )),
                });
            }
        }
    }

    // Precisions. A refusal is a success, not a gap: the identity asked for it.
    let blocked = claimed
        .get(block_key)
        .and_then(Value::as_bool)
        .unwrap_or(false);
    match claimed.get(precision_key).and_then(Value::as_object) {
        Some(table) if !table.is_empty() => {
            for (id, expected) in table {
                let observed = observation
                    .precision
                    .get(id)
                    .and_then(|format| format.as_ref())
                    .map(|format| serde_json::to_value(format).unwrap_or(Value::Null));
                comparator.scalar(
                    &format!("{precision_key}[{id}]"),
                    Some(expected),
                    observed.as_ref(),
                    None,
                );
            }
        }
        _ => {
            let refused = observation.precision.values().all(Option::is_none);
            if blocked && refused && !observation.precision.is_empty() {
                comparator.push(Difference {
                    property: precision_key.to_owned(),
                    verdict: Verdict::Refused,
                    expected: Some(Value::Bool(true)),
                    observed: Some(Value::Null),
                    note: Some(
                        "the GPU has no recording, so the query is refused rather than answered \
                         with the host's precision formats"
                            .to_owned(),
                    ),
                });
            } else if !blocked && !observation.precision.is_empty() {
                comparator.push(Difference {
                    property: precision_key.to_owned(),
                    verdict: Verdict::Unclaimed,
                    expected: None,
                    observed: Some(Value::Object(
                        observation
                            .precision
                            .iter()
                            .map(|(id, format)| {
                                (
                                    id.clone(),
                                    format
                                        .as_ref()
                                        .and_then(|format| serde_json::to_value(format).ok())
                                        .unwrap_or(Value::Null),
                                )
                            })
                            .collect(),
                    )),
                    note: Some(
                        "no recorded precision table and no refusal, so these are the host's"
                            .to_owned(),
                    ),
                });
            }
        }
    }
}

// ------------------------------------------------------------------ the probe

/// A throwaway profile directory for one probe run.
///
/// Its own directory rather than the profile's, for two reasons: a profile
/// whose browser is already open has a locked profile directory, and a probe
/// that failed halfway would otherwise leave its session state behind. The
/// directory is removed when this is dropped.
pub struct ProbeProfile {
    path: PathBuf,
}

impl ProbeProfile {
    /// Creates the directory and the `user.js` that makes the probe closeable.
    ///
    /// The preferences matter for exactly one reason each:
    ///
    /// * `dom.allow_scripts_to_close_windows` lets the page close its own
    ///   window, so a finished run leaves no browser behind. Firefox refuses
    ///   `window.close()` by default, and a probe that left a window open every
    ///   time would be a tool people stop using.
    /// * `network.proxy.no_proxies_on` keeps the loopback report off any proxy
    ///   the profile carries — a proxied `127.0.0.1` never reaches the
    ///   verifier.
    ///
    /// These are written to `user.js` rather than the `CAMOU_PREFS` channel
    /// because nothing consumes that channel yet (see `resources/UPSTREAM.md`);
    /// a preference that is never applied is worse than one written where
    /// Firefox actually reads it.
    pub fn new(identity: &Identity) -> Result<Self, VerifyError> {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or(0);
        let path = std::env::temp_dir().join(format!(
            "narc-probe-{}-{unique:x}",
            std::process::id()
        ));
        std::fs::create_dir_all(&path).map_err(VerifyError::Profile)?;

        let mut prefs = Identity::prefs_from_json(&identity.to_prefs_json())?;
        prefs.insert(
            "dom.allow_scripts_to_close_windows".to_owned(),
            Value::Bool(true),
        );
        prefs.insert(
            "network.proxy.no_proxies_on".to_owned(),
            Value::String("localhost, 127.0.0.1, ::1".to_owned()),
        );
        let mut user_js = String::new();
        for (key, value) in &prefs {
            let name = serde_json::to_string(key).map_err(VerifyError::Report)?;
            user_js.push_str(&format!("user_pref({name}, {value});\n"));
        }
        std::fs::write(path.join("user.js"), user_js).map_err(VerifyError::Profile)?;

        Ok(Self { path })
    }

    /// The directory to hand the launch plan.
    pub fn path(&self) -> &std::path::Path {
        &self.path
    }
}

impl Drop for ProbeProfile {
    fn drop(&mut self) {
        // A browser that is still shutting down holds files in here; failing to
        // remove the directory is a leftover temp file, not an error worth
        // propagating out of a `Drop`.
        std::fs::remove_dir_all(&self.path).ok();
    }
}

/// Launches the plan at a probe page and returns what the browser exposed.
///
/// The plan is used verbatim apart from the appended URL, so the browser being
/// measured is the browser a real launch produces — same arguments, same
/// environment, same engine. The one thing the caller must get right is the
/// profile directory: pass a [`ProbeProfile`]'s path, not the profile's own.
pub fn probe(
    plan: &LaunchPlan,
    timeout: Duration,
) -> Result<(Observation, BTreeMap<String, String>, Duration), VerifyError> {
    if !std::path::Path::new(&plan.program).exists() {
        return Err(VerifyError::NoEngine {
            program: plan.program.clone(),
        });
    }

    // The claim side is read back out of the plan, because that is what the
    // engine is actually handed.
    let identity = identity_from_env(&plan.env)?;

    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(VerifyError::Listen)?;
    let port = listener.local_addr().map_err(VerifyError::Listen)?.port();
    listener
        .set_nonblocking(true)
        .map_err(VerifyError::Listen)?;

    let ids = probe_parameter_ids(&identity);
    let params = ids
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let url = format!("http://127.0.0.1:{port}/?params={params}");

    let mut args = plan.args.clone();
    args.push(url);
    let mut command = Command::new(&plan.program);
    command
        .args(&args)
        .envs(&plan.env)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        // No breakaway here, unlike an interactive launch: the probe is owned
        // by this process and must not outlive it.
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        command.creation_flags(DETACHED_PROCESS);
    }
    let started = Instant::now();
    let mut child = command.spawn().map_err(|source| VerifyError::Spawn {
        program: plan.program.clone(),
        source,
    })?;

    let deadline = started + timeout;
    let served = serve(&listener, deadline, timeout);
    // Whatever happened, the browser is not needed any more.
    reap(&mut child);

    let (observation, headers) = served?;
    Ok((observation, headers, started.elapsed()))
}

/// The GL constant ids to ask the browser for.
///
/// A covered GPU is asked for exactly the ids its own table claims, so every
/// row of the report is a real comparison. A GPU with no table is asked for
/// everything the corpus knows, because the point there is to print what the
/// host answers.
fn probe_parameter_ids(identity: &Identity) -> Vec<u32> {
    let mut ids: BTreeSet<u32> = BTreeSet::new();
    for key in [keys::WEBGL_PARAMETERS, keys::WEBGL2_PARAMETERS] {
        if let Some(table) = identity.get_object(key) {
            ids.extend(table.keys().filter_map(|id| id.parse::<u32>().ok()));
        }
    }
    if ids.is_empty() {
        ids.extend(crate::generator::webgl::recorded_parameter_ids());
    }
    ids.into_iter().collect()
}

/// Closes the browser: first by asking, then by force.
///
/// The page closes its own window (see [`ProbeProfile`]), so the normal path is
/// a clean exit. The kill is the fallback for a page that never ran — a browser
/// that could not reach the verifier cannot close itself.
fn reap(child: &mut Child) {
    let deadline = Instant::now() + CLOSE_GRACE;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(100));
            }
            _ => break,
        }
    }
    child.kill().ok();
    child.wait().ok();
}

/// Serves the probe page and waits for the report.
fn serve(
    listener: &TcpListener,
    deadline: Instant,
    timeout: Duration,
) -> Result<(Observation, BTreeMap<String, String>), VerifyError> {
    loop {
        match listener.accept() {
            Ok((stream, _)) => {
                if let Some(report) = handle(stream) {
                    return Ok(report);
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    return Err(VerifyError::Timeout {
                        seconds: timeout.as_secs(),
                    });
                }
                std::thread::sleep(Duration::from_millis(40));
            }
            Err(error) => return Err(VerifyError::Listen(error)),
        }
    }
}

/// Serves one connection. Returns the report when this was it.
fn handle(mut stream: TcpStream) -> Option<(Observation, BTreeMap<String, String>)> {
    // A stream accepted from a non-blocking listener is non-blocking too, and a
    // non-blocking read of a request that has not fully arrived returns
    // `WouldBlock` rather than waiting — which would drop the report on the
    // floor. The read timeout is short because Firefox opens speculative
    // connections that never send anything.
    stream.set_nonblocking(false).ok();
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .ok();
    let mut buffer = Vec::new();
    let mut chunk = [0u8; 4096];

    // Headers first: read until the blank line that ends them.
    let header_end = loop {
        if let Some(position) = find(&buffer, b"\r\n\r\n") {
            break position + 4;
        }
        if buffer.len() > 64 * 1024 {
            return None;
        }
        match stream.read(&mut chunk) {
            Ok(0) => return None,
            Ok(read) => buffer.extend_from_slice(&chunk[..read]),
            Err(_) => return None,
        }
    };

    let head = String::from_utf8_lossy(&buffer[..header_end]).to_string();
    let mut lines = head.split("\r\n");
    let request = lines.next().unwrap_or_default().to_owned();
    let mut headers = BTreeMap::new();
    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
            headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_owned());
        }
    }
    let mut parts = request.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let target = parts.next().unwrap_or_default();
    let path = target.split('?').next().unwrap_or(target);

    let content_length: usize = headers
        .get("content-length")
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    let mut body = buffer[header_end..].to_vec();
    while body.len() < content_length {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(read) => body.extend_from_slice(&chunk[..read]),
            Err(_) => break,
        }
    }

    match (method, path) {
        ("GET", "/") => {
            respond(
                &mut stream,
                "200 OK",
                "text/html; charset=utf-8",
                PROBE_PAGE.as_bytes(),
            );
            None
        }
        ("POST", "/report") => {
            let parsed = serde_json::from_slice::<Observation>(&body);
            match parsed {
                Ok(observation) => {
                    respond(&mut stream, "200 OK", "application/json", b"{\"ok\":true}");
                    Some((observation, headers))
                }
                Err(error) => {
                    let message = format!("{{\"error\":{}}}", Value::String(error.to_string()));
                    respond(
                        &mut stream,
                        "400 Bad Request",
                        "application/json",
                        message.as_bytes(),
                    );
                    None
                }
            }
        }
        _ => {
            respond(&mut stream, "404 Not Found", "text/plain", b"not found");
            None
        }
    }
}

/// Writes one HTTP response and closes the connection.
fn respond(stream: &mut TcpStream, status: &str, content_type: &str, body: &[u8]) {
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n\
         Cache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(head.as_bytes()).ok();
    stream.write_all(body).ok();
    stream.flush().ok();
}

/// The index of the first occurrence of `needle` in `haystack`.
fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

#[cfg(test)]
#[path = "verify_tests.rs"]
mod tests;
