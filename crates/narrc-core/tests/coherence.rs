//! Coherence rules: what a machine cannot be, and what gets repaired.
//!
//! The fixture is a coherent Windows desktop. Each test breaks exactly one
//! invariant so a failure names the rule that regressed rather than "some rule
//! fired".

use narrc_core::coherence::{self, constants::*, Violation};
use narrc_core::identity::Identity;
use narrc_core::os::TargetOs;
use narrc_core::schema::keys;

const ANGLE_INTEL: &str =
    "ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0), or similar";

/// A coherent 1920x1080 Windows identity with 8 cores.
fn windows() -> Identity {
    let mut identity = Identity::new();
    identity
        .set_str(
            keys::USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0",
        )
        .set_str(keys::PLATFORM, "Win32")
        .set_u32(keys::HARDWARE_CONCURRENCY, 8)
        .set_u32(keys::MAX_TOUCH_POINTS, 0)
        .set_u32(keys::SCREEN_WIDTH, 1920)
        .set_u32(keys::SCREEN_HEIGHT, 1080)
        .set_u32(keys::SCREEN_AVAIL_WIDTH, 1920)
        .set_u32(keys::SCREEN_AVAIL_HEIGHT, 1040)
        .set_u32(keys::COLOR_DEPTH, 24)
        .set_u32(keys::PIXEL_DEPTH, 24)
        .set_f64(keys::DEVICE_PIXEL_RATIO, 1.0)
        .set_u32(keys::INNER_WIDTH, 1900)
        .set_u32(keys::INNER_HEIGHT, 940)
        .set_u32(keys::OUTER_WIDTH, 1920)
        .set_u32(keys::OUTER_HEIGHT, 1026)
        .set_str(keys::WEBGL_RENDERER, ANGLE_INTEL);
    identity
}

/// A coherent Apple Silicon MacBook identity.
fn macos() -> Identity {
    let mut identity = Identity::new();
    identity
        .set_str(
            keys::USER_AGENT,
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0",
        )
        .set_str(keys::PLATFORM, "MacIntel")
        .set_u32(keys::HARDWARE_CONCURRENCY, 8)
        .set_u32(keys::MAX_TOUCH_POINTS, 0)
        .set_u32(keys::SCREEN_WIDTH, 1470)
        .set_u32(keys::SCREEN_HEIGHT, 956)
        .set_u32(keys::SCREEN_AVAIL_WIDTH, 1470)
        .set_u32(keys::SCREEN_AVAIL_HEIGHT, 931)
        .set_u32(keys::COLOR_DEPTH, 30)
        .set_u32(keys::PIXEL_DEPTH, 30)
        .set_f64(keys::DEVICE_PIXEL_RATIO, 2.0)
        .set_u32(keys::INNER_WIDTH, 1470)
        .set_u32(keys::INNER_HEIGHT, 870)
        .set_u32(keys::OUTER_WIDTH, 1470)
        .set_u32(keys::OUTER_HEIGHT, 956)
        .set_str(keys::WEBGL_RENDERER, "Apple M2, or similar");
    identity
}

fn rules_of(identity: &Identity, os: TargetOs) -> Vec<String> {
    coherence::validate(identity, os)
        .into_iter()
        .map(|violation| violation.rule)
        .collect()
}

fn assert_fires(identity: &Identity, os: TargetOs, rule: &str) {
    let fired = rules_of(identity, os);
    assert!(
        fired.iter().any(|name| name == rule),
        "expected rule {rule} to fire, got {fired:?}"
    );
}

// ------------------------------------------------------------------ baseline

#[test]
fn a_coherent_windows_identity_breaks_nothing() {
    assert_eq!(
        coherence::validate(&windows(), TargetOs::Windows),
        Vec::new()
    );
}

#[test]
fn a_coherent_macos_identity_breaks_nothing() {
    assert_eq!(coherence::validate(&macos(), TargetOs::Macos), Vec::new());
}

#[test]
fn violations_render_with_their_rule_name() {
    let violation = Violation {
        rule: "gpu-matches-os".into(),
        detail: "boom".into(),
    };
    assert_eq!(violation.to_string(), "[gpu-matches-os] boom");
}

// ---------------------------------------------------------------------- GPU

#[test]
fn windows_requires_an_angle_gpu() {
    let mut identity = windows();
    identity.set_str(keys::WEBGL_RENDERER, "Apple M2, or similar");
    assert_fires(&identity, TargetOs::Windows, "gpu-matches-os");
}

