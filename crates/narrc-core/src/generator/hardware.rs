//! The graphics card and the CPU, drawn together.
//!
//! These are the two fields a coherence check reads first, and the two a
//! naive generator gets wrong. The rule here: **pick the GPU first, then draw
//! the core count from the list that GPU actually shipped in.** Not the other
//! way round, and never independently.
//!
//! It also means a Windows identity never claims an Apple GPU, a macOS one
//! never claims an ANGLE string, and a MacBook Pro panel never appears behind
//! a 2011 iGPU — because the pool for each OS is disjoint and each entry in
//! the pool carries its own panel list.

use crate::os::TargetOs;
use crate::pools::{Gpu, LINUX_GPUS, MACOS_GPUS, WINDOWS_GPUS};
use crate::rng::Rng;
use serde::{Deserialize, Serialize};

/// A drawn graphics identity.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GpuChoice {
    /// The value behind `webGl:vendor`.
    pub vendor: String,
    /// The value behind `webGl:renderer`.
    pub renderer: String,
    /// A core count the chosen part shipped in, for `navigator.hardwareConcurrency`.
    pub cores: u32,
    /// A display this part is known to drive, if the pool records one.
    pub panel: Option<(u32, u32)>,
    /// True when the part is Apple Silicon, which constrains the colour depth.
    pub apple_silicon: bool,
}

impl GpuChoice {
    /// A short label for the UI: the part's name, not the sanitised string.
    ///
    /// The WebGL renderer is what a page sees, and it is not a name. On Windows
    /// it is wrapped in ANGLE's translation layer —
    /// `ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, or
    /// similar)` — and naively splitting on `(` yields "ANGLE" for every
    /// Windows profile, which is a label that tells a user nothing and makes
    /// two profiles indistinguishable in the list.
    ///
    /// Only the ANGLE form is unwrapped, and only its vendor prefix is dropped.
    /// An Intel part's own name contains parentheses — "Intel(R) HD Graphics
    /// 400" — so treating any parentheses as a wrapper mangles the Linux and
    /// macOS strings this must leave alone.
    pub fn label(&self) -> String {
        let bare = self.renderer.trim_end_matches(", or similar").trim();

        let inner = if let Some(rest) = bare.strip_prefix("ANGLE (") {
            rest.strip_suffix(')').unwrap_or(rest)
        } else {
            bare
        };

        // "NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0" — the
        // first field is the vendor, which the label already implies.
        let parts: Vec<&str> = inner.split(", ").collect();
        let name = if bare.starts_with("ANGLE (") && parts.len() > 1 {
            parts[1..].join(", ")
        } else {
            inner.to_owned()
        };

        name.trim().to_owned()
    }
}

/// The GPU pool for an OS.
fn pool(os: TargetOs) -> &'static [Gpu] {
    match os {
        TargetOs::Windows => WINDOWS_GPUS,
        TargetOs::Macos => MACOS_GPUS,
        TargetOs::Linux => LINUX_GPUS,
    }
}

/// Draws a graphics identity for `os`.
///
/// `panel_filter` narrows the draw to GPUs known to drive a specific display,
/// which is how a profile that has already committed to a screen keeps the two
/// consistent. A pool entry with no recorded panel is never excluded by this
/// filter, because "we did not record one" is not "cannot drive it".
pub fn draw_gpu(seed: u64, os: TargetOs, panel_filter: Option<(u32, u32)>) -> GpuChoice {
    let mut rng = Rng::stream(seed, "gpu");
    let candidates: Vec<&Gpu> = pool(os).iter().collect();

    // With a panel filter, drop the candidates that positively contradict it
    // and the ones that record a *different* panel. Only if that empties the
    // pool do we fall back to the unfiltered draw.
    let narrowed: Vec<&Gpu> = match panel_filter {
        Some(panel) => candidates
            .iter()
            .copied()
            .filter(|gpu| gpu.panel.is_none() || gpu.panel == Some(panel))
            .filter(|gpu| panel_is_plausible_for_os(gpu, panel, os))
            .collect(),
        None => candidates.clone(),
    };

    let usable = if narrowed.is_empty() {
        candidates
    } else {
        narrowed
    };
    let weights: Vec<f64> = usable.iter().map(|gpu| gpu.weight).collect();
    let gpu = usable[rng.weighted_index(&weights).unwrap_or(0)];

    GpuChoice {
        vendor: gpu.vendor.to_owned(),
        renderer: gpu.renderer.to_owned(),
        cores: *gpu.cores.iter().min().unwrap_or(&4),
        panel: gpu.panel,
        apple_silicon: gpu.apple_silicon,
    }
}

/// Whether an Apple Silicon part is the only thing that can drive a panel.
fn panel_is_plausible_for_os(gpu: &Gpu, panel: (u32, u32), os: TargetOs) -> bool {
    use crate::coherence::constants::APPLE_SILICON_PANELS;
    if os == TargetOs::Macos && !gpu.apple_silicon && APPLE_SILICON_PANELS.contains(&panel) {
        return false;
    }
    true
}

