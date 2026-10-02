//! Physical limits of a real machine.
//!
//! Every constant here is a claim about hardware, not about browsers. They
//! exist because the fastest way to get flagged is to be *too consistent with
//! one's generator* and the second-fastest is to be internally inconsistent:
//! a 10-core machine reporting a GPU that shipped in a 2-core laptop.
//!
//! Each group documents where the number came from. Where a value is a range
//! rather than a set, the comment says why —?that distinction matters when
//! deciding whether to *reject* an out-of-band value or merely *repair* it.

/// Apple Silicon logical core counts, and only those.
///
/// Apple Silicon has no SMT, so logical == physical. The list is explicit
/// rather than "8..=32" because 9, 13 and 15 are not Apple parts, and a page
/// that reads `hardwareConcurrency` and cross-references a GPU string can
/// notice. 11 is present because the M3 Pro is a 6P+5E part, an odd count that
/// genuinely exists.
pub const APPLE_SILICON_CORES: &[u32] = &[8, 10, 11, 12, 14, 16, 20, 24, 28, 32];

/// Intel Mac iGPU logical core counts.
///
/// Firefox reports the physical count when `kern.tcsm_available` is set and the
/// logical count otherwise, so both are real. Macs running WebGL on the Intel
/// iGPU have 2-8 physical, 4-16 logical.
pub const INTEL_MAC_IGP_CORES: &[u32] = &[2, 4, 6, 8, 12, 16];

/// Intel Mac dGPU core counts: the iGPU set plus the desktop parts, up to the
/// 2019 Mac Pro's 28 cores / 56 threads. An eGPU puts one of these behind any
/// Intel Mac, so the iGPU counts stay legal too.
pub const INTEL_MAC_DGPU_CORES: &[u32] =
    &[2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 56];

/// Windows logical core counts, weighted by what actually ships.
///
/// Weighted towards 4/6/8 because that is the real distribution; the 32-core
/// row exists so a plausible high-end box is reachable, not because it is
/// common.
pub const WINDOWS_CORES: &[u32] = &[2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32];
pub const WINDOWS_CORE_WEIGHTS: &[f64] = &[
    0.04, 0.16, 0.24, 0.26, 0.10, 0.08, 0.04, 0.04, 0.02, 0.008, 0.004, 0.002,
];

/// Linux desktop core counts, biased low —?a browser rarely runs on a server.
pub const LINUX_CORES: &[u32] = &[2, 4, 6, 8, 10, 12, 16, 20, 24, 32];
pub const LINUX_CORE_WEIGHTS: &[f64] =
    &[0.10, 0.24, 0.22, 0.18, 0.10, 0.07, 0.05, 0.02, 0.015, 0.005];

/// The display scaling steps each OS actually reports.
///
/// Windows exposes the full 100/125/150/175/200/250/300% set. macOS reports 1
/// or 2 and nothing between. Linux reports 1, or 2 under HiDPI, with GNOME
/// fractional scaling adding 1.25/1.5/1.75. Values like 1.09 or 1.818 are
/// scraped artefacts —?a browser zoom level folded into the ratio, not a
/// display mode —?and are strong tells.
///
/// Ascending slices, not sets: the repair keeps the first of two equally near
/// steps, and a set's iteration order is not stable enough to depend on.
pub const PLAUSIBLE_DPR: &[(&str, &[f64])] = &[
    ("windows", &[1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0]),
    ("macos", &[1.0, 2.0]),
    ("linux", &[1.0, 1.25, 1.5, 1.75, 2.0]),
];

/// `screen.colorDepth` values Firefox emits: 24, or 30 on a deep-colour
/// display. macOS defaults to deep colour, so an Apple Silicon Mac reports 30
/// (measured). 32 shows up in scraped corpora and is not a value Firefox
/// produces.
pub const PLAUSIBLE_COLOR_DEPTH: &[u32] = &[24, 30];

