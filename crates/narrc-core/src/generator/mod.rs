//! The generator: a seed in, a coherent machine out.
//!
//! # Draw order
//!
//! The order is the design, so it is worth stating plainly:
//!
//! 1. **Hardware** — GPU first, then a core count from that GPU's own list.
//! 2. **Display** — a panel that GPU is known to drive, then the window
//!    geometry that fits inside it after the OS taskbar and the browser's own
//!    86px of chrome.
//! 3. **Place** — locale, timezone and coordinates from one row of one table.
//! 4. **Peripherals** — fonts, voices and audio devices for that OS.
//! 5. **User agent** — written *last*, from the OS and the Firefox pin, so it
//!    cannot disagree with anything above it.
//!
//! Each step reads the previous ones. That is the whole point: a generator
//! that draws `screen.width` and `navigator.userAgent` from two independent
//! pools is the thing this crate exists to not be.
//!
//! # Determinism
//!
//! A profile's seed is its identity. Re-opening it next year must present the
//! same machine, so every draw comes from a *labelled* sub-stream
//! ([`Rng::stream`]) rather than one long shared sequence — adding a new field
//! to the generator then cannot shift the values every existing field draws.

pub mod geo;
pub mod hardware;
pub mod media;

use serde::{Deserialize, Serialize};

use crate::coherence::{self, constants::BROWSER_CHROME_HEIGHT};
use crate::identity::Identity;
use crate::os::TargetOs;
use crate::pools::{
    self, GECKO_TRAILER, LINUX_DISTROS, MACOS_VERSIONS, WINDOWS_BUILDS, WINDOWS_DEVICE_PREFIXES,
};
use crate::rng::Rng;
use crate::schema::keys;
use geo::{draw_host_ipv4, draw_host_ipv6};

// Re-exported, not just imported: these are the generator's public vocabulary,
// and a caller should never have to know that the fonts live in `media` and the
// card in `hardware`.
pub use geo::GeoProfile;
pub use hardware::GpuChoice;
pub use media::{AudioProfile, FontProfile, Peripherals};

/// What the user asked for, before anything is drawn.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GeneratorOptions {
    /// The OS to impersonate.
    pub os: TargetOs,
    /// An explicit display, or `None` to draw one the GPU is known to drive.
    pub screen: Option<(u32, u32)>,
    /// An explicit display scale, or `None` to draw one the OS offers.
    ///
    /// Pinned together with a display rather than alone: the two are only
    /// checkable as a pair, because the CSS size a page sees is the panel
    /// divided by this. A scale without a panel would be a claim nothing on
    /// the page can confirm and the coherence layer cannot bound.
    #[serde(default)]
    pub dpr: Option<f64>,
    /// How many fonts to claim.
    pub fonts: FontProfile,
    /// Whether to claim `doNotTrack` and `globalPrivacyControl`.
    pub tracking_protection: bool,
    /// A locale tag to pin, or `None` to draw one.
    pub locale: Option<String>,
    /// A country to pin, which the proxy's exit IP usually determines.
    pub country: Option<String>,
}

impl GeneratorOptions {
    /// Sensible defaults for an OS.
    pub fn new(os: TargetOs) -> Self {
        Self {
            os,
            screen: None,
            dpr: None,
            fonts: FontProfile::Stock,
            tracking_protection: true,
            locale: None,
            country: None,
        }
    }

    /// Pins the display.
    pub fn with_screen(mut self, width: u32, height: u32) -> Self {
        self.screen = Some((width, height));
        self
    }

    /// Pins the display scale, which turns a pinned panel into the CSS size
    /// a page on that host would actually see.
    pub fn with_dpr(mut self, dpr: f64) -> Self {
        self.dpr = Some(dpr);
        self
    }

    /// Pin the country, which is what a configured proxy implies.
    pub fn with_country(mut self, country: &str) -> Self {
        self.country = Some(country.to_owned());
        self
    }
}

impl Default for GeneratorOptions {
    fn default() -> Self {
        Self::new(TargetOs::Windows)
    }
}

/// A generated identity, with the reasoning kept alongside it.
///
/// The audit trail is not decoration. A user comparing two profiles needs to
/// see *why* they differ, and a support question of the form "what did you set
/// my resolution to" must be answerable from what is stored, not from a log
/// that has already rotated.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GeneratedIdentity {
    /// The values to hand the engine.
    pub identity: Identity,
    /// The OS that was drawn.
    pub os: TargetOs,
    /// The place that was drawn.
    pub geo: GeoProfile,
    /// The graphics identity that was drawn.
    pub gpu: GpuChoice,
    /// The peripherals that were drawn.
    pub peripherals: Peripherals,
    /// The audio parameters that were drawn.
    pub audio: AudioProfile,
    /// The user agent that was written, last, from everything above.
    pub user_agent: String,
    /// Invariants the generator could not satisfy on the first draw.
    pub violations: Vec<coherence::Violation>,
    /// A content hash of the identity, for duplicate detection.
    pub digest: u64,
}

