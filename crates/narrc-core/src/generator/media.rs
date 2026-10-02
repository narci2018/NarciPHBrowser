//! Fonts, voices, media devices and audio — the "installed hardware" surface.
//!
//! Everything here is a *list a real machine of this OS would have*. The
//! failure mode worth naming: a Windows identity with twelve fonts. A real
//! Windows Chrome exposes a few hundred families, so a short list is not
//! "more private", it is a machine with almost nothing installed, and
//! `document.fonts.check` will say so.
//!
//! Lists are also *subtracted*, never invented. Camoufox filters the host's
//! real font list down to the identity's, so a family the host does not have
//! is a family the page gets a miss on — which is correct behaviour for a
//! machine that genuinely does not have it.

use crate::os::TargetOs;
use crate::pools::{
    Voice, LINUX_FONTS, LINUX_MIC_LABELS, LINUX_SPEAKER_LABELS, LINUX_VOICES, LINUX_WEBCAM_LABELS,
    MACOS_FONTS, MACOS_MIC_LABELS, MACOS_SPEAKER_LABELS, MACOS_VOICES, MACOS_WEBCAM_LABELS,
    WINDOWS_FONTS, WINDOWS_MIC_LABELS, WINDOWS_SPEAKER_LABELS, WINDOWS_VOICES,
    WINDOWS_WEBCAM_LABELS,
};
use crate::rng::Rng;
use serde::{Deserialize, Serialize};

/// A drawn set of installed devices and voices.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Peripherals {
    /// The value behind `fonts`.
    pub fonts: Vec<String>,
    /// The value behind `voices`.
    pub voices: Vec<String>,
    /// The value behind `mediaDevices:microphoneLabels`.
    pub microphones: Vec<String>,
    /// The value behind `mediaDevices:speakerLabels`.
    pub speakers: Vec<String>,
    /// The value behind `mediaDevices:webcamLabels`.
    pub webcams: Vec<String>,
}

/// How much of a platform's font list an identity keeps.
///
/// Not a random subset. A machine that has installed a few extra applications
/// has a *superset* of the OS list, not a random fraction of it, and a
/// fraction of 54 fonts is a fingerprint of its own.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FontProfile {
    /// Exactly the OS list, and nothing else.
    Stock,
    /// The OS list plus a few plausible extras — a developer machine.
    Extended,
}

impl FontProfile {
    /// How many extra families a non-stock profile adds.
    const EXTRA_FAMILIES: usize = 6;