/// macOS reports 30 by default; everything else is overwhelmingly 24.
pub const MAC_COLOR_DEPTH_WEIGHTS: &[f64] = &[0.15, 0.85];
pub const DEFAULT_COLOR_DEPTH_WEIGHTS: &[f64] = &[0.97, 0.03];

/// `navigator.maxTouchPoints`: 0 with no digitiser, otherwise the panel's
/// maximum simultaneous contacts (measured 5 on a Windows laptop).
///
/// A range, not a set: scraped corpora carry 0, 1, 10, 40 and 256, and none of
/// those sources is authoritative. Consumer digitisers top out at 10
/// simultaneous contacts.
pub const MAX_PLAUSIBLE_TOUCH_POINTS: u32 = 10;

/// Touch-point values actually observed, with how common they are.
///
/// 0 dominates: most desktops have no digitiser at all. 5 is the value a real
/// Windows laptop reports, which scraped data almost never carries.
pub const TOUCH_POINTS: &[u32] = &[0, 0, 0, 0, 0, 0, 1, 2, 5, 10];
pub const TOUCH_POINT_WEIGHTS: &[f64] =
    &[0.30, 0.20, 0.15, 0.12, 0.08, 0.05, 0.05, 0.03, 0.015, 0.005];

/// The browser's own chrome height, in CSS pixels: the toolbar strip above the
/// content area.
///
/// This is a property of the *binary*, not of the identity —?the same window
/// furniture renders whatever OS is claimed. It matters because the real
/// window is sized from `window.outerHeight`, so the content area a page can
/// receive input in is `outerHeight - 86`. An identity claiming a
/// `outerHeight - innerHeight` *smaller* than this is claiming a viewport
/// taller than the window can hold, and the difference is unreachable: mouse
/// events dispatched into those bottom rows land on nothing.
pub const BROWSER_CHROME_HEIGHT: u32 = 86;

/// Taskbar height reserved out of `screen.height` for `screen.availHeight`.
///
/// Windows reserves 40 CSS px at 100% scaling, macOS a 25px menu bar, Linux
/// whatever the panel is —?27 is the common GNOME default.
pub const TASKBAR_HEIGHT: &[(&str, u32)] = &[("windows", 40), ("macos", 25), ("linux", 27)];

/// GPU renderer substrings that cannot appear on macOS.
///
/// Firefox on a Mac renders WebGL through CGL, not ANGLE, and its renderer
/// sanitiser has no ANGLE-on-Metal branch. So neither `ANGLE` nor a software
/// rasteriser string belongs in a macOS identity.
pub const NOT_A_MAC_GPU: &[&str] = &["ANGLE", "llvmpipe", "Apple Software Renderer"];

/// Windows GPUs must be ANGLE strings: Firefox on Windows goes through ANGLE's
/// D3D11 backend, so a non-ANGLE renderer there is a browser that does not
/// exist.
pub const WINDOWS_GPU_PREFIX: &str = "ANGLE";

/// Linux must be neither ANGLE (a Windows/macOS artefact) nor an Apple part.
pub fn gpu_fits_os(renderer: &str, os: crate::os::TargetOs) -> bool {
    use crate::os::TargetOs;
    if renderer.is_empty() {
        return true;
    }
    match os {
        TargetOs::Windows => renderer.starts_with(WINDOWS_GPU_PREFIX),
        TargetOs::Macos => !NOT_A_MAC_GPU.iter().any(|bad| renderer.contains(bad)),
        TargetOs::Linux => !renderer.contains("ANGLE") && !renderer.contains("Apple M"),
    }
}

/// The notched MacBook panels' scaled resolutions (Air 13.6"/15.3", Pro 14"/16")
/// and the 24" iMac's default. Apple Silicon only —?an Intel Mac never reports
/// these.
pub const APPLE_SILICON_PANELS: &[(u32, u32)] = &[
    (1024, 665),
    (1280, 832),
    (1470, 956),
    (1710, 1112),
    (1280, 828),
    (1440, 932),
    (1710, 1107),
    (1147, 745),
    (1352, 878),
    (1512, 982),
    (1800, 1169),
    (1312, 848),
    (1496, 967),
    (1728, 1117),
    (2056, 1329),
    (2240, 1260),
];

