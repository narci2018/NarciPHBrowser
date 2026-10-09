//! The engine bridge: an identity in, a launchable process out.
//!
//! # Why this module is thin on purpose
//!
//! The generator knows about machines. This module knows about *Firefox
//! processes*. The split is deliberate: an identity is plain data, so it can be
//! generated, diffed, stored and tested without a browser installed, and the
//! translation that does know about the engine can be replaced without
//! invalidating a single stored profile.
//!
//! # The environment-block limit
//!
//! The engine reads its configuration from the environment, and the
//! environment is not as large as people assume. Windows caps a single
//! environment block at 32767 characters, POSIX at a single argument's
//! `MAX_ARG_STRLEN` of 128 KiB —?but a block that large cannot be passed
//! through most launchers, and macOS `posix_spawn` gets a smaller effective
//! budget in practice. So the payload is **chunked** across numbered variables
//! (`CAMOU_CONFIG_1`, `CAMOU_CONFIG_2`, …) and rejoined by the reader. A profile
//! with a full Windows font list, a long WebGL renderer and its recorded WebGL
//! context is around 10 KB, which is two chunks; the chunking is what keeps the
//! *pathological* cases — an extended font list, many locales, a custom canvas
//! payload — launching instead of failing with an error that gives no clue as
//! to why.
//!
//! Ordering is sorted before chunking so that a given identity always produces
//! the same chunk boundaries. Without that, adding one key would shuffle every
//! later key into a different chunk, and a user diffing two launch logs would
//! be comparing noise.

use std::collections::BTreeMap;

use serde::Serialize;

use crate::error::{Error, Result};
use crate::identity::Identity;
use crate::schema::keys;

/// A launchable description of a browser process.
///
/// `Serialize` because a plan is data, and because a UI has to be able to show
/// what is about to run — the arguments and the environment, in full — before
/// it runs. A plan the user cannot inspect is a plan they have to trust.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LaunchPlan {
    /// The engine binary to run.
    pub program: String,
    /// The arguments, in order.
    pub args: Vec<String>,
    /// The environment, sorted and chunked.
    pub env: BTreeMap<String, String>,
    /// A no-window launch (for proxies and health checks) versus a visible one.
    pub headless: bool,
    /// Warnings raised while building the plan, which do not block the launch.
    pub warnings: Vec<String>,
}

impl LaunchPlan {
    /// The variables the engine reads, for a log line that is safe to print.
    ///
    /// The values are the point, so this is opt-in and never used to build a
    /// command line that gets written to disk.
    pub fn describe(&self) -> String {
        let mut out = format!("{} {:?}", self.program, self.args);
        for (key, value) in &self.env {
            out.push_str(&format!(" {key}={value}"));
        }
        out
    }
}

/// The prefix for the chunked configuration variables.
pub const CONFIG_PREFIX: &str = "CAMOU_CONFIG";
/// The prefix for the chunked preference variables.
pub const PREFS_PREFIX: &str = "CAMOU_PREFS";

/// Where the engine reads its fontconfig configuration.
///
/// `FONTCONFIG_FILE`, not an invented name: this is the variable upstream
/// points at its per-OS font bundle with (see `resources/UPSTREAM.md`), and an
/// engine that cannot find its fonts falls back to the host's —?which is how a
/// profile that claims ten installed fonts ends up reporting four hundred.
///
/// The path is per profile so that two profiles with different font lists do
/// not share one font cache and contradict each other.
pub const FONTCONFIG_PATH_VAR: &str = "FONTCONFIG_FILE";

/// The per-chunk limit.
///
/// Deliberately conservative. 8192 characters of payload is 16 KB of
/// environment block per chunk, which leaves room for the rest of the block —?/// `PATH`, `HOME`, the display, the proxy variables —?on every platform
/// without any of them needing arithmetic.
pub const CHUNK_LIMIT: usize = 8 * 1024;

/// The Windows environment-block ceiling, in UTF-16 code units.
#[cfg(windows)]
pub const ENV_BLOCK_LIMIT: usize = 32_767;
/// The POSIX ceiling worth respecting in practice.
#[cfg(not(windows))]
pub const ENV_BLOCK_LIMIT: usize = 128 * 1024;

/// Splits `value` into chunks of at most `limit` characters.
///
/// A split that would land inside a multi-byte UTF-8 sequence is moved forward
/// to the next character boundary, because half a codepoint in an environment
/// variable is a launch failure with an unreadable error message —?and
/// non-Latin font family names make multi-byte sequences routine, not exotic.
pub fn chunk_value(value: &str, limit: usize) -> Vec<&str> {
    assert!(limit > 0, "chunk limit must be positive");
    if value.is_empty() {
        return vec![""];
    }

    let mut chunks = Vec::new();
    let bytes = value.as_bytes();
    let mut start = 0;
    while start < value.len() {
        let mut end = (start + limit).min(value.len());
        while end > start && !value.is_char_boundary(end) {
            end -= 1;
        }
        if end == start {
            // A single character longer than the limit. It cannot be split, so
            // it gets a chunk of its own and the caller is over budget.
            end = (start + 4).min(value.len());
            while end < value.len() && !value.is_char_boundary(end) {
                end += 1;
            }
        }
        chunks.push(&value[start..end]);
        start = end;
    }
    debug_assert!(bytes.len() == value.len());
    chunks
}