#[test]
fn macos_rejects_angle_and_software_renderers() {
    for renderer in [ANGLE_INTEL, "llvmpipe, or similar"] {
        let mut identity = macos();
        identity.set_str(keys::WEBGL_RENDERER, renderer);
        assert_fires(&identity, TargetOs::Macos, "gpu-matches-os");
    }
}

#[test]
fn linux_rejects_angle_and_apple_gpus() {
    for renderer in [ANGLE_INTEL, "Apple M3, or similar"] {
        let mut identity = windows();
        identity.set_str(keys::WEBGL_RENDERER, renderer);
        assert_fires(&identity, TargetOs::Linux, "gpu-matches-os");
    }
}

#[test]
fn an_intel_mac_igp_cannot_claim_desktop_core_counts() {
    let mut identity = macos();
    identity.set_str(keys::WEBGL_RENDERER, "Intel(R) HD Graphics 400, or similar");
    identity.set_u32(keys::HARDWARE_CONCURRENCY, 32);
    assert_fires(&identity, TargetOs::Macos, "intel-mac-hardware");
}

#[test]
fn an_intel_mac_cannot_use_an_apple_silicon_panel() {
    let mut identity = macos();
    identity.set_str(keys::WEBGL_RENDERER, "Radeon R9 200 Series, or similar");
    // 1470x956 is a MacBook Pro 14" panel: Apple Silicon only.
    assert_fires(&identity, TargetOs::Macos, "intel-mac-hardware");
}

#[test]
fn the_intel_mac_rule_only_applies_to_macos() {
    let mut identity = windows();
    identity.set_u32(keys::HARDWARE_CONCURRENCY, 32);
    assert!(
        !rules_of(&identity, TargetOs::Windows).contains(&"intel-mac-hardware".to_owned()),
        "a 32-core Windows box is not an Intel Mac problem"
    );
}

// -------------------------------------------------------------------- cores

#[test]
fn apple_silicon_cores_snap_up_to_the_real_part() {
    let mut identity = macos();
    identity.set_u32(keys::HARDWARE_CONCURRENCY, 3);
    assert_fires(&identity, TargetOs::Macos, "apple-silicon-cores");

    coherence::apply(&mut identity, TargetOs::Macos);
    assert_eq!(identity.get_u32(keys::HARDWARE_CONCURRENCY), Some(8));
}

#[test]
fn thirteen_cores_snaps_to_fourteen_because_apple_ships_no_thirteen() {
    let mut identity = macos();
    identity.set_u32(keys::HARDWARE_CONCURRENCY, 13);
    coherence::apply(&mut identity, TargetOs::Macos);
    assert_eq!(identity.get_u32(keys::HARDWARE_CONCURRENCY), Some(14));
}

#[test]
fn a_core_count_above_every_apple_part_stays_capped() {
    let mut identity = macos();
    identity.set_u32(keys::HARDWARE_CONCURRENCY, 64);
    coherence::apply(&mut identity, TargetOs::Macos);
    assert_eq!(
        identity.get_u32(keys::HARDWARE_CONCURRENCY),
        Some(*APPLE_SILICON_CORES.last().unwrap())
    );
}

// -------------------------------------------------------------- colour depth

#[test]
fn an_impossible_colour_depth_is_repaired_to_24() {
    let mut identity = windows();
    identity.set_u32(keys::COLOR_DEPTH, 47);
    coherence::apply(&mut identity, TargetOs::Windows);
    assert_eq!(identity.get_u32(keys::COLOR_DEPTH), Some(24));
}

#[test]
fn thirty_two_bit_colour_is_not_a_value_firefox_emits() {
    let mut identity = windows();
    identity.set_u32(keys::COLOR_DEPTH, 32);
    assert_fires(&identity, TargetOs::Windows, "color-depth");
}

#[test]
fn pixel_depth_tracks_colour_depth_through_a_repair() {
    let mut identity = windows();
    identity.set_u32(keys::COLOR_DEPTH, 47);
    identity.set_u32(keys::PIXEL_DEPTH, 47);
    coherence::apply(&mut identity, TargetOs::Windows);
    assert_eq!(identity.get_u32(keys::PIXEL_DEPTH), Some(24));
}

#[test]
fn an_apple_silicon_mac_defaults_to_deep_colour() {
    let mut identity = macos();
    identity.set_u32(keys::COLOR_DEPTH, 24);
    identity.set_u32(keys::PIXEL_DEPTH, 24);
    assert_fires(&identity, TargetOs::Macos, "color-depth");

    coherence::apply(&mut identity, TargetOs::Macos);
    assert_eq!(identity.get_u32(keys::COLOR_DEPTH), Some(30));
    assert_eq!(identity.get_u32(keys::PIXEL_DEPTH), Some(30));
}

