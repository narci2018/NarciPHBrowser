//! Coherence: the difference between a random pile of values and a machine.
//!
//! A fingerprint browser that picks `hardwareConcurrency` and a GPU string
//! independently will eventually produce a 32-core laptop with a 2009
//! integrated GPU. Real anti-detect systems do not need to be sophisticated to
//! catch that — a GPU/core-count mismatch is a two-line check.
//!
//! This module is a port of Camoufox's `coherence.py`. Each rule is a pair:
//! a **check** that describes the breakage, and a **repair** where a correct
//! value is *determined* rather than invented. The distinction is the point:
//!
//! * `colorDepth: 47` is repaired to 24. There is one right answer.
//! * A portrait screen is *reported*, not repaired. Fixing it means guessing
//!   which panel the user meant, and the caller — which can simply draw again —
//!   is better placed to decide.
//!
//! Rules run in declaration order and repairs are idempotent, so [`apply`] can
//! be called on a freshly generated identity, on one loaded from disk, and on
//! one a user has hand-edited, and land on the same answer.

pub mod constants;

use serde::{Deserialize, Serialize};

use crate::identity::Identity;
use crate::os::TargetOs;
use crate::schema::keys;
use constants::*;

/// One broken invariant.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Violation {
    /// The rule's name, stable across releases so the UI can localise it.
    pub rule: String,
    /// A human explanation naming the actual values.
    pub detail: String,
}

impl Violation {
    fn new(rule: &str, detail: impl Into<String>) -> Self {
        Self {
            rule: rule.to_owned(),
            detail: detail.into(),
        }
    }
}

impl std::fmt::Display for Violation {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.rule, self.detail)
    }
}

// --------------------------------------------------------------- accessors

fn renderer(identity: &Identity) -> String {
    identity
        .get_str(keys::WEBGL_RENDERER)
        .unwrap_or_default()
        .to_owned()
}

fn is_apple_silicon(identity: &Identity) -> bool {
    renderer(identity).contains("Apple M")
}

fn dpr_steps(os: TargetOs) -> &'static [f64] {
    PLAUSIBLE_DPR
        .iter()
        .find(|(name, _)| *name == os.as_str())
        .map(|(_, steps)| *steps)
        .unwrap_or(&[1.0])
}

/// The taskbar the OS reserves out of `screen.height`.
pub fn taskbar_for(os: TargetOs) -> u32 {
    TASKBAR_HEIGHT
        .iter()
        .find(|(name, _)| *name == os.as_str())
        .map(|(_, height)| *height)
        .unwrap_or(27)
}

/// Why no Intel Mac reports this GPU beside these cores and this screen.
fn intel_mac_misfit(identity: &Identity) -> Option<String> {
    let renderer = renderer(identity);
    if renderer.is_empty() || is_apple_silicon(identity) {
        return None;
    }
    let allowed = if renderer.contains("Intel") {
        INTEL_MAC_IGP_CORES
    } else {
        INTEL_MAC_DGPU_CORES
    };
    if let Some(cores) = identity.get_u32(keys::HARDWARE_CONCURRENCY) {
        if !allowed.contains(&cores) {
            return Some(format!(
                "{renderer:?} with hardwareConcurrency {cores}; no Intel Mac with that GPU reports it"
            ));
        }
    }
    let panel = (
        identity.get_u32(keys::SCREEN_WIDTH).unwrap_or(0),
        identity.get_u32(keys::SCREEN_HEIGHT).unwrap_or(0),
    );
    if APPLE_SILICON_PANELS.contains(&panel) {
        return Some(format!(
            "{renderer:?} behind a {}x{} panel, which only Apple Silicon Macs have",
            panel.0, panel.1
        ));
    }
    None
}

// ------------------------------------------------------------------ checks

fn check_apple_silicon_cores(identity: &Identity, _os: TargetOs) -> Option<String> {
    if !is_apple_silicon(identity) {
        return None;
    }
    let cores = identity.get_u32(keys::HARDWARE_CONCURRENCY)?;
    if !APPLE_SILICON_CORES.contains(&cores) {
        return Some(format!(
            "{:?} with hardwareConcurrency {cores}; Apple Silicon starts at 8",
            renderer(identity)
        ));
    }
    None
}

fn check_gpu_matches_os(identity: &Identity, os: TargetOs) -> Option<String> {
    let renderer = renderer(identity);
    if renderer.is_empty() || gpu_fits_os(&renderer, os) {
        return None;
    }
    Some(match os {
        TargetOs::Macos => format!("macOS identity with {renderer:?}, which no Mac reports"),
        TargetOs::Windows => {
            format!("Windows identity with {renderer:?}; Firefox on Windows renders through ANGLE")
        }
        TargetOs::Linux => format!("Linux identity with {renderer:?}"),
    })
}