/// The screen and window geometry a real browser window on this display has.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WindowGeometry {
    pub screen_width: u32,
    pub screen_height: u32,
    pub avail_width: u32,
    pub avail_height: u32,
    pub inner_width: u32,
    pub inner_height: u32,
    pub outer_width: u32,
    pub outer_height: u32,
    pub screen_x: i32,
    pub screen_y: i32,
}

/// Draws the screen and window geometry for a display.
///
/// Three subtractions happen here and each is load-bearing:
///
/// * the taskbar, out of `screen.height` into `screen.availHeight`;
/// * the browser's own chrome, out of `availHeight` into `outerHeight`;
/// * a small margin, because a real window is not snapped to the pixel edge
///   of the work area.
pub fn draw_geometry(
    seed: u64,
    os: TargetOs,
    screen: (u32, u32),
    device_pixel_ratio: f64,
) -> WindowGeometry {
    let mut rng = Rng::stream(seed, "geometry");
    let (screen_width, screen_height) = screen;
    let taskbar = coherence::taskbar_for(os);

    // DPR scales the *physical* panel, so a 2x display reports half the CSS
    // pixels for the same panel.
    let scale = device_pixel_ratio.max(1.0);
    let css_width =
        ((screen_width as f64 / scale).round() as u32).max(coherence::constants::MIN_SCREEN_WIDTH);
    let css_height = ((screen_height as f64 / scale).round() as u32)
        .max(coherence::constants::MIN_SCREEN_HEIGHT);

    let avail_width = css_width;
    let avail_height = css_height
        .saturating_sub(taskbar)
        .max(BROWSER_CHROME_HEIGHT + 100);

    // A real window is inset from the work area rather than filling it. The
    // margins are unsigned: `saturating_sub` on a u32 by a negative i32 would
    // wrap to four billion rather than clamp, and a window at 4294967xxx is a
    // value no browser can report.
    let margin_x = rng.range_i32(0, 48) as u32;
    let margin_y = rng.range_i32(0, 32) as u32;
    let outer_width = avail_width.saturating_sub(margin_x).max(640);
    let outer_height = avail_height.saturating_sub(margin_y).max(480);

    let inner_width = outer_width.saturating_sub(16).max(320);
    let inner_height = outer_height.saturating_sub(BROWSER_CHROME_HEIGHT).max(200);

    WindowGeometry {
        screen_width: css_width,
        screen_height: css_height,
        avail_width,
        avail_height,
        inner_width,
        inner_height,
        outer_width,
        outer_height,
        // A window on a multi-monitor desktop is rarely at 0,0.
        screen_x: margin_x as i32,
        screen_y: margin_y as i32,
    }
}

/// Writes the `navigator.*` family and the matching request headers.
///
/// The user agent is assembled here, from the OS and the Firefox pin, rather
/// than picked from a pool of strings. A pool of user agents is how a profile
/// ends up claiming Windows while its `oscpu` says `Linux x86_64`.
pub fn write_navigator(identity: &mut Identity, seed: u64, os: TargetOs) -> String {
    let user_agent = build_user_agent(seed, os);

    identity.set_str(keys::USER_AGENT, &user_agent);
    identity.set_str(keys::HEADER_USER_AGENT, &user_agent);
    // appVersion is the UA minus the leading "Mozilla/" -- a real browser
    // derives it that way, and a full UA in its place is a tell.
    let app_version = user_agent
        .strip_prefix("Mozilla/")
        .unwrap_or(&user_agent)
        .to_owned();
    identity.set_str(keys::APP_VERSION, &app_version);
    identity.set_str(keys::PLATFORM, os.navigator_platform());

    match os {
        TargetOs::Windows => {
            identity.set_str(keys::OSCPU, "Windows NT 10.0; Win64; x64");
        }
        TargetOs::Macos => {
            // Firefox reports an empty oscpu on macOS.
            identity.remove(keys::OSCPU);
        }
        TargetOs::Linux => {
            identity.set_str(keys::OSCPU, "Linux x86_64");
        }
    }

    // A Windows machine reports its architecture in the UA; macOS and Linux
    // x86_64 both say "Intel" in the frozen platform token, not in the UA, so
    // there is nothing further to write here.
    user_agent
}