// ------------------------------------------------------------- touch points

#[test]
fn no_mac_has_a_touchscreen() {
    let mut identity = macos();
    identity.set_u32(keys::MAX_TOUCH_POINTS, 10);
    assert_fires(&identity, TargetOs::Macos, "touch-points");

    coherence::apply(&mut identity, TargetOs::Macos);
    assert_eq!(identity.get_u32(keys::MAX_TOUCH_POINTS), Some(0));
}

#[test]
fn a_scraped_contact_count_of_256_is_repaired_to_none() {
    let mut identity = windows();
    identity.set_u32(keys::MAX_TOUCH_POINTS, 256);
    assert_fires(&identity, TargetOs::Windows, "touch-points");

    coherence::apply(&mut identity, TargetOs::Windows);
    assert_eq!(identity.get_u32(keys::MAX_TOUCH_POINTS), Some(0));
}

#[test]
fn a_plausible_windows_touchscreen_survives() {
    let mut identity = windows();
    identity.set_u32(keys::MAX_TOUCH_POINTS, 5);
    coherence::apply(&mut identity, TargetOs::Windows);
    assert_eq!(
        identity.get_u32(keys::MAX_TOUCH_POINTS),
        Some(5),
        "5 is the value a real Windows laptop reports and must not be zeroed"
    );
}

// --------------------------------------------------------- pixel ratio

#[test]
fn a_zoomed_ratio_snaps_to_a_real_display_step() {
    let mut identity = windows();
    // 1.818 is a browser zoom folded into the ratio, not a display mode.
    identity.set_f64(keys::DEVICE_PIXEL_RATIO, 1.818);
    assert_fires(&identity, TargetOs::Windows, "device-pixel-ratio");

    coherence::apply(&mut identity, TargetOs::Windows);
    assert_eq!(identity.get_f64(keys::DEVICE_PIXEL_RATIO), Some(1.75));
}

#[test]
fn macos_offers_only_one_and_two() {
    let mut identity = macos();
    identity.set_f64(keys::DEVICE_PIXEL_RATIO, 1.25);
    assert_fires(&identity, TargetOs::Macos, "device-pixel-ratio");

    coherence::apply(&mut identity, TargetOs::Macos);
    assert_eq!(identity.get_f64(keys::DEVICE_PIXEL_RATIO), Some(1.0));
}

#[test]
fn an_exact_tie_between_two_steps_resolves_to_the_lower_one() {
    // 1.5 is exactly between 1.0 and 2.0, so "nearest step" has no answer and
    // the documented tie-break decides. It has to be a decision rather than an
    // error: a hand-edited 1.5 should still launch.
    let mut identity = macos();
    identity.set_f64(keys::DEVICE_PIXEL_RATIO, 1.5);
    coherence::apply(&mut identity, TargetOs::Macos);
    assert_eq!(identity.get_f64(keys::DEVICE_PIXEL_RATIO), Some(1.0));

    // The same tie on Windows, where 1.5 is a real step, is left alone.
    let mut windows_identity = windows();
    windows_identity.set_f64(keys::DEVICE_PIXEL_RATIO, 1.5);
    coherence::apply(&mut windows_identity, TargetOs::Windows);
    assert_eq!(
        windows_identity.get_f64(keys::DEVICE_PIXEL_RATIO),
        Some(1.5)
    );
}

#[test]
fn every_os_accepts_its_own_whole_table() {
    for (os, steps) in [
        (
            TargetOs::Windows,
            &[1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0][..],
        ),
        (TargetOs::Macos, &[1.0, 2.0][..]),
        (TargetOs::Linux, &[1.0, 1.25, 1.5, 1.75, 2.0][..]),
    ] {
        for step in steps {
            let mut identity = windows();
            identity.set_f64(keys::DEVICE_PIXEL_RATIO, *step);
            assert!(
                !rules_of(&identity, os).contains(&"device-pixel-ratio".to_owned()),
                "{os} must accept a ratio of {step}"
            );
        }
    }
}

// ---------------------------------------------------------- window chrome