fn check_intel_mac_hardware(identity: &Identity, os: TargetOs) -> Option<String> {
    if os != TargetOs::Macos {
        return None;
    }
    intel_mac_misfit(identity)
}

fn check_color_depth(identity: &Identity, _os: TargetOs) -> Option<String> {
    let depth = identity.get_u32(keys::COLOR_DEPTH)?;
    if !PLAUSIBLE_COLOR_DEPTH.contains(&depth) {
        return Some(format!(
            "screen.colorDepth {depth}; Firefox reports 24 or 30"
        ));
    }
    if is_apple_silicon(identity) && depth != 30 {
        return Some(format!(
            "Apple Silicon Mac with colorDepth {depth}; deep colour is the macOS default"
        ));
    }
    None
}

fn check_touch_points(identity: &Identity, os: TargetOs) -> Option<String> {
    let touch = identity.get_u32(keys::MAX_TOUCH_POINTS)?;
    if touch > MAX_PLAUSIBLE_TOUCH_POINTS {
        return Some(format!(
            "navigator.maxTouchPoints {touch}; a digitiser reports at most {MAX_PLAUSIBLE_TOUCH_POINTS}"
        ));
    }
    if os == TargetOs::Macos && touch != 0 {
        return Some(format!(
            "macOS identity with maxTouchPoints {touch}; no Mac has a touchscreen"
        ));
    }
    None
}

fn check_device_pixel_ratio(identity: &Identity, os: TargetOs) -> Option<String> {
    let dpr = identity.get_f64(keys::DEVICE_PIXEL_RATIO)?;
    if dpr_steps(os)
        .iter()
        .any(|step| (*step - dpr).abs() < f64::EPSILON)
    {
        return None;
    }
    Some(format!(
        "window.devicePixelRatio {dpr} is not a display mode {} offers",
        os.as_str()
    ))
}

fn check_window_chrome(identity: &Identity, _os: TargetOs) -> Option<String> {
    let inner = identity.get_u32(keys::INNER_HEIGHT)?;
    let outer = identity.get_u32(keys::OUTER_HEIGHT)?;
    let gap = outer as i64 - inner as i64;
    if gap < BROWSER_CHROME_HEIGHT as i64 {
        return Some(format!(
            "window.outerHeight {outer} - innerHeight {inner} = {gap}, less than the \
             {BROWSER_CHROME_HEIGHT}px of chrome the window actually has; the bottom \
             {}px of the claimed viewport cannot receive input",
            BROWSER_CHROME_HEIGHT as i64 - gap
        ));
    }
    None
}

fn check_screen_shape(identity: &Identity, _os: TargetOs) -> Option<String> {
    let width = identity.get_u32(keys::SCREEN_WIDTH)?;
    let height = identity.get_u32(keys::SCREEN_HEIGHT)?;
    if height > width {
        return Some(format!(
            "portrait screen {width}x{height}; desktop panels are landscape"
        ));
    }
    if width < MIN_SCREEN_WIDTH {
        return Some(format!(
            "screen {width}x{height} is smaller than any current desktop panel"
        ));
    }
    None
}

fn check_avail_bounds(identity: &Identity, _os: TargetOs) -> Option<String> {
    if let Some(avail) = identity.get_u32(keys::SCREEN_AVAIL_WIDTH) {
        if let Some(width) = identity.get_u32(keys::SCREEN_WIDTH) {
            if avail > width {
                return Some(format!(
                    "screen.availWidth {avail} exceeds screen.width {width}"
                ));
            }
        }
    }
    if let Some(avail) = identity.get_u32(keys::SCREEN_AVAIL_HEIGHT) {
        if let Some(height) = identity.get_u32(keys::SCREEN_HEIGHT) {
            if avail > height {
                return Some(format!(
                    "screen.availHeight {avail} exceeds screen.height {height}"
                ));
            }
        }
    }
    None
}

/// The processor family a string names, when it names one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Arch {
    /// 64-bit x86. What every desktop that is not an ARM machine is.
    X64,
    /// 64-bit ARM, under any of the names the three platforms use for it.
    Arm64,
}