/// Draws a core count for a GPU that did *not* record one.
///
/// Used only for the pool entries with an open-ended core list. Apple Silicon
/// is not in this path: its list is exact, and a page that counts workers
/// would see an impossible number.
pub fn draw_uncoupled_cores(seed: u64, os: TargetOs) -> u32 {
    use crate::coherence::constants::{
        LINUX_CORES, LINUX_CORE_WEIGHTS, WINDOWS_CORES, WINDOWS_CORE_WEIGHTS,
    };
    let mut rng = Rng::stream(seed, "cores");
    match os {
        TargetOs::Windows => {
            let index = rng.weighted_index(WINDOWS_CORE_WEIGHTS).unwrap_or(0);
            WINDOWS_CORES[index]
        }
        TargetOs::Linux => {
            let index = rng.weighted_index(LINUX_CORE_WEIGHTS).unwrap_or(0);
            LINUX_CORES[index]
        }
        // macOS without a recorded GPU is not reachable through draw_gpu, but
        // a caller editing one field by hand can get here. Apple's list is the
        // only defensible answer.
        TargetOs::Macos => {
            use crate::coherence::constants::INTEL_MAC_DGPU_CORES;
            INTEL_MAC_DGPU_CORES[rng.below(INTEL_MAC_DGPU_CORES.len())]
        }
    }
}