#[test]
fn a_viewport_taller_than_the_window_is_reported_and_repaired() {
    let mut identity = windows();
    // outerHeight - innerHeight = 4px, but the window really has 86px of
    // chrome, so 82px of the claimed viewport can never receive input.
    identity.set_u32(keys::INNER_HEIGHT, 1022);
    assert_fires(&identity, TargetOs::Windows, "window-chrome");

    coherence::apply(&mut identity, TargetOs::Windows);
    let inner = identity.get_u32(keys::INNER_HEIGHT).unwrap();
    let outer = identity.get_u32(keys::OUTER_HEIGHT).unwrap();
    assert!(
        outer - inner >= BROWSER_CHROME_HEIGHT,
        "after repair outer-inner = {}, must be >= {BROWSER_CHROME_HEIGHT}",
        outer - inner
    );
}

#[test]
fn the_repair_prefers_growing_the_window_when_the_screen_has_room() {
    let mut identity = windows();
    identity.set_u32(keys::INNER_HEIGHT, 940);
    identity.set_u32(keys::OUTER_HEIGHT, 944);
    coherence::apply(&mut identity, TargetOs::Windows);
    assert_eq!(
        identity.get_u32(keys::INNER_HEIGHT),
        Some(940),
        "the drawn viewport is kept and the window grows"
    );
    assert_eq!(identity.get_u32(keys::OUTER_HEIGHT), Some(1026));
}

#[test]
fn the_repair_shrinks_the_viewport_when_the_screen_is_too_small() {
    let mut identity = windows();
    // A 1080-tall screen with a 40px taskbar leaves 1040 usable; a viewport
    // that needs 1026px of chrome above it cannot fit.
    identity.set_u32(keys::INNER_HEIGHT, 1030);
    identity.set_u32(keys::OUTER_HEIGHT, 1040);
    identity.set_u32(keys::SCREEN_AVAIL_HEIGHT, 1040);
    coherence::apply(&mut identity, TargetOs::Windows);

    let inner = identity.get_u32(keys::INNER_HEIGHT).unwrap();
    let outer = identity.get_u32(keys::OUTER_HEIGHT).unwrap();
    assert!(
        outer - inner >= BROWSER_CHROME_HEIGHT,
        "outer-inner = {} after the shrink path",
        outer - inner
    );
    assert!(inner <= 1040, "the viewport must fit the claimed screen");
}

// ----------------------------------------------------------- screen shape

#[test]
fn a_portrait_desktop_screen_is_reported_not_repaired() {
    let mut identity = windows();
    identity.set_u32(keys::SCREEN_WIDTH, 1080);
    identity.set_u32(keys::SCREEN_HEIGHT, 1920);
    assert_fires(&identity, TargetOs::Windows, "screen-shape");

    // No repair exists: inventing a panel is not a coherence fix.
    let remaining = coherence::apply(&mut identity, TargetOs::Windows);
    assert!(remaining.iter().any(|v| v.rule == "screen-shape"));
    assert_eq!(identity.get_u32(keys::SCREEN_WIDTH), Some(1080));
}

#[test]
fn a_phone_sized_screen_is_reported() {
    let mut identity = windows();
    identity.set_u32(keys::SCREEN_WIDTH, 480);
    identity.set_u32(keys::SCREEN_HEIGHT, 800);
    assert_fires(&identity, TargetOs::Windows, "screen-shape");
    assert!(coherence::screen_is_implausible(&identity));
}

#[test]
fn the_orientation_repair_swaps_axes_and_the_avail_bounds_with_them() {
    let mut identity = windows();
    identity
        .set_u32(keys::SCREEN_WIDTH, 1080)
        .set_u32(keys::SCREEN_HEIGHT, 1920)
        .set_u32(keys::SCREEN_AVAIL_WIDTH, 1080)
        .set_u32(keys::SCREEN_AVAIL_HEIGHT, 1880);

    assert!(coherence::repair_screen_orientation(&mut identity));
    assert_eq!(identity.get_u32(keys::SCREEN_WIDTH), Some(1920));
    assert_eq!(identity.get_u32(keys::SCREEN_HEIGHT), Some(1080));
    assert_eq!(identity.get_u32(keys::SCREEN_AVAIL_WIDTH), Some(1880));
    assert_eq!(identity.get_u32(keys::SCREEN_AVAIL_HEIGHT), Some(1080));
}

#[test]
fn the_orientation_repair_is_a_no_op_on_a_landscape_screen() {
    let mut identity = windows();
    assert!(!coherence::repair_screen_orientation(&mut identity));
    assert_eq!(identity.get_u32(keys::SCREEN_WIDTH), Some(1920));
}

// ----------------------------------------------------------- avail bounds