/// The architecture named by a user agent, or `None` when it names none.
///
/// Only an *explicit* 64-bit token counts. This is not fussiness: macOS freezes
/// its user agent at `Intel Mac OS X 10.15` on Apple Silicon machines, so on
/// macOS the honest answer is "the user agent does not say", and returning
/// `X64` there would manufacture a contradiction on every Apple Silicon profile
/// — including every one this crate generates.
fn user_agent_arch(user_agent: &str) -> Option<Arch> {
    let ua = user_agent.to_ascii_lowercase();
    // ARM first: an ARM token can appear in a UA that also mentions x86_64 when
    // a spoofing layer has concatenated strings.
    if ua.contains("aarch64") || ua.contains("arm64") || ua.contains("armv") {
        Some(Arch::Arm64)
    } else if ua.contains("x86_64") || ua.contains("win64") || ua.contains("x64") {
        Some(Arch::X64)
    } else {
        None
    }
}

/// The architecture named by `navigator.platform` or `navigator.oscpu`.
fn platform_arch(value: &str) -> Option<Arch> {
    let value = value.to_ascii_lowercase();
    if value.contains("aarch64") || value.contains("arm64") || value.contains("armv") {
        Some(Arch::Arm64)
    } else if value.contains("x86_64") || value.contains("x64") || value.contains("amd64") {
        Some(Arch::X64)
    } else {
        None
    }
}

fn check_arch_agreement(identity: &Identity, _os: TargetOs) -> Option<String> {
    let user_agent = identity.get_str(keys::USER_AGENT).unwrap_or_default();
    if user_agent.is_empty() {
        return None;
    }
    let claimed = user_agent_arch(user_agent)?;

    let platform = identity.get_str(keys::PLATFORM).unwrap_or_default();
    let oscpu = identity.get_str(keys::OSCPU).unwrap_or_default();

    for (field, value) in [("platform", platform), ("oscpu", oscpu)] {
        if let Some(other) = platform_arch(value) {
            if other != claimed {
                return Some(format!(
                    "user agent claims a {claimed:?} machine while {field} says \
                     {other:?} ({value:?})"
                ));
            }
        }
    }
    None
}

// ----------------------------------------------------------------- repairs

fn repair_apple_silicon_cores(identity: &mut Identity, _os: TargetOs) {
    let Some(cores) = identity.get_u32(keys::HARDWARE_CONCURRENCY) else {
        return;
    };
    // Snap UP to the nearest count Apple ships: a machine claiming an M-series
    // GPU has at least 8 cores, and a page timing workers can see how many.
    let snapped = APPLE_SILICON_CORES
        .iter()
        .copied()
        .filter(|candidate| *candidate >= cores)
        .min()
        .unwrap_or(*APPLE_SILICON_CORES.last().expect("non-empty pool"));
    identity.set_u32(keys::HARDWARE_CONCURRENCY, snapped);
}

fn repair_color_depth(identity: &mut Identity, os: TargetOs) {
    if let Some(depth) = identity.get_u32(keys::COLOR_DEPTH) {
        if !PLAUSIBLE_COLOR_DEPTH.contains(&depth) {
            identity.set_u32(keys::COLOR_DEPTH, 24);
        }
    }
    if os == TargetOs::Macos && is_apple_silicon(identity) {
        identity.set_u32(keys::COLOR_DEPTH, 30);
    }
    // pixelDepth is the same number in every browser that reports both.
    if identity.is_set(keys::COLOR_DEPTH) || identity.is_set(keys::PIXEL_DEPTH) {
        let depth = identity.get_u32(keys::COLOR_DEPTH).unwrap_or(24);
        identity.set_u32(keys::PIXEL_DEPTH, depth);
    }
}

fn repair_touch_points(identity: &mut Identity, os: TargetOs) {
    let touch = identity.get_u32(keys::MAX_TOUCH_POINTS);
    let too_many = touch.is_some_and(|t| t > MAX_PLAUSIBLE_TOUCH_POINTS);
    if os == TargetOs::Macos || too_many || touch.is_some() {
        // A machine claiming 256 contacts is not a machine with a better
        // touchscreen; the value is noise, so the identity has no digitiser.
        identity.set_u32(keys::MAX_TOUCH_POINTS, 0);
    }
}

fn repair_device_pixel_ratio(identity: &mut Identity, os: TargetOs) {
    let Some(dpr) = identity.get_f64(keys::DEVICE_PIXEL_RATIO) else {
        return;
    };
    // Nearest real scaling step: 1.818 becomes 1.75 on Windows, 2 on macOS.
    // Ties keep the lower step, which is why the table is ascending.
    let nearest = dpr_steps(os)
        .iter()
        .copied()
        .reduce(|best, candidate| {
            if (candidate - dpr).abs() < (best - dpr).abs() {
                candidate
            } else {
                best
            }
        })
        .unwrap_or(1.0);
    identity.set_f64(keys::DEVICE_PIXEL_RATIO, nearest);
}

