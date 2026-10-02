//! The profile lifecycle, driven from outside the crate.
//!
//! The unit tests in `src/profile.rs` can reach private helpers, so they cannot
//! catch a type that is `pub` but inconvenient — a field that will not
//! serialize, a method whose signature fights the caller, a default that only
//! exists under `#[cfg(test)]`. This file uses nothing but the public surface,
//! the way the desktop app and the SDK will, so a shape that only works from the
//! inside fails here.

use narrc_core::coherence;
use narrc_core::engine::{self, EngineConfig};
use narrc_core::profile::{GeoGate, OverrideProblem, Profile, ProfileStore, ProxyConfig};
use narrc_core::{schema, GeneratorOptions, Identity, TargetOs};

/// A store in a directory of this test's own, removed on the way in.
///
/// Named per-process rather than per-test so a crashed run cannot leave a
/// directory that makes the next run's assertions pass for the wrong reason.
fn store(tag: &str) -> ProfileStore {
    let root = std::env::temp_dir().join(format!(
        "narrc-e2e-{tag}-{}-{:?}",
        std::process::id(),
        std::thread::current().id()
    ));
    let _ = std::fs::remove_dir_all(&root);
    ProfileStore::open(root).expect("a store in the temp dir")
}

fn windows_profile(id: &str, name: &str, seed: u64) -> Profile {
    Profile::new(id, name, seed, GeneratorOptions::new(TargetOs::Windows))
}

#[test]
fn the_documented_workflow_works_end_to_end() {
    let store = store("workflow");

    // Create.
    let mut profile = windows_profile("acct", "Bank account", 20_260_929);
    profile.notes = "used for the quarterly statement".into();
    profile.proxy = Some(ProxyConfig::new("http://proxy.example:3128").with_exit_country("DE"));
    store.save(&profile).expect("a fresh profile saves");

    // List.
    let listed = store.list();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].name, "Bank account");
    assert_eq!(listed[0].notes, "used for the quarterly statement");

    // Load, and confirm the proxy survived the round trip.
    let loaded = store.load("acct").unwrap().expect("it is there");
    let proxy = loaded.proxy.as_ref().expect("the proxy survived");
    assert_eq!(proxy.exit_country.as_deref(), Some("DE"));
    assert_eq!(proxy.url, "http://proxy.example:3128");

    // Edit: a hand override, and a check that it survives.
    let mut edited = loaded;
    edited
        .overrides
        .set_u32(schema::keys::HARDWARE_CONCURRENCY, 8);
    store.save(&edited).expect("an edit saves");
    let reloaded = store.load("acct").unwrap().unwrap();
    assert_eq!(
        reloaded
            .effective_identity()
            .get_u32(schema::keys::HARDWARE_CONCURRENCY),
        Some(8)
    );

    // Launch.
    let profile_dir = store.browser_dir("acct");
    let plan = reloaded
        .launch_plan(&profile_dir, None, false)
        .expect("a coherent profile launches");

    assert!(!plan.program.is_empty());
    assert!(plan.args.contains(&"--profile".to_owned()));
    assert!(plan.env.contains_key("HTTP_PROXY"));
    assert!(!plan.headless);

    // And the identity the engine would read back is the effective one.
    let delivered = engine::identity_from_env(&plan.env).expect("the env round trips");
    assert_eq!(delivered, reloaded.effective_identity());

    // Delete.
    assert!(store.delete("acct").unwrap());
    assert!(store.list().is_empty());
    assert!(!profile_dir.exists());
}

#[test]
fn a_profile_created_by_one_consumer_is_usable_by_another() {
    // The upgrade path: a profile written by an older build of the app is
    // opened by a newer one, redrawn, and the user's edits are still honoured.
    let store = store("upgrade");
    let mut profile = windows_profile("legacy", "Legacy", 7);
    profile
        .overrides
        .set_str(schema::keys::WEBGL_VENDOR, "Google Inc. (NVIDIA)");
    store.save(&profile).unwrap();

    // Simulate an older build having written fewer fields.
    let path = store.file("legacy");
    let mut raw: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    let object = raw.as_object_mut().unwrap();
    object.remove("proxy");
    object.remove("extra_args");
    std::fs::write(&path, serde_json::to_string(&raw).unwrap()).unwrap();

    let mut reopened = store
        .load("legacy")
        .unwrap()
        .expect("an older profile still loads");
    assert!(reopened.proxy.is_none());
    reopened.extra_args.push("--width=1600".into());
    store.save(&reopened).unwrap();

    let final_read = store.load("legacy").unwrap().unwrap();
    assert_eq!(final_read.extra_args, vec!["--width=1600"]);
    assert_eq!(
        final_read
            .effective_identity()
            .get_str(schema::keys::WEBGL_VENDOR),
        Some("Google Inc. (NVIDIA)")
    );
}

