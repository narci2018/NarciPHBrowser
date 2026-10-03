//! The wire types and the command implementations behind them.
//!
//! # Shapes are the SDK's contract
//!
//! Every type here serialises to exactly what the TypeScript SDK declares, and
//! the two are pinned against each other by the fixture test at the bottom of
//! this file. That test is the reason this file exists as data rather than as
//! ad-hoc `json!` strings: a field renamed on the Rust side has to fail a
//! build, not a user's UI.
//!
//! # Errors carry a kind
//!
//! [`SidecarError`] distinguishes "you asked for something that does not exist"
//! from "the thing exists but cannot be used" from "the environment broke".
//! A UI can act on the first by refreshing a list, on the second by opening an
//! editor, and on the third by showing a retry. A single string error message
//! would collapse all three into "something went wrong".

use std::process::Stdio;

use narrc_core::coherence::constants::{MIN_SCREEN_HEIGHT, MIN_SCREEN_WIDTH, PLAUSIBLE_DPR};
use narrc_core::coherence::Violation;
use narrc_core::engine::LaunchPlan;
use narrc_core::profile::{GeoGate, OverrideProblem, Profile, ProfileStore, ProxyConfig};
use narrc_core::{GeneratorOptions, Identity, TargetOs};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::store_path;

/// A request from the UI.
///
/// `command` and `params` are flat rather than nested under a name, because a
/// line protocol is read by humans in a log far more often than by a struct
/// definition, and `{"command":"list","params":{}}` is obvious at a glance.
#[derive(Debug, Clone, Deserialize)]
pub struct Request {
    /// Echoed back untouched, so a UI that pipelines can pair replies.
    pub id: u64,
    /// What to do.
    #[serde(flatten)]
    pub command: Command,
}

/// Every command the sidecar answers.
///
/// **Adjacently** tagged, not internally tagged, and the distinction is the
/// whole wire format: `{"command":"load","params":{"id":"acct"}}` rather than
/// `{"command":"load","id":"acct"}`. Internally tagged spreads a variant's
/// fields out across the top level, which makes the shape depend on which
/// command it is — `params` would be silently ignored by `ping` and rejected by
/// `load`, from one field on the same line. A protocol that changes meaning
/// based on its own tag is one nobody can log and read.
///
/// Every variant carries a params type, even the ones that take nothing, because
/// serde's adjacently-tagged unit variants reject `"params": {}` outright. An
/// empty struct is the honest way to say "this command takes no arguments".
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "command", content = "params", rename_all = "kebab-case")]
pub enum Command {
    /// Liveness, and a round trip for the UI to measure latency with.
    Ping(EmptyParams),
    /// The versions of the sidecar and the engine it targets.
    Version(EmptyParams),
    /// Where profiles are kept, without creating anything.
    DefaultStore(EmptyParams),
    /// A new profile from a description.
    Create(CreateSpec),
    /// An existing profile rewritten from a description, keeping its seed.
    Update(UpdateParams),
    /// Every profile, as summaries.
    List(EmptyParams),
    /// One profile in full.
    Load(IdParams),
    /// A profile and everything known about it.
    Inspect(IdParams),
    /// A profile's coherence report.
    Validate(IdParams),
    /// A profile plus a hand edit.
    SetOverride(SetOverrideParams),
    /// A profile minus a hand edit.
    ClearOverride(ClearOverrideParams),
    /// A profile removed, with its browser data.
    Delete(IdParams),
    /// The launch plan, without launching.
    Plan(PlanParams),
    /// A profile's identity read back out of a running browser.
    Verify(VerifyParams),
    /// The engine's property schema, for editors that set fields.
    Schema(EmptyParams),
    /// A profile launched.
    Launch(LaunchParams),
    /// A profile driven over Playwright's automation endpoint.
    AgentStart(AgentStartParams),
    /// A running automation session, stopped.
    AgentStop(IdParams),
    /// Every running automation session.
    AgentList(EmptyParams),
}

/// For the commands that take no arguments.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct EmptyParams {}

/// A single profile id.
#[derive(Debug, Clone, Deserialize)]
pub struct IdParams {
    /// The profile's id.
    pub id: String,
}

/// A hand edit to apply.
#[derive(Debug, Clone, Deserialize)]
pub struct SetOverrideParams {
    /// The profile's id.
    pub id: String,
    /// The property to set.
    pub property: String,
    /// The value, coerced to the property's type.
    pub value: Value,
}

/// A hand edit to remove.
#[derive(Debug, Clone, Deserialize)]
pub struct ClearOverrideParams {
    /// The profile's id.
    pub id: String,
    /// The property to clear.
    pub property: String,
}

/// A launch plan request.
#[derive(Debug, Clone, Deserialize)]
pub struct PlanParams {
    /// The profile's id.
    pub id: String,
    /// An explicit engine binary, or `None` for the default.
    #[serde(default)]
    pub engine: Option<String>,
    /// Whether to launch without a window.
    #[serde(default)]
    pub headless: bool,
}

/// A read-back verification request.
#[derive(Debug, Clone, Deserialize)]
pub struct VerifyParams {
    /// The profile's id.
    pub id: String,
    /// An explicit engine binary, or `None` for the default.
    #[serde(default)]
    pub engine: Option<String>,
    /// Whether the report lists the properties that agreed as well as the ones
    /// that did not.
    ///
    /// Off by default: a covered GPU agrees on well over a hundred values, and
    /// the answer a caller wants is the handful that disagree.
    #[serde(default)]
    pub keep_agreements: bool,
}

/// A launch request.
#[derive(Debug, Clone, Deserialize)]
pub struct LaunchParams {
    /// The profile's id.
    pub id: String,
    /// An explicit engine binary, or `None` for the default.
    #[serde(default)]
    pub engine: Option<String>,
    /// The proxy's observed exit country, for the geo gate.
    #[serde(default)]
    pub exit_country: Option<String>,
}

/// What an automation session needs beyond a launch.
#[derive(Debug, Clone, Deserialize)]
pub struct AgentStartParams {
    /// The profile's id.
    pub id: String,
    /// An explicit engine binary, or `None` for the default.
    #[serde(default)]
    pub engine: Option<String>,
    /// The proxy's observed exit country, for the geo gate.
    #[serde(default)]
    pub exit_country: Option<String>,
    /// The `playwright-core` package root the automation script will require.
    ///
    /// The Node package ships it at `node_modules/playwright-core`; Python
    /// Playwright bundles it at `site-packages/playwright/driver/package`.
    pub driver_path: String,
    /// An explicit Node runtime. `None` runs `node` from `PATH`; Python
    /// Playwright's bundled runtime is `site-packages/playwright/driver/node`.
    #[serde(default)]
    pub node_path: Option<String>,
    /// A WebSocket port to ask for, or `None` for Playwright's choice.
    #[serde(default)]
    pub port: Option<u16>,
    /// Whether the automated browser opens a window. Off by default: the
    /// common automation case is unattended, and a headless launch is the
    /// cheaper one.
    #[serde(default)]
    pub headless: bool,
}

/// A reply. Exactly one of `result` and `error` is present.
#[derive(Debug, Clone, Serialize)]
pub struct Response {
    /// The request's `id`.
    pub id: u64,
    /// Whether `result` is present.
    pub ok: bool,
    /// The payload, on success.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    /// The failure, otherwise.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<SidecarError>,
}

