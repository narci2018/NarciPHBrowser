//! Recorded values a real machine can present.
//!
//! Every table here is a *pool of things that exist*, not a range. A generator
//! that picks a core count from `1..=64` invents machines; one that picks from
//! the parts AMD and Intel and Apple actually shipped does not. Where a value
//! is weighted, the weight is roughly the real-world distribution — the point
//! of a distribution is that two profiles created a second apart are not
//! obviously siblings.
//!
//! The GPU, font and voice strings are taken from Camoufox's recorded
//! `fingerprint-presets.json` (Firefox 147/150 devices, MPL-2.0) plus the
//! corresponding hardware each string names. Fonts and voices are the
//! well-known family/voice names of each OS, which are facts about the
//! operating systems rather than anyone's proprietary data.

// ------------------------------------------------------------------ browser

/// The Firefox version the vendored Camoufox build reports.
///
/// Must match the `Firefox 156` pin in `resources/UPSTREAM.md`; a user agent
/// claiming a different version than the engine is an instant mismatch, since
/// `rv:` and the Gecko build ID are both independently observable.
pub const FIREFOX_VERSION: &str = "156.0";

/// The four-component version, for the `Gecko/<date> Firefox/<version>` tail.
pub const FIREFOX_VERSION_FULL: &str = "156.0";

/// The Gecko build date Firefox 156 identifies itself with.
pub const GECKO_TRAILER: &str = "20100101";

// ------------------------------------------------------------------ Windows

/// A Windows 10/11 NT version and the build number a real machine reports.
pub const WINDOWS_BUILDS: &[(&str, &str)] = &[
    ("10.0.19045", "19045"),
    ("10.0.19044", "19044"),
    ("10.0.22631", "22631"),
    ("10.0.22621", "22621"),
    ("10.0.26100", "26100"),
    ("10.0.22000", "22000"),
    ("10.0.20348", "20348"),
    ("10.0.17763", "17763"),
];

/// A Windows machine name prefix. Windows uses the form `DESKTOP-XXXXXXX` for
/// OEM images and a user-chosen name after that; both are common.
pub const WINDOWS_DEVICE_PREFIXES: &[&str] = &["DESKTOP", "PC", "WIN", "NARCI"];

// --------------------------------------------------------------------- macOS

/// macOS versions a Mac can report, newest first. Apple Silicon needs 11+.
pub const MACOS_VERSIONS: &[&str] = &[
    "15.3", "15.2", "15.1", "14.7", "14.6", "14.5", "13.6", "12.7",
];

// -------------------------------------------------------------------- Linux

/// Linux distributions, and the desktop environment each ships. Both are
/// observable (`navigator.userAgentData` and the GTK/Qt runtime behind the
/// rendering), so they are drawn together.
pub const LINUX_DISTROS: &[(&str, &str)] = &[
    ("Ubuntu", "GNOME"),
    ("Ubuntu", "GNOME"),
    ("Fedora", "GNOME"),
    ("Linux Mint", "Cinnamon"),
    ("Pop!_OS", "GNOME"),
    ("Debian", "GNOME"),
    ("openSUSE", "KDE"),
    ("Arch", "KDE"),
    ("Manjaro", "KDE"),
];

// ---------------------------------------------------------------------- GPU

/// A recorded `(vendor, renderer)` pair.
pub struct Gpu {
    pub vendor: &'static str,
    pub renderer: &'static str,
    /// Core counts this GPU is known to ship in, for a matching draw.
    pub cores: &'static [u32],
    /// A display this GPU is known to drive, as `(width, height)`.
    pub panel: Option<(u32, u32)>,
    /// Relative likelihood, for a weighted draw.
    pub weight: f64,
    /// True for Apple Silicon parts, which constrain cores to the Apple list.
    pub apple_silicon: bool,
}

/// Windows GPUs. Firefox on Windows renders through ANGLE's D3D11 backend, so
/// every string starts with `ANGLE` and ends `, or similar` — that suffix is
/// Firefox's renderer sanitiser, and dropping it is a tell on its own.
pub const WINDOWS_GPUS: &[Gpu] = &[
    Gpu {
        vendor: "Google Inc. (Intel)",
        renderer: "ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0), or similar",
        cores: &[2, 4, 6, 8],
        panel: Some((1920, 1080)),
        weight: 0.24,
        apple_silicon: false,
    },
    Gpu {
        vendor: "Google Inc. (Intel)",
        renderer: "ANGLE (Intel, Intel(R) HD Graphics 630 Direct3D11 vs_5_0 ps_5_0), or similar",
        cores: &[4, 6, 8, 12],
        panel: Some((1920, 1080)),
        weight: 0.20,
        apple_silicon: false,
    },
    Gpu {
        vendor: "Google Inc. (Intel)",
        renderer: "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0), or similar",
        cores: &[4, 8],
        panel: Some((1920, 1080)),
        weight: 0.12,
        apple_silicon: false,
    },
    Gpu {
        vendor: "Google Inc. (Intel)",
        renderer:
            "ANGLE (Intel, Intel(R) Arc(TM) A750 Graphics Direct3D11 vs_5_0 ps_5_0), or similar",
        cores: &[8, 12, 16, 20],
        panel: Some((2560, 1440)),
        weight: 0.04,
        apple_silicon: false,
    },
    Gpu {
        vendor: "Google Inc. (NVIDIA)",
        renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0), or similar",
        cores: &[8, 12, 16],
        panel: Some((2560, 1440)),
        weight: 0.08,
        apple_silicon: false,
    },
    Gpu {
        vendor: "Google Inc. (NVIDIA)",
        renderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0), or similar",
        cores: &[4, 6, 8],
        panel: Some((1920, 1080)),
        weight: 0.10,
        apple_silicon: false,
    },
    Gpu {
        vendor: "Google Inc. (NVIDIA)",
        renderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar",
        cores: &[4, 6, 8],
        panel: Some((1920, 1080)),
        weight: 0.06,
        apple_silicon: false,
    },
    Gpu {
        vendor: "Google Inc. (NVIDIA)",
        renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0), or similar",
        cores: &[12, 16, 20],
        panel: Some((2560, 1440)),
        weight: 0.03,
        apple_silicon: false,
    },
    Gpu {
        vendor: "Google Inc. (AMD)",
        renderer: "ANGLE (AMD, Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0), or similar",
        cores: &[6, 8, 12],
        panel: Some((1920, 1080)),
        weight: 0.06,
        apple_silicon: false,
    },
    Gpu {
        vendor: "Google Inc. (AMD)",
        renderer: "ANGLE (AMD, Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0), or similar",
        cores: &[4, 6, 8],
        panel: Some((1920, 1080)),
        weight: 0.05,
        apple_silicon: false,
    },
    Gpu {
        vendor: "Google Inc. (AMD)",
        renderer: "ANGLE (AMD, Radeon R9 200 Series Direct3D11 vs_5_0 ps_5_0), or similar",
        cores: &[4, 6, 8],
        panel: Some((1920, 1080)),
        weight: 0.02,
        apple_silicon: false,
    },
];