#[test]
fn avail_bounds_cannot_exceed_the_screen() {
    let mut identity = windows();
    identity.set_u32(keys::SCREEN_AVAIL_WIDTH, 2560);
    assert_fires(&identity, TargetOs::Windows, "avail-bounds");

    coherence::apply(&mut identity, TargetOs::Windows);
    assert_eq!(identity.get_u32(keys::SCREEN_AVAIL_WIDTH), Some(1920));
}

#[test]
fn avail_height_is_clamped_too() {
    let mut identity = windows();
    identity.set_u32(keys::SCREEN_AVAIL_HEIGHT, 2000);
    coherence::apply(&mut identity, TargetOs::Windows);
    assert_eq!(identity.get_u32(keys::SCREEN_AVAIL_HEIGHT), Some(1080));
}

// -------------------------------------------------------------------- arch

#[test]
fn a_user_agent_contradicting_platform_is_reported() {
    let mut identity = windows();
    identity.set_str(keys::PLATFORM, "Linux armv7l");
    assert_fires(&identity, TargetOs::Windows, "arch-agreement");
}

#[test]
fn a_windows_user_agent_contradicting_oscpu_is_reported() {
    // A Windows user agent says "Win64; x64", never "x86_64", so a rule that
    // looks for the Linux spelling cannot see this contradiction at all.
    let mut identity = windows();
    identity.set_str(keys::OSCPU, "Windows NT 10.0; Win64; aarch64");
    assert_fires(&identity, TargetOs::Windows, "arch-agreement");
}

#[test]
fn an_arm_user_agent_contradicting_platform_is_reported() {
    let mut identity = windows();
    identity.set_str(
        keys::USER_AGENT,
        "Mozilla/5.0 (Windows NT 10.0; Win64; aarch64; rv:156.0) Gecko/20100101 Firefox/156.0",
    );
    identity.set_str(keys::OSCPU, "Windows NT 10.0; Win64; x64");
    assert_fires(&identity, TargetOs::Windows, "arch-agreement");
}

#[test]
fn a_coherent_apple_silicon_profile_trips_no_architecture_rule() {
    assert_eq!(rules_of(&macos(), TargetOs::Macos), Vec::<String>::new());
}

#[test]
fn architecture_agreement_has_no_repair() {
    let mut identity = windows();
    identity.set_str(keys::PLATFORM, "Linux armv7l");
    let remaining = coherence::apply(&mut identity, TargetOs::Windows);
    assert!(
        remaining.iter().any(|v| v.rule == "arch-agreement"),
        "guessing an architecture is not a coherence fix"
    );
}

#[test]
fn an_absent_user_agent_skips_the_architecture_check() {
    let mut identity = windows();
    identity.remove(keys::USER_AGENT);
    identity.set_str(keys::PLATFORM, "Linux armv7l");
    assert!(!rules_of(&identity, TargetOs::Windows).contains(&"arch-agreement".to_owned()));
}

// ------------------------------------------------------------- idempotence

#[test]
fn apply_is_idempotent() {
    for identity in [windows(), macos()] {
        let os = if identity.is_set(keys::PLATFORM)
            && identity.get_str(keys::PLATFORM) == Some("MacIntel")
        {
            TargetOs::Macos
        } else {
            TargetOs::Windows
        };
        let mut first = identity.clone();
        let second_pass = coherence::apply(&mut first, os);
        let snapshot = first.clone();
        let third_pass = coherence::apply(&mut first, os);

        assert_eq!(second_pass, third_pass, "the violation set must be stable");
        assert_eq!(
            snapshot, first,
            "a second apply must not move any value again"
        );
    }
}

#[test]
fn apply_converges_on_a_heavily_broken_identity() {
    let mut identity = windows();
    identity
        .set_u32(keys::COLOR_DEPTH, 47)
        .set_u32(keys::PIXEL_DEPTH, 99)
        .set_f64(keys::DEVICE_PIXEL_RATIO, 4.7)
        .set_u32(keys::MAX_TOUCH_POINTS, 256)
        .set_u32(keys::SCREEN_AVAIL_WIDTH, 4000)
        .set_u32(keys::INNER_HEIGHT, 1020)
        .set_u32(keys::OUTER_HEIGHT, 1024);

    coherence::apply(&mut identity, TargetOs::Windows);
    let remaining = rules_of(&identity, TargetOs::Windows);
    assert!(
        remaining.is_empty(),
        "everything repairable should have been repaired, left: {remaining:?}"
    );
}