/// Draws a graphics identity *and* a matching core count.
///
/// This is the entry point the generator uses. The core count is snapped into
/// the GPU's own list, so `draw_gpu` and `draw_cores` can never disagree.
pub fn draw_hardware(seed: u64, os: TargetOs, panel_filter: Option<(u32, u32)>) -> GpuChoice {
    let mut choice = draw_gpu(seed, os, panel_filter);
    let mut rng = Rng::stream(seed, "cores-from-gpu");
    let candidates: Vec<u32> = pool(os)
        .iter()
        .find(|gpu| gpu.renderer == choice.renderer)
        .map(|gpu| gpu.cores.to_vec())
        .unwrap_or_default();
    if !candidates.is_empty() {
        choice.cores = candidates[rng.below(candidates.len())];
    } else {
        choice.cores = draw_uncoupled_cores(seed, os);
    }
    choice
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::coherence::constants::{gpu_fits_os, APPLE_SILICON_CORES, MAX_CORES, MIN_CORES};
    use std::collections::HashSet;

    fn pool_for(os: TargetOs) -> &'static [Gpu] {
        pool(os)
    }

    #[test]
    fn drawing_is_reproducible() {
        for os in TargetOs::ALL {
            assert_eq!(
                draw_hardware(99, os, None),
                draw_hardware(99, os, None),
                "{os} is not reproducible"
            );
        }
    }

    #[test]
    fn every_os_draws_only_from_its_own_pool() {
        for os in TargetOs::ALL {
            for seed in 0..300 {
                let choice = draw_hardware(seed, os, None);
                let known = pool_for(os)
                    .iter()
                    .any(|gpu| gpu.renderer == choice.renderer && gpu.vendor == choice.vendor);
                assert!(
                    known,
                    "{os} drew {:?} from outside its pool",
                    choice.renderer
                );
            }
        }
    }

    #[test]
    fn every_drawn_gpu_fits_its_os() {
        for os in TargetOs::ALL {
            for seed in 0..500 {
                let choice = draw_hardware(seed, os, None);
                assert!(
                    gpu_fits_os(&choice.renderer, os),
                    "{os} drew {}",
                    choice.renderer
                );
            }
        }
    }

    #[test]
    fn the_core_count_comes_from_the_chosen_parts_own_list() {
        for os in TargetOs::ALL {
            for seed in 0..500 {
                let choice = draw_hardware(seed, os, None);
                let allowed = pool_for(os)
                    .iter()
                    .find(|gpu| gpu.renderer == choice.renderer)
                    .map(|gpu| gpu.cores.to_vec());
                if let Some(allowed) = allowed {
                    assert!(
                        allowed.contains(&choice.cores),
                        "{} claimed {} cores, but that part shipped in {allowed:?}",
                        choice.renderer,
                        choice.cores
                    );
                }
            }
        }
    }

    #[test]
    fn apple_silicon_only_ever_claims_apple_core_counts() {
        for seed in 0..500 {
            let choice = draw_hardware(seed, TargetOs::Macos, None);
            if choice.apple_silicon {
                assert!(
                    APPLE_SILICON_CORES.contains(&choice.cores),
                    "Apple Silicon part with {} cores",
                    choice.cores
                );
            }
        }
    }

    #[test]
    fn core_counts_stay_inside_the_plausible_bounds() {
        for os in TargetOs::ALL {
            for seed in 0..500 {
                let choice = draw_hardware(seed, os, None);
                assert!(
                    (MIN_CORES..=MAX_CORES).contains(&choice.cores),
                    "{os} drew {} cores",
                    choice.cores
                );
            }
        }
    }

    #[test]
    fn different_seeds_reach_different_gpus() {
        let renderers: HashSet<String> = (0..400)
            .map(|seed| draw_hardware(seed, TargetOs::Windows, None).renderer)
            .collect();
        assert!(
            renderers.len() >= 4,
            "only {} Windows GPUs reached",
            renderers.len()
        );
    }

    #[test]
    fn a_panel_filter_excludes_parts_that_cannot_drive_the_panel() {
        // 1728x1117 is a MacBook Pro 16" panel, so only Apple Silicon can
        // claim it -- an Intel iGPU behind it is a two-line detection.
        for seed in 0..200 {
            let choice = draw_hardware(seed, TargetOs::Macos, Some((1728, 1117)));
            assert!(
                choice.apple_silicon,
                "{seed}: {} cannot drive a 1728x1117 panel",
                choice.renderer
            );
        }
    }

    #[test]
    fn an_impossible_panel_filter_falls_back_rather_than_panicking() {
        // Nothing in the table drives a 3x3 display. The draw must still
        // succeed: refusing here would make a hand-edited profile unlaunchable
        // instead of merely suspicious.
        let choice = draw_hardware(5, TargetOs::Linux, Some((3, 3)));
        assert!(!choice.renderer.is_empty());
    }

    #[test]
    fn the_uncoupled_core_draw_respects_each_os_pool() {
        for seed in 0..200 {
            let windows = draw_uncoupled_cores(seed, TargetOs::Windows);
            assert!(
                crate::coherence::constants::WINDOWS_CORES.contains(&windows),
                "{windows} is not a Windows core count"
            );
            let linux = draw_uncoupled_cores(seed, TargetOs::Linux);
            assert!(
                crate::coherence::constants::LINUX_CORES.contains(&linux),
                "{linux} is not a Linux core count"
            );
            let mac = draw_uncoupled_cores(seed, TargetOs::Macos);
            assert!(crate::coherence::constants::INTEL_MAC_DGPU_CORES.contains(&mac));
        }
    }

    #[test]
    fn the_label_is_the_part_name_and_not_the_sanitised_string() {
        // Every Windows label used to come out as "ANGLE", because that is what
        // the sanitised string starts with. A label identical for every profile
        // is worse than no label: the user cannot tell two profiles apart.
        for seed in 0..60 {
            let choice = draw_hardware(seed, TargetOs::Windows, None);
            let label = choice.label();
            assert_ne!(label, "ANGLE", "seed {seed}: label is just the wrapper");
            assert!(!label.contains("ANGLE"), "{label}");
            assert!(!label.contains("or similar"), "{label}");
            assert!(!label.starts_with("Direct3D"), "{label}");
            assert!(label.contains(' '), "{label} is not a readable part name");
        }

        let mac = draw_hardware(2, TargetOs::Macos, None);
        if mac.apple_silicon {
            assert!(mac.label().starts_with("Apple M"), "{}", mac.label());
        }
    }

    #[test]
    fn a_windows_label_names_the_same_card_the_renderer_does() {
        for seed in 0..60 {
            let choice = draw_hardware(seed, TargetOs::Windows, None);
            let label = choice.label();
            // The card name has to survive the unwrapping, or the label is
            // describing a different machine than the renderer claims.
            let card = choice
                .renderer
                .split(" (")
                .nth(1)
                .unwrap_or_default()
                .split(", or similar")
                .next()
                .unwrap_or_default();
            let card_tail = card.split(", ").last().unwrap_or(card);
            let last_word = label.split(' ').next_back().unwrap_or("");
            assert!(
                card_tail.contains(last_word),
                "renderer names {card_tail:?} but the label is {label:?}"
            );
        }
    }

    #[test]
    fn a_linux_label_keeps_the_whole_renderer() {
        // Linux renderers are not wrapped, so the label is the string minus the
        // sanitiser suffix, and nothing more.
        for seed in 0..60 {
            let choice = draw_hardware(seed, TargetOs::Linux, None);
            assert_eq!(
                choice.label(),
                choice.renderer.trim_end_matches(", or similar").trim(),
                "seed {seed}"
            );
        }
    }

    #[test]
    fn vendor_and_renderer_never_come_from_different_parts() {
        for os in TargetOs::ALL {
            for seed in 0..300 {
                let choice = draw_hardware(seed, os, None);
                let paired = pool_for(os)
                    .iter()
                    .any(|gpu| gpu.renderer == choice.renderer && gpu.vendor == choice.vendor);
                assert!(
                    paired,
                    "{os} mixed {} with {}",
                    choice.vendor, choice.renderer
                );
            }
        }
    }
}