    fn pool(&self, os: TargetOs) -> &'static [&'static str] {
        match os {
            TargetOs::Windows => WINDOWS_FONTS,
            TargetOs::Macos => MACOS_FONTS,
            TargetOs::Linux => LINUX_FONTS,
        }
    }

    fn voice_pool(&self, os: TargetOs) -> &'static [Voice] {
        match os {
            TargetOs::Windows => WINDOWS_VOICES,
            TargetOs::Macos => MACOS_VOICES,
            TargetOs::Linux => LINUX_VOICES,
        }
    }

    fn mic_pool(&self, os: TargetOs) -> &'static [&'static str] {
        match os {
            TargetOs::Windows => WINDOWS_MIC_LABELS,
            TargetOs::Macos => MACOS_MIC_LABELS,
            TargetOs::Linux => LINUX_MIC_LABELS,
        }
    }

    fn speaker_pool(&self, os: TargetOs) -> &'static [&'static str] {
        match os {
            TargetOs::Windows => WINDOWS_SPEAKER_LABELS,
            TargetOs::Macos => MACOS_SPEAKER_LABELS,
            TargetOs::Linux => LINUX_SPEAKER_LABELS,
        }
    }

    fn webcam_pool(&self, os: TargetOs) -> &'static [&'static str] {
        match os {
            TargetOs::Windows => WINDOWS_WEBCAM_LABELS,
            TargetOs::Macos => MACOS_WEBCAM_LABELS,
            TargetOs::Linux => LINUX_WEBCAM_LABELS,
        }
    }

    /// Draws the installed-device surface for an identity.
    pub fn draw(&self, seed: u64, os: TargetOs) -> Peripherals {
        let fonts = self.draw_fonts(seed, os);
        let voices = self.draw_voices(seed, os);
        let microphones = self.draw_devices(seed, "mic", self.mic_pool(os), 1, 2);
        let speakers = self.draw_devices(seed, "speaker", self.speaker_pool(os), 1, 2);
        let webcams = self.draw_devices(seed, "webcam", self.webcam_pool(os), 0, 1);
        Peripherals {
            fonts,
            voices,
            microphones,
            speakers,
            webcams,
        }
    }

    fn draw_fonts(&self, seed: u64, os: TargetOs) -> Vec<String> {
        let pool = self.pool(os);
        let mut fonts: Vec<String> = pool.iter().map(|name| (*name).to_owned()).collect();

        if *self == FontProfile::Extended {
            // Extras are additions, not substitutions: a superset of the OS
            // list is what an installed application produces.
            let mut rng = Rng::stream(seed, "font-extras");
            let extras = [
                "Cascadia Code",
                "Cascadia Mono",
                "Fira Code",
                "JetBrains Mono",
                "Roboto Mono",
                "Source Code Pro",
                "IBM Plex Sans",
                "Inter",
                "Noto Sans Symbols2",
                "Hack",
                "MesloLGS NF",
                "Inconsolata",
            ];
            let chosen = rng.sample(&extras, Self::EXTRA_FAMILIES);
            for name in chosen {
                fonts.push((*name).to_owned());
            }
        }

        // A stable order keeps the CAMOU_CONFIG payload byte-identical for the
        // same seed, so two launches of one profile hash the same.
        fonts.sort_unstable();
        fonts.dedup();
        fonts
    }

    fn draw_voices(&self, seed: u64, os: TargetOs) -> Vec<String> {
        let pool = self.voice_pool(os);
        let mut rng = Rng::stream(seed, "voices");
        // A stock install registers every voice the OS ships. A machine with
        // one is rare; dropping to 0 is even rarer and, on macOS, would mean
        // Accessibility has been switched off — which is a real configuration
        // but not the common one.
        let count = rng.range_i32((pool.len() as i32 / 2).max(2), pool.len() as i32);
        let mut names: Vec<String> = pool
            .iter()
            .take(count as usize)
            .map(|voice| voice.name.to_owned())
            .collect();
        names.sort_unstable();
        names
    }

    /// Draws device labels, always at least `floor` of them.
    ///
    /// A floor of 1 for microphones and speakers is not a fingerprint
    /// prettiness: `navigator.mediaDevices.enumerateDevices` on a machine with
    /// no audio input at all reports no microphone, and every page that offers
    /// a "talk to us" widget uses that as a bot signal.
    fn draw_devices(
        &self,
        seed: u64,
        label: &str,
        pool: &'static [&'static str],
        floor: usize,
        ceiling: usize,
    ) -> Vec<String> {
        let mut rng = Rng::stream(seed, &format!("devices-{label}"));
        let ceiling = ceiling.min(pool.len());
        let count = rng.range_i32(floor as i32, ceiling.max(floor) as i32) as usize;
        let mut labels: Vec<String> = pool
            .iter()
            .take(count)
            .map(|name| (*name).to_owned())
            .collect();
        labels.sort_unstable();
        labels
    }
}

/// Audio context parameters a real machine reports.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AudioProfile {
    /// The value behind `AudioContext:sampleRate`. Desktop Firefox reports
    /// 44100 or 48000; 48000 dominates on Windows with an HD audio device.
    pub sample_rate: u32,
    /// The value behind `AudioContext:outputLatency`, in seconds.
    ///
    /// A *measured* number, not a constant: it depends on the buffer size and
    /// the driver, so the ranges below are per-OS rather than global.
    pub output_latency: f64,
    /// The value behind `AudioContext:maxChannelCount`.
    pub max_channels: u32,
    /// The value behind `audio:seed`, which perturbs the noise floor.
    pub seed: u32,
}