impl Response {
    /// A response carrying a failure, for a request we could not even parse.
    ///
    /// The id is `0` because we never read one. That is not a guess to be
    /// trusted: a UI that sent a malformed line should treat *any* reply to that
    /// line as unattributable, which is why the kind says `malformed`.
    #[allow(dead_code)] // used by the binary, not the library
    pub(crate) fn malformed(error: impl std::fmt::Display) -> Self {
        Self {
            id: 0,
            ok: false,
            result: None,
            error: Some(SidecarError::new(ErrorKind::Malformed, error.to_string())),
        }
    }

    /// A response for a failure reading the transport itself.
    #[allow(dead_code)] // used by the binary, not the library
    pub(crate) fn io_error(error: &std::io::Error) -> Self {
        Self {
            id: 0,
            ok: false,
            result: None,
            error: Some(SidecarError::new(ErrorKind::Io, error.to_string())),
        }
    }
}

impl std::fmt::Display for Response {
    /// The line as it goes on the wire.
    ///
    /// Hand-written so it cannot emit a bare `{` on a failure. A `Display` that
    /// fell back to a debug format would put a multi-line, unparseable thing on
    /// a protocol where every line has to be one JSON object — and the reader
    /// would then treat the second line as a fresh, malformed request.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match serde_json::to_string(self) {
            Ok(json) => f.write_str(&json),
            // Unreachable in practice: every field is a plain owned value. If
            // it ever happened, a readable line beats a silent exit, because the
            // reader stays in sync with the id.
            Err(error) => write!(
                f,
                r#"{{"id":{},"ok":false,"error":{{"kind":"io","message":"the response could not be serialised: {}"}}}}"#,
                self.id,
                error.to_string().replace('"', "'")
            ),
        }
    }
}

/// How a failure should be presented, as data rather than prose.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ErrorKind {
    /// The request could not be parsed, or named a command that does not exist.
    Malformed,
    /// No such profile.
    NotFound,
    /// The profile exists but the request cannot be carried out as stated.
    Invalid,
    /// Two profiles would collide, or a gate refused.
    Conflict,
    /// The environment failed: permissions, disk, a missing engine.
    Io,
}

impl ErrorKind {
    /// Whether retrying the same request could plausibly succeed.
    ///
    /// Drives whether the UI offers a retry button. A `NotFound` retry is
    /// always the same answer; an `Io` one might not be.
    pub fn retryable(&self) -> bool {
        matches!(self, ErrorKind::Io)
    }
}

/// A failure, in a form the UI can branch on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SidecarError {
    /// The category.
    pub kind: ErrorKind,
    /// The explanation, naming the actual values.
    pub message: String,
    /// Whether retrying the same request could plausibly succeed.
    ///
    /// Carried on the wire rather than derived in the UI. The rule — an
    /// environment failure might succeed, a missing profile will not — is
    /// knowledge the sidecar has and the UI does not, and a UI that guessed it
    /// would eventually show a retry button that can only ever fail again.
    pub retryable: bool,
}

impl std::fmt::Display for ErrorKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let text = match self {
            ErrorKind::Malformed => "malformed",
            ErrorKind::NotFound => "not-found",
            ErrorKind::Invalid => "invalid",
            ErrorKind::Conflict => "conflict",
            ErrorKind::Io => "io",
        };
        f.write_str(text)
    }
}

impl std::fmt::Display for SidecarError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.kind, self.message)
    }
}

impl SidecarError {
    pub(crate) fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            retryable: kind.retryable(),
        }
    }
}

impl From<narrc_core::Error> for SidecarError {
    fn from(error: narrc_core::Error) -> Self {
        // The core's error type is a UI's problem only insofar as it says what
        // went wrong. The kind is inferred from the message, which is the one
        // seam here worth closing later with a typed core error — noted rather
        // than hidden, because "not found" and "invalid" get different buttons.
        let text = error.to_string();
        let kind = if text.contains("newer version") {
            ErrorKind::Invalid
        } else if text.contains("could not") || text.contains("not a readable profile") {
            ErrorKind::Io
        } else {
            ErrorKind::Invalid
        };
        Self::new(kind, text)
    }
}

/// A profile to create, as the UI describes one.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateSpec {
    /// What to call it.
    pub name: String,
    /// The identity's seed. Omit to have one drawn.
    #[serde(default)]
    pub seed: Option<u64>,
    /// The OS to present.
    pub os: TargetOs,
    /// A country to pin, which a proxy's exit IP usually determines.
    #[serde(default)]
    pub country: Option<String>,
    /// A locale to pin, e.g. `de-DE`.
    #[serde(default)]
    pub locale: Option<String>,
    /// A screen to pin, as `[width, height]`.
    #[serde(default)]
    pub screen: Option<[u32; 2]>,
    /// The display scale to pin alongside the screen, e.g. `1.25`.
    ///
    /// Only honoured together with a screen: the two are checkable as a pair,
    /// and a scale without a panel is a claim no page can confirm.
    #[serde(default)]
    pub dpr: Option<f64>,
    /// `stock` or `extended` fonts.
    #[serde(default)]
    pub fonts: Option<narrc_core::FontProfile>,
    /// Whether to claim tracking protection.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tracking_protection: Option<bool>,
    /// Whether the engine humanises programmatic cursor movement.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub humanize: Option<bool>,
    /// Browser extensions to load, as paths to `.xpi` files or unpacked addon
    /// directories.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub addons: Option<Vec<String>>,
    /// Notes the user wrote.
    #[serde(default)]
    pub notes: Option<String>,
    /// A proxy to launch through.
    #[serde(default)]
    pub proxy: Option<CreateProxy>,
    /// Extra engine arguments, verbatim.
    #[serde(default)]
    pub extra_args: Vec<String>,
}

/// A profile to rewrite, as the UI edits one.
///
/// The description nests under `spec` rather than spreading next to `id`, so
/// the wire says in one place which shape the rewrite is written in. The
/// spec's `seed` is ignored: editing a profile changes what it looks like,
/// never which machine it is.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateParams {
    /// The profile's id.
    pub id: String,
    /// What the profile should become.
    pub spec: CreateSpec,
}

/// A proxy as the UI supplies one.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CreateProxy {
    /// The proxy URL.
    pub url: String,
    /// The country the exit IP is expected to be in.
    #[serde(default)]
    pub exit_country: Option<String>,
}

impl From<CreateProxy> for ProxyConfig {
    fn from(proxy: CreateProxy) -> Self {
        Self {
            url: proxy.url,
            exit_country: proxy.exit_country,
        }
    }
}

/// A profile as a list row: what fits on one line, and nothing else.
///
/// A separate shape from [`Profile`] on purpose. A list of a hundred profiles
/// should not carry a hundred identities — that is megabytes of JSON to render
/// thirty rows, and every one of them is a value the UI has no business holding
/// until the user asks for that profile.
#[derive(Debug, Clone, Serialize)]
pub struct ProfileSummary {
    /// The filesystem-safe id.
    pub id: String,
    /// The user's name for it.
    pub name: String,
    /// The seed the machine is drawn from.
    pub seed: u64,
    /// The OS it presents.
    pub os: TargetOs,
    /// The country it claims.
    pub country: String,
    /// A content hash of the identity, for spotting duplicates.
    pub digest: String,
    /// How many hand edits are in force.
    pub override_count: usize,
    /// Whether it would launch as it stands.
    pub coherent: bool,
    /// Whether a proxy is configured.
    pub proxied: bool,
    /// How many browser extensions will load with this profile.
    pub addon_count: usize,
    /// A one-line summary, for the row.
    pub summary: String,
}