fn repair_window_chrome(identity: &mut Identity, _os: TargetOs) {
    let (Some(inner), Some(outer)) = (
        identity.get_u32(keys::INNER_HEIGHT),
        identity.get_u32(keys::OUTER_HEIGHT),
    ) else {
        return;
    };
    let avail = identity
        .get_u32(keys::SCREEN_AVAIL_HEIGHT)
        .or_else(|| identity.get_u32(keys::SCREEN_HEIGHT))
        .unwrap_or(0);
    // Prefer growing the window, which keeps the viewport the identity drew.
    if avail == 0 || inner + BROWSER_CHROME_HEIGHT <= avail {
        identity.set_u32(keys::OUTER_HEIGHT, inner + BROWSER_CHROME_HEIGHT);
        return;
    }
    // No room on the claimed screen: shrink the viewport to what the window can
    // hold instead, so the claim matches the surface either way.
    identity.set_u32(
        keys::INNER_HEIGHT,
        outer.saturating_sub(BROWSER_CHROME_HEIGHT).max(1),
    );
}

fn repair_avail_bounds(identity: &mut Identity, _os: TargetOs) {
    if let Some(width) = identity.get_u32(keys::SCREEN_WIDTH) {
        if identity.get_u32(keys::SCREEN_AVAIL_WIDTH).unwrap_or(0) > width {
            identity.set_u32(keys::SCREEN_AVAIL_WIDTH, width);
        }
    }
    if let Some(height) = identity.get_u32(keys::SCREEN_HEIGHT) {
        if identity.get_u32(keys::SCREEN_AVAIL_HEIGHT).unwrap_or(0) > height {
            identity.set_u32(keys::SCREEN_AVAIL_HEIGHT, height);
        }
    }
}

type CheckFn = fn(&Identity, TargetOs) -> Option<String>;
type RepairFn = fn(&mut Identity, TargetOs);

struct Rule {
    name: &'static str,
    check: CheckFn,
    repair: Option<RepairFn>,
}

/// The rule set, in the order repairs are applied.
fn rules() -> Vec<Rule> {
    vec![
        Rule {
            name: "apple-silicon-cores",
            check: check_apple_silicon_cores,
            repair: Some(repair_apple_silicon_cores),
        },
        Rule {
            name: "gpu-matches-os",
            check: check_gpu_matches_os,
            repair: None,
        },
        Rule {
            name: "intel-mac-hardware",
            check: check_intel_mac_hardware,
            repair: None,
        },
        Rule {
            name: "color-depth",
            check: check_color_depth,
            repair: Some(repair_color_depth),
        },
        Rule {
            name: "touch-points",
            check: check_touch_points,
            repair: Some(repair_touch_points),
        },
        Rule {
            name: "device-pixel-ratio",
            check: check_device_pixel_ratio,
            repair: Some(repair_device_pixel_ratio),
        },
        Rule {
            name: "window-chrome",
            check: check_window_chrome,
            repair: Some(repair_window_chrome),
        },
        Rule {
            name: "screen-shape",
            check: check_screen_shape,
            repair: None,
        },
        Rule {
            name: "avail-bounds",
            check: check_avail_bounds,
            repair: Some(repair_avail_bounds),
        },
        Rule {
            name: "arch-agreement",
            check: check_arch_agreement,
            repair: None,
        },
    ]
}

// -------------------------------------------------------------------- API

/// Every invariant the identity breaks. Empty means coherent.
pub fn validate(identity: &Identity, os: TargetOs) -> Vec<Violation> {
    rules()
        .iter()
        .filter_map(|rule| {
            (rule.check)(identity, os).map(|detail| Violation::new(rule.name, detail))
        })
        .collect()
}

/// Repairs what is determined, and returns whatever is left.
///
/// A rule with no repair — a Windows GPU on a macOS identity, a portrait
/// screen — cannot be corrected without inventing a machine, so it is
/// returned for the caller to decide about. A caller that draws the identity
/// can simply draw again.
pub fn apply(identity: &mut Identity, os: TargetOs) -> Vec<Violation> {
    for rule in rules() {
        if let Some(repair) = rule.repair {
            if (rule.check)(identity, os).is_some() {
                repair(identity, os);
            }
        }
    }
    validate(identity, os)
}