/// Builds the numbered chunk variables for one logical value.
///
/// Returns an empty map for an empty value: a `CAMOU_CONFIG_1=` that is empty
/// and a `CAMOU_CONFIG_1` that is absent are the same thing to the reader, and
/// the absent one does not appear in a diff.
pub fn chunked_vars(prefix: &str, value: &str) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    if value.is_empty() {
        return map;
    }
    for (index, chunk) in chunk_value(value, CHUNK_LIMIT).iter().enumerate() {
        map.insert(format!("{prefix}_{}", index + 1), (*chunk).to_owned());
    }
    map
}

/// Reassembles numbered chunks back into the original value.
///
/// This is the reader's half of the contract, and it is here —?not only in the
/// browser —?so the round trip is testable without one.
pub fn rejoin_chunks(chunks: &[&str]) -> String {
    chunks.concat()
}

/// The directory the launcher installs the engine into, per platform.
///
/// Windows keeps the install beside the user profile (`%USERPROFILE%\camoufox`),
/// where the engine's own layout expects to sit; everywhere else the XDG cache
/// convention holds (`~/.cache/camoufox`). The installer and the default
/// engine path must agree on this, or a plan built without the launcher's
/// binary override would point at a location nothing installs into.
pub fn engine_install_dir() -> std::path::PathBuf {
    if let Ok(explicit) = std::env::var("NARCI_CAMOUFOX_DIR") {
        return explicit.into();
    }
    let home = std::env::var(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .unwrap_or_default();
    if cfg!(windows) {
        std::path::PathBuf::from(home).join("camoufox")
    } else {
        std::path::PathBuf::from(home).join(".cache").join("camoufox")
    }
}

/// The engine binary's file name, per platform.
pub fn engine_binary_name() -> &'static str {
    if cfg!(windows) {
        "camoufox.exe"
    } else {
        "camoufox"
    }
}

/// Where the engine binary is expected to live.
///
/// A path, not a bundled resource. The engine is a ~200 MB Firefox build and
/// licensing it into this project's binary is not this crate's decision to
/// make; the launcher checks the path, reports clearly when it is missing, and
/// the UI points at the setting.
pub fn default_engine_path() -> String {
    if let Ok(explicit) = std::env::var("NARCI_CAMOUFOX_PATH") {
        return explicit;
    }
    engine_install_dir()
        .join(engine_binary_name())
        .to_string_lossy()
        .to_string()
}

/// Everything the launcher needs beyond the identity itself.
#[derive(Debug, Clone, PartialEq)]
pub struct EngineConfig {
    /// The engine binary.
    pub program: String,
    /// A per-profile profile directory, where prefs and storage live.
    pub profile_dir: std::path::PathBuf,
    /// Extra arguments, passed through after the identity arguments.
    pub extra_args: Vec<String>,
    /// Variables to set alongside the identity, e.g. a proxy.
    pub extra_env: BTreeMap<String, String>,
    /// Preferences pinned on top of the identity's own, e.g. a proxy's
    /// `network.proxy.*`.
    ///
    /// Applied after [`Identity::to_prefs_json`], so a caller's value wins
    /// rather than being overwritten by the identity's default. The identity
    /// pins `network.proxy.type` to `0` — "no proxy" — which is right for a
    /// profile with none and would silently disconnect a profile that has one.
    pub extra_prefs: BTreeMap<String, serde_json::Value>,
    /// Warnings the caller already knows, carried into the plan's own.
    ///
    /// The launcher has facts the identity does not — a proxy that cannot be
    /// fully expressed, a scheme the engine dials differently — and a warning
    /// only helps if it reaches the user in the same list as every other one.
    pub extra_warnings: Vec<String>,
    /// Launch without a window.
    pub headless: bool,
    /// Suppress the first-run pages and the update check.
    pub suppress_noise: bool,
}

impl EngineConfig {
    /// A config pointing at the default engine location and a profile directory.
    pub fn new(profile_dir: impl Into<std::path::PathBuf>) -> Self {
        Self {
            program: default_engine_path(),
            profile_dir: profile_dir.into(),
            extra_args: Vec::new(),
            extra_env: BTreeMap::new(),
            extra_prefs: BTreeMap::new(),
            extra_warnings: Vec::new(),
            headless: false,
            suppress_noise: true,
        }
    }
}