impl ProfileSummary {
    pub fn of(profile: &Profile) -> Self {
        let resolved = profile.resolved();
        let identity = &resolved.identity;
        let summary = describe(identity, profile.options.os);
        Self {
            id: profile.id.clone(),
            name: profile.name.clone(),
            seed: profile.seed,
            os: profile.options.os,
            country: resolved.geo.country.clone(),
            digest: identity.digest(),
            override_count: profile.overrides.len(),
            // Coherence is checked on the *resolved* identity — after repairs —
            // because that is what would actually launch. A profile whose drawn
            // identity has a violation that the coherence layer can repair is
            // coherent; one whose violation survives repair is not.
            coherent: resolved.violations.is_empty(),
            proxied: profile.proxy.is_some(),
            addon_count: profile.addons.len(),
            summary,
        }
    }
}

/// A profile and everything the UI needs to show it.
#[derive(Debug, Clone, Serialize)]
pub struct Inspection {
    /// The stored profile.
    pub profile: Profile,
    /// What the profile will actually present.
    pub effective: Identity,
    /// The identity the seed draws, for diffing against the edits.
    pub drawn: Identity,
    /// Properties the edits changed, with both values.
    pub override_diff: Vec<DiffEntry>,
    /// Every broken invariant.
    pub violations: Vec<Violation>,
    /// Edits the engine would drop.
    pub override_problems: Vec<OverrideProblem>,
    /// The place the profile claims.
    pub geo: GeoView,
    /// A one-line summary of the machine.
    pub summary: String,
}

/// One property, before and after.
#[derive(Debug, Clone, Serialize)]
pub struct DiffEntry {
    /// The property name.
    pub property: String,
    /// The drawn value.
    pub drawn: Value,
    /// The effective value.
    pub effective: Value,
    /// Whether the hand edit changed it.
    pub overridden: bool,
}

/// The place a profile claims, flattened for display.
#[derive(Debug, Clone, Serialize)]
pub struct GeoView {
    /// BCP-47 language.
    pub language: String,
    /// ISO 3166-1 alpha-2.
    pub country: String,
    /// IANA zone.
    pub timezone: String,
    /// Minutes east of UTC.
    pub utc_offset: i32,
    /// Approximate coordinates.
    pub latitude: f64,
    pub longitude: f64,
}

impl From<narrc_core::generator::geo::GeoProfile> for GeoView {
    fn from(geo: narrc_core::generator::geo::GeoProfile) -> Self {
        Self {
            language: geo.language,
            country: geo.country,
            timezone: geo.timezone,
            utc_offset: geo.utc_offset,
            latitude: geo.latitude,
            longitude: geo.longitude,
        }
    }
}

/// A coherence report.
#[derive(Debug, Clone, Serialize)]
pub struct Report {
    /// The profile's id.
    pub id: String,
    /// Every broken invariant. Empty means coherent.
    pub violations: Vec<Violation>,
    /// Edits the engine would drop.
    pub override_problems: Vec<OverrideProblem>,
    /// Whether the profile would launch as it stands.
    pub launchable: bool,
    /// The count of properties in the effective identity.
    pub property_count: usize,
}

/// A launch, and the process it made.
#[derive(Debug, Clone, Serialize)]
pub struct Launched {
    /// The process id, or `None` if it could not be read.
    pub pid: Option<u32>,
    /// The plan that was used.
    pub plan: LaunchPlan,
    /// The geo gate's verdict, when a proxy was configured.
    pub geo_gate: Option<GeoGate>,
    /// Values the coherence layer dropped to make the profile launchable.
    pub discarded: Vec<Violation>,
}

// ------------------------------------------------------------------- helpers

/// The store, or the error saying why there is not one.
pub(crate) fn store() -> Result<ProfileStore, SidecarError> {
    let path = store_path::default_store()?;
    ProfileStore::open(path).map_err(SidecarError::from)
}

/// A profile by id, or a `NotFound` naming the id.
///
/// The message repeats the id because the UI has a list on screen and needs to
/// point at the right row; "not found" alone sends the user looking.
pub(crate) fn load_profile(store: &ProfileStore, id: &str) -> Result<Profile, SidecarError> {
    store.load(id)?.ok_or_else(|| {
        SidecarError::new(
            ErrorKind::NotFound,
            format!("no profile with the id {id:?}"),
        )
    })
}

/// A seed for a profile nobody named one for.
///
/// Drawn from the process's own hash seed rather than a clock or the OS
/// entropy pool, because it does not need to be unpredictable — it needs to be
/// *different* from the last one. Two profiles with the same seed are the same
/// machine, and a user who clicks "new" expects a new machine.
fn draw_seed() -> u64 {
    use std::hash::{BuildHasher, Hasher};
    std::collections::hash_map::RandomState::new()
        .build_hasher()
        .finish()
        ^ std::collections::hash_map::RandomState::new()
            .build_hasher()
            .finish()
}

/// One line describing the machine, the way a person would.
fn describe(identity: &Identity, os: TargetOs) -> String {
    let renderer = identity
        .get_str(narrc_core::schema::keys::WEBGL_RENDERER)
        .unwrap_or("an unknown GPU");
    let cores = identity
        .get_u32(narrc_core::schema::keys::HARDWARE_CONCURRENCY)
        .unwrap_or(0);
    let width = identity
        .get_u32(narrc_core::schema::keys::SCREEN_WIDTH)
        .unwrap_or(0);
    let height = identity
        .get_u32(narrc_core::schema::keys::SCREEN_HEIGHT)
        .unwrap_or(0);
    let fonts = identity
        .get_str_array(narrc_core::schema::keys::FONTS)
        .map(|names| names.len())
        .unwrap_or(0);
    format!("{os}, {cores} cores, {width}x{height}, {fonts} fonts, {renderer}")
}

// ------------------------------------------------------------------ commands

pub fn ping() -> Result<Value, SidecarError> {
    Ok(json!({ "pong": true }))
}

pub fn version() -> Result<Value, SidecarError> {
    Ok(json!({
        "sidecar": env!("CARGO_PKG_VERSION"),
        "core": narrc_core::VERSION,
        "engine": narrc_core::ENGINE_TARGET,
    }))
}

pub fn store_path_command() -> Result<Value, SidecarError> {
    Ok(json!({ "path": store_path::default_store()?.display().to_string() }))
}

/// The user's name for a profile, trimmed and bounded.
fn checked_name(raw: &str) -> Result<String, SidecarError> {
    let name = raw.trim().to_owned();
    if name.is_empty() {
        return Err(SidecarError::new(
            ErrorKind::Invalid,
            "a profile needs a name",
        ));
    }
    if name.len() > 120 {
        return Err(SidecarError::new(
            ErrorKind::Invalid,
            format!("a name of {} characters is not a name", name.len()),
        ));
    }
    Ok(name)
}