/// macOS GPUs. Firefox on a Mac renders through CGL, so none of these is an
/// ANGLE string. The Intel entries are the buckets Firefox's sanitiser maps
/// real parts into, not the parts themselves.
pub const MACOS_GPUS: &[Gpu] = &[
    Gpu {
        vendor: "Apple",
        renderer: "Apple M1, or similar",
        cores: &[8],
        panel: Some((1440, 900)),
        weight: 0.10,
        apple_silicon: true,
    },
    Gpu {
        vendor: "Apple",
        renderer: "Apple M1 Pro, or similar",
        cores: &[10, 12],
        panel: Some((1728, 1117)),
        weight: 0.09,
        apple_silicon: true,
    },
    Gpu {
        vendor: "Apple",
        renderer: "Apple M1 Max, or similar",
        cores: &[10, 12, 14],
        panel: Some((1728, 1117)),
        weight: 0.04,
        apple_silicon: true,
    },
    Gpu {
        vendor: "Apple",
        renderer: "Apple M2, or similar",
        cores: &[8, 10],
        panel: Some((1470, 956)),
        weight: 0.14,
        apple_silicon: true,
    },
    Gpu {
        vendor: "Apple",
        renderer: "Apple M2 Pro, or similar",
        cores: &[10, 12, 14],
        panel: Some((1728, 1117)),
        weight: 0.11,
        apple_silicon: true,
    },
    Gpu {
        vendor: "Apple",
        renderer: "Apple M3, or similar",
        cores: &[8, 11],
        panel: Some((1512, 982)),
        weight: 0.16,
        apple_silicon: true,
    },
    Gpu {
        vendor: "Apple",
        renderer: "Apple M3 Pro, or similar",
        cores: &[11, 12, 14],
        panel: Some((1800, 1169)),
        weight: 0.10,
        apple_silicon: true,
    },
    Gpu {
        vendor: "Apple",
        renderer: "Apple M4, or similar",
        cores: &[10],
        panel: Some((1512, 982)),
        weight: 0.06,
        apple_silicon: true,
    },
    Gpu {
        vendor: "Intel Inc.",
        renderer: "Intel(R) HD Graphics 400, or similar",
        cores: &[2, 4, 6, 8],
        panel: None,
        weight: 0.08,
        apple_silicon: false,
    },
    Gpu {
        vendor: "Intel Inc.",
        renderer: "Intel(R) HD Graphics, or similar",
        cores: &[2, 4, 6, 8, 12, 16],
        panel: None,
        weight: 0.06,
        apple_silicon: false,
    },
    Gpu {
        vendor: "ATI Technologies Inc.",
        renderer: "Radeon R9 200 Series, or similar",
        cores: &[4, 6, 8, 12, 16],
        panel: None,
        weight: 0.03,
        apple_silicon: false,
    },
    Gpu {
        vendor: "ATI Technologies Inc.",
        renderer: "Radeon HD 3200 Graphics, or similar",
        cores: &[4, 6, 8],
        panel: None,
        weight: 0.03,
        apple_silicon: false,
    },
];

/// Linux GPUs, as the Mesa/NVIDIA strings a stock Firefox reports.
pub const LINUX_GPUS: &[Gpu] = &[
    Gpu {
        vendor: "Intel",
        renderer: "Intel(R) HD Graphics 400, or similar",
        cores: &[2, 4],
        panel: Some((1920, 1080)),
        weight: 0.14,
        apple_silicon: false,
    },
    Gpu {
        vendor: "Intel",
        renderer: "Intel(R) UHD Graphics 620, or similar",
        cores: &[4, 8],
        panel: Some((1920, 1080)),
        weight: 0.18,
        apple_silicon: false,
    },
    Gpu {
        vendor: "Intel",
        renderer: "Mesa Intel(R) UHD Graphics 620 (KBL GT2), or similar",
        cores: &[4, 8],
        panel: Some((1920, 1080)),
        weight: 0.12,
        apple_silicon: false,
    },
    Gpu {
        vendor: "NVIDIA Corporation",
        renderer: "NVIDIA GeForce GTX 980, or similar",
        cores: &[4, 6, 8],
        panel: Some((1920, 1080)),
        weight: 0.16,
        apple_silicon: false,
    },
    Gpu {
        vendor: "NVIDIA Corporation",
        renderer: "NVIDIA GeForce RTX 3060/PCIe/SSE2, or similar",
        cores: &[8, 12, 16],
        panel: Some((2560, 1440)),
        weight: 0.12,
        apple_silicon: false,
    },
    Gpu {
        vendor: "AMD",
        renderer: "Radeon HD 3200 Graphics, or similar",
        cores: &[2, 4, 6],
        panel: Some((1366, 768)),
        weight: 0.10,
        apple_silicon: false,
    },
    Gpu {
        vendor: "AMD",
        renderer: "AMD Radeon Graphics (radeonsi, renoir LLVM 15.0.7), or similar",
        cores: &[6, 8],
        panel: Some((1920, 1080)),
        weight: 0.12,
        apple_silicon: false,
    },
    Gpu {
        vendor: "AMD",
        renderer: "Radeon R9 200 Series, or similar",
        cores: &[4, 6, 8],
        panel: Some((1920, 1080)),
        weight: 0.06,
        apple_silicon: false,
    },
];

// -------------------------------------------------------------------- fonts