/// Assembles the Firefox user agent for an OS.
///
/// The Windows NT version is drawn from the real build table, so a Windows
/// identity does not claim a build that never existed.
pub fn build_user_agent(seed: u64, os: TargetOs) -> String {
    let mut rng = Rng::stream(seed, "user-agent");
    let version = pools::FIREFOX_VERSION;
    let trailer = format!("Gecko/{GECKO_TRAILER}");

    match os {
        TargetOs::Windows => {
            let (nt_version, _) = rng.pick(WINDOWS_BUILDS);
            format!(
                "Mozilla/5.0 (Windows NT {nt_version}; Win64; x64; rv:{version}) {trailer} Firefox/{version}"
            )
        }
        TargetOs::Macos => {
            // Firefox freezes the platform token at 10.15 on every macOS
            // release, because Apple froze the compatibility version and the
            // browser follows it. The drawn `MACOS_VERSIONS` entry is still
            // what `os.version` reports elsewhere in the identity, so the
            // machine can be a Sequoia box that claims 10.15 in the UA.
            let _macos_version = rng.pick(MACOS_VERSIONS);
            format!(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:{version}) {trailer} Firefox/{version}"
            )
        }
        TargetOs::Linux => {
            let (distro, _desktop) = rng.pick(LINUX_DISTROS);
            format!("Mozilla/5.0 (X11; {distro}; Linux x86_64; rv:{version}) {trailer} Firefox/{version}")
        }
    }
}

/// A Windows machine name, for the field behind `navigator.buildID`'s sibling
/// host identifiers.
pub fn draw_device_name(seed: u64, os: TargetOs) -> String {
    let mut rng = Rng::stream(seed, "device-name");
    match os {
        TargetOs::Windows => {
            let prefix = rng.pick(WINDOWS_DEVICE_PREFIXES);
            let suffix: String = (0..7)
                .map(|_| {
                    let value = rng.next_u32() % 36;
                    char::from_digit(value, 36)
                        .unwrap_or('0')
                        .to_ascii_uppercase()
                })
                .collect();
            format!("{prefix}-{suffix}")
        }
        // macOS and Linux report no machine name in any API a page can reach.
        _ => String::new(),
    }
}

/// Draws a complete, coherent identity.
///
/// `seed` is the identity's name in the only sense that matters: the same seed
/// and the same options always produce the same machine.
pub fn generate(seed: u64, options: &GeneratorOptions) -> GeneratedIdentity {
    let os = options.os;

    // 1. Hardware. The panel filter is what ties the display to the card.
    let gpu = hardware::draw_hardware(seed, os, options.screen);

    // 2. Display. Apple's deep-colour default and the panel list both feed in.
    //    A pinned scale wins over the draw, so a profile created against a
    //    host machine keeps presenting that host's pixels.
    let screen = options.screen.unwrap_or_else(|| {
        gpu.panel
            .unwrap_or_else(|| pick_default_panel(&mut Rng::stream(seed, "panel"), os))
    });

    let mut rng_dpr = Rng::stream(seed, "dpr");
    let dpr = options
        .dpr
        .unwrap_or_else(|| pick_dpr(&mut rng_dpr, os, gpu.apple_silicon, options.screen));
    let geometry = draw_geometry(seed, os, screen, dpr);

    // 3. Place.
    let geo = resolve_geo(seed, options);

    // 4. Peripherals and audio.
    let peripherals = options.fonts.draw(seed, os);
    let audio = AudioProfile::draw(seed, os);

    // Assemble.
    let mut identity = Identity::new();
    write_display(&mut identity, &geometry, dpr, gpu.apple_silicon);
    write_hardware(&mut identity, &gpu, os, seed);
    write_place(&mut identity, &geo, seed);
    write_peripherals(&mut identity, &peripherals, &audio);
    let user_agent = write_navigator(&mut identity, seed, os);
    write_preferences(&mut identity, os, options);

    // Coherence is applied, not assumed. The generator should produce zero
    // violations, and if it ever does not, they travel with the identity
    // rather than being swallowed.
    let violations = coherence::apply(&mut identity, os);
    let digest = crate::coherence::constants::identity_digest(&identity);

    GeneratedIdentity {
        identity,
        os,
        geo,
        gpu,
        peripherals,
        audio,
        user_agent,
        violations,
        digest,
    }
}