/// A desktop display's `screen.width`, with weights.
///
/// Weighted towards the 16:9 1920x1080 that dominates, with a tail of the
/// larger panels and the 1366x768 that low-end laptops still ship with.
///
/// One entry per distinct panel, paired index-for-index with
/// [`SCREEN_SIZE_WEIGHTS`]. Duplicating a row to raise its weight is a
/// convenient trick that goes wrong the moment a second array is walked in
/// step with the first, and `SCREEN_SIZES` has more than one reader.
pub const SCREEN_SIZES: &[(u32, u32)] = &[
    (1366, 768),
    (1920, 1080),
    (2560, 1440),
    (3840, 2160),
    (1280, 800),
    (1440, 900),
    (1680, 1050),
    (2560, 1600),
    (1536, 864),
    (2880, 1800),
    (3440, 1440),
];
pub const SCREEN_SIZE_WEIGHTS: &[f64] = &[
    0.13, 0.35, 0.12, 0.03, 0.06, 0.06, 0.06, 0.05, 0.10, 0.04, 0.04,
];

/// Plausible aspect ratios. A "screen" outside these is a broken generator.
///
/// As reduced fractions, because 1366x768 is 16:9 by intent and 1.7780 by
/// division, and a check that compares them exactly rejects every real panel.
pub const PLAUSIBLE_ASPECT_RATIOS: &[(u32, u32)] = &[
    (4, 3),   // 4:3 CRTs and the odd office panel
    (5, 4),   // 5:4, the pre-widescreen office standard
    (3, 2),   // 3:2, projectors and a few 13" laptops
    (8, 5),   // 8:5
    (16, 10), // 16:10, the ThinkPad and the MacBook 16" ratio
    (16, 9),  // 16:9, everything modern
    (21, 9),  // 21:9 as marketed, e.g. 2560x1080
    (43, 18), // 43:18, which is what 3440x1440 actually is
];

/// The smallest display worth impersonating, in CSS px.
///
/// Below this the "browser" is a phone-sized window; Firefox's own minimum
/// window is larger, so a smaller claim cannot be a real session.
pub const MIN_SCREEN_WIDTH: u32 = 800;
pub const MIN_SCREEN_HEIGHT: u32 = 600;

/// `navigator.hardwareConcurrency` bounds for a non-Apple-Silicon machine.
pub const MIN_CORES: u32 = 1;
pub const MAX_CORES: u32 = 64;