// -------------------------------------------------------- source sanitising

#[test]
fn an_incoherent_source_gpu_pair_is_dropped() {
    let mut identity = macos();
    identity.set_str(keys::WEBGL_RENDERER, ANGLE_INTEL);
    identity.set_str(keys::WEBGL_VENDOR, "Google Inc. (Intel)");

    let dropped = coherence::drop_incoherent_source_values(&mut identity, TargetOs::Macos);
    assert_eq!(dropped.len(), 1);
    assert_eq!(dropped[0].rule, "gpu-matches-os");
    assert!(!identity.is_set(keys::WEBGL_RENDERER));
    assert!(!identity.is_set(keys::WEBGL_VENDOR));
}

#[test]
fn a_coherent_source_gpu_pair_is_kept() {
    let mut identity = macos();
    let before = identity.clone();
    assert!(coherence::drop_incoherent_source_values(&mut identity, TargetOs::Macos).is_empty());
    assert_eq!(identity, before);
}

#[test]
fn an_absent_source_gpu_pair_is_a_no_op() {
    let mut identity = macos();
    identity.remove(keys::WEBGL_RENDERER);
    let before = identity.clone();
    assert!(coherence::drop_incoherent_source_values(&mut identity, TargetOs::Macos).is_empty());
    assert_eq!(identity, before);
}

#[test]
fn an_intel_gpu_with_a_desktop_core_count_is_dropped_for_macos() {
    let mut identity = macos();
    identity.set_str(keys::WEBGL_RENDERER, "Intel(R) HD Graphics 400, or similar");
    identity.set_u32(keys::HARDWARE_CONCURRENCY, 32);
    let dropped = coherence::drop_incoherent_source_values(&mut identity, TargetOs::Macos);
    assert_eq!(dropped[0].rule, "intel-mac-hardware");
    assert!(!identity.is_set(keys::WEBGL_RENDERER));
}

#[test]
fn the_taskbar_matches_the_claimed_os() {
    assert_eq!(coherence::taskbar_for(TargetOs::Windows), 40);
    assert_eq!(coherence::taskbar_for(TargetOs::Macos), 25);
    assert_eq!(coherence::taskbar_for(TargetOs::Linux), 27);
}

#[test]
fn a_webgl_parameter_override_without_a_renderer_is_a_violation() {
    let mut identity = macos();
    identity.remove(keys::WEBGL_RENDERER);
    identity.set_object(
        keys::WEBGL_PARAMETERS,
        [("MAX_TEXTURE_SIZE", serde_json::json!(16384))],
    );
    let violations = coherence::validate(&identity, TargetOs::Macos);
    assert!(
        violations.iter().any(|v| v.rule == "webgl-context-override"),
        "{violations:?}"
    );

    // Naming the renderer the parameters belong to resolves it.
    identity.set_str(keys::WEBGL_RENDERER, "Apple M2");
    assert!(coherence::validate(&identity, TargetOs::Macos).is_empty());
}

#[test]
fn a_renderer_alone_needs_no_parameter_family() {
    // The coherence layer only hard-blocks the inverse direction (parameters
    // with no renderer to own them). A renderer with no parameters is *legal*
    // — the engine falls back to the host for every limit — so it is reported
    // as a launch warning in `engine.rs` instead of a violation here.
    let identity = macos();
    assert!(coherence::validate(&identity, TargetOs::Macos).is_empty());
}

#[test]
fn dropping_a_gpu_pair_drops_its_parameter_family_with_it() {
    let mut identity = macos();
    identity.set_str(keys::WEBGL_RENDERER, "Intel(R) HD Graphics 400, or similar");
    identity.set_u32(keys::HARDWARE_CONCURRENCY, 32);
    identity.set_object(
        keys::WEBGL_PARAMETERS,
        [("MAX_TEXTURE_SIZE", serde_json::json!(16384))],
    );
    identity.set_str_array(keys::WEBGL_EXTENSIONS, ["OES_texture_float"]);

    coherence::drop_incoherent_source_values(&mut identity, TargetOs::Macos);

    assert!(!identity.is_set(keys::WEBGL_RENDERER));
    assert!(!identity.is_set(keys::WEBGL_VENDOR));
    assert!(!identity.is_set(keys::WEBGL_PARAMETERS));
    assert!(!identity.is_set(keys::WEBGL_EXTENSIONS));
    // And what remains is coherent: no orphaned overrides to report.
    assert!(coherence::validate(&identity, TargetOs::Macos).is_empty());
}