fn pick_dpr(rng: &mut Rng, os: TargetOs, apple_silicon: bool, screen: Option<(u32, u32)>) -> f64 {
    let fits = |step: f64| {
        screen.is_none_or(|(width, height)| {
            width as f64 / step >= coherence::constants::MIN_SCREEN_WIDTH as f64
                && height as f64 / step >= coherence::constants::MIN_SCREEN_HEIGHT as f64
        })
    };
    // A Retina MacBook has been 2x since 2016 and there is no 1.5x Mac, so
    // the pool is not the same shape as the other two.
    if os == TargetOs::Macos {
        let drawn = if apple_silicon || rng.chance(0.5) {
            2.0
        } else {
            1.0
        };
        if fits(drawn) {
            return drawn;
        }
        let other = if drawn == 2.0 { 1.0 } else { 2.0 };
        return if fits(other) { other } else { drawn };
    }
    let steps: &'static [f64] = match os {
        TargetOs::Windows => &[1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0],
        _ => &[1.0, 1.25, 1.5, 1.75, 2.0],
    };
    let fitting: Vec<f64> = steps.iter().copied().filter(|step| fits(*step)).collect();
    let pool: &[f64] = if fitting.is_empty() {
        steps
    } else {
        &fitting
    };
    // Weighted towards 1.0: most desktops do not run a scaled display, and an
    // identity pool where 3x is as likely as 1x is not a real distribution.
    let weights: Vec<f64> = pool
        .iter()
        .map(|step| {
            if *step <= 1.0 {
                0.55
            } else {
                0.45 / (pool.len() - 1) as f64
            }
        })
        .collect();
    pool[rng.weighted_index(&weights).unwrap_or(0)]
}

fn pick_default_panel(rng: &mut Rng, os: TargetOs) -> (u32, u32) {
    let sizes = crate::coherence::constants::SCREEN_SIZES;
    let weights = crate::coherence::constants::SCREEN_SIZE_WEIGHTS;
    let index = rng.weighted_index(weights).unwrap_or(1);
    let _ = os;
    sizes[index.min(sizes.len() - 1)]
}

fn resolve_geo(seed: u64, options: &GeneratorOptions) -> GeoProfile {
    if let Some(country) = &options.country {
        if let Some(profile) = GeoProfile::for_country(seed, country) {
            return profile;
        }
    }
    if let Some(locale) = &options.locale {
        // A pinned locale still gets a place from the table, matched on
        // language: `de-DE` and `de-AT` are the same language in different
        // countries, and picking the wrong one is a smaller error than
        // ignoring the pin.
        let matches: Vec<&pools::LocaleRegion> = pools::LOCALES
            .iter()
            .map(|(_, region)| region)
            .filter(|region| region.language == *locale)
            .collect();
        if !matches.is_empty() {
            let mut rng = Rng::stream(seed, "geo-locale");
            return GeoProfile::from_region(matches[rng.below(matches.len())]);
        }
    }
    GeoProfile::draw(seed)
}

fn write_display(
    identity: &mut Identity,
    geometry: &WindowGeometry,
    dpr: f64,
    apple_silicon: bool,
) {
    identity
        .set_u32(keys::SCREEN_WIDTH, geometry.screen_width)
        .set_u32(keys::SCREEN_HEIGHT, geometry.screen_height)
        .set_u32(keys::SCREEN_AVAIL_WIDTH, geometry.avail_width)
        .set_u32(keys::SCREEN_AVAIL_HEIGHT, geometry.avail_height)
        // No taskbar strip on the left or top; a real desktop reserves one.
        .set_u32(keys::SCREEN_AVAIL_TOP, 0)
        .set_u32(keys::SCREEN_AVAIL_LEFT, 0)
        .set_u32(keys::INNER_WIDTH, geometry.inner_width)
        .set_u32(keys::INNER_HEIGHT, geometry.inner_height)
        .set_u32(keys::OUTER_WIDTH, geometry.outer_width)
        .set_u32(keys::OUTER_HEIGHT, geometry.outer_height)
        .set_i32(keys::SCREEN_X, geometry.screen_x)
        .set_i32(keys::SCREEN_Y, geometry.screen_y)
        .set_f64(keys::DEVICE_PIXEL_RATIO, dpr);

    let depth = if apple_silicon { 30 } else { 24 };
    identity
        .set_u32(keys::COLOR_DEPTH, depth)
        .set_u32(keys::PIXEL_DEPTH, depth);
}