/// A proxy URL, validated before any profile is written, so a malformed one
/// is reported at creation rather than at the moment the user tries to launch
/// and the browser goes out unproxied.
fn checked_proxy(proxy: Option<&CreateProxy>) -> Result<Option<ProxyConfig>, SidecarError> {
    let Some(proxy) = proxy else {
        return Ok(None);
    };
    let parsed: ProxyConfig = proxy.clone().into();
    parsed
        .parts()
        .map_err(|error| SidecarError::new(ErrorKind::Invalid, format!("proxy: {error}")))?;
    Ok(Some(parsed))
}

/// The generator options a description asks for, resolved against a seed.
struct SpecOptions<'a> {
    /// The seed the options are drawn for.
    seed: u64,
    /// The OS to present.
    os: TargetOs,
    /// A country to pin.
    country: Option<&'a str>,
    /// A locale to pin.
    locale: Option<&'a str>,
    /// A panel to pin, physically.
    screen: Option<[u32; 2]>,
    /// A scale to pin alongside the panel.
    dpr: Option<f64>,
    /// How many fonts to claim.
    fonts: Option<narrc_core::FontProfile>,
    /// Whether to claim tracking protection.
    tracking_protection: Option<bool>,
    /// Whether the engine humanises programmatic cursor movement.
    humanize: Option<bool>,
}

fn checked_options(request: SpecOptions<'_>) -> Result<GeneratorOptions, SidecarError> {
    let mut options = GeneratorOptions::new(request.os);
    if let Some(country) = request.country {
        let country = country.trim().to_ascii_uppercase();
        if narrc_core::generator::geo::GeoProfile::for_country(request.seed, &country).is_none() {
            return Err(SidecarError::new(
                ErrorKind::Invalid,
                format!("no timezone table for the country {country:?}"),
            ));
        }
        options.country = Some(country);
    }
    if let Some(locale) = request.locale {
        options.locale = Some(locale.to_owned());
    }
    if let Some([width, height]) = request.screen {
        options.screen = Some((width, height));
    }
    if let Some(fonts) = request.fonts {
        options.fonts = fonts;
    }
    if let Some(tracking) = request.tracking_protection {
        options.tracking_protection = tracking;
    }
    if let Some(humanize) = request.humanize {
        options.humanize = humanize;
    }

    // A scale pins only with a panel that divides into a plausible CSS size
    // at a step the OS actually offers. Anything else is dropped rather than
    // stored: a profile that claims a scale its own screen contradicts is
    // incoherent before a single page is loaded.
    if let (Some(dpr), Some((width, height))) = (request.dpr, options.screen) {
        let step = PLAUSIBLE_DPR
            .iter()
            .find(|(name, _)| *name == request.os.as_str())
            .and_then(|(_, steps)| steps.iter().find(|step| (**step - dpr).abs() < 1e-6))
            .copied();
        if let Some(step) = step {
            let css_width = width as f64 / step;
            let css_height = height as f64 / step;
            if css_width >= MIN_SCREEN_WIDTH as f64 && css_height >= MIN_SCREEN_HEIGHT as f64 {
                options.dpr = Some(step);
            }
        }
    }
    Ok(options)
}

pub fn create(spec: &CreateSpec) -> Result<Value, SidecarError> {
    let name = checked_name(&spec.name)?;
    let seed = spec.seed.unwrap_or_else(draw_seed);
    let store = store()?;
    let proxy = checked_proxy(spec.proxy.as_ref())?;
    let options = checked_options(SpecOptions {
        seed,
        os: spec.os,
        country: spec.country.as_deref(),
        locale: spec.locale.as_deref(),
        screen: spec.screen,
        dpr: spec.dpr,
        fonts: spec.fonts,
        tracking_protection: spec.tracking_protection,
        humanize: spec.humanize,
    })?;

    let id = store.free_id(&name, seed);
    let mut profile = Profile::new(id.clone(), name, seed, options);
    profile.notes = spec.notes.clone().unwrap_or_default();
    profile.proxy = proxy;
    profile.extra_args = spec.extra_args.clone();
    profile.addons = spec.addons.clone().unwrap_or_default();

    let report = report_of(&profile);
    store.save(&profile)?;

    Ok(json!({
        "id": profile.id,
        "summary": ProfileSummary::of(&profile),
        "report": report,
    }))
}

/// Rewrites a profile from a new description.
///
/// The seed, the id and the hand edits are kept: an edit changes what the
/// machine looks like, never which machine it is. A caller that wants a
/// different machine creates a profile instead.
pub fn update(id: &str, spec: &CreateSpec) -> Result<Value, SidecarError> {
    let name = checked_name(&spec.name)?;
    let proxy = checked_proxy(spec.proxy.as_ref())?;
    let store = store()?;
    let mut profile = load_profile(&store, id)?;
    let options = checked_options(SpecOptions {
        seed: profile.seed,
        os: spec.os,
        country: spec.country.as_deref(),
        locale: spec.locale.as_deref(),
        screen: spec.screen,
        dpr: spec.dpr,
        fonts: spec.fonts,
        tracking_protection: spec.tracking_protection,
        humanize: spec.humanize,
    })?;

    profile.name = name;
    profile.options = options;
    profile.notes = spec.notes.clone().unwrap_or_default();
    profile.proxy = proxy;
    profile.extra_args = spec.extra_args.clone();
    profile.addons = spec.addons.clone().unwrap_or_default();

    let report = report_of(&profile);
    store.save(&profile)?;

    Ok(json!({
        "id": profile.id,
        "summary": ProfileSummary::of(&profile),
        "report": report,
    }))
}

pub fn list() -> Result<Value, SidecarError> {
    let store = store()?;
    let profiles = store.list();
    let summaries: Vec<ProfileSummary> = profiles.iter().map(ProfileSummary::of).collect();

    // The unreadable ids travel with the list rather than in a separate call,
    // because a profile that cannot be parsed must be visible in the same view
    // as the profiles that can. Silently omitting it reads as data loss, which
    // is the one thing a tool that stores identities must never cause.
    Ok(json!({
        "profiles": summaries,
        "unreadable": store.unreadable_ids(),
    }))
}

pub fn load(id: &str) -> Result<Value, SidecarError> {
    let store = store()?;
    let profile = load_profile(&store, id)?;
    to_value(&profile)
}

pub fn delete(id: &str) -> Result<Value, SidecarError> {
    let store = store()?;
    let removed = store.delete(id)?;
    if !removed {
        return Err(SidecarError::new(
            ErrorKind::NotFound,
            format!("no profile with the id {id:?}"),
        ));
    }
    Ok(json!({ "deleted": id }))
}

pub fn inspect(id: &str) -> Result<Value, SidecarError> {
    let store = store()?;
    let profile = load_profile(&store, id)?;
    to_value(&inspect_profile(&profile)?)
}

pub fn validate(id: &str) -> Result<Value, SidecarError> {
    let store = store()?;
    let profile = load_profile(&store, id)?;
    to_value(&report_of(&profile))
}