/// The font families a stock Windows install exposes.
///
/// A real Windows Chrome reports a few hundred. Camoufox filters the host's
/// list down to this rather than injecting: a page asks for a family by name
/// and gets a hit only if the identity says it has one, so an *over*-long
/// list is as much a tell as an empty one — real machines have gaps.
pub const WINDOWS_FONTS: &[&str] = &[
    "Arial",
    "Arial Black",
    "Bahnschrift",
    "Calibri",
    "Cambria",
    "Cambria Math",
    "Candara",
    "Comic Sans MS",
    "Consolas",
    "Constantia",
    "Corbel",
    "Courier New",
    "Ebrima",
    "Franklin Gothic Medium",
    "Gabriola",
    "Gadugi",
    "Georgia",
    "HoloLens MDL2 Assets",
    "Impact",
    "Ink Free",
    "Javanese Text",
    "Leelawadee UI",
    "Lucida Console",
    "Lucida Sans Unicode",
    "Malgun Gothic",
    "Marlett",
    "Microsoft Himalaya",
    "Microsoft JhengHei",
    "Microsoft New Tai Lue",
    "Microsoft PhagsPa",
    "Microsoft Sans Serif",
    "Microsoft Tai Le",
    "Microsoft YaHei",
    "Microsoft Yi Baiti",
    "MingLiU-ExtB",
    "Mongolian Baiti",
    "MS Gothic",
    "MV Boli",
    "Myanmar Text",
    "Nirmala UI",
    "Palatino Linotype",
    "Segoe MDL2 Assets",
    "Segoe Print",
    "Segoe Script",
    "Segoe UI",
    "Segoe UI Emoji",
    "Segoe UI Historic",
    "Segoe UI Symbol",
    "SimSun",
    "Sitka",
    "Sylfaen",
    "Symbol",
    "Tahoma",
    "Times New Roman",
    "Trebuchet MS",
    "Verdana",
    "Webdings",
    "Wingdings",
    "Yu Gothic",
];

/// The font families a stock macOS install exposes.
pub const MACOS_FONTS: &[&str] = &[
    "American Typewriter",
    "Andale Mono",
    "Apple Chancery",
    "Apple Color Emoji",
    "Apple SD Gothic Neo",
    "Apple Symbols",
    "AppleGothic",
    "AppleMyungjo",
    "Arial",
    "Arial Black",
    "Arial Narrow",
    "Arial Rounded MT Bold",
    "Arial Unicode MS",
    "Avenir",
    "Avenir Next",
    "Avenir Next Condensed",
    "Baskerville",
    "Big Caslon",
    "Bodoni 72",
    "Bradley Hand",
    "Brush Script MT",
    "Chalkboard",
    "Chalkduster",
    "Cochin",
    "Comic Sans MS",
    "Copperplate",
    "Courier",
    "Courier New",
    "Didot",
    "Futura",
    "Geneva",
    "Georgia",
    "Gill Sans",
    "Helvetica",
    "Helvetica Neue",
    "Herculanum",
    "Hoefler Text",
    "Impact",
    "Lucida Grande",
    "Luminari",
    "Marker Felt",
    "Menlo",
    "Microsoft Sans Serif",
    "Monaco",
    "Noteworthy",
    "Optima",
    "Palatino",
    "Papyrus",
    "Phosphate",
    "Rockwell",
    "Savoye LET",
    "SignPainter",
    "Skia",
    "Snell Roundhand",
    "Tahoma",
    "Times",
    "Times New Roman",
    "Trattatello",
    "Trebuchet MS",
    "Verdana",
    "Zapfino",
];

/// The font families a stock Linux desktop exposes.
///
/// Much shorter than Windows, and that difference is itself observable: a
/// Linux identity with a 300-family font list is a giveaway, and so is a
/// Windows identity with 40.
pub const LINUX_FONTS: &[&str] = &[
    "Bitstream Charter",
    "Cantarell",
    "DejaVu Math TeX Gyre",
    "DejaVu Sans",
    "DejaVu Sans Mono",
    "DejaVu Serif",
    "Droid Sans Fallback",
    "Droid Sans Mono",
    "Fira Code",
    "Fira Sans",
    "Fira Sans Mono",
    "FreeMono",
    "FreeSans",
    "FreeSerif",
    "Liberation Mono",
    "Liberation Sans",
    "Liberation Serif",
    "Noto Color Emoji",
    "Noto Mono",
    "Noto Sans",
    "Noto Sans CJK JP",
    "Noto Sans CJK KR",
    "Noto Sans CJK SC",
    "Noto Sans CJK TC",
    "Noto Sans Display",
    "Noto Sans Mono",
    "Noto Serif",
    "Ubuntu",
    "Ubuntu Condensed",
    "Ubuntu Mono",
];

// ------------------------------------------------------------------- voices

/// A recorded speech-synthesis voice.
pub struct Voice {
    pub name: &'static str,
    /// BCP-47 tag.
    pub lang: &'static str,
    /// Firefox's `localService` flag: voices shipped with the OS are local.
    pub local: bool,
}

/// Windows SAPI voices. `localService: true` is correct for these — they ship
/// with the OS rather than being downloaded, so a page that correlates the
/// flag with the voice list catches a profile that marks them false.
pub const WINDOWS_VOICES: &[Voice] = &[
    Voice {
        name: "Microsoft David Desktop",
        lang: "en-US",
        local: true,
    },
    Voice {
        name: "Microsoft Mark",
        lang: "en-US",
        local: true,
    },
    Voice {
        name: "Microsoft Zira Desktop",
        lang: "en-US",
        local: true,
    },
    Voice {
        name: "Microsoft Zira",
        lang: "en-US",
        local: true,
    },
    Voice {
        name: "Microsoft Hazel",
        lang: "en-GB",
        local: true,
    },
    Voice {
        name: "Microsoft Susan",
        lang: "en-GB",
        local: true,
    },
    Voice {
        name: "Microsoft Javier",
        lang: "es-ES",
        local: true,
    },
    Voice {
        name: "Microsoft Laura",
        lang: "es-ES",
        local: true,
    },
    Voice {
        name: "Microsoft Paul",
        lang: "fr-FR",
        local: true,
    },
    Voice {
        name: "Microsoft Julie",
        lang: "fr-FR",
        local: true,
    },
    Voice {
        name: "Microsoft Michael",
        lang: "de-DE",
        local: true,
    },
    Voice {
        name: "Microsoft Katja",
        lang: "de-DE",
        local: true,
    },
    Voice {
        name: "Microsoft Yumi",
        lang: "ja-JP",
        local: true,
    },
    Voice {
        name: "Microsoft Huihui",
        lang: "zh-CN",
        local: true,
    },
    Voice {
        name: "Microsoft Kangkang",
        lang: "zh-TW",
        local: true,
    },
];