fn write_hardware(identity: &mut Identity, gpu: &GpuChoice, os: TargetOs, seed: u64) {
    identity
        .set_str(keys::WEBGL_VENDOR, &gpu.vendor)
        .set_str(keys::WEBGL_RENDERER, &gpu.renderer)
        .set_u32(keys::HARDWARE_CONCURRENCY, gpu.cores);

    // Touch is a property of the machine's digitiser, not of the OS as such --
    // but no Mac has one, which the coherence layer enforces.
    let mut rng = Rng::stream(seed, "touch");
    let touch = if os == TargetOs::Macos {
        0
    } else {
        let weights = crate::coherence::constants::TOUCH_POINT_WEIGHTS;
        crate::coherence::constants::TOUCH_POINTS[rng.weighted_index(weights).unwrap_or(0)]
    };
    identity.set_u32(keys::MAX_TOUCH_POINTS, touch);

    let device_name = draw_device_name(seed, os);
    if !device_name.is_empty() {
        identity.set_str(keys::BUILD_ID, &device_name);
    }
}

fn write_place(identity: &mut Identity, geo: &GeoProfile, seed: u64) {
    identity
        .set_str(keys::TIMEZONE, &geo.timezone)
        .set_str(keys::LANGUAGE, &geo.language)
        .set_str(
            keys::LOCALE_LANGUAGE,
            geo.language
                .split('-')
                .next()
                .unwrap_or(geo.language.as_str()),
        )
        .set_str(keys::LOCALE_REGION, &geo.region)
        .set_str(keys::LOCALE_ALL, &geo.language.replace('-', "_"))
        .set_str(
            keys::HEADER_ACCEPT_LANGUAGE,
            &pools::accept_language(&geo.language),
        )
        .set_str(keys::HEADER_ACCEPT_ENCODING, pools::ACCEPT_ENCODING)
        .set_f64(keys::GEO_LATITUDE, geo.latitude)
        .set_f64(keys::GEO_LONGITUDE, geo.longitude)
        // Desktop geolocation reports tens of metres, not metres.
        .set_f64(keys::GEO_ACCURACY, 32.0)
        .set_str(keys::WEBRTC_IPV4, &draw_host_ipv4(seed))
        .set_str(keys::WEBRTC_IPV6, &draw_host_ipv6(seed));
}

fn write_peripherals(identity: &mut Identity, peripherals: &Peripherals, audio: &AudioProfile) {
    identity
        .set_str_array(keys::FONTS, &peripherals.fonts)
        .set_str_array(keys::VOICES, &peripherals.voices)
        .set_str_array(keys::MEDIA_MIC_LABELS, &peripherals.microphones)
        .set_str_array(keys::MEDIA_SPEAKER_LABELS, &peripherals.speakers)
        .set_str_array(keys::MEDIA_WEBCAM_LABELS, &peripherals.webcams)
        .set_u32(
            keys::MEDIA_MICS,
            peripherals.microphones.len().max(1) as u32,
        )
        .set_u32(
            keys::MEDIA_SPEAKERS,
            peripherals.speakers.len().max(1) as u32,
        )
        .set_u32(keys::MEDIA_WEBCAMS, peripherals.webcams.len() as u32)
        .set_bool(keys::MEDIA_ENABLED, true)
        .set_bool(keys::MEDIA_SPOOF_CODECS, true)
        .set_u32(keys::AUDIO_SEED, audio.seed)
        .set_u32(keys::AUDIO_SAMPLE_RATE, audio.sample_rate)
        .set_f64(keys::AUDIO_OUTPUT_LATENCY, audio.output_latency)
        .set_u32(keys::AUDIO_MAX_CHANNELS, audio.max_channels);
}