pub fn set_override(id: &str, property: &str, value: Value) -> Result<Value, SidecarError> {
    let store = store()?;
    let mut profile = load_profile(&store, id)?;

    // The value is coerced to the property's schema type and then set through
    // the typed setter, so "1920" for `screen.width` becomes a number and a
    // string stays a string. A UI that sends every field as a string would
    // otherwise produce identities the engine drops, which is the failure this
    // exists to prevent.
    let schema = narrc_core::PropertySchema::load().map_err(|error| {
        SidecarError::new(
            ErrorKind::Io,
            format!("the engine schema is unavailable, so no edit can be checked: {error}"),
        )
    })?;
    let Some(kind) = schema.kind(property) else {
        return Err(SidecarError::new(
            ErrorKind::Invalid,
            format!("the engine has no property named {property:?}"),
        ));
    };
    let Some(coerced) = kind.coerce(&value) else {
        return Err(SidecarError::new(
            ErrorKind::Invalid,
            format!("{property:?} wants a {kind}, not a {}", json_type(&value)),
        ));
    };
    let was_coerced = coerced != value;
    profile
        .overrides
        .set(&schema, property, coerced.clone())
        .map_err(|error| SidecarError::new(ErrorKind::Invalid, error.to_string()))?;

    let problems = profile.validate_overrides();
    store.save(&profile)?;

    Ok(json!({
        "property": property,
        "value": coerced,
        // The UI needs to know it edited one field and got another back: a
        // number field that silently became a number is fine, but a boolean
        // that became the string "false" is not, and this is how it says so.
        "coerced": was_coerced,
        "problems": problems,
        "report": report_of(&profile),
    }))
}

pub fn clear_override(id: &str, property: &str) -> Result<Value, SidecarError> {
    let store = store()?;
    let mut profile = load_profile(&store, id)?;
    let removed = profile.overrides.remove(property);
    if removed.is_none() {
        return Err(SidecarError::new(
            ErrorKind::NotFound,
            format!("{property:?} is not overridden on {id:?}"),
        ));
    }
    store.save(&profile)?;
    Ok(json!({
        "property": property,
        "report": report_of(&profile),
    }))
}

/// The engine's property schema: every property name with its declared type.
///
/// An editor needs the type of each field to render the right input and to
/// refuse a value the engine would drop before it is sent. The schema is
/// vendored into the binary, so this is a lookup rather than a file read, and
/// it cannot disagree with what [`set_override`] validates against — they load
/// the same bytes.
pub fn schema() -> Result<Value, SidecarError> {
    let schema = narrc_core::PropertySchema::load().map_err(|error| {
        SidecarError::new(
            ErrorKind::Io,
            format!("the engine schema is unavailable: {error}"),
        )
    })?;
    Ok(json!({
        "properties": schema.map(),
        // The properties the generator deliberately never draws: behaviour
        // switches a full-field editor should mark as engine opt-ins rather
        // than present as ordinary identity fields. Kept in the core crate so
        // the wire response and the reachability test quote one list.
        "never_drawn": narrc_core::schema::NEVER_DRAWN,
    }))
}

pub fn plan(id: &str, engine: Option<&str>, headless: bool) -> Result<Value, SidecarError> {
    let store = store()?;
    let profile = load_profile(&store, id)?;
    let plan = profile
        .launch_plan(&store.browser_dir(id), engine, headless)
        .map_err(SidecarError::from)?;
    to_value(&plan)
}

/// Launches the profile's engine at a probe page and reports what it exposed.
///
/// This is the one command that *measures* rather than reasons: everything else
/// here describes the identity the engine was handed, and this asks a page what
/// it can actually read. It therefore starts a real browser, which is why it is
/// a command of its own rather than part of [`validate`] — a validation that
/// took ten seconds and opened a window would not be run.
///
/// The probe is given a throwaway profile directory rather than the profile's
/// own, for the two reasons [`narrc_core::verify::ProbeProfile`] exists: a
/// profile whose browser is already open has a locked directory, and the probe
/// needs a preference the profile must not be left carrying.
///
/// The launch is not headless. A page reads a different rendering path without
/// a window, so a difference found there would be a difference the user would
/// never see — and the values this exists to check are exactly the ones a
/// rendering path decides.
pub fn verify(
    id: &str,
    engine: Option<&str>,
    keep_agreements: bool,
) -> Result<Value, SidecarError> {
    let store = store()?;
    let profile = load_profile(&store, id)?;

    // The identity the plan will carry, resolved the same way `launch_plan`
    // resolves it, so the probe's own preferences describe the same machine the
    // plan configures. A violation surfaces from `launch_plan` below rather
    // than being repaired here: verifying a profile that cannot launch would
    // report on a machine nobody can run.
    let identity = profile.resolved().identity;
    let probe = narrc_core::verify::ProbeProfile::new(&identity).map_err(|error| {
        SidecarError::new(
            ErrorKind::Io,
            format!("could not prepare the probe profile: {error}"),
        )
    })?;

    let plan = profile
        .launch_plan(probe.path(), engine, false)
        .map_err(SidecarError::from)?;

    let report = narrc_core::verify::run(
        &plan,
        narrc_core::verify::DEFAULT_PROBE_TIMEOUT,
        keep_agreements,
    )
    .map_err(|error| {
        // A missing engine or a browser that never reported is the environment,
        // not the request: the same call can succeed once the engine is
        // installed or the machine is less loaded. A plan that could not be read
        // back is the request.
        let kind = if matches!(
            error,
            narrc_core::verify::VerifyError::NoEngine { .. }
                | narrc_core::verify::VerifyError::Timeout { .. }
                | narrc_core::verify::VerifyError::Listen(_)
                | narrc_core::verify::VerifyError::Spawn { .. }
        ) {
            ErrorKind::Io
        } else {
            ErrorKind::Invalid
        };
        SidecarError::new(kind, error.to_string())
    })?;

    to_value(&report)
}

pub fn launch(
    id: &str,
    engine: Option<&str>,
    exit_country: Option<&str>,
) -> Result<Value, SidecarError> {
    let store = store()?;
    let profile = load_profile(&store, id)?;

    // The gate is checked before the plan, and refused before anything is
    // spawned. A proxy in the wrong country means the browser is about to
    // present a machine in one place from an address in another, which is the
    // contradiction this whole crate exists to prevent — and it is visible from
    // outside, so it costs an account rather than a suspicion.
    let geo_gate = profile
        .proxy
        .as_ref()
        .map(|_| profile.check_geo_gate(exit_country));
    if let Some(gate) = &geo_gate {
        if !gate.allows_launch() {
            return Err(SidecarError::new(
                ErrorKind::Conflict,
                format!("the geo gate refused this launch: {gate:?}"),
            ));
        }
    }

    let dir = store.browser_dir(id);
    let (plan, discarded) = profile
        .launch_plan_after_discarding_conflicts(&dir, engine, false)
        .map_err(SidecarError::from)?;

    let pid = spawn(&plan).map_err(|error| {
        SidecarError::new(
            ErrorKind::Io,
            format!("could not start {}: {error}", plan.program),
        )
    })?;

    to_value(&Launched {
        pid,
        plan,
        geo_gate,
        discarded,
    })
}

/// Starts the planned process.
///
/// Stdin and stderr are dropped rather than piped: the browser outlives the
/// sidecar, so a pipe held open by a child that is still running would keep the
/// sidecar from ever exiting, and a reader of a log the UI is not showing is a
/// way to fill a pipe buffer and hang the browser.
fn spawn(plan: &LaunchPlan) -> Result<Option<u32>, std::io::Error> {
    spawn_with_program(plan, &plan.program)
}