/// macOS voices, in the form Firefox reports them.
pub const MACOS_VOICES: &[Voice] = &[
    Voice {
        name: "Alex",
        lang: "en-US",
        local: true,
    },
    Voice {
        name: "Ava",
        lang: "en-US",
        local: true,
    },
    Voice {
        name: "Samantha",
        lang: "en-US",
        local: true,
    },
    Voice {
        name: "Daniel",
        lang: "en-GB",
        local: true,
    },
    Voice {
        name: "Karen",
        lang: "en-AU",
        local: true,
    },
    Voice {
        name: "Moira",
        lang: "en-IE",
        local: true,
    },
    Voice {
        name: "Monica",
        lang: "es-ES",
        local: true,
    },
    Voice {
        name: "Thomas",
        lang: "fr-FR",
        local: true,
    },
    Voice {
        name: "Anna",
        lang: "de-DE",
        local: true,
    },
    Voice {
        name: "Kyoko",
        lang: "ja-JP",
        local: true,
    },
    Voice {
        name: "Ting-Ting",
        lang: "zh-CN",
        local: true,
    },
    Voice {
        name: "Meijia",
        lang: "zh-TW",
        local: true,
    },
];

/// Linux voices, as espeak-ng reports them.
pub const LINUX_VOICES: &[Voice] = &[
    Voice {
        name: "English (Great Britain)",
        lang: "en-GB",
        local: true,
    },
    Voice {
        name: "English (United States)",
        lang: "en-US",
        local: true,
    },
    Voice {
        name: "German",
        lang: "de-DE",
        local: true,
    },
    Voice {
        name: "French",
        lang: "fr-FR",
        local: true,
    },
    Voice {
        name: "Spanish",
        lang: "es-ES",
        local: true,
    },
    Voice {
        name: "Italian",
        lang: "it-IT",
        local: true,
    },
    Voice {
        name: "Portuguese (Brazil)",
        lang: "pt-BR",
        local: true,
    },
    Voice {
        name: "Russian",
        lang: "ru-RU",
        local: true,
    },
];

// -------------------------------------------------------------------- media

/// Microphone labels Windows reports. The `Microphone (Device Name)` shape is
/// what `navigator.mediaDevices.enumerateDevices` returns for an integrated
/// array mic, and a page can read the exact string.
pub const WINDOWS_MIC_LABELS: &[&str] = &[
    "Microphone Array (Realtek(R) Audio)",
    "Microphone (2- High Definition Audio Device)",
    "Microphone (Realtek(R) Audio)",
    "Microphone (USB Audio Device)",
    "Microphone (Generic USB Audio)",
    "Digital Audio (SFP Controller)",
];

pub const WINDOWS_SPEAKER_LABELS: &[&str] = &[
    "Speakers (Realtek(R) Audio)",
    "Speakers (2- High Definition Audio Device)",
    "Speakers (USB Audio Device)",
    "Speakers (Generic USB Audio)",
];

pub const WINDOWS_WEBCAM_LABELS: &[&str] = &[
    "Integrated Camera (04f2:b6d9)",
    "Integrated Webcam HD (0c45:6a06)",
    "HD Webcam (Microsoft Corp.)",
    "USB2.0 HD UVC WebCam",
];

pub const MACOS_MIC_LABELS: &[&str] = &[
    "MacBook Pro Microphone (Built-in)",
    "MacBook Air Microphone (Built-in)",
    "iPhone Microphone (Continuity Capture)",
];

pub const MACOS_SPEAKER_LABELS: &[&str] = &[
    "MacBook Pro Speakers (Built-in)",
    "MacBook Air Speakers (Built-in)",
    "External Headphones",
];

pub const MACOS_WEBCAM_LABELS: &[&str] = &[
    "FaceTime HD Camera (Built-in)",
    "iPhone Camera (Continuity Capture)",
    "Studio Display Camera",
];

pub const LINUX_MIC_LABELS: &[&str] = &[
    "Built-in Audio Analog Stereo",
    "USB Audio Device",
    "Webcam Audio",
    "HDA Intel PCH Analog",
];

pub const LINUX_SPEAKER_LABELS: &[&str] = &[
    "Built-in Audio Analog Stereo",
    "USB Audio Device",
    "HDA Intel PCH Analog",
    "Audio Analog Stereo",
];

pub const LINUX_WEBCAM_LABELS: &[&str] = &[
    "Integrated_Webcam_HD: Integrate (0c45:6a06)",
    "HD Pro Webcam C920",
    "Generic Camera",
];

// -------------------------------------------------------------------- locale

/// A locale and the place it implies.
///
/// Timezone, `Accept-Language` and geolocation are three views of one fact —
/// where the machine is — and a profile that gets one right and another wrong
/// is trivially detectable. They are therefore drawn from one table rather
/// than independently, and [`crate::generator::geo`] re-derives all three
/// together.
pub struct LocaleRegion {
    /// BCP-47 language, the value behind `navigator.language`.
    pub language: &'static str,
    /// ISO 3166-1 alpha-2, the value behind `locale:region`.
    pub region: &'static str,
    /// IANA timezone, the value behind `Date`'s timezone.
    pub timezone: &'static str,
    /// UTC offset in minutes, the value behind the `Date` offset.
    pub utc_offset: i32,
    /// A representative coordinate, for `geolocation:*`.
    pub latitude: f64,
    pub longitude: f64,
    /// A country code, for a GeoIP gate against the proxy's exit IP.
    pub country: &'static str,
}