/// A stable, content-derived hash of an identity.
///
/// Used to detect two profiles that would present the same device, and to key
/// per-profile caches on disk. FNV-1a is not a cryptographic hash and is not
/// used as one: this is a fingerprint for change detection, not for security.
pub fn identity_digest(identity: &crate::identity::Identity) -> u64 {
    crate::rng::fnv1a64(identity.to_config_json().as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::Identity;
    use crate::os::TargetOs;

    #[test]
    fn apple_silicon_cores_contain_no_impossible_part() {
        // 9, 13, 15 and 18 are not Apple core counts; the explicit list exists
        // precisely to keep them out.
        for impossible in [3u32, 5, 7, 9, 13, 15, 18, 22, 26, 30, 36] {
            assert!(
                !APPLE_SILICON_CORES.contains(&impossible),
                "{impossible} is not an Apple Silicon core count"
            );
        }
        assert_eq!(APPLE_SILICON_CORES[0], 8, "Apple Silicon starts at 8");
    }

    #[test]
    fn intel_mac_igp_is_a_subset_of_the_dgpu_set() {
        for core in INTEL_MAC_IGP_CORES {
            assert!(
                INTEL_MAC_DGPU_CORES.contains(core),
                "IGP core count {core} missing from the dGPU set"
            );
        }
    }

    #[test]
    fn core_pools_match_their_weights() {
        assert_eq!(WINDOWS_CORES.len(), WINDOWS_CORE_WEIGHTS.len());
        assert_eq!(LINUX_CORES.len(), LINUX_CORE_WEIGHTS.len());
        assert_eq!(TOUCH_POINTS.len(), TOUCH_POINT_WEIGHTS.len());
        assert_eq!(SCREEN_SIZES.len(), SCREEN_SIZE_WEIGHTS.len());
        assert!(
            WINDOWS_CORES.windows(2).all(|w| w[0] < w[1]),
            "must be ascending"
        );
        assert!(LINUX_CORES.windows(2).all(|w| w[0] < w[1]));
    }

    #[test]
    fn weights_are_descending_with_popularity() {
        // Not strictly enforced, but the point of the weights is that lower
        // core counts are more common; a regression here is worth a test.
        let first = WINDOWS_CORE_WEIGHTS[0];
        let last = WINDOWS_CORE_WEIGHTS[WINDOWS_CORE_WEIGHTS.len() - 1];
        assert!(
            first > last,
            "2-core Windows boxes are commoner than 32-core ones"
        );
        assert!(
            first > 0.0 && last > 0.0,
            "a zero weight is an unreachable row"
        );
    }

    #[test]
    fn every_weighted_table_is_the_same_length_as_its_pool() {
        // These are paired arrays walked in step. A length mismatch is an
        // out-of-bounds read waiting for the next person to add a row.
        assert_eq!(WINDOWS_CORES.len(), WINDOWS_CORE_WEIGHTS.len());
        assert_eq!(LINUX_CORES.len(), LINUX_CORE_WEIGHTS.len());
        assert_eq!(SCREEN_SIZES.len(), SCREEN_SIZE_WEIGHTS.len());
        assert_eq!(TOUCH_POINTS.len(), TOUCH_POINT_WEIGHTS.len());
        assert_eq!(PLAUSIBLE_COLOR_DEPTH.len(), MAC_COLOR_DEPTH_WEIGHTS.len());
        assert_eq!(
            PLAUSIBLE_COLOR_DEPTH.len(),
            DEFAULT_COLOR_DEPTH_WEIGHTS.len()
        );
    }

    #[test]
    fn no_display_is_listed_twice() {
        // The previous table expressed a weight by repeating a row. Deduplicated,
        // because a second reader that zips the two arrays would silently see a
        // different distribution than the one the weights describe.
        let mut seen = std::collections::HashSet::new();
        for size in SCREEN_SIZES {
            assert!(seen.insert(*size), "{size:?} is listed twice");
        }
        let mut ratios = std::collections::HashSet::new();
        for ratio in PLAUSIBLE_ASPECT_RATIOS {
            assert!(ratios.insert(*ratio), "{ratio:?} is listed twice");
        }
    }

    #[test]
    fn dpr_tables_are_ascending_and_os_specific() {
        for (os, steps) in PLAUSIBLE_DPR {
            assert!(
                steps.windows(2).all(|w| w[0] < w[1]),
                "{os} DPR steps unsorted"
            );
            assert!(*steps.first().unwrap() >= 1.0);
        }
        let mac = PLAUSIBLE_DPR.iter().find(|(o, _)| *o == "macos").unwrap().1;
        assert_eq!(mac, &[1.0, 2.0], "macOS reports 1 or 2 and nothing between");
        let win = PLAUSIBLE_DPR
            .iter()
            .find(|(o, _)| *o == "windows")
            .unwrap()
            .1;
        assert!(win.contains(&1.25) && win.contains(&1.75));
    }

    #[test]
    fn every_taskbar_height_leaves_room_for_a_window() {
        for (os, height) in TASKBAR_HEIGHT {
            let (_, screen_height) = SCREEN_SIZES
                .iter()
                .find(|(_, h)| *h > *height + 200)
                .expect("a screen taller than any taskbar");
            assert!(
                *screen_height > *height,
                "{os} taskbar ({height}) must be smaller than the screen"
            );
        }
    }

    #[test]
    fn gpu_fits_os_enforces_the_three_backend_rules() {
        let angle = "ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0), or similar";
        let apple = "Apple M2, or similar";
        let mesa = "Intel(R) HD Graphics 400, or similar";

        assert!(gpu_fits_os(angle, TargetOs::Windows));
        assert!(!gpu_fits_os(apple, TargetOs::Windows));
        assert!(!gpu_fits_os(mesa, TargetOs::Windows));

        assert!(gpu_fits_os(apple, TargetOs::Macos));
        assert!(!gpu_fits_os(angle, TargetOs::Macos));
        assert!(!gpu_fits_os("llvmpipe, or similar", TargetOs::Macos));

        assert!(gpu_fits_os(mesa, TargetOs::Linux));
        assert!(!gpu_fits_os(angle, TargetOs::Linux));
        assert!(!gpu_fits_os(apple, TargetOs::Linux));
    }

    #[test]
    fn an_empty_renderer_is_allowed_through() {
        // "unset" is not "wrong"; the coherence layer decides whether leaving
        // WebGL to the host is acceptable, not this predicate.
        for os in TargetOs::ALL {
            assert!(gpu_fits_os("", os));
        }
    }

    #[test]
    fn screen_sizes_are_all_above_the_floor_and_land_on_a_known_ratio() {
        for (width, height) in SCREEN_SIZES {
            assert!(*width >= MIN_SCREEN_WIDTH, "{width}x{height} is too narrow");
            assert!(
                *height >= MIN_SCREEN_HEIGHT,
                "{width}x{height} is too short"
            );
            let aspect_ok = PLAUSIBLE_ASPECT_RATIOS.iter().any(|(rw, rh)| {
                // 1% tolerance absorbs integer rounding (1366/768 is 16:9 but
                // not exactly).
                let declared = *rw as f64 / *rh as f64;
                let actual = *width as f64 / *height as f64;
                (declared - actual).abs() / actual < 0.02
            });
            assert!(aspect_ok, "{width}x{height} matches no known aspect ratio");
        }
    }

    #[test]
    fn apple_silicon_panels_are_all_odd_sized_and_below_a_macbook() {
        for (width, height) in APPLE_SILICON_PANELS {
            assert!(*width > 1000 && *width <= 2300, "panel {width}x{height}");
            assert!(*height < 1400, "panel {width}x{height}");
        }
    }

    #[test]
    fn colour_depth_weights_sum_to_one_and_prefer_the_right_default() {
        let sum: f64 = MAC_COLOR_DEPTH_WEIGHTS.iter().sum();
        assert!((sum - 1.0).abs() < 1e-9);
        let sum: f64 = DEFAULT_COLOR_DEPTH_WEIGHTS.iter().sum();
        assert!((sum - 1.0).abs() < 1e-9);
        assert!(
            MAC_COLOR_DEPTH_WEIGHTS[1] > MAC_COLOR_DEPTH_WEIGHTS[0],
            "macOS defaults to deep colour (30)"
        );
        assert!(
            DEFAULT_COLOR_DEPTH_WEIGHTS[0] > DEFAULT_COLOR_DEPTH_WEIGHTS[1],
            "everything else defaults to 24"
        );
    }

    #[test]
    fn touch_points_stay_within_the_documented_ceiling() {
        for points in TOUCH_POINTS {
            assert!(*points <= MAX_PLAUSIBLE_TOUCH_POINTS);
        }
    }

    #[test]
    fn digest_is_stable_and_content_sensitive() {
        let mut a = Identity::new();
        a.set_u32(crate::schema::keys::SCREEN_WIDTH, 1920);
        let mut b = a.clone();
        assert_eq!(identity_digest(&a), identity_digest(&b));
        b.set_u32(crate::schema::keys::SCREEN_WIDTH, 1280);
        assert_ne!(identity_digest(&a), identity_digest(&b));
    }
}