/// Starts the planned process under a specific engine binary, detached from
/// this process, and reports the pid of the browser that keeps running.
///
/// The engine re-execs itself: the pid handed back by `spawn` dies within a
/// few hundred milliseconds and the browser that survives is its child. A
/// toast pointing at the dead launcher would be worse than no pid, so the
/// successor is followed before the pid is reported.
pub fn spawn_with_program(
    plan: &LaunchPlan,
    program: &str,
) -> Result<Option<u32>, std::io::Error> {
    let mut command = std::process::Command::new(program);
    command
        .args(&plan.args)
        .envs(&plan.env)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        // Without this a console binary inherits the sidecar's console and
        // Ctrl-C on the sidecar kills the browser too, which a user would
        // reasonably call a crash.
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        // Breakaway asks to leave the launcher's kill-on-close job object, so a
        // browser outlives the app that started it — the point of a detached
        // spawn. The flag fails the whole spawn when no job in the chain allows
        // breakaway (some shells and CI runners wrap everything they start), so
        // a refusal falls back to a plain detached spawn rather than losing the
        // launch.
        const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;
        const ERROR_ACCESS_DENIED: i32 = 5;
        command.creation_flags(DETACHED_PROCESS | CREATE_BREAKAWAY_FROM_JOB);
        let spawned = match command.spawn() {
            Ok(child) => Ok(child),
            Err(error) if error.raw_os_error() == Some(ERROR_ACCESS_DENIED) => {
                command.creation_flags(DETACHED_PROCESS);
                command.spawn()
            }
            Err(error) => Err(error),
        };
        return spawned.and_then(handle_reexec_successor);
    }
    #[cfg(not(windows))]
    {
        let child = command.spawn()?;
        Ok(Some(child.id()))
    }
}