/// The arguments that make a launch reproducible and quiet.
///
/// Each of these earns its place:
///
/// * `--profile <dir>` —?the profile directory, so two profiles never share
///   storage. A missing one is a silent cookie collision.
/// * `--no-remote` —?a second launch must not attach to a first one and
///   inherit *its* identity.
/// * `--new-instance` —?the matching half of `--no-remote`; without it the
///   first process wins and the second is a no-op that exits zero.
/// * `--no-first-run`, `--no-default-browser-check` —?the welcome flow opens
///   tabs and sets a default browser, both of which are user-visible side
///   effects of launching a tool.
///
/// Private-browsing mode is deliberately absent: the per-profile directory
/// already keeps two profiles apart, and making a profile ephemeral would
/// throw away the cookies it exists to keep — while landing every launch on
/// the private-browsing page, which no ordinary first visit looks like.
pub fn base_args(config: &EngineConfig) -> Vec<String> {
    let mut args = vec![
        "--profile".to_owned(),
        config.profile_dir.display().to_string(),
        "--no-remote".to_owned(),
        "--new-instance".to_owned(),
    ];
    if config.headless {
        args.push("--headless".to_owned());
    }
    if config.suppress_noise {
        args.push("--no-first-run".to_owned());
        args.push("--no-default-browser-check".to_owned());
    }
    args.extend(config.extra_args.iter().cloned());
    args
}

/// Warns when a spoofed WebGL renderer has no recorded limit table to match.
///
/// The engine's `MaskConfig::MParamGL` returns the *host's* value for any
/// parameter the config does not name, and an absent or empty extension list
/// falls through to the host's too (see `resources/UPSTREAM.md` for the two
/// source sites). So an identity that spoofs the renderer but not the table
/// does not present a merely less-detailed GPU — it presents one whose limits
/// contradict the name printed beside them, which is a stronger tell than
/// either value would be alone.
///
/// This is a warning and not a coherence violation on purpose. A hand edit
/// that sets only the renderer is a legal configuration, and the coherence
/// layer's violations make a profile *unlaunchable* — which would turn a
/// coverage gap in the corpus into a refusal to run roughly half the pool.
fn webgl_coverage_warnings(identity: &Identity) -> Vec<String> {
    let Some(renderer) = identity.get_str(keys::WEBGL_RENDERER) else {
        return Vec::new();
    };
    let mut missing = Vec::new();
    if !identity.is_set(keys::WEBGL_PARAMETERS) {
        missing.push("the limit table (webGl:parameters)");
    }
    if !identity.is_set(keys::WEBGL_EXTENSIONS) {
        missing.push("the extension list (webGl:supportedExtensions)");
    }
    if missing.is_empty() {
        return Vec::new();
    }
    // The precision refusal is the one part of the gap the generator *can*
    // close, so say which of the two situations this is: a refusal carries no
    // information about the machine, but it is not a substitute for a table.
    let mitigation = if identity.get_bool(keys::WEBGL_SHADER_PRECISION_BLOCK) == Some(true) {
        " (the shader-precision query is refused rather than answered, but that does not supply \
         the missing values)"
    } else {
        ""
    };
    vec![format!(
        "WebGL renderer {renderer:?} has no recorded {}: the engine answers those from the host, \
         so the spoofed renderer contradicts its own limits{mitigation}",
        missing.join(" and ")
    )]
}

/// Properties the engine's own property list declares but the installed build
/// does not apply, with the value a page reads instead.
///
/// Measured, not read off a changelog: `cargo run -p narrc-core --example probe
/// -- host` launches the engine with an empty identity, and a claimed value is
/// compared against what the page read back. Confirmed by claiming a
/// distinctive value and seeing the engine's own answer return.
///
/// * `navigator.buildID` reports the engine's fixed constant. The generator
///   already writes that same value (see `pools::FIREFOX_BUILD_ID`), so this
///   only warns if something set a different one.
///
/// `navigator.doNotTrack` was listed here and should not have been. It is
/// **pref-backed** in Firefox rather than property-backed — the main-thread
/// getter, the `WorkerNavigator` getter and the `DNT` request header all derive
/// from `privacy.donottrackheader.enabled`, and the engine never reads the
/// config key. The divergence was therefore ours to close, not the engine's to
/// fix: `Identity::to_prefs_json` writes that pref, and a profile claiming `"1"`
/// now reads back `"1"` (measured 119/119 agreed, with `dnt: 1` on the request).
/// Keeping it in this list would have told users to expect a leak that no
/// longer exists.
pub const UNAPPLIED_PROPERTIES: &[(&str, &str)] =
    &[("navigator.buildID", crate::pools::FIREFOX_BUILD_ID)];

