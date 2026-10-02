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
//! (`CAMOU_CONFIG_1`, `CAMOU_CONFIG_2`, —? and rejoined by the reader. A
//! profile with a full Windows font list and a long WebGL renderer is around
//! 8 KB, which fits in one chunk; the chunking exists so that the *pathological*
//! cases —?an extended font list, many locales, a custom canvas payload —?still
//! launch instead of failing with an error that gives no clue as to why.
//!
//! Ordering is sorted before chunking so that a given identity always produces
//! the same chunk boundaries. Without that, adding one key would shuffle every
//! later key into a different chunk, and a user diffing two launch logs would
//! be comparing noise.

use std::collections::BTreeMap;

use serde::Serialize;

use crate::error::{Error, Result};
use crate::identity::Identity;

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
    let home = std::env::var(if cfg!(windows) {
        "LOCALAPPDATA"
    } else {
        "HOME"
    })
    .unwrap_or_default();
    if cfg!(windows) {
        format!("{home}\\camoufox\\camoufox.exe")
    } else {
        format!("{home}/.cache/camoufox/camoufox")
    }
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

    let payload = identity.to_config_json();
    let config_vars = chunked_vars(CONFIG_PREFIX, &payload);
    let prefs_vars = chunked_vars(PREFS_PREFIX, &identity.to_prefs_json());

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
    // not share one font cache and contradict each other.
    env.insert(
        FONTCONFIG_PATH_VAR.to_owned(),
        config.profile_dir.join("fonts.conf").display().to_string(),
    );
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

    #[test]
    fn a_typical_payload_fits_in_one_chunk() {
        for os in crate::os::TargetOs::ALL {
            let identity = generator::generate(1, &GeneratorOptions::new(os)).identity;
            let payload = identity.to_config_json();
            let chunks = chunked_vars(CONFIG_PREFIX, &payload);
            assert_eq!(
                chunks.len(),
                1,
                "{os} produced a {} byte payload, which should fit in one chunk",
                payload.len()
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
    fn the_fontconfig_path_is_per_profile() {
        let identity = Identity::new();
        let a = build_plan(&identity, &config("C:/profiles/a")).unwrap();
        let b = build_plan(&identity, &config("C:/profiles/b")).unwrap();
        let path_a = &a.env[FONTCONFIG_PATH_VAR];
        let path_b = &b.env[FONTCONFIG_PATH_VAR];
        assert_ne!(
            path_a, path_b,
            "two profiles sharing one fontconfig path would share a font list"
        );
        assert!(path_a.ends_with("fonts.conf"));
    }

    #[test]
    fn a_missing_engine_is_a_warning_not_an_error() {
        let plan = build_plan(&Identity::new(), &config("C:/profiles/x")).unwrap();
        assert!(
            plan.warnings
                .iter()
                .any(|w| w.contains("engine binary not found")),
            "expected a warning, got {:?}",
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