/// On Windows, follows the engine's re-exec to the process that survives.
///
/// The engine re-execs itself: the pid handed back by `spawn` dies within a
/// few hundred milliseconds and the browser that survives is its child. A
/// toast pointing at the dead launcher would be worse than no pid, so the
/// successor is followed before the pid is reported.
#[cfg(windows)]
fn handle_reexec_successor(mut child: std::process::Child) -> Result<Option<u32>, std::io::Error> {
    let pid = child.id();
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(800);
    loop {
        if let Some(successor) = first_child_of(pid) {
            return Ok(Some(successor));
        }
        if child.try_wait()?.is_some() {
            return Ok(Some(pid));
        }
        if std::time::Instant::now() >= deadline {
            return Ok(Some(pid));
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
}

/// The direct child of `parent`, if one exists right now.
#[cfg(windows)]
fn first_child_of(parent: u32) -> Option<u32> {
    #[repr(C)]
    struct ProcessEntry32W {
        dw_size: u32,
        cnt_usage: u32,
        process_id: u32,
        default_heap_id: usize,
        module_id: u32,
        cnt_threads: u32,
        parent_process_id: u32,
        pri_class_base: i32,
        flags: u32,
        exe_file: [u16; 260],
    }

    #[allow(non_snake_case)]
    extern "system" {
        fn CreateToolhelp32Snapshot(flags: u32, process_id: u32) -> *mut core::ffi::c_void;
        fn Process32FirstW(snapshot: *mut core::ffi::c_void, entry: *mut ProcessEntry32W) -> i32;
        fn Process32NextW(snapshot: *mut core::ffi::c_void, entry: *mut ProcessEntry32W) -> i32;
        fn CloseHandle(object: *mut core::ffi::c_void) -> i32;
    }

    const TH32CS_SNAP_PROCESS: u32 = 0x0000_0002;
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAP_PROCESS, 0);
        if snapshot as isize == -1 {
            return None;
        }
        let mut entry = ProcessEntry32W {
            dw_size: core::mem::size_of::<ProcessEntry32W>() as u32,
            ..core::mem::zeroed()
        };
        let mut found = None;
        if Process32FirstW(snapshot, &mut entry) != 0 {
            loop {
                if entry.process_id != 0 && entry.parent_process_id == parent {
                    found = Some(entry.process_id);
                    break;
                }
                if Process32NextW(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snapshot);
        found
    }
}

// ------------------------------------------------------- report and inspect

pub fn report_of(profile: &Profile) -> Report {
    let identity = profile.effective_identity();
    let violations = narrc_core::coherence::validate(&identity, profile.options.os);
    Report {
        id: profile.id.clone(),
        launchable: violations.is_empty() && profile.validate_overrides().is_empty(),
        violations,
        override_problems: profile.validate_overrides(),
        property_count: identity.len(),
    }
}

pub fn inspect_profile(profile: &Profile) -> Result<Inspection, SidecarError> {
    let resolved = profile.resolved();
    let drawn = resolved.drawn.identity;
    let effective = resolved.identity;

    let mut override_diff: Vec<DiffEntry> = profile
        .overrides
        .names()
        .map(|name| DiffEntry {
            property: name.clone(),
            drawn: drawn.get(name).cloned().unwrap_or(Value::Null),
            effective: effective.get(name).cloned().unwrap_or(Value::Null),
            overridden: drawn.get(name) != effective.get(name),
        })
        .collect();
    // Sorted, because the UI renders a table and a table that reorders itself
    // between two identical reads looks like a bug in the data.
    override_diff.sort_by(|a, b| a.property.cmp(&b.property));

    Ok(Inspection {
        summary: describe(&effective, profile.options.os),
        profile: profile.clone(),
        effective,
        drawn,
        override_diff,
        violations: resolved.violations,
        override_problems: profile.validate_overrides(),
        geo: resolved.geo.into(),
    })
}

/// Serialising something that is a plain value can only fail on a type that
/// does not implement `Serialize`, which is a compile error, so this keeps the
/// error type uniform without an `unwrap` at every call site.
pub fn to_value<T: Serialize>(value: &T) -> Result<Value, SidecarError> {
    serde_json::to_value(value)
        .map_err(|error| SidecarError::new(ErrorKind::Invalid, error.to_string()))
}

fn json_type(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

// ------------------------------------------------------------------ fixtures

/// The shapes the TypeScript SDK declares, pinned.
///
/// A field added here without adding it to the SDK is a build failure rather
/// than a UI that shows `undefined`. Written out by hand rather than generated:
/// a generated type cannot catch the SDK drifting from the wire, which is the
/// only thing worth checking.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_summary_carries_exactly_the_documented_keys() {
        let profile = Profile::new("id", "Name", 7, GeneratorOptions::new(TargetOs::Windows));
        let value = serde_json::to_value(ProfileSummary::of(&profile)).unwrap();
        let mut keys: Vec<&str> = value
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            vec![
                "addon_count",
                "coherent",
                "country",
                "digest",
                "id",
                "name",
                "os",
                "override_count",
                "proxied",
                "seed",
                "summary",
            ]
        );
    }

    #[test]
    fn an_error_carries_a_kind_a_ui_can_branch_on() {
        let error = SidecarError::new(ErrorKind::NotFound, "gone");
        let value = serde_json::to_value(&error).unwrap();
        assert_eq!(value["kind"], "not-found");
        assert_eq!(value["message"], "gone");
        // The retry flag is on the wire so the UI does not re-derive the rule,
        // and a "retry" on a missing profile must never be offered.
        assert_eq!(value["retryable"], false);
        assert_eq!(
            serde_json::to_value(SidecarError::new(ErrorKind::Io, "disk")).unwrap()["retryable"],
            true
        );
    }

    #[test]
    fn the_geo_gate_serialises_as_the_sdk_expects() {
        // The SDK declares this as a discriminated union on `verdict`; the
        // kebab-case rename is what makes "not-configured" one token.
        let cases = [
            (GeoGate::NotConfigured, "not-configured"),
            (GeoGate::Pass, "pass"),
            (
                GeoGate::Mismatch {
                    expected: "DE".into(),
                    observed: "US".into(),
                },
                "mismatch",
            ),
            (
                GeoGate::Unknown {
                    expected: "DE".into(),
                },
                "unknown",
            ),
        ];
        for (gate, verdict) in cases {
            let value = serde_json::to_value(&gate).unwrap();
            assert_eq!(value["verdict"], verdict, "{gate:?}");
        }
    }

    #[test]
    fn an_override_problem_serialises_as_the_sdk_expects() {
        let value = serde_json::to_value(OverrideProblem::Unknown {
            property: "x".into(),
        })
        .unwrap();
        assert_eq!(value["problem"], "unknown");
        assert_eq!(value["property"], "x");

        let value = serde_json::to_value(OverrideProblem::WrongType {
            property: "screen.width".into(),
            expected: "uint".into(),
            found: "string".into(),
        })
        .unwrap();
        assert_eq!(value["problem"], "wrong-type");
    }

    #[test]
    fn a_violation_is_a_rule_and_an_explanation() {
        let value = serde_json::to_value(Violation {
            rule: "gpu-matches-os".into(),
            detail: "an Apple GPU on windows".into(),
        })
        .unwrap();
        assert_eq!(value["rule"], "gpu-matches-os");
        assert_eq!(value["detail"], "an Apple GPU on windows");
    }

    #[test]
    fn the_target_os_is_a_lower_case_token() {
        assert_eq!(serde_json::to_value(TargetOs::Windows).unwrap(), "windows");
        assert_eq!(serde_json::to_value(TargetOs::Macos).unwrap(), "macos");
        assert_eq!(serde_json::to_value(TargetOs::Linux).unwrap(), "linux");
    }

    #[test]
    fn a_create_spec_needs_a_name_and_an_os() {
        assert!(serde_json::from_str::<CreateSpec>(r#"{"name":"a","os":"windows"}"#).is_ok());
        assert!(serde_json::from_str::<CreateSpec>(r#"{"os":"windows"}"#).is_err());
        assert!(serde_json::from_str::<CreateSpec>(r#"{"name":"a"}"#).is_err());
        // An unknown field is refused rather than ignored: a UI built against a
        // newer sidecar should hear about it rather than quietly not save.
        assert!(
            serde_json::from_str::<CreateSpec>(r#"{"name":"a","os":"windows","sead":1}"#).is_err()
        );
    }

    #[test]
    fn a_drawn_seed_differs_between_calls() {
        // Two clicks on "new" must not produce the same machine. A fixed seed
        // here would make the button a no-op from the user's point of view.
        let seeds: std::collections::HashSet<u64> = (0..32).map(|_| draw_seed()).collect();
        assert_eq!(seeds.len(), 32, "draw_seed is repeating");
    }

    #[test]
    fn a_summary_describes_the_machine_in_one_line() {
        let profile = Profile::new("id", "Name", 7, GeneratorOptions::new(TargetOs::Windows));
        let summary = ProfileSummary::of(&profile).summary;
        assert!(summary.contains("windows"), "{summary}");
        assert!(summary.contains("cores"), "{summary}");
        assert!(!summary.contains('\n'), "{summary}");
    }

    #[test]
    fn an_inspection_diff_is_sorted_and_flags_what_changed() {
        let mut profile = Profile::new("id", "Name", 7, GeneratorOptions::new(TargetOs::Windows));
        profile
            .overrides
            .set_u32(narrc_core::schema::keys::SCREEN_WIDTH, 2560);
        profile
            .overrides
            .set_str(narrc_core::schema::keys::WEBGL_VENDOR, "Edited Vendor");

        let inspection = inspect_profile(&profile).unwrap();
        let names: Vec<&str> = inspection
            .override_diff
            .iter()
            .map(|entry| entry.property.as_str())
            .collect();
        let mut sorted = names.clone();
        sorted.sort_unstable();
        assert_eq!(names, sorted, "the diff is not sorted");

        let width = inspection
            .override_diff
            .iter()
            .find(|entry| entry.property == narrc_core::schema::keys::SCREEN_WIDTH)
            .unwrap();
        assert!(width.overridden, "a changed value should say so");

        // An edit that restates the drawn value changed nothing, and the UI
        // should not present it as an edit.
        let vendor = inspection
            .override_diff
            .iter()
            .find(|entry| entry.property == narrc_core::schema::keys::WEBGL_VENDOR)
            .unwrap();
        if vendor.drawn == vendor.effective {
            assert!(!vendor.overridden);
        }
    }

    #[test]
    fn a_report_says_whether_the_profile_would_launch() {
        let clean = Profile::new("id", "Name", 7, GeneratorOptions::new(TargetOs::Windows));
        assert!(report_of(&clean).launchable);
        assert!(report_of(&clean).violations.is_empty());

        // A hand edit the engine would drop makes a profile unlaunchable even
        // though every coherence rule passes: the user believes a value is in
        // force and it is not.
        let mut broken = clean.clone();
        broken.overrides.set_str("screen.widt", "1920");
        assert!(!report_of(&broken).launchable);
        assert_eq!(report_of(&broken).override_problems.len(), 1);
    }

    #[test]
    fn a_profile_with_a_malformed_proxy_is_refused_at_creation() {
        // The check belongs at creation, not at launch: a bad proxy found at
        // launch is a browser that already went out unproxied.
        let spec = CreateSpec {
            name: "Bad".into(),
            seed: Some(1),
            os: TargetOs::Windows,
            country: None,
            locale: None,
            screen: None,
            dpr: None,
            fonts: None,
            tracking_protection: None,
            humanize: None,
            addons: None,
            notes: None,
            proxy: Some(CreateProxy {
                url: "proxy.example:3128".into(),
                exit_country: None,
            }),
            extra_args: Vec::new(),
        };
        let error = create(&spec).unwrap_err();
        assert_eq!(error.kind, ErrorKind::Invalid);
        assert!(error.message.contains("proxy"), "{}", error.message);
    }

    #[test]
    fn an_unknown_country_is_refused_before_a_profile_exists() {
        let spec = CreateSpec {
            name: "Bad".into(),
            seed: Some(1),
            os: TargetOs::Windows,
            country: Some("ZZ".into()),
            locale: None,
            screen: None,
            dpr: None,
            fonts: None,
            tracking_protection: None,
            humanize: None,
            addons: None,
            notes: None,
            proxy: None,
            extra_args: Vec::new(),
        };
        let error = create(&spec).unwrap_err();
        assert_eq!(error.kind, ErrorKind::Invalid);
        assert!(error.message.contains("ZZ"), "{}", error.message);
    }

    #[test]
    fn a_blank_name_is_refused() {
        for name in ["", "   ", "\t"] {
            let spec = CreateSpec {
                name: name.into(),
                seed: Some(1),
                os: TargetOs::Windows,
                country: None,
                locale: None,
                screen: None,
                dpr: None,
                fonts: None,
                tracking_protection: None,
            humanize: None,
            addons: None,
                notes: None,
                proxy: None,
                extra_args: Vec::new(),
            };
            assert_eq!(create(&spec).unwrap_err().kind, ErrorKind::Invalid);
        }
    }

    fn panel_and_scale(screen: Option<[u32; 2]>, dpr: Option<f64>) -> SpecOptions<'static> {
        SpecOptions {
            seed: 1,
            os: TargetOs::Windows,
            country: None,
            locale: None,
            screen,
            dpr,
            fonts: None,
            tracking_protection: None,
            humanize: None,
        }
    }

    #[test]
    fn a_scale_pins_only_with_a_panel_it_fits() {
        assert_eq!(
            checked_options(panel_and_scale(Some([1920, 1200]), Some(1.25)))
                .unwrap()
                .dpr,
            Some(1.25)
        );

        // A step Windows does not offer is dropped rather than stored as a
        // claim the coherence layer would reject on read.
        assert_eq!(
            checked_options(panel_and_scale(Some([1920, 1200]), Some(1.3)))
                .unwrap()
                .dpr,
            None
        );

        // A panel that does not divide into a desktop-sized CSS view.
        assert_eq!(
            checked_options(panel_and_scale(Some([1366, 768]), Some(2.5)))
                .unwrap()
                .dpr,
            None
        );

        // A scale with no panel has nothing to divide.
        assert_eq!(
            checked_options(panel_and_scale(None, Some(1.25))).unwrap().dpr,
            None
        );

        // Dropping the scale keeps the panel: the resolution still pins.
        let options = checked_options(panel_and_scale(Some([1920, 1200]), Some(1.3))).unwrap();
        assert_eq!(options.screen, Some((1920, 1200)));
    }

    #[test]
    fn an_update_params_carries_an_id_and_a_spec_only() {
        let params: UpdateParams =
            serde_json::from_str(r#"{"id":"acct","spec":{"name":"a","os":"windows"}}"#).unwrap();
        assert_eq!(params.id, "acct");
        assert!(serde_json::from_str::<UpdateParams>(r#"{"id":"acct"}"#).is_err());
        assert!(
            serde_json::from_str::<UpdateParams>(r#"{"id":"acct","spec":{"name":"a","os":"windows"},"extra":1}"#)
                .is_err()
        );
    }

    #[test]
    fn the_json_type_names_a_value_for_an_error_message() {
        assert_eq!(json_type(&json!("a")), "string");
        assert_eq!(json_type(&json!(1)), "number");
        assert_eq!(json_type(&json!(true)), "boolean");
        assert_eq!(json_type(&json!([])), "array");
        assert_eq!(json_type(&json!({})), "object");
    }

    #[test]
    fn a_summary_carries_no_nested_identity() {
        // The reason summaries are their own type: a list of a hundred profiles
        // must not carry a hundred identities, which is megabytes of JSON to
        // render thirty rows and a value the UI has no business holding until
        // the user opens that profile.
        let profile = Profile::new("id", "Name", 7, GeneratorOptions::new(TargetOs::Windows));
        let value = serde_json::to_value(ProfileSummary::of(&profile)).unwrap();
        let text = value.to_string();
        assert!(!text.contains("hardwareConcurrency"), "{text}");
        assert!(!text.contains("webGl"), "{text}");
    }

    #[test]
    fn the_default_store_path_is_absolute() {
        let path = store_path::default_store().expect("a store path");
        assert!(path.is_absolute(), "{}", path.display());
        assert!(path.ends_with("profiles"), "{}", path.display());
    }

    #[test]
    fn a_launch_plan_serialises_with_the_keys_the_sdk_declares() {
        use std::path::PathBuf;
        let store = PathBuf::from("C:/p");
        let mut config = narrc_core::engine::EngineConfig::new(&store);
        config.program = "camoufox".into();
        let identity = Identity::new();
        let plan = narrc_core::engine::build_plan(&identity, &config).unwrap();
        let value = serde_json::to_value(&plan).unwrap();
        let keys: Vec<&str> = value
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        for key in ["program", "args", "env", "headless", "warnings"] {
            assert!(keys.contains(&key), "{key} missing from {keys:?}");
        }
    }

    #[test]
    fn a_verify_request_parses_with_and_without_its_optional_fields() {
        let request: Request =
            serde_json::from_str(r#"{"id":1,"command":"verify","params":{"id":"acct"}}"#).unwrap();
        match request.command {
            Command::Verify(params) => {
                assert_eq!(params.id, "acct");
                assert_eq!(params.engine, None);
                // Off by default: a covered GPU agrees on well over a hundred
                // values, and a UI that had to opt *out* of listing them would
                // be paying for them on every run.
                assert!(!params.keep_agreements);
            }
            other => panic!("expected a verify request, got {other:?}"),
        }
        let request: Request = serde_json::from_str(
            r#"{"id":2,"command":"verify","params":{"id":"acct","engine":"C:/camoufox.exe","keep_agreements":true}}"#,
        )
        .unwrap();
        match request.command {
            Command::Verify(params) => {
                assert_eq!(params.engine.as_deref(), Some("C:/camoufox.exe"));
                assert!(params.keep_agreements);
            }
            other => panic!("expected a verify request, got {other:?}"),
        }
    }

    #[test]
    fn the_schema_names_every_property_with_its_type() {
        let request: Request =
            serde_json::from_str(r#"{"id":1,"command":"schema","params":{}}"#).unwrap();
        assert!(matches!(request.command, Command::Schema(_)));

        let value = schema().unwrap();
        let properties = value
            .get("properties")
            .and_then(Value::as_object)
            .expect("the schema carries a properties map");
        assert!(properties.len() >= 79, "got {}", properties.len());
        assert_eq!(
            properties.get("navigator.userAgent").and_then(Value::as_str),
            Some("str")
        );
        assert_eq!(
            properties.get("screen.width").and_then(Value::as_str),
            Some("uint")
        );
        // The behaviour switches ride along as a list, so a full-field editor
        // can mark them as engine opt-ins without hard-coding names of its own.
        let never_drawn = value
            .get("never_drawn")
            .and_then(Value::as_array)
            .expect("the schema carries the never-drawn list");
        for known in [
            "addons",
            "disableTheming",
            "instantAnimations",
            "allowMainWorld",
            "humanize:minTime",
        ] {
            assert!(
                never_drawn.iter().any(|name| name.as_str() == Some(known)),
                "{known} missing from {never_drawn:?}"
            );
            assert!(properties.contains_key(known), "{known} not a property");
        }
    }

    #[test]
    fn verifying_a_profile_that_does_not_exist_never_reaches_a_browser() {
        // The lookup runs before anything is launched, so a typo costs a
        // `not-found` rather than a browser start and a two-minute timeout.
        let error = verify("no-such-profile", None, false).unwrap_err();
        assert_eq!(error.kind, ErrorKind::NotFound);
        assert!(error.message.contains("no-such-profile"), "{}", error.message);
    }
}