/// Warns when an identity claims a property the engine will not deliver.
///
/// A warning rather than a coherence violation, for the same reason as
/// [`webgl_coverage_warnings`]: the profile is still launchable and still
/// mostly correct, and a violation would make the first such profile
/// unlaunchable. The user is told what a site will see instead.
fn unapplied_property_warnings(identity: &Identity) -> Vec<String> {
    let mut warnings = Vec::new();
    for (property, presented) in UNAPPLIED_PROPERTIES {
        let Some(claimed) = identity.get_str(property) else {
            continue;
        };
        if claimed != *presented {
            warnings.push(format!(
                "the installed engine does not apply {property}: this profile claims {claimed:?} \
                 but a page reads {presented:?}"
            ));
        }
    }
    warnings
}

/// The identity's preferences with the config's own pinned over them.
///
/// Two writers decide `network.proxy.type`: the identity, which writes `0`
/// because a profile with no proxy should say so, and the caller that knows
/// the profile has one. Whichever wrote second used to win by *being second in
/// nothing at all* — the identity's value was the only one written, and the
/// browser read "no proxy" for a profile the user had configured one for. This
/// is the merge that gives the caller the last word.
fn pinned_prefs(identity: &Identity, config: &EngineConfig) -> Result<String> {
    if config.extra_prefs.is_empty() {
        return Ok(identity.to_prefs_json());
    }
    let mut prefs: serde_json::Map<String, serde_json::Value> = serde_json::from_str(
        &identity.to_prefs_json(),
    )
    .map_err(|error| Error::identity(format!("identity prefs are not JSON: {error}")))?;
    for (name, value) in &config.extra_prefs {
        prefs.insert(name.clone(), value.clone());
    }
    serde_json::to_string(&prefs)
        .map_err(|error| Error::identity(format!("could not serialize prefs: {error}")))
}

/// Turns an identity into a launch plan.
///
/// The returned plan is *not* executed. Executing it is the sidecar's job, and
/// the split is what lets this function be unit-tested on a machine with no
/// engine installed and no profile directory on disk.
pub fn build_plan(identity: &Identity, config: &EngineConfig) -> Result<LaunchPlan> {
    let mut warnings = Vec::new();

    let program = std::path::Path::new(&config.program);
    if !program.exists() {
        // Not an error. A developer running the test suite has no engine, and
        // a user who has not installed one yet should get a plan they can
        // inspect alongside a clear message, not a failed launch.
        warnings.push(format!(
            "engine binary not found at {}; set NARCI_CAMOUFOX_PATH",
            config.program
        ));
    }

    // An addon path that is not there is skipped by the engine without a
    // word — the profile the user sees would silently run without the
    // extension they believe it carries.
    for addon in identity.get_str_array(crate::schema::keys::ADDONS).unwrap_or_default() {
        if !std::path::Path::new(&addon).exists() {
            warnings.push(format!("addon {addon:?} does not exist; the engine would skip it"));
        }
    }

    warnings.extend(webgl_coverage_warnings(identity));
    warnings.extend(unapplied_property_warnings(identity));
    warnings.extend(config.extra_warnings.iter().cloned());

    let payload = identity.to_config_json();
    let config_vars = chunked_vars(CONFIG_PREFIX, &payload);
    let prefs_vars = chunked_vars(PREFS_PREFIX, &pinned_prefs(identity, config)?);

    let total: usize = config_vars
        .values()
        .chain(prefs_vars.values())
        .map(String::len)
        .sum();
    if total > ENV_BLOCK_LIMIT {
        // Should be unreachable given CHUNK_LIMIT and the 128 KiB ceiling, but
        // the failure mode is a launch error with no cause, so it is worth
        // naming here where the numbers are known.
        warnings.push(format!(
            "identity payload is {total} bytes across {} chunks, over the {} byte environment budget",
            config_vars.len() + prefs_vars.len(),
            ENV_BLOCK_LIMIT
        ));
    }

    let mut env = BTreeMap::new();
    env.extend(config_vars);
    env.extend(prefs_vars);
    // A per-profile fontconfig, so two profiles with different font lists do
    // not share one font cache and contradict each other. Pointed at only
    // when the file is there: a fontconfig variable naming a file that does
    // not exist is read as "no font configuration" by anything that honours
    // it, which is the host-font fallback the variable exists to prevent.
    // (Nothing in this crate writes fonts.conf yet — see resources/UPSTREAM.md.)
    let fonts_conf = config.profile_dir.join("fonts.conf");
    if fonts_conf.is_file() {
        env.insert(
            FONTCONFIG_PATH_VAR.to_owned(),
            fonts_conf.display().to_string(),
        );
    }
    env.extend(config.extra_env.iter().map(|(k, v)| (k.clone(), v.clone())));

    Ok(LaunchPlan {
        program: config.program.clone(),
        args: base_args(config),
        env,
        headless: config.headless,
        warnings,
    })
}