#[test]
fn a_profile_saved_in_one_os_does_not_silently_change_machine_when_reopened() {
    // The determinism promise, exercised across a save: the digest a user could
    // have recorded last month must be the digest they get today.
    let store = store("determinism");
    let profile = windows_profile("det", "Determinism", 424_242);
    let before = profile.effective_identity().digest();
    store.save(&profile).unwrap();

    for _ in 0..5 {
        let read = store.load("det").unwrap().unwrap();
        assert_eq!(read.effective_identity().digest(), before);
    }

    // And a different seed really is a different machine, so the test above is
    // not passing because everything hashes the same.
    let other = windows_profile("other", "Other", 424_243);
    assert_ne!(other.effective_identity().digest(), before);
}

#[test]
fn an_unknown_override_is_caught_before_it_is_saved_as_a_lie() {
    let store = store("unknown");
    let mut profile = windows_profile("typo", "Typo", 1);
    profile.overrides.set_str("webgl.renderer", "NVIDIA");

    let problems = profile.validate_overrides();
    assert_eq!(
        problems,
        vec![OverrideProblem::Unknown {
            property: "webgl.renderer".into()
        }]
    );
    // The right spelling works, which is what makes the report actionable.
    profile.overrides.remove("webgl.renderer");
    profile
        .overrides
        .set_str(schema::keys::WEBGL_RENDERER, "NVIDIA");
    assert_eq!(profile.validate_overrides(), Vec::new());
    store.save(&profile).unwrap();
}

#[test]
fn a_conflicting_edit_is_refused_by_name() {
    // A user who types an Apple GPU into a Windows profile must be told which
    // rule they broke, not handed a browser that contradicts itself.
    let store = store("conflict");
    let mut profile = windows_profile("clash", "Clash", 3);
    profile
        .overrides
        .set_str(schema::keys::WEBGL_RENDERER, "Apple M3 Pro, or similar");
    profile
        .overrides
        .set_str(schema::keys::WEBGL_VENDOR, "Apple, Inc.");
    store.save(&profile).unwrap();

    let loaded = store.load("clash").unwrap().unwrap();
    let rules: Vec<String> = loaded
        .resolved()
        .violations
        .iter()
        .map(|violation| violation.rule.clone())
        .collect();
    assert!(rules.contains(&"gpu-matches-os".to_owned()), "{rules:?}");

    let error = loaded
        .launch_plan(&store.browser_dir("clash"), None, false)
        .unwrap_err()
        .to_string();
    assert!(error.contains("gpu-matches-os"), "{error}");

    // The way out exists, and is explicit.
    let (plan, discarded) = loaded
        .launch_plan_after_discarding_conflicts(&store.browser_dir("clash"), None, false)
        .expect("discarding is a way out");
    assert!(!discarded.is_empty());
    let delivered = engine::identity_from_env(&plan.env).unwrap();
    assert_eq!(delivered.get_str(schema::keys::WEBGL_RENDERER), None);
}

#[test]
fn every_os_survives_the_whole_lifecycle_without_a_violation() {
    // The end-to-end claim the crate is sold on: for each OS, a drawn profile
    // is coherent, coherent after a reload, and coherent after a launch.
    let store = store("lifecycle");
    for os in TargetOs::ALL {
        for seed in 0..12u64 {
            let id = format!("{os}-{seed}");
            let profile = Profile::new(
                id.clone(),
                format!("{os} profile {seed}"),
                seed,
                GeneratorOptions::new(os),
            );
            assert_eq!(
                profile.validate_and_report(),
                Vec::new(),
                "{os} seed {seed} drawn"
            );

            store.save(&profile).expect("saves");
            let loaded = store.load(&id).unwrap().expect("loads");
            assert_eq!(loaded.effective_identity(), profile.effective_identity());

            let plan = loaded
                .launch_plan(&store.browser_dir(&id), None, false)
                .expect("launches");
            let delivered = engine::identity_from_env(&plan.env).unwrap();
            assert_eq!(delivered, loaded.effective_identity(), "{os} seed {seed}");

            // And what actually goes out is coherent, not merely what was stored.
            assert_eq!(
                coherence::validate(&delivered, os),
                Vec::new(),
                "{os} seed {seed} delivered"
            );
        }
    }
}