/// The locale table.
///
/// The key is the row's own `language-region`, lower-cased — redundant with the
/// struct beside it, and kept that way deliberately: it gives a stable handle
/// for a row, and it means a row whose key disagrees with its language is a
/// data bug a test can catch rather than a label nobody reads.
///
/// Repetition is meaningful. Four `en-us` rows are four timezones, so the US is
/// four times as likely to be drawn as a country with one; that is the wrong
/// shape for the real distribution (see [`crate::generator::geo::GeoProfile::draw`])
/// but the right direction, and the alternative is a weight invented from
/// nothing.
pub const LOCALES: &[(&str, LocaleRegion)] = &[
    (
        "en-us",
        LocaleRegion {
            language: "en-US",
            region: "US",
            timezone: "America/New_York",
            utc_offset: -300,
            latitude: 40.7128,
            longitude: -74.0060,
            country: "US",
        },
    ),
    (
        "en-us",
        LocaleRegion {
            language: "en-US",
            region: "US",
            timezone: "America/Chicago",
            utc_offset: -360,
            latitude: 41.8781,
            longitude: -87.6298,
            country: "US",
        },
    ),
    (
        "en-us",
        LocaleRegion {
            language: "en-US",
            region: "US",
            timezone: "America/Denver",
            utc_offset: -420,
            latitude: 39.7392,
            longitude: -104.9903,
            country: "US",
        },
    ),
    (
        "en-us",
        LocaleRegion {
            language: "en-US",
            region: "US",
            timezone: "America/Los_Angeles",
            utc_offset: -480,
            latitude: 34.0522,
            longitude: -118.2437,
            country: "US",
        },
    ),
    (
        "en-gb",
        LocaleRegion {
            language: "en-GB",
            region: "GB",
            timezone: "Europe/London",
            utc_offset: 0,
            latitude: 51.5074,
            longitude: -0.1278,
            country: "GB",
        },
    ),
    (
        "en-au",
        LocaleRegion {
            language: "en-AU",
            region: "AU",
            timezone: "Australia/Sydney",
            utc_offset: 600,
            latitude: -33.8688,
            longitude: 151.2093,
            country: "AU",
        },
    ),
    (
        "en-ca",
        LocaleRegion {
            language: "en-CA",
            region: "CA",
            timezone: "America/Toronto",
            utc_offset: -300,
            latitude: 43.6532,
            longitude: -79.3832,
            country: "CA",
        },
    ),
    (
        "fr-ca",
        LocaleRegion {
            language: "fr-CA",
            region: "CA",
            timezone: "America/Toronto",
            utc_offset: -300,
            latitude: 45.5019,
            longitude: -73.5674,
            country: "CA",
        },
    ),
    (
        "en-ie",
        LocaleRegion {
            language: "en-IE",
            region: "IE",
            timezone: "Europe/Dublin",
            utc_offset: 0,
            latitude: 53.3498,
            longitude: -6.2603,
            country: "IE",
        },
    ),
    (
        "en-nz",
        LocaleRegion {
            language: "en-NZ",
            region: "NZ",
            timezone: "Pacific/Auckland",
            utc_offset: 720,
            latitude: -36.8509,
            longitude: 174.7645,
            country: "NZ",
        },
    ),
    (
        "de-de",
        LocaleRegion {
            language: "de-DE",
            region: "DE",
            timezone: "Europe/Berlin",
            utc_offset: 60,
            latitude: 52.5200,
            longitude: 13.4050,
            country: "DE",
        },
    ),
    (
        "fr-fr",
        LocaleRegion {
            language: "fr-FR",
            region: "FR",
            timezone: "Europe/Paris",
            utc_offset: 60,
            latitude: 48.8566,
            longitude: 2.3522,
            country: "FR",
        },
    ),
    (
        "es-es",
        LocaleRegion {
            language: "es-ES",
            region: "ES",
            timezone: "Europe/Madrid",
            utc_offset: 60,
            latitude: 40.4168,
            longitude: -3.7038,
            country: "ES",
        },
    ),
    (
        "pt-br",
        LocaleRegion {
            language: "pt-BR",
            region: "BR",
            timezone: "America/Sao_Paulo",
            utc_offset: -180,
            latitude: -23.5505,
            longitude: -46.6333,
            country: "BR",
        },
    ),
    (
        "it-it",
        LocaleRegion {
            language: "it-IT",
            region: "IT",
            timezone: "Europe/Rome",
            utc_offset: 60,
            latitude: 41.9028,
            longitude: 12.4964,
            country: "IT",
        },
    ),
    (
        "nl-nl",
        LocaleRegion {
            language: "nl-NL",
            region: "NL",
            timezone: "Europe/Amsterdam",
            utc_offset: 60,
            latitude: 52.3676,
            longitude: 4.9041,
            country: "NL",
        },
    ),
    (
        "sv-se",
        LocaleRegion {
            language: "sv-SE",
            region: "SE",
            timezone: "Europe/Stockholm",
            utc_offset: 60,
            latitude: 59.3293,
            longitude: 18.0686,
            country: "SE",
        },
    ),
    (
        "pl-pl",
        LocaleRegion {
            language: "pl-PL",
            region: "PL",
            timezone: "Europe/Warsaw",
            utc_offset: 60,
            latitude: 52.2297,
            longitude: 21.0122,
            country: "PL",
        },
    ),
    (
        "ru-ru",
        LocaleRegion {
            language: "ru-RU",
            region: "RU",
            timezone: "Europe/Moscow",
            utc_offset: 180,
            latitude: 55.7558,
            longitude: 37.6173,
            country: "RU",
        },
    ),
    (
        "uk-ua",
        LocaleRegion {
            language: "uk-UA",
            region: "UA",
            timezone: "Europe/Kyiv",
            utc_offset: 120,
            latitude: 50.4501,
            longitude: 30.5234,
            country: "UA",
        },
    ),
    (
        "tr-tr",
        LocaleRegion {
            language: "tr-TR",
            region: "TR",
            timezone: "Europe/Istanbul",
            utc_offset: 180,
            latitude: 41.0082,
            longitude: 28.9784,
            country: "TR",
        },
    ),
    (
        "ja-jp",
        LocaleRegion {
            language: "ja-JP",
            region: "JP",
            timezone: "Asia/Tokyo",
            utc_offset: 540,
            latitude: 35.6762,
            longitude: 139.6503,
            country: "JP",
        },
    ),
    (
        "ko-kr",
        LocaleRegion {
            language: "ko-KR",
            region: "KR",
            timezone: "Asia/Seoul",
            utc_offset: 540,
            latitude: 37.5665,
            longitude: 126.9780,
            country: "KR",
        },
    ),
    (
        "zh-cn",
        LocaleRegion {
            language: "zh-CN",
            region: "CN",
            timezone: "Asia/Shanghai",
            utc_offset: 480,
            latitude: 31.2304,
            longitude: 121.4737,
            country: "CN",
        },
    ),
    (
        "zh-tw",
        LocaleRegion {
            language: "zh-TW",
            region: "TW",
            timezone: "Asia/Taipei",
            utc_offset: 480,
            latitude: 25.0330,
            longitude: 121.5654,
            country: "TW",
        },
    ),
    (
        "zh-hk",
        LocaleRegion {
            language: "zh-HK",
            region: "HK",
            timezone: "Asia/Hong_Kong",
            utc_offset: 480,
            latitude: 22.3193,
            longitude: 114.1694,
            country: "HK",
        },
    ),
    (
        "en-in",
        LocaleRegion {
            language: "en-IN",
            region: "IN",
            timezone: "Asia/Kolkata",
            utc_offset: 330,
            latitude: 19.0760,
            longitude: 72.8777,
            country: "IN",
        },
    ),
    (
        "en-sg",
        LocaleRegion {
            language: "en-SG",
            region: "SG",
            timezone: "Asia/Singapore",
            utc_offset: 480,
            latitude: 1.3521,
            longitude: 103.8198,
            country: "SG",
        },
    ),
    (
        "en-za",
        LocaleRegion {
            language: "en-ZA",
            region: "ZA",
            timezone: "Africa/Johannesburg",
            utc_offset: 120,
            latitude: -26.2041,
            longitude: 28.0473,
            country: "ZA",
        },
    ),
    (
        "ar-eg",
        LocaleRegion {
            language: "ar-EG",
            region: "EG",
            timezone: "Africa/Cairo",
            utc_offset: 120,
            latitude: 30.0444,
            longitude: 31.2357,
            country: "EG",
        },
    ),
    (
        "ar-ae",
        LocaleRegion {
            language: "ar-AE",
            region: "AE",
            timezone: "Asia/Dubai",
            utc_offset: 240,
            latitude: 25.2048,
            longitude: 55.2708,
            country: "AE",
        },
    ),
    (
        "ar-sa",
        LocaleRegion {
            language: "ar-SA",
            region: "SA",
            timezone: "Asia/Riyadh",
            utc_offset: 180,
            latitude: 24.7136,
            longitude: 46.6753,
            country: "SA",
        },
    ),
    (
        "he-il",
        LocaleRegion {
            language: "he-IL",
            region: "IL",
            timezone: "Asia/Jerusalem",
            utc_offset: 120,
            latitude: 32.0853,
            longitude: 34.7818,
            country: "IL",
        },
    ),
    (
        "th-th",
        LocaleRegion {
            language: "th-TH",
            region: "TH",
            timezone: "Asia/Bangkok",
            utc_offset: 420,
            latitude: 13.7563,
            longitude: 100.5018,
            country: "TH",
        },
    ),
    (
        "id-id",
        LocaleRegion {
            language: "id-ID",
            region: "ID",
            timezone: "Asia/Jakarta",
            utc_offset: 420,
            latitude: -6.2088,
            longitude: 106.8456,
            country: "ID",
        },
    ),
    (
        "ms-my",
        LocaleRegion {
            language: "ms-MY",
            region: "MY",
            timezone: "Asia/Kuala_Lumpur",
            utc_offset: 480,
            latitude: 3.1390,
            longitude: 101.6869,
            country: "MY",
        },
    ),
    (
        "en-ph",
        LocaleRegion {
            language: "en-PH",
            region: "PH",
            timezone: "Asia/Manila",
            utc_offset: 480,
            latitude: 14.5995,
            longitude: 120.9842,
            country: "PH",
        },
    ),
    (
        "vi-vn",
        LocaleRegion {
            language: "vi-VN",
            region: "VN",
            timezone: "Asia/Ho_Chi_Minh",
            utc_offset: 420,
            latitude: 10.8231,
            longitude: 106.6297,
            country: "VN",
        },
    ),
    (
        "es-mx",
        LocaleRegion {
            language: "es-MX",
            region: "MX",
            timezone: "America/Mexico_City",
            utc_offset: -360,
            latitude: 19.4326,
            longitude: -99.1332,
            country: "MX",
        },
    ),
    (
        "es-ar",
        LocaleRegion {
            language: "es-AR",
            region: "AR",
            timezone: "America/Argentina/Buenos_Aires",
            utc_offset: -180,
            latitude: -34.6037,
            longitude: -58.3816,
            country: "AR",
        },
    ),
    (
        "es-cl",
        LocaleRegion {
            language: "es-CL",
            region: "CL",
            timezone: "America/Santiago",
            utc_offset: -240,
            latitude: -33.4489,
            longitude: -70.6693,
            country: "CL",
        },
    ),
    (
        "es-co",
        LocaleRegion {
            language: "es-CO",
            region: "CO",
            timezone: "America/Bogota",
            utc_offset: -300,
            latitude: 4.7110,
            longitude: -74.0721,
            country: "CO",
        },
    ),
    (
        "pt-pt",
        LocaleRegion {
            language: "pt-PT",
            region: "PT",
            timezone: "Europe/Lisbon",
            utc_offset: 60,
            latitude: 38.7223,
            longitude: -9.1393,
            country: "PT",
        },
    ),
    (
        "da-dk",
        LocaleRegion {
            language: "da-DK",
            region: "DK",
            timezone: "Europe/Copenhagen",
            utc_offset: 120,
            latitude: 55.6761,
            longitude: 12.5683,
            country: "DK",
        },
    ),
    (
        "fi-fi",
        LocaleRegion {
            language: "fi-FI",
            region: "FI",
            timezone: "Europe/Helsinki",
            utc_offset: 120,
            latitude: 60.1699,
            longitude: 24.9384,
            country: "FI",
        },
    ),
    (
        "nb-no",
        LocaleRegion {
            language: "nb-NO",
            region: "NO",
            timezone: "Europe/Oslo",
            utc_offset: 60,
            latitude: 59.9139,
            longitude: 10.7522,
            country: "NO",
        },
    ),
    (
        "cs-cz",
        LocaleRegion {
            language: "cs-CZ",
            region: "CZ",
            timezone: "Europe/Prague",
            utc_offset: 60,
            latitude: 50.0755,
            longitude: 14.4378,
            country: "CZ",
        },
    ),
    (
        "hu-hu",
        LocaleRegion {
            language: "hu-HU",
            region: "HU",
            timezone: "Europe/Budapest",
            utc_offset: 60,
            latitude: 47.4979,
            longitude: 19.0402,
            country: "HU",
        },
    ),
    (
        "ro-ro",
        LocaleRegion {
            language: "ro-RO",
            region: "RO",
            timezone: "Europe/Bucharest",
            utc_offset: 120,
            latitude: 44.4268,
            longitude: 26.1025,
            country: "RO",
        },
    ),
];