/// Turns a portrait screen landscape, keeping the panel's own dimensions.
///
/// A preset reporting 1440x2560 is a phone panel, or a desktop one captured
/// while rotated. Either way a desktop identity that claims it answers
/// `matchMedia('(orientation: portrait)')` the way no desktop does, so the
/// axes are swapped rather than the numbers invented. Run before the window
/// clamps, which then bound the window to the new screen.
///
/// Returns whether anything changed.
pub fn repair_screen_orientation(identity: &mut Identity) -> bool {
    let (Some(width), Some(height)) = (
        identity.get_u32(keys::SCREEN_WIDTH),
        identity.get_u32(keys::SCREEN_HEIGHT),
    ) else {
        return false;
    };
    if height <= width {
        return false;
    }
    identity.set_u32(keys::SCREEN_WIDTH, height);
    identity.set_u32(keys::SCREEN_HEIGHT, width);
    if let (Some(avail_width), Some(avail_height)) = (
        identity.get_u32(keys::SCREEN_AVAIL_WIDTH),
        identity.get_u32(keys::SCREEN_AVAIL_HEIGHT),
    ) {
        identity.set_u32(keys::SCREEN_AVAIL_WIDTH, avail_height);
        identity.set_u32(keys::SCREEN_AVAIL_HEIGHT, avail_width);
    }
    true
}

/// Whether the screen is one no desktop reports.
pub fn screen_is_implausible(identity: &Identity) -> bool {
    check_screen_shape(identity, TargetOs::Windows).is_some()
}

/// Discards a GPU pair this identity cannot keep.
///
/// Run after the core count and the screen are final, and before the pools
/// that would otherwise defer to them. A preset carries its own GPU pair, so a
/// macOS preset naming an Intel IGP keeps it all the way to the page unless the
/// pair is dropped here — including when the launch has replaced the preset's
/// core count with a 20-core host's — at which point normal sampling draws a
/// coherent one instead.
///
/// Only values another pool can replace are dropped; everything else is left
/// for [`apply`].
pub fn drop_incoherent_source_values(identity: &mut Identity, os: TargetOs) -> Vec<Violation> {
    let renderer = renderer(identity);
    if renderer.is_empty() {
        return Vec::new();
    }
    let rule = if !gpu_fits_os(&renderer, os) {
        "gpu-matches-os"
    } else if check_intel_mac_hardware(identity, os).is_some() {
        "intel-mac-hardware"
    } else {
        return Vec::new();
    };
    identity.remove(keys::WEBGL_RENDERER);
    identity.remove(keys::WEBGL_VENDOR);
    vec![Violation::new(
        rule,
        format!("dropped {renderer:?} for a {} identity", os.as_str()),
    )]
}

#[cfg(test)]
mod tests {
    //! Tests for the private helpers. The rules' *behaviour* is covered from
    //! `tests/coherence.rs`, which can only reach the public surface; these are
    //! the cases where the helper itself is the thing worth pinning.

    use super::{user_agent_arch, Arch};

    #[test]
    fn the_frozen_macos_platform_token_is_not_read_as_an_architecture() {
        // Every Apple Silicon Mac reports "Intel Mac OS X 10.15" in its user
        // agent. Reading that as a 64-bit x86 claim would flag every Mac profile
        // this crate generates, so macOS has to answer "the user agent does not
        // say" instead.
        assert_eq!(
            user_agent_arch(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0"
            ),
            None
        );
    }

    #[test]
    fn each_platform_spells_x64_differently() {
        // The reason the old rule, which searched for "x86_64", could never fire
        // on a Windows profile: Windows writes "Win64; x64".
        assert_eq!(
            user_agent_arch("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0)"),
            Some(Arch::X64)
        );
        assert_eq!(
            user_agent_arch("Mozilla/5.0 (X11; Linux x86_64; rv:156.0)"),
            Some(Arch::X64)
        );
        assert_eq!(
            user_agent_arch("Mozilla/5.0 (X11; Linux aarch64; rv:156.0)"),
            Some(Arch::Arm64)
        );
        assert_eq!(
            user_agent_arch("Mozilla/5.0 (Windows NT 10.0; Win64; aarch64)"),
            Some(Arch::Arm64)
        );
    }

    #[test]
    fn a_user_agent_naming_no_architecture_returns_none_rather_than_guessing() {
        for ua in ["", "curl/8.4.0", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"] {
            assert_eq!(user_agent_arch(ua), None, "{ua}");
        }
    }
}