fn write_preferences(identity: &mut Identity, _os: TargetOs, options: &GeneratorOptions) {
    if options.tracking_protection {
        identity
            .set_str(keys::DO_NOT_TRACK, pools::DO_NOT_TRACK)
            .set_bool(keys::GLOBAL_PRIVACY_CONTROL, pools::GLOBAL_PRIVACY_CONTROL);
    } else {
        // "unspecified" is the value a Firefox with tracking protection off
        // reports. An empty doNotTrack is not a value a browser emits.
        identity.set_str(keys::DO_NOT_TRACK, "unspecified");
        identity.remove(keys::GLOBAL_PRIVACY_CONTROL);
    }

    // The cursor is part of the automation surface, not the identity: a headless
    // run with a visible cursor is inconsistent, and a headed run with none is
    // not observable to a page at all.
    identity.set_bool(keys::SHOW_CURSOR, true);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn the_same_seed_and_options_produce_the_same_machine() {
        for seed in [1u64, 99, 12345] {
            for os in TargetOs::ALL {
                let options = GeneratorOptions::new(os);
                let first = generate(seed, &options);
                let second = generate(seed, &options);
                assert_eq!(first, second, "seed {seed} / {os} is not reproducible");
            }
        }
    }

    #[test]
    fn different_seeds_produce_different_machines() {
        let digests: HashSet<u64> = (0..200)
            .map(|seed| generate(seed, &GeneratorOptions::default()).digest)
            .collect();
        assert!(
            digests.len() > 190,
            "200 seeds produced only {} distinct identities",
            digests.len()
        );
    }

    #[test]
    fn a_generated_identity_breaks_no_invariant() {
        for os in TargetOs::ALL {
            for seed in 0..200 {
                let generated = generate(seed, &GeneratorOptions::new(os));
                assert_eq!(
                    generated.violations,
                    Vec::new(),
                    "seed {seed}/{os} generated an incoherent machine: {:?}",
                    generated.violations
                );
            }
        }
    }

    #[test]
    fn the_user_agent_names_the_os_that_was_requested() {
        for os in TargetOs::ALL {
            for seed in 0..100 {
                let generated = generate(seed, &GeneratorOptions::new(os));
                assert_eq!(
                    TargetOs::from_user_agent(&generated.user_agent),
                    Some(os),
                    "seed {seed} generated {} for a {os} identity",
                    generated.user_agent
                );
            }
        }
    }

    #[test]
    fn the_user_agent_reports_the_pinned_firefox_version() {
        for os in TargetOs::ALL {
            let generated = generate(1, &GeneratorOptions::new(os));
            assert!(
                generated
                    .user_agent
                    .contains(&format!("Firefox/{}", pools::FIREFOX_VERSION)),
                "{}",
                generated.user_agent
            );
            assert!(generated
                .user_agent
                .contains(&format!("rv:{}", pools::FIREFOX_VERSION)));
        }
    }

    #[test]
    fn a_windows_user_agent_reports_a_build_that_exists() {
        for seed in 0..300 {
            let ua = build_user_agent(seed, TargetOs::Windows);
            let known = WINDOWS_BUILDS
                .iter()
                .any(|(version, _)| ua.contains(&format!("Windows NT {version};")));
            assert!(known, "{ua} names a build that does not exist");
        }
    }

    #[test]
    fn the_user_agent_and_the_platform_agree() {
        for os in TargetOs::ALL {
            for seed in 0..150 {
                let generated = generate(seed, &GeneratorOptions::new(os));
                assert_eq!(
                    generated.identity.get_str(keys::PLATFORM),
                    Some(os.navigator_platform())
                );
            }
        }
    }

    #[test]
    fn app_version_is_the_user_agent_without_the_leading_token() {
        for os in TargetOs::ALL {
            let generated = generate(5, &GeneratorOptions::new(os));
            let expected = generated.user_agent.strip_prefix("Mozilla/").unwrap();
            assert_eq!(
                generated.identity.get_str(keys::APP_VERSION),
                Some(expected)
            );
        }
    }

    #[test]
    fn only_windows_reports_an_oscpu() {
        for seed in 0..50 {
            let macos = generate(seed, &GeneratorOptions::new(TargetOs::Macos));
            assert!(
                !macos.identity.is_set(keys::OSCPU),
                "macOS Firefox reports none"
            );

            let linux = generate(seed, &GeneratorOptions::new(TargetOs::Linux));
            assert_eq!(linux.identity.get_str(keys::OSCPU), Some("Linux x86_64"));

            let windows = generate(seed, &GeneratorOptions::new(TargetOs::Windows));
            assert_eq!(
                windows.identity.get_str(keys::OSCPU),
                Some("Windows NT 10.0; Win64; x64")
            );
        }
    }

    #[test]
    fn the_window_fits_inside_the_work_area() {
        for os in TargetOs::ALL {
            for seed in 0..200 {
                let generated = generate(seed, &GeneratorOptions::new(os));
                let identity = &generated.identity;
                let outer_height = identity.get_u32(keys::OUTER_HEIGHT).unwrap();
                let avail_height = identity.get_u32(keys::SCREEN_AVAIL_HEIGHT).unwrap();
                let inner_height = identity.get_u32(keys::INNER_HEIGHT).unwrap();
                assert!(
                    outer_height <= avail_height,
                    "{os} seed {seed}: window {outer_height} exceeds the work area {avail_height}"
                );
                assert!(
                    outer_height > inner_height,
                    "{os} seed {seed}: window is inside-out"
                );
                assert!(
                    outer_height - inner_height >= BROWSER_CHROME_HEIGHT,
                    "{os} seed {seed}: chrome is {}px, under {BROWSER_CHROME_HEIGHT}",
                    outer_height - inner_height
                );
            }
        }
    }

    #[test]
    fn the_window_is_no_wider_than_the_screen() {
        for os in TargetOs::ALL {
            for seed in 0..200 {
                let identity = &generate(seed, &GeneratorOptions::new(os)).identity;
                assert!(
                    identity.get_u32(keys::OUTER_WIDTH).unwrap()
                        <= identity.get_u32(keys::SCREEN_WIDTH).unwrap()
                );
            }
        }
    }

    #[test]
    fn avail_height_reserves_the_taskbar() {
        for os in TargetOs::ALL {
            for seed in 0..100 {
                let identity = &generate(seed, &GeneratorOptions::new(os)).identity;
                let screen = identity.get_u32(keys::SCREEN_HEIGHT).unwrap();
                let avail = identity.get_u32(keys::SCREEN_AVAIL_HEIGHT).unwrap();
                assert_eq!(
                    screen - avail,
                    coherence::taskbar_for(os),
                    "{os} seed {seed} reserved the wrong taskbar height"
                );
            }
        }
    }

    #[test]
    fn an_apple_silicon_identity_reports_deep_colour() {
        for seed in 0..100 {
            let generated = generate(seed, &GeneratorOptions::new(TargetOs::Macos));
            if generated.gpu.apple_silicon {
                assert_eq!(generated.identity.get_u32(keys::COLOR_DEPTH), Some(30));
                assert_eq!(
                    generated.identity.get_f64(keys::DEVICE_PIXEL_RATIO),
                    Some(2.0)
                );
            }
        }
    }

    #[test]
    fn macos_never_reports_a_touchscreen() {
        for seed in 0..200 {
            let generated = generate(seed, &GeneratorOptions::new(TargetOs::Macos));
            assert_eq!(generated.identity.get_u32(keys::MAX_TOUCH_POINTS), Some(0));
        }
    }

    #[test]
    fn the_pinned_country_shows_up_in_the_locale() {
        for country in ["US", "DE", "JP"] {
            let options = GeneratorOptions::new(TargetOs::Windows).with_country(country);
            for seed in 0..20 {
                let generated = generate(seed, &options);
                assert_eq!(
                    generated.geo.country, country,
                    "seed {seed} ignored the pinned country"
                );
                assert_eq!(
                    generated.identity.get_str(keys::LOCALE_REGION),
                    Some(country)
                );
            }
        }
    }

    #[test]
    fn a_pinned_locale_is_honoured() {
        let options = GeneratorOptions {
            os: TargetOs::Windows,
            screen: None,
            dpr: None,
            fonts: FontProfile::Stock,
            tracking_protection: true,
            locale: Some("de-DE".into()),
            country: None,
        };
        for seed in 0..20 {
            let generated = generate(seed, &options);
            assert_eq!(generated.geo.language, "de-DE");
            assert_eq!(generated.identity.get_str(keys::LANGUAGE), Some("de-DE"));
        }
    }

    #[test]
    fn an_unknown_pinned_locale_falls_back_rather_than_failing() {
        let options = GeneratorOptions {
            os: TargetOs::Windows,
            screen: None,
            dpr: None,
            fonts: FontProfile::Stock,
            tracking_protection: true,
            locale: Some("xx-YY".into()),
            country: None,
        };
        let generated = generate(1, &options);
        assert!(!generated.geo.language.is_empty());
    }

    #[test]
    fn a_pinned_screen_is_respected() {
        let options = GeneratorOptions::new(TargetOs::Windows).with_screen(2560, 1440);
        for seed in 0..20 {
            let identity = &generate(seed, &options).identity;
            // At 1x the CSS size is the panel; at higher ratios it is smaller,
            // so compare against the ratio the generator chose.
            let dpr = identity.get_f64(keys::DEVICE_PIXEL_RATIO).unwrap();
            let expected = (2560.0 / dpr).round() as u32;
            assert_eq!(identity.get_u32(keys::SCREEN_WIDTH).unwrap(), expected);
        }
    }

    #[test]
    fn a_pinned_screen_never_clamps_away_the_pin() {
        let panels = [(1920, 1080), (2560, 1440), (1366, 768), (1920, 1200)];
        for (width, height) in panels {
            let options = GeneratorOptions::new(TargetOs::Windows).with_screen(width, height);
            for seed in 0..50 {
                let identity = &generate(seed, &options).identity;
                let dpr = identity.get_f64(keys::DEVICE_PIXEL_RATIO).unwrap();
                assert_eq!(
                    identity.get_u32(keys::SCREEN_WIDTH).unwrap(),
                    (width as f64 / dpr).round() as u32,
                    "{width}x{height} seed {seed} at {dpr}x had its width clamped"
                );
                assert_eq!(
                    identity.get_u32(keys::SCREEN_HEIGHT).unwrap(),
                    (height as f64 / dpr).round() as u32,
                    "{width}x{height} seed {seed} at {dpr}x had its height clamped"
                );
            }
        }
    }

    #[test]
    fn a_pinned_scale_reaches_the_identity_and_stays_coherent() {
        // The pair the host-monitor path pins: a physical panel and the scale
        // it runs at. The page must see exactly the CSS size of that host.
        let options = GeneratorOptions::new(TargetOs::Windows)
            .with_screen(1920, 1200)
            .with_dpr(1.25);
        for seed in 0..20 {
            let generated = generate(seed, &options);
            let identity = &generated.identity;
            assert_eq!(identity.get_f64(keys::DEVICE_PIXEL_RATIO), Some(1.25));
            assert_eq!(identity.get_u32(keys::SCREEN_WIDTH), Some(1536));
            assert_eq!(identity.get_u32(keys::SCREEN_HEIGHT), Some(960));
            let violations = crate::coherence::validate(identity, TargetOs::Windows);
            assert!(violations.is_empty(), "seed {seed}: {violations:?}");
        }
    }

    #[test]
    fn a_stored_options_without_a_scale_still_reads() {
        // Profiles written before the scale field existed must keep loading;
        // the field is defaulted rather than required.
        let json = r#"{"os":"windows","screen":null,"fonts":"stock","tracking_protection":true,"locale":null,"country":null}"#;
        let options: GeneratorOptions = serde_json::from_str(json).expect("an older options json");
        assert_eq!(options.dpr, None);
    }

    #[test]
    fn tracking_protection_off_removes_the_gpc_flag_and_keeps_dnt_meaningful() {
        let options = GeneratorOptions {
            tracking_protection: false,
            ..GeneratorOptions::new(TargetOs::Windows)
        };
        let identity = &generate(1, &options).identity;
        assert!(!identity.is_set(keys::GLOBAL_PRIVACY_CONTROL));
        assert_eq!(identity.get_str(keys::DO_NOT_TRACK), Some("unspecified"));

        let on = &generate(1, &GeneratorOptions::new(TargetOs::Windows)).identity;
        assert_eq!(on.get_bool(keys::GLOBAL_PRIVACY_CONTROL), Some(true));
        assert_eq!(on.get_str(keys::DO_NOT_TRACK), Some("1"));
    }

    #[test]
    fn the_geolocation_accuracy_is_desktop_scale() {
        for seed in 0..50 {
            let identity = &generate(seed, &GeneratorOptions::default()).identity;
            let accuracy = identity.get_f64(keys::GEO_ACCURACY).unwrap();
            assert!(accuracy > 5.0, "a 1 m accuracy means a GPS fix");
            assert!(accuracy < 500.0, "a 1 km accuracy means an IP lookup");
        }
    }

    #[test]
    fn only_windows_names_a_machine() {
        assert!(!draw_device_name(1, TargetOs::Windows).is_empty());
        assert!(draw_device_name(1, TargetOs::Macos).is_empty());
        assert!(draw_device_name(1, TargetOs::Linux).is_empty());
    }

    #[test]
    fn windows_machine_names_have_the_oem_shape() {
        for seed in 0..50 {
            let name = draw_device_name(seed, TargetOs::Windows);
            assert!(name.contains('-'), "{name}");
            let (_, suffix) = name.split_once('-').unwrap();
            assert_eq!(suffix.len(), 7, "{name}");
            assert!(suffix.chars().all(|c| c.is_ascii_alphanumeric()), "{name}");
        }
    }

    #[test]
    fn every_generated_identity_validates_against_the_schema() {
        let schema = crate::schema::PropertySchema::load().unwrap();
        for os in TargetOs::ALL {
            for seed in 0..50 {
                let generated = generate(seed, &GeneratorOptions::new(os));
                assert!(
                    generated.identity.validate(&schema).is_ok(),
                    "seed {seed}/{os} wrote a key the engine does not read"
                );
            }
        }
    }

    #[test]
    fn generated_identities_serialise_to_the_config_payload() {
        let generated = generate(1, &GeneratorOptions::default());
        let json = generated.identity.to_config_json();
        let restored = Identity::from_config_json(&json).unwrap();
        assert_eq!(restored, generated.identity);
    }
}