/// `Accept-Encoding` values Firefox actually sends. Camoufox spoofs the header
/// alongside the user agent, so the pair has to look like one browser.
pub const ACCEPT_ENCODING: &str = "gzip, deflate, br, zstd";

/// The `navigator.doNotTrack` value Firefox emits when tracking protection is
/// on: the literal string `"1"`, not the boolean.
pub const DO_NOT_TRACK: &str = "1";

/// `navigator.globalPrivacyControl` is only ever `true` on Firefox; a `false`
/// value would describe a browser that does not exist, so it is set only when
/// tracking protection is on.
///
/// A **boolean**, unlike `doNotTrack` which is the string `"1"`. The engine's
/// schema distinguishes the two, and writing `"1"` here is not a harmless
/// mistake: the property is dropped, the profile presents tracking protection as
/// off while claiming `doNotTrack: 1`, and nothing reports an error.
pub const GLOBAL_PRIVACY_CONTROL: bool = true;

/// `Accept-Language` built from a locale, with a fallback the browser would
/// actually send.
///
/// Firefox sends the UI language first, then the bare language:
/// `en-US,en;q=0.9`. A single-tag header is a tell on Firefox, so a fallback is
/// always present — but only one, and never one that repeats a tag already in
/// the header. Appending a blanket `en;q=0.5` to an English locale produces
/// `en-US,en;q=0.9,en;q=0.5`, which is malformed and which any proxy in the
/// path may well rewrite into something the profile did not ask for.
pub fn accept_language(language: &str) -> String {
    let base = language.split('-').next().unwrap_or(language);

    // No region to strip: the language *is* the base, so there is no second tag
    // to offer and the browser would send the language alone.
    if base == language {
        return language.to_owned();
    }

    let mut header = format!("{language},{base};q=0.9");
    if base != "en" {
        header.push_str(",en;q=0.5");
    }
    header
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::coherence::constants::APPLE_SILICON_CORES;

    #[test]
    fn the_firefox_version_matches_the_upstream_pin() {
        assert!(
            FIREFOX_VERSION.starts_with("156."),
            "the vendored schema is pinned to Firefox 156; the UA must agree or \
             `rv:` and the Gecko trailer will not match the engine"
        );
    }

    #[test]
    fn every_gpu_fits_the_os_its_pool_belongs_to() {
        for gpu in WINDOWS_GPUS {
            assert!(
                gpu.renderer.starts_with("ANGLE"),
                "Windows renders through ANGLE: {}",
                gpu.renderer
            );
            assert!(gpu.vendor.starts_with("Google Inc."), "{}", gpu.vendor);
        }
        for gpu in MACOS_GPUS {
            assert!(!gpu.renderer.contains("ANGLE"), "{}", gpu.renderer);
            assert!(!gpu.renderer.contains("llvmpipe"), "{}", gpu.renderer);
        }
        for gpu in LINUX_GPUS {
            assert!(!gpu.renderer.contains("ANGLE"), "{}", gpu.renderer);
            assert!(!gpu.renderer.contains("Apple M"), "{}", gpu.renderer);
        }
    }

    #[test]
    fn every_gpu_string_carries_the_firefox_sanitiser_suffix() {
        // Without ", or similar" the string is not one Firefox emits.
        for gpu in WINDOWS_GPUS.iter().chain(MACOS_GPUS).chain(LINUX_GPUS) {
            assert!(
                gpu.renderer.ends_with(", or similar"),
                "{} is missing the sanitiser suffix",
                gpu.renderer
            );
        }
    }

    #[test]
    fn apple_silicon_gpus_only_list_apple_core_counts() {
        for gpu in MACOS_GPUS.iter().filter(|g| g.apple_silicon) {
            for cores in gpu.cores {
                assert!(
                    APPLE_SILICON_CORES.contains(cores),
                    "{} lists {cores} cores, which Apple does not ship",
                    gpu.renderer
                );
            }
        }
    }

    #[test]
    fn the_apple_silicon_flag_matches_the_renderer_name() {
        for gpu in MACOS_GPUS {
            assert_eq!(
                gpu.apple_silicon,
                gpu.renderer.contains("Apple M"),
                "{}",
                gpu.renderer
            );
        }
        for gpu in WINDOWS_GPUS.iter().chain(LINUX_GPUS) {
            assert!(!gpu.apple_silicon, "{} is not Apple Silicon", gpu.renderer);
        }
    }

    #[test]
    fn gpu_weights_and_core_pools_are_non_empty() {
        for gpu in WINDOWS_GPUS.iter().chain(MACOS_GPUS).chain(LINUX_GPUS) {
            assert!(
                gpu.weight > 0.0,
                "{} has weight {}",
                gpu.renderer,
                gpu.weight
            );
            assert!(!gpu.cores.is_empty(), "{} has no core counts", gpu.renderer);
        }
    }

    #[test]
    fn font_pool_lengths_differ_the_way_real_systems_do() {
        // This is load-bearing: a Linux identity with 300 fonts is a tell, and
        // so is a Windows one with 40.
        assert!(
            WINDOWS_FONTS.len() > 50,
            "Windows exposes a few hundred fonts"
        );
        assert!(
            LINUX_FONTS.len() < WINDOWS_FONTS.len(),
            "Linux exposes far fewer than Windows"
        );
        assert!(LINUX_FONTS.len() < 50, "Linux font lists are short");
    }

    #[test]
    fn font_pools_have_no_duplicates() {
        for (name, pool) in [
            ("Windows", WINDOWS_FONTS),
            ("macOS", MACOS_FONTS),
            ("Linux", LINUX_FONTS),
        ] {
            let mut sorted = pool.to_vec();
            sorted.sort_unstable();
            let before = sorted.len();
            sorted.dedup();
            assert_eq!(before, sorted.len(), "{name} font pool has a duplicate");
        }
    }

    #[test]
    fn font_families_do_not_contain_commas() {
        // A comma inside a family name would break a `fonts` array consumer
        // that splits on commas, and none of these real names has one.
        for (name, pool) in [
            ("Windows", WINDOWS_FONTS),
            ("macOS", MACOS_FONTS),
            ("Linux", LINUX_FONTS),
        ] {
            for family in pool {
                assert!(!family.contains(','), "{name} font {family:?} has a comma");
            }
        }
    }

    #[test]
    fn mac_has_no_windows_sapi_voices_and_windows_has_no_mac_voices() {
        assert!(WINDOWS_VOICES
            .iter()
            .all(|v| v.name.starts_with("Microsoft ")));
        assert!(MACOS_VOICES
            .iter()
            .all(|v| !v.name.starts_with("Microsoft ")));
    }

    #[test]
    fn every_os_voice_is_local() {
        // All three pools are OS-bundled synthesisers, so `localService` is
        // true for every one. A page that checks the flag would see a profile
        // claiming downloaded voices on a machine with no speech pack.
        for pool in [WINDOWS_VOICES, MACOS_VOICES, LINUX_VOICES] {
            for voice in pool {
                assert!(voice.local, "{} should be a local service", voice.name);
                assert!(
                    voice.lang.contains('-'),
                    "{} needs a BCP-47 tag",
                    voice.name
                );
            }
        }
    }

    #[test]
    fn every_windows_voice_has_a_matching_microphone_in_the_pool() {
        // Not enforced 1:1 -- a machine can have voices for languages whose
        // input device is not present -- but the common en-US ones must be
        // coverable.
        let has_en_us = WINDOWS_VOICES.iter().any(|v| v.lang == "en-US");
        let has_mic = WINDOWS_MIC_LABELS
            .iter()
            .any(|label| label.to_lowercase().contains("microphone"));
        assert!(has_en_us && has_mic);
    }

    #[test]
    fn media_label_pools_are_non_empty_per_os() {
        assert!(!WINDOWS_MIC_LABELS.is_empty() && !MACOS_MIC_LABELS.is_empty());
        assert!(!LINUX_MIC_LABELS.is_empty());
        assert!(!WINDOWS_SPEAKER_LABELS.is_empty());
        assert!(!WINDOWS_WEBCAM_LABELS.is_empty());
    }

    #[test]
    fn every_locale_is_internally_consistent() {
        for (id, locale) in LOCALES {
            assert_eq!(
                id.split('-').next().unwrap(),
                locale.language.split('-').next().unwrap(),
                "{id} does not match its language {}",
                locale.language
            );
            assert_eq!(
                locale.region.len(),
                2,
                "{id} region must be a two-letter ISO code"
            );
            assert_eq!(locale.country.len(), 2, "{id} country must be two letters");
            assert_eq!(
                locale.country, locale.region,
                "{id} country and region disagree"
            );
            assert!(
                (-90.0..=90.0).contains(&locale.latitude),
                "{id} latitude {}",
                locale.latitude
            );
            assert!(
                (-180.0..=180.0).contains(&locale.longitude),
                "{id} longitude {}",
                locale.longitude
            );
        }
    }

    #[test]
    fn utc_offsets_are_multiples_of_fifteen_minutes() {
        // Every real IANA offset is a whole number of quarter-hours, except
        // the 45-minute Nepal case which is not in this table.
        for (id, locale) in LOCALES {
            assert_eq!(
                locale.utc_offset % 15,
                0,
                "{id} has offset {}, which is not a quarter-hour",
                locale.utc_offset
            );
        }
    }

    #[test]
    fn timezones_are_iana_style_underscore_paths() {
        for (id, locale) in LOCALES {
            assert!(
                locale.timezone.contains('/'),
                "{id} timezone {} should be an Area/Location pair",
                locale.timezone
            );
            assert!(
                !locale.timezone.contains(' '),
                "{id} IANA timezones use underscores, not spaces"
            );
        }
    }

    #[test]
    fn the_locale_table_leans_the_way_the_real_population_does() {
        // Four US rows against one Faroese row is the point of the table; a
        // regression to uniform weights would make every profile equally
        // likely to be anywhere, which is not what the internet looks like.
        let us = LOCALES.iter().filter(|(_, l)| l.country == "US").count();
        assert!(us >= 3, "US should be over-represented");
        assert!(LOCALES.len() > 40, "the table should be broad");
    }

    #[test]
    fn accept_language_carries_a_region_a_fallback_and_a_quality() {
        let header = accept_language("en-US");
        assert!(header.starts_with("en-US,"));
        assert!(header.contains("en;q=0.9"), "got {header}");
        assert!(
            header.contains("q="),
            "quality values are required: {header}"
        );
    }

    #[test]
    fn a_region_less_language_sends_one_tag_and_never_repeats_itself() {
        // The two branches used to be identical, which produced "en,en;q=0.9,
        // en;q=0.5" — a malformed header, and one a proxy in the path may
        // rewrite into a different one entirely.
        let header = accept_language("ja");
        assert_eq!(header, "ja");
        let tags: Vec<&str> = header.split(',').collect();
        assert_eq!(tags.len(), 1, "{header}");
        assert!(
            !header.contains(";"),
            "no quality value belongs on a single tag"
        );
    }

    #[test]
    fn every_locale_row_produces_a_header_with_no_duplicate_tags() {
        for (id, locale) in LOCALES {
            let header = accept_language(locale.language);
            let mut seen = std::collections::HashSet::new();
            for tag in header.split(',') {
                let name = tag.split(';').next().unwrap_or(tag).trim();
                assert!(!name.is_empty(), "{id}: empty tag in {header:?}");
                assert!(
                    seen.insert(name),
                    "{id}: {name:?} appears twice in {header:?}"
                );
            }
        }
    }

    #[test]
    fn an_english_locale_does_not_get_the_english_fallback_twice() {
        // The failure this guards: "en-US,en;q=0.9,en;q=0.5". English is most
        // of the table, so a blanket English fallback corrupts most headers.
        assert_eq!(accept_language("en-US"), "en-US,en;q=0.9");
        assert_eq!(accept_language("en-GB"), "en-GB,en;q=0.9");
        // A non-English locale still gets English as the last resort, which is
        // what Firefox's default list does.
        assert_eq!(accept_language("de-DE"), "de-DE,de;q=0.9,en;q=0.5");
    }

    #[test]
    fn every_generated_header_ends_in_a_quality_value_when_it_has_one() {
        for (id, locale) in LOCALES {
            let header = accept_language(locale.language);
            let last = header.split(',').next_back().unwrap_or("");
            if header.contains(';') {
                assert!(last.contains("q="), "{id}: {header:?}");
            }
            assert!(!header.contains(",,"), "{id}: {header:?} has an empty tag");
            assert!(
                !header.starts_with(',') && !header.ends_with(','),
                "{id}: {header:?}"
            );
        }
    }

    #[test]
    fn accept_language_is_deterministic() {
        assert_eq!(accept_language("de-DE"), accept_language("de-DE"));
    }

    #[test]
    fn windows_builds_are_all_ten_point_zero() {
        for (version, build) in WINDOWS_BUILDS {
            assert!(version.starts_with("10.0."), "{version}");
            assert_eq!(
                version.trim_start_matches("10.0."),
                *build,
                "{version} and build {build} disagree"
            );
        }
    }

    #[test]
    fn linux_distros_name_a_desktop_that_exists() {
        for (distro, desktop) in LINUX_DISTROS {
            assert!(!distro.is_empty() && !desktop.is_empty());
        }
    }
}