impl AudioProfile {
    /// Draws an audio profile for an OS.
    pub fn draw(seed: u64, os: TargetOs) -> Self {
        let mut rng = Rng::stream(seed, "audio");
        let (sample_rate, latency_lo, latency_hi, channels) = match os {
            // Windows with a Realtek HD device: 48000 Hz, ~10-25 ms of
            // output latency, 2 channels.
            TargetOs::Windows => (48_000u32, 0.010f64, 0.025f64, 2u32),
            // macOS with CoreAudio: 48000 Hz, and Apple's output latency is
            // characteristically low because of the ring buffer.
            TargetOs::Macos => (48_000u32, 0.005, 0.015, 2u32),
            // Linux on PulseAudio/PipeWire resamples to 44100 unless the
            // device is natively 48k, and latency is much higher.
            TargetOs::Linux => (44_100u32, 0.020, 0.060, 2u32),
        };
        Self {
            sample_rate,
            // Quantised to a microsecond. Two reasons, one practical and one
            // about honesty: a latency reported to seventeen significant digits
            // is not something any audio stack measures, and a value that fine
            // does not always survive a JSON round trip on every platform's
            // float formatter — which would make a stored profile come back
            // subtly changed from the one the user generated.
            output_latency: (rng.range_f64(latency_lo, latency_hi) * 1_000_000.0).round()
                / 1_000_000.0,
            max_channels: channels,
            // A non-zero seed is what makes two profiles' `getChannelData`
            // output differ. Zero would mean "no noise", which Camoufox reads
            // as "leave the audio hash alone" and two profiles would collide.
            seed: (rng.next_u64() % u32::MAX as u64) as u32,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pools::{LINUX_FONTS, MACOS_FONTS, WINDOWS_FONTS};
    use std::collections::HashSet;

    #[test]
    fn drawing_is_reproducible() {
        for os in TargetOs::ALL {
            for profile in [FontProfile::Stock, FontProfile::Extended] {
                assert_eq!(
                    profile.draw(1, os),
                    profile.draw(1, os),
                    "{profile:?}/{os} is not reproducible"
                );
            }
            assert_eq!(AudioProfile::draw(1, os), AudioProfile::draw(1, os));
        }
    }

    #[test]
    fn a_stock_font_list_is_the_whole_os_list() {
        for os in TargetOs::ALL {
            let drawn = FontProfile::Stock.draw(1, os);
            let expected: HashSet<&str> = match os {
                TargetOs::Windows => WINDOWS_FONTS.iter().copied().collect(),
                TargetOs::Macos => MACOS_FONTS.iter().copied().collect(),
                TargetOs::Linux => LINUX_FONTS.iter().copied().collect(),
            };
            assert_eq!(
                drawn
                    .fonts
                    .iter()
                    .map(|f| f.as_str())
                    .collect::<HashSet<_>>(),
                expected,
                "{os} stock font list is not the OS list"
            );
        }
    }

    #[test]
    fn an_extended_list_is_a_superset_never_a_fraction() {
        for os in TargetOs::ALL {
            let stock = FontProfile::Stock.draw(1, os).fonts;
            let extended = FontProfile::Extended.draw(1, os).fonts;
            assert!(
                extended.len() > stock.len(),
                "{os} extended list is not larger"
            );
            for family in &stock {
                assert!(
                    extended.contains(family),
                    "{os} extended list dropped the stock family {family}"
                );
            }
        }
    }

    #[test]
    fn a_windows_identity_never_claims_ten_fonts() {
        // The specific failure this module exists to prevent.
        for seed in 0..200 {
            let drawn = FontProfile::Stock.draw(seed, TargetOs::Windows);
            assert!(
                drawn.fonts.len() > 50,
                "seed {seed} produced only {} fonts",
                drawn.fonts.len()
            );
        }
    }

    #[test]
    fn font_lists_have_no_duplicates() {
        for os in TargetOs::ALL {
            for profile in [FontProfile::Stock, FontProfile::Extended] {
                for seed in 0..50 {
                    let fonts = profile.draw(seed, os).fonts;
                    let before = fonts.len();
                    let mut deduped = fonts.clone();
                    deduped.dedup();
                    assert_eq!(before, deduped.len(), "duplicate family at seed {seed}");
                }
            }
        }
    }

    #[test]
    fn font_lists_are_sorted_so_the_config_payload_is_stable() {
        let fonts = FontProfile::Extended.draw(3, TargetOs::Windows).fonts;
        let mut sorted = fonts.clone();
        sorted.sort();
        assert_eq!(fonts, sorted);
    }

    #[test]
    fn every_machine_has_at_least_one_microphone_and_speaker() {
        for os in TargetOs::ALL {
            for seed in 0..200 {
                let drawn = FontProfile::Stock.draw(seed, os);
                assert!(
                    !drawn.microphones.is_empty(),
                    "seed {seed}/{os} has no microphone; every page's \
                     voice widget treats that as a bot signal"
                );
                assert!(
                    !drawn.speakers.is_empty(),
                    "seed {seed}/{os} has no speaker"
                );
            }
        }
    }

    #[test]
    fn webcams_are_optional_but_never_all_three() {
        for os in TargetOs::ALL {
            for seed in 0..200 {
                let drawn = FontProfile::Stock.draw(seed, os);
                assert!(
                    drawn.webcams.len() <= 1,
                    "{os} drew {} webcams",
                    drawn.webcams.len()
                );
            }
        }
    }

    #[test]
    fn device_labels_stay_inside_the_platform_pool() {
        for os in TargetOs::ALL {
            let drawn = FontProfile::Stock.draw(9, os);
            for label in drawn.microphones {
                let allowed: Vec<&str> = match os {
                    TargetOs::Windows => WINDOWS_MIC_LABELS.to_vec(),
                    TargetOs::Macos => MACOS_MIC_LABELS.to_vec(),
                    TargetOs::Linux => LINUX_MIC_LABELS.to_vec(),
                };
                assert!(allowed.contains(&label.as_str()), "{os} drew {label:?}");
            }
        }
    }

    #[test]
    fn voices_are_never_empty_and_are_drawn_from_the_platform_pool() {
        for os in TargetOs::ALL {
            for seed in 0..200 {
                let drawn = FontProfile::Stock.draw(seed, os);
                assert!(!drawn.voices.is_empty(), "seed {seed}/{os} has no voices");
                let allowed: Vec<&str> = match os {
                    TargetOs::Windows => WINDOWS_VOICES.iter().map(|v| v.name).collect(),
                    TargetOs::Macos => MACOS_VOICES.iter().map(|v| v.name).collect(),
                    TargetOs::Linux => LINUX_VOICES.iter().map(|v| v.name).collect(),
                };
                for voice in &drawn.voices {
                    assert!(allowed.contains(&voice.as_str()), "{os} drew {voice:?}");
                }
            }
        }
    }

    #[test]
    fn windows_never_claims_a_macos_voice() {
        for seed in 0..200 {
            for voice in FontProfile::Stock.draw(seed, TargetOs::Windows).voices {
                assert!(voice.starts_with("Microsoft "), "{voice}");
            }
        }
    }

    #[test]
    fn audio_sample_rates_are_ones_firefox_reports() {
        for os in TargetOs::ALL {
            for seed in 0..200 {
                let rate = AudioProfile::draw(seed, os).sample_rate;
                assert!(
                    rate == 44_100 || rate == 48_000,
                    "{os} drew a {rate} Hz sample rate"
                );
            }
        }
    }

    #[test]
    fn linux_audio_latency_is_the_worst_of_the_three() {
        // The point of the per-OS range: an identity claiming Linux with a
        // 5 ms output latency is claiming a machine that does not exist.
        for seed in 0..200 {
            let linux = AudioProfile::draw(seed, TargetOs::Linux).output_latency;
            let mac = AudioProfile::draw(seed, TargetOs::Macos).output_latency;
            assert!(
                linux > mac * 1.5,
                "linux {linux} vs mac {mac} at seed {seed}"
            );
        }
    }

    #[test]
    fn audio_latency_stays_inside_its_range() {
        for os in TargetOs::ALL {
            for seed in 0..300 {
                let latency = AudioProfile::draw(seed, os).output_latency;
                assert!(latency > 0.0, "{os} drew a non-positive latency");
                assert!(
                    latency < 0.2,
                    "{os} drew {latency}s, which is not a real buffer"
                );
            }
        }
    }

    #[test]
    fn audio_latency_is_quantised_to_a_microsecond() {
        // Seventeen significant digits is both implausible for a real audio
        // stack and, on some platforms, lossy through a JSON round trip.
        for os in TargetOs::ALL {
            for seed in 0..200 {
                let latency = AudioProfile::draw(seed, os).output_latency;
                let scaled = latency * 1_000_000.0;
                assert!(
                    (scaled - scaled.round()).abs() < 1e-6,
                    "{os} seed {seed}: {latency} is not on a microsecond boundary"
                );
                assert!(latency > 0.0 && latency < 0.2, "{os} drew {latency}s");
            }
        }
    }

    #[test]
    fn the_audio_seed_is_never_zero() {
        // Zero means "no perturbation" in Camoufox, and two profiles would
        // then hash identically.
        for seed in 0..2000 {
            let audio_seed = AudioProfile::draw(seed, TargetOs::Windows).seed;
            assert_ne!(audio_seed, 0, "seed {seed} drew a zero audio seed");
        }
    }

    #[test]
    fn audio_seeds_differ_between_profiles() {
        let seeds: HashSet<u32> = (0..200)
            .map(|s| AudioProfile::draw(s, TargetOs::Windows).seed)
            .collect();
        assert!(
            seeds.len() > 190,
            "only {} distinct audio seeds in 200",
            seeds.len()
        );
    }
}