#[test]
fn the_proxy_gate_is_a_gate_and_not_a_suggestion() {
    let store = store("gate");
    let mut profile = windows_profile("geo", "Geo", 11);
    profile.options.country = Some("DE".into());
    profile.proxy = Some(ProxyConfig::new("http://proxy.example:3128").with_exit_country("DE"));
    store.save(&profile).unwrap();
    let loaded = store.load("geo").unwrap().unwrap();

    assert_eq!(loaded.check_geo_gate(Some("DE")), GeoGate::Pass);
    assert!(loaded.check_geo_gate(Some("DE")).allows_launch());

    // A proxy that is in the wrong country is the failure the gate exists for.
    assert!(!loaded.check_geo_gate(Some("US")).allows_launch());
    // And not knowing is not the same as passing.
    assert!(!loaded.check_geo_gate(None).allows_launch());

    // Pinning the country makes the drawn identity agree with the gate, or the
    // gate would compare against one place and the browser would present another.
    let resolved = loaded.resolved();
    assert_eq!(resolved.geo.country, "DE");
    assert_eq!(
        resolved.identity.get_str(schema::keys::TIMEZONE),
        Some("Europe/Berlin")
    );
}

#[test]
fn a_malformed_proxy_url_is_refused_rather_than_bypassed() {
    // The worst outcome available: the user believes they are proxied, the
    // browser connects direct, and the account is flagged.
    let store = store("badproxy");
    for bad in [
        "proxy.example:3128",
        "http://proxy.example:99999",
        "gopher://x:70",
    ] {
        let mut profile = windows_profile("p", "P", 1);
        profile.proxy = Some(ProxyConfig::new(bad));
        store.save(&profile).unwrap();
        let loaded = store.load("p").unwrap().unwrap();
        assert!(
            loaded
                .launch_plan(&store.browser_dir("p"), None, false)
                .is_err(),
            "{bad} should not produce a launch plan"
        );
    }
}

#[test]
fn headless_and_a_custom_engine_path_reach_the_plan() {
    let store = store("launch");
    let profile = windows_profile("custom", "Custom", 2);
    let mut config = EngineConfig::new(store.browser_dir("custom"));
    config.headless = true;
    config.program = r"C:\engines\camoufox\camoufox.exe".into();

    let plan = engine::build_plan(&profile.effective_identity(), &config).unwrap();
    assert!(plan.headless);
    assert_eq!(plan.program, r"C:\engines\camoufox\camoufox.exe");
}

#[test]
fn many_profiles_coexist_without_touching_each_other() {
    let store = store("many");
    let mut digests = std::collections::HashSet::new();
    for seed in 0..40u64 {
        let id = store.free_id("Bulk", seed);
        let mut profile = Profile::new(
            id.clone(),
            format!("Bulk {seed}"),
            seed,
            GeneratorOptions::new(TargetOs::Linux),
        );
        profile
            .overrides
            .set_u32(schema::keys::HARDWARE_CONCURRENCY, 4 + seed as u32 % 8);
        store.save(&profile).unwrap();

        let loaded = store.load(&id).unwrap().unwrap();
        digests.insert(loaded.effective_identity().digest());
        assert_eq!(
            loaded.overrides.get_u32(schema::keys::HARDWARE_CONCURRENCY),
            Some(4 + seed as u32 % 8)
        );
    }
    assert_eq!(store.list().len(), 40);
    assert!(
        digests.len() >= 39,
        "only {} distinct machines",
        digests.len()
    );
    assert!(store.unreadable_ids().is_empty());
}

#[test]
fn an_empty_store_is_not_an_error() {
    let store = store("empty");
    assert!(store.list().is_empty());
    assert!(store.ids().is_empty());
    assert!(store.unreadable_ids().is_empty());
    assert!(store.load("nothing").unwrap().is_none());
}

#[test]
fn an_identity_can_be_carried_between_profiles_by_hand() {
    // A user comparing two machines, or a support conversation, sometimes
    // wants the *identity* rather than the seed. The conversion has to be
    // lossless in both directions, or a copied profile is not the profile.
    let source = windows_profile("src", "Source", 987_654);
    let payload = source.effective_identity().to_config_json();
    let restored = Identity::from_config_json(&payload).expect("round trips");
    assert_eq!(restored, source.effective_identity());

    let mut target = windows_profile("dst", "Target", 1);
    target.overrides = restored;
    assert_eq!(target.effective_identity(), source.effective_identity());
    // But it is stored as overrides, so the seed still governs anything the
    // copy did not carry.
    assert_eq!(target.seed, 1);
}