/// Reads back an identity from a set of environment variables.
///
/// The inverse of [`build_plan`], and the half the tests rely on: a round trip
/// through chunked environment variables must return exactly the identity that
/// went in, or the chunking has silently corrupted someone's profile.
pub fn identity_from_env(env: &BTreeMap<String, String>) -> Result<Identity> {
    let chunks = numbered_chunks(env, CONFIG_PREFIX);
    if chunks.is_empty() {
        return Err(Error::InvalidConfig(
            "no CAMOU_CONFIG chunks in the environment".into(),
        ));
    }
    let payload = rejoin_chunks(&chunks);
    Identity::from_config_json(&payload)
}

/// Collects `PREFIX_1`, `PREFIX_2`, —?in order, stopping at the first gap.
///
/// Stopping at the gap rather than skipping it is the point: a missing chunk
/// means a truncated environment, and reassembling the remainder would produce
/// a profile that is *almost* right —?which is worse than refusing, because it
/// looks like it worked.
pub fn numbered_chunks<'a>(env: &'a BTreeMap<String, String>, prefix: &str) -> Vec<&'a str> {
    let mut chunks = Vec::new();
    for index in 1..=1024 {
        match env.get(&format!("{prefix}_{index}")) {
            Some(value) => chunks.push(value.as_str()),
            None => break,
        }
    }
    chunks
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generator::{self, GeneratorOptions};
    use std::collections::HashSet;

    fn config(dir: &str) -> EngineConfig {
        EngineConfig::new(dir)
    }

    /// A typical payload fits in the environment budget with room to spare.
    ///
    /// The chunking is no longer only pathological-case insurance: a recorded
    /// WebGL context is a real parameter table, not a handful of constants, so
    /// a typical identity now spans two chunks. What has to hold is that the
    /// total stays well inside the platform ceiling and that the chunks
    /// reassemble losslessly.
    #[test]
    fn a_typical_payload_fits_in_the_environment_budget() {
        for os in crate::os::TargetOs::ALL {
            let identity = generator::generate(1, &GeneratorOptions::new(os)).identity;
            let payload = identity.to_config_json();
            let prefs = identity.to_prefs_json();

            let mut env = chunked_vars(CONFIG_PREFIX, &payload);
            env.extend(chunked_vars(PREFS_PREFIX, &prefs));
            let total: usize = env.values().map(String::len).sum();

            assert!(
                total <= ENV_BLOCK_LIMIT / 2,
                "{os} produced a {total} byte payload, over half the {ENV_BLOCK_LIMIT} byte budget"
            );
            // However many chunks it took, the reader gets the identity back.
            assert_eq!(
                identity_from_env(&env).expect("the chunks reassemble").to_config_json(),
                payload,
                "{os} did not survive the round trip through the environment"
            );
        }
    }

    #[test]
    fn chunking_splits_only_when_it_must() {
        assert_eq!(chunk_value("short", 8192), vec!["short"]);
        assert_eq!(chunk_value("", 8192), vec![""]);
        let long = "x".repeat(CHUNK_LIMIT + 1);
        let chunks = chunk_value(&long, CHUNK_LIMIT);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks.concat(), long);
    }

    #[test]
    fn chunking_never_splits_a_codepoint() {
        // Chinese font family names are three bytes each, and a chunk boundary
        // that lands inside one is a launch failure with no error message.
        let value: String = "\u{5fae}".repeat(4000);
        for limit in [1usize, 2, 4, 5, 7, 8, 8192] {
            for chunk in chunk_value(&value, limit) {
                assert!(
                    std::str::from_utf8(chunk.as_bytes()).is_ok(),
                    "limit {limit} produced an invalid chunk"
                );
            }
            assert_eq!(chunk_value(&value, limit).concat(), value, "limit {limit}");
        }
    }

    #[test]
    fn an_empty_value_produces_no_variables() {
        assert!(chunked_vars(CONFIG_PREFIX, "").is_empty());
    }

    #[test]
    fn chunk_variables_are_numbered_from_one() {
        let value = "y".repeat(CHUNK_LIMIT * 3);
        let vars = chunked_vars(CONFIG_PREFIX, &value);
        let keys: Vec<&String> = vars.keys().collect();
        assert_eq!(keys.len(), 3);
        assert_eq!(keys[0], "CAMOU_CONFIG_1");
        assert_eq!(keys[1], "CAMOU_CONFIG_2");
        assert_eq!(keys[2], "CAMOU_CONFIG_3");
    }

    #[test]
    fn a_gap_in_the_numbering_stops_the_reassembly() {
        let mut env = BTreeMap::new();
        env.insert("CAMOU_CONFIG_1".to_owned(), "{\"a\":".to_owned());
        env.insert("CAMOU_CONFIG_2".to_owned(), "1,".to_owned());
        // 3 is missing: 4 must not be picked up.
        env.insert("CAMOU_CONFIG_4".to_owned(), "\"z\":1}".to_owned());
        let chunks = numbered_chunks(&env, CONFIG_PREFIX);
        assert_eq!(chunks, vec!["{\"a\":", "1,"]);
    }

    #[test]
    fn a_plan_round_trips_through_the_environment() {
        for os in crate::os::TargetOs::ALL {
            let identity = generator::generate(7, &GeneratorOptions::new(os)).identity;
            let plan = build_plan(&identity, &config("C:/profiles/7")).unwrap();
            let restored = identity_from_env(&plan.env).unwrap();
            assert_eq!(restored, identity, "{os} did not survive the round trip");
        }
    }

    #[test]
    fn a_plan_uses_numbered_chunks_for_config_and_prefs_separately() {
        let identity = generator::generate(3, &GeneratorOptions::default()).identity;
        let plan = build_plan(&identity, &config("C:/profiles/3")).unwrap();
        assert!(plan.env.contains_key("CAMOU_CONFIG_1"));
        assert!(plan.env.contains_key("CAMOU_PREFS_1"));
        // Rejoining the config chunks must be valid JSON on its own.
        let chunks = numbered_chunks(&plan.env, CONFIG_PREFIX);
        serde_json::from_str::<serde_json::Value>(&rejoin_chunks(&chunks)).unwrap();
    }

    #[test]
    fn every_chunk_key_in_a_plan_is_contiguous() {
        let identity = generator::generate(11, &GeneratorOptions::default()).identity;
        let plan = build_plan(&identity, &config("C:/profiles/11")).unwrap();
        for prefix in [CONFIG_PREFIX, PREFS_PREFIX] {
            let count = plan
                .env
                .keys()
                .filter(|key| key.starts_with(&format!("{prefix}_")))
                .count();
            assert_eq!(
                numbered_chunks(&plan.env, prefix).len(),
                count,
                "{prefix} has a gap in its numbering"
            );
        }
    }

    #[test]
    fn the_plan_keeps_two_profiles_in_separate_directories() {
        let identity = Identity::new();
        let a = build_plan(&identity, &config("C:/profiles/a")).unwrap();
        let b = build_plan(&identity, &config("C:/profiles/b")).unwrap();
        assert_ne!(a.args, b.args);
        assert!(a
            .args
            .windows(2)
            .any(|pair| pair == ["--profile".to_owned(), "C:/profiles/a".to_owned()]));
        assert!(b
            .args
            .windows(2)
            .any(|pair| pair == ["--profile".to_owned(), "C:/profiles/b".to_owned()]));
    }

    #[test]
    fn the_fontconfig_path_appears_only_when_the_file_exists() {
        let identity = Identity::new();
        let base = std::env::temp_dir().join(format!("narci-fonts-{}", std::process::id()));
        let dir_a = base.join("a");
        let dir_b = base.join("b");
        std::fs::create_dir_all(&dir_a).unwrap();
        std::fs::create_dir_all(&dir_b).unwrap();
        std::fs::write(dir_a.join("fonts.conf"), "<fontconfig/>").unwrap();

        // Without the file, the variable is absent: pointing it at a file that
        // does not exist reads as "no font configuration" and invites the
        // host-font fallback it exists to prevent.
        let absent = build_plan(&identity, &config(dir_b.to_string_lossy().as_ref())).unwrap();
        assert!(!absent.env.contains_key(FONTCONFIG_PATH_VAR));

        let present = build_plan(&identity, &config(dir_a.to_string_lossy().as_ref())).unwrap();
        let path = present.env[FONTCONFIG_PATH_VAR].as_str();
        assert!(path.ends_with("fonts.conf"));
        assert!(path.contains("a"));

        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn a_missing_engine_is_a_warning_not_an_error() {
        // An explicit missing path, so the test does not depend on whether the
        // machine running it happens to have the engine installed.
        let mut missing = config("C:/profiles/x");
        missing.program = "C:/definitely/not/an/engine.exe".to_owned();
        let plan = build_plan(&Identity::new(), &missing).unwrap();
        assert!(
            plan.warnings
                .iter()
                .any(|w| w.contains("engine binary not found")),
            "expected a warning, got {:?}",
            plan.warnings
        );
    }

    #[test]
    fn a_missing_addon_path_is_a_warning_not_an_error() {
        let mut identity = Identity::new();
        identity.set_str_array(
            crate::schema::keys::ADDONS,
            ["C:/definitely/not/there.xpi"],
        );
        let plan = build_plan(&identity, &config("C:/profiles/x")).unwrap();
        assert!(
            plan.warnings
                .iter()
                .any(|w| w.contains("does not exist") && w.contains("not/there.xpi")),
            "expected a missing-addon warning, got {:?}",
            plan.warnings
        );
    }

    /// A spoofed renderer with no limit table is flagged, because the engine
    /// would answer every WebGL parameter from the host and contradict it.
    #[test]
    fn a_renderer_without_a_limit_table_is_flagged() {
        let mut identity = Identity::new();
        identity.set_str(crate::schema::keys::WEBGL_RENDERER, "Apple M2, or similar");
        let plan = build_plan(&identity, &config("C:/profiles/x")).unwrap();
        assert!(
            plan.warnings
                .iter()
                .any(|w| w.contains("Apple M2") && w.contains("contradicts its own limits")),
            "expected a coverage warning, got {:?}",
            plan.warnings
        );

        // The generator's own refusal for an uncovered GPU is named as the
        // mitigation it is, not as a fix. The renderer comes from the hardware
        // draw in the real pipeline, so it is set by hand here.
        let mut uncovered = Identity::new();
        uncovered.set_str(crate::schema::keys::WEBGL_RENDERER, "Apple M2, or similar");
        crate::generator::webgl::write_webgl(
            &mut uncovered,
            "Apple M2, or similar",
            crate::os::TargetOs::Macos,
            1,
        );
        let plan = build_plan(&uncovered, &config("C:/profiles/x")).unwrap();
        assert!(
            plan.warnings
                .iter()
                .any(|w| w.contains("shader-precision query is refused")),
            "expected the refusal to be described, got {:?}",
            plan.warnings
        );
    }

    /// A fully spoofed context says nothing, so the warning stays quiet on the
    /// coverage the corpus does have.
    #[test]
    fn a_spoofed_context_raises_no_coverage_warning() {
        let identity = generator::generate(0xabc, &GeneratorOptions::new(crate::os::TargetOs::Windows))
            .identity;
        assert!(identity.is_set(crate::schema::keys::WEBGL_RENDERER));
        assert!(identity.is_set(crate::schema::keys::WEBGL_PARAMETERS));
        let plan = build_plan(&identity, &config("C:/profiles/x")).unwrap();
        assert!(
            !plan.warnings.iter().any(|w| w.contains("contradicts its own limits")),
            "a recorded GPU must not be flagged, got {:?}",
            plan.warnings
        );
    }

    #[test]
    fn a_property_the_engine_cannot_deliver_is_flagged() {
        let mut identity = Identity::new();
        identity.set_str(crate::schema::keys::BUILD_ID, "20190909000000");
        let plan = build_plan(&identity, &config("C:/profiles/x")).unwrap();
        assert!(
            plan.warnings
                .iter()
                .any(|warning| warning.contains("navigator.buildID")),
            "a buildID the engine cannot honour must be flagged, got {:?}",
            plan.warnings
        );
    }

    /// Tracking protection is on by default and `"1"` is delivered, so it must
    /// *not* be flagged: the claim reaches the page through
    /// `privacy.donottrackheader.enabled`, which the plan writes.
    #[test]
    fn a_tracking_protection_claim_is_not_flagged() {
        let mut identity = Identity::new();
        identity.set_str(crate::schema::keys::DO_NOT_TRACK, "1");
        let plan = build_plan(&identity, &config("C:/profiles/x")).unwrap();
        assert!(
            !plan
                .warnings
                .iter()
                .any(|warning| warning.contains("navigator.doNotTrack")),
            "a delivered DNT claim must not be reported as a leak, got {:?}",
            plan.warnings
        );
    }

    #[test]
    fn a_property_the_engine_delivers_is_not_flagged() {
        let mut identity = Identity::new();
        identity.set_str(crate::schema::keys::DO_NOT_TRACK, "unspecified");
        identity.set_str(crate::schema::keys::BUILD_ID, crate::pools::FIREFOX_BUILD_ID);
        let plan = build_plan(&identity, &config("C:/profiles/x")).unwrap();
        assert!(
            !plan
                .warnings
                .iter()
                .any(|warning| warning.contains("does not apply")),
            "got {:?}",
            plan.warnings
        );
    }

    /// A generated profile writes its buildID to the engine's own value and its
    /// DNT claim to a pref the plan sets, so it is warned about neither.
    #[test]
    fn a_generated_profile_is_not_flagged_over_its_build_id() {
        let identity = generator::generate(7, &GeneratorOptions::default()).identity;
        let plan = build_plan(&identity, &config("C:/profiles/x")).unwrap();
        assert!(
            !plan
                .warnings
                .iter()
                .any(|warning| warning.contains("navigator.buildID")
                    || warning.contains("navigator.doNotTrack")),
            "got {:?}",
            plan.warnings
        );
    }

    #[test]
    fn extra_env_survives_the_plan() {
        let mut config = config("C:/profiles/x");
        config
            .extra_env
            .insert("HTTP_PROXY".to_owned(), "http://127.0.0.1:8080".to_owned());
        let plan = build_plan(&Identity::new(), &config).unwrap();
        assert_eq!(plan.env["HTTP_PROXY"], "http://127.0.0.1:8080");
    }

    /// The preferences a plan hands the browser, reassembled from its chunks.
    fn plan_prefs(plan: &LaunchPlan) -> serde_json::Value {
        let chunks = numbered_chunks(&plan.env, PREFS_PREFIX);
        serde_json::from_str(&rejoin_chunks(&chunks)).expect("the prefs are JSON")
    }

    #[test]
    fn a_pinned_preference_beats_the_identity_default() {
        // Two writers decide `network.proxy.type`, and the one that knows the
        // profile has a proxy has to be the one that lands last. Without the
        // merge the identity's `0` was the only value written, and a browser
        // reading it connected direct for a profile configured to proxy.
        let mut config = config("C:/profiles/x");
        config
            .extra_prefs
            .insert("network.proxy.type".to_owned(), serde_json::json!(1));
        config
            .extra_prefs
            .insert("network.proxy.http".to_owned(), serde_json::json!("proxy.example"));

        let plan = build_plan(&Identity::new(), &config).unwrap();
        let prefs = plan_prefs(&plan);
        assert_eq!(prefs["network.proxy.type"], serde_json::json!(1));
        assert_eq!(
            prefs["network.proxy.http"],
            serde_json::json!("proxy.example")
        );
        // The merge replaces keys, never the payload: everything else the
        // identity pinned is still there.
        assert!(
            prefs.get("privacy.partition.network_state").is_some(),
            "{prefs:?}"
        );
    }

    #[test]
    fn no_pinned_preference_leaves_the_identity_untouched() {
        let plan = build_plan(&Identity::new(), &config("C:/profiles/x")).unwrap();
        assert_eq!(
            plan_prefs(&plan)["network.proxy.type"],
            serde_json::json!(0)
        );
    }

    #[test]
    fn the_callers_own_warnings_reach_the_plan() {
        let mut config = config("C:/profiles/x");
        config
            .extra_warnings
            .push("a proxy cannot be told this".to_owned());

        let plan = build_plan(&Identity::new(), &config).unwrap();
        assert!(plan
            .warnings
            .iter()
            .any(|warning| warning == "a proxy cannot be told this"));
    }

    #[test]
    fn no_plan_carries_the_private_window_flag() {
        // Private mode would land every launch on the private-browsing page
        // and discard the profile's own storage when it closes.
        for headless in [false, true] {
            let mut config = config("C:/profiles/x");
            config.headless = headless;
            let plan = build_plan(&Identity::new(), &config).unwrap();
            assert!(!plan.args.contains(&"--private-window".to_owned()));
            assert_eq!(plan.headless, headless);
        }
    }

    #[test]
    fn no_always_remote_and_new_instance() {
        // Without both, a second launch attaches to the first and silently
        // presents the first profile's identity.
        for headless in [false, true] {
            let mut config = config("C:/profiles/x");
            config.headless = headless;
            let args = base_args(&config);
            assert!(args.contains(&"--no-remote".to_owned()));
            assert!(args.contains(&"--new-instance".to_owned()));
        }
    }

    #[test]
    fn the_same_identity_produces_the_same_plan() {
        let identity = generator::generate(42, &GeneratorOptions::default()).identity;
        let a = build_plan(&identity, &config("C:/profiles/42")).unwrap();
        let b = build_plan(&identity, &config("C:/profiles/42")).unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn different_profiles_produce_different_payloads() {
        let digests: HashSet<String> = (0..50)
            .map(|seed| {
                build_plan(
                    &generator::generate(seed, &GeneratorOptions::default()).identity,
                    &config("C:/profiles/x"),
                )
                .unwrap()
                .env["CAMOU_CONFIG_1"]
                    .clone()
            })
            .collect();
        assert!(
            digests.len() > 45,
            "50 profiles produced {} payloads",
            digests.len()
        );
    }

    #[test]
    fn the_environment_stays_inside_the_platform_budget() {
        // The whole reason chunking exists. A 200-profile launcher that builds
        // one giant CAMOU_CONFIG is one unlucky profile away from a launch
        // failure that looks like a browser bug.
        for seed in 0..40u64 {
            for os in crate::os::TargetOs::ALL {
                let identity = generator::generate(
                    seed,
                    &GeneratorOptions {
                        fonts: crate::generator::FontProfile::Extended,
                        ..GeneratorOptions::new(os)
                    },
                )
                .identity;
                let plan = build_plan(&identity, &config("C:/profiles/x")).unwrap();
                let total: usize = plan.env.values().map(|v| v.len()).sum();
                assert!(
                    total < ENV_BLOCK_LIMIT,
                    "seed {seed}/{os} needs {total} bytes of environment"
                );
            }
        }
    }

    #[test]
    fn a_plan_with_no_chunks_is_an_error_not_an_empty_identity() {
        let env = BTreeMap::new();
        assert!(identity_from_env(&env).is_err());
    }

    #[test]
    fn a_corrupt_payload_is_reported_rather_than_accepted() {
        let mut env = BTreeMap::new();
        env.insert("CAMOU_CONFIG_1".to_owned(), "{not json".to_owned());
        assert!(identity_from_env(&env).is_err());
    }
}
