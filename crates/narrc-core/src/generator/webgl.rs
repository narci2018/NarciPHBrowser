//! WebGL context parameters, drawn from the recorded fpgen corpus.
//!
//! # Where the values come from
//!
//! Upstream's launcher draws these properties from fpgen's statistical model
//! — a 211 MB corpus of real recorded devices — conditioned on the GPU the
//! identity already claims. Porting the model's Bayesian sampler was the
//! honest-but-heavy option; this module takes the lighter honest option
//! instead: the corpus was walked once, offline, and every recorded WebGL1
//! and WebGL2 context that belongs to a GPU [`pools`] already offers was
//! extracted into `resources/webgl-presets.json`, already in the exact value
//! shape the engine consumes (the transform is upstream `webgl.py`'s
//! `_context_config`: parameters keyed by their recorded constant id,
//! shader precisions keyed `"shaderType,precisionType"`).
//!
//! What that buys, and what it does not:
//!
//! * the values are **real recordings**, not ranges — the same rule
//!   `pools.rs` is built on ("a pool of things that exist");
//! * a draw is **conditioned on the GPU**: the family is read off the
//!   renderer string the identity already presents;
//! * the draw is **deterministic**: one named sub-stream picks among the
//!   recorded variants of that family, so a profile never changes its
//!   WebGL limits between regenerations;
//! * coverage is **partial**, and a miss is not neutral. The engine's
//!   `MParamGL` returns the *host's* value for any parameter the config
//!   omits, so a renderer drawn without its table would sit beside the real
//!   machine's limits and contradict them. [`write_webgl`] refuses the one
//!   query it can (the shader precision, via `blockIfNotDefined`) and
//!   `engine::build_plan` warns; neither is a substitute for the values.
//!   See `resources/UPSTREAM.md` for the source sites and the gap's size.
//!
//! The extension list is filtered per OS at draw time, with upstream's own
//! sets: four extensions a release Firefox never exposes, plus
//! `OVR_multiview2` off Windows, where the host GL driver decides whether
//! the extension exists and a spoofed list cannot ask it.
//!
//! Provenance, the pin, and the extraction are recorded in `UPSTREAM.md`.

use std::collections::HashMap;
use std::sync::OnceLock;

use serde_json::Value;

use crate::identity::Identity;
use crate::os::TargetOs;
use crate::rng::Rng;
use crate::schema::keys;

/// The derived corpus, compiled in.
const PRESETS_JSON: &str = include_str!("../../resources/webgl-presets.json");

/// Extensions a release Firefox never exposes — draft extensions behind
/// `webgl.enable-draft-extensions`, or mobile-only. Measured on stock
/// Firefox 152.0.4 on real Windows 11 (ANGLE D3D11) 2026-09-16: none of
/// these four are exposed. A spoofed list that names one is a tell.
const NEVER_EXPOSED_EXTENSIONS: &[&str] = &[
    "WEBGL_multi_draw",
    "WEBGL_clip_cull_distance",
    "EXT_texture_norm16",
    "WEBGL_compressed_texture_etc1",
];

/// `OVR_multiview2` is a release extension whose availability depends on the
/// graphics backend. On Windows, Firefox renders WebGL through ANGLE's D3D11
/// backend, which implements multiview on every D3D11 GPU, and fpgen records
/// it on ~99% of Windows WebGL2 devices. On Linux it depends on the host GL
/// driver, and the spoofed list answers without asking the host — so a
/// Linux identity could advertise an extension the GPU cannot back.
const HOST_DEPENDENT_EXTENSIONS: &[&str] = &["OVR_multiview2"];

/// Whether a recorded extension must be dropped from a spoofed list.
///
/// Windows blocks the four a release Firefox never exposes; everywhere else
/// the host GL driver also gets a say, so `OVR_multiview2` goes too.
fn is_blocked(name: &str, os: TargetOs) -> bool {
    NEVER_EXPOSED_EXTENSIONS.contains(&name)
        || (os != TargetOs::Windows && HOST_DEPENDENT_EXTENSIONS.contains(&name))
}

/// Tokens inside a Mesa renderer's parenthetical that name the *driver*, not
/// the device. They are dropped along with the version numbers around them, so
/// two recordings of one chip made by different Mesa builds share a key.
const DRIVER_TOKENS: &[&str] = &[
    "llvm", "aco", "drm", "radeonsi", "zink", "v3d", "panfrost", "freedreno", "mesa",
];

/// One recorded context pair, already in the engine's value shape.
struct Variant {
    /// The WebGL1 context: attributes, extensions, parameters, precisions.
    webgl: Value,
    /// The WebGL2 context, or `None` for a device without WebGL2.
    webgl2: Option<Value>,
}

/// Every recorded variant of one GPU family.
struct Family {
    variants: Vec<Variant>,
}

/// The whole corpus, keyed by `"<os>/<family>"`.
struct Corpus {
    families: HashMap<String, Family>,
}

fn corpus() -> &'static Corpus {
    static CORPUS: OnceLock<Corpus> = OnceLock::new();
    CORPUS.get_or_init(|| {
        let parsed: serde_json::Value =
            serde_json::from_str(PRESETS_JSON).expect("the vendored WebGL corpus is valid JSON");
        let mut families = HashMap::new();
        if let Some(map) = parsed.get("families").and_then(Value::as_object) {
            for (key, entry) in map {
                let variants = entry
                    .get("variants")
                    .and_then(Value::as_array)
                    .map(|list| {
                        list.iter()
                            .map(|variant| Variant {
                                webgl: variant
                                    .get("webgl")
                                    .cloned()
                                    .unwrap_or(Value::Null),
                                webgl2: variant.get("webgl2").cloned(),
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                families.insert(
                    key.clone(),
                    Family { variants },
                );
            }
        }
        Corpus { families }
    })
}

/// The OS key the corpus is indexed by.
fn os_key(os: TargetOs) -> &'static str {
    match os {
        TargetOs::Windows => "win",
        TargetOs::Macos => "mac",
        TargetOs::Linux => "linux",
    }
}

/// Reads the GPU family out of a renderer string.
///
/// The same normalization the offline extraction applied, so a pool's
/// sanitised renderer and the raw recorded string land on one key. Three
/// recorded shapes have to meet:
///
/// * Windows through ANGLE, where the name usually repeats the vendor ANGLE
///   already named — `ANGLE (AMD, AMD Radeon RX 6600 (0x000073FF) …)` against
///   the pool's `ANGLE (AMD, Radeon RX 6600 …)`. The vendor is prepended when
///   the name omits it, and left alone when it is already there, so both sides
///   read `AMD Radeon RX 6600`;
/// * macOS through Metal, whose recorded renderer is
///   `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)` —
///   the chip is named after the prefix, and the old generic cuts reduced the
///   whole thing to `ANGLE`;
/// * Linux through Mesa, whose renderer carries the driver and its version in
///   a parenthetical that says nothing about the device:
///   `AMD Radeon Graphics (radeonsi, renoir LLVM 15.0.7)` against the
///   recorded `AMD Radeon Graphics (radeonsi renoir ACO)`. Both read
///   `AMD Radeon Graphics (renoir)`, and the chip codename survives because
///   that is what separates two devices.
pub fn family_of(renderer: &str) -> String {
    let text = renderer
        .strip_suffix(", or similar")
        .unwrap_or(renderer)
        .trim();

    // macOS. Checked before the generic ANGLE branch, whose `" Metal"` cut
    // would otherwise reduce the name to the literal string `ANGLE`.
    if let Some(rest) = text.strip_prefix("ANGLE (Apple, ANGLE Metal Renderer: ") {
        return canonical(rest.split(',').next().unwrap_or(rest));
    }

    if let Some(rest) = text.strip_prefix("ANGLE (") {
        if let Some((angle_vendor, name)) = rest.split_once(", ") {
            let mut name = name;
            // Cut at the first thing that is not the GPU's name: the device
            // id, the backend token, the shader-model suffix.
            for cut in [
                " (0x", " Direct3D", " OpenGL", " GLES", " OpenGLES", " Vulkan", " Metal",
                " webgl", ", ANGLE", " vs_", " ps_",
            ] {
                if let Some(index) = name.find(cut) {
                    name = &name[..index];
                }
            }
            let name = name.trim();
            // ANGLE names the vendor once; the recorded name often repeats it
            // and the pool's sanitised one does not. Normalise to *with* the
            // vendor, unless the name already mentions it — which is why
            // `Intel(R) UHD Graphics 620` is not doubled, and why the Linux
            // `Mesa Intel(R) UHD Graphics 620 (KBL GT2)` keeps its own
            // spelling instead of gaining an `Intel` in front of it.
            let vendor_word = angle_vendor.split_whitespace().next().unwrap_or("");
            let name = if vendor_word.is_empty()
                || name.to_ascii_lowercase().contains(&vendor_word.to_ascii_lowercase())
            {
                name.to_string()
            } else {
                format!("{vendor_word} {name}")
            };
            return canonical(&name);
        }
    }
    canonical(text)
}

/// Trims the trailing punctuation, and the driver-version noise a Mesa
/// renderer carries inside its parenthetical.
///
/// `(radeonsi, renoir LLVM 15.0.7)` and `(radeonsi renoir ACO)` both become
/// `(renoir)`: the codename is the device, the driver and compiler names and
/// the version numbers around them are build details of whoever recorded it.
/// Dropping the driver name is not cosmetic — the corpus records one chip
/// under both spellings (`AMD Radeon Vega 8 Graphics (radeonsi raven ACO)` and
/// `(raven LLVM 15.0.7)`, `AMD Radeon Graphics (radeonsi renoir ACO)` and
/// `(renoir LLVM 19.1.1)`), so keeping it would key one GPU twice and let a
/// draw pick whichever build happened to be recorded first.
///
/// A parenthetical with no driver token in it — `(TM)`, `(R)`, `(KBL GT2)` —
/// is part of the name and is left exactly as it was.
fn canonical(text: &str) -> String {
    let text = text.trim().trim_end_matches([',', ';', '.']).trim();
    let Some(open) = text.rfind('(') else {
        return text.to_string();
    };
    let Some(close) = text[open..].find(')').map(|offset| open + offset) else {
        return text.to_string();
    };
    let inner = &text[open + 1..close];
    let tokens: Vec<&str> = inner
        .split(|c: char| c.is_whitespace() || c == ',')
        .filter(|token| !token.is_empty())
        .collect();
    if !tokens
        .iter()
        .any(|token| DRIVER_TOKENS.contains(&token.to_ascii_lowercase().as_str()))
    {
        return text.to_string();
    }
    let kept: Vec<&str> = tokens
        .into_iter()
        .filter(|token| {
            let lower = token.to_ascii_lowercase();
            // Keep what names the device; drop the driver, its compiler, and
            // every version number (`15.0.7`, `3.61`, `6.14.0-37-generic`).
            !DRIVER_TOKENS.contains(&lower.as_str())
                && !token.starts_with(|c: char| c.is_ascii_digit())
        })
        .collect();
    format!("{} ({}){}", text[..open].trim_end(), kept.join(" "), &text[close + 1..])
}

/// Draws the WebGL contexts for the GPU the identity already claims.
///
/// A GPU with no recorded family still gets its vendor and renderer spoofed by
/// the hardware draw, but draws no context — and the engine's
/// `MaskConfig::MParamGL` returns the *host's* value for any parameter the
/// config omits, so that identity would present a renderer its own limits
/// contradict. The shader-precision query is the one part that can be refused
/// instead, which is what [`block_unrecorded_precisions`] does.
pub fn write_webgl(identity: &mut Identity, renderer: &str, os: TargetOs, seed: u64) {
    let corpus = corpus();
    let key = format!("{}/{}", os_key(os), family_of(renderer));
    let Some(family) = corpus.families.get(&key) else {
        block_unrecorded_precisions(identity);
        return;
    };
    if family.variants.is_empty() {
        block_unrecorded_precisions(identity);
        return;
    }
    let mut rng = Rng::stream(seed, "webgl");
    let variant = rng.pick(&family.variants);
    write_context(identity, "webGl", &variant.webgl, os);
    if let Some(webgl2) = &variant.webgl2 {
        write_context(identity, "webGl2", webgl2, os);
    }
}

/// Parameter ids the corpus records but the engine answers from the real GL
/// context, so a profile must not claim them.
///
/// # How this list was obtained
///
/// Not read off the patch — **measured** against the installed engine, by
/// `cargo run -p narrc-core --example spoofable`, which claims a sentinel value
/// for every corpus id and reports which sentinels come back. An id whose
/// sentinel is returned is spoofed; an id that returns the host's value is not,
/// whatever the corpus says. The measurement independently reproduced the
/// patch's `fromTable` allowlist exactly (14 WebGL1 ids plus `COLOR_WRITEMASK`,
/// and the WebGL2-only additions), which is why the list can be trusted as
/// complete rather than merely sufficient.
///
/// # Why they are dropped rather than kept
///
/// The patch answers these from the live context on purpose, because answering
/// them from a table reads back state the page just changed: `UNPACK_FLIP_Y`
/// after `pixelStorei`, `ALPHA_BITS` on an `{alpha: false}` context,
/// `DRAW_BUFFER0` after `drawBuffers`. The corpus's recorded values are the
/// *recorder's* state, not this profile's. Keeping them would mean claiming:
///
/// * live state and bindings (VIEWPORT, SCISSOR_BOX, the enables, the
///   pixel-store flags, the clear values, `DRAW_BUFFER1`–`DRAW_BUFFER7`) — a
///   claim that is wrong for any page that has drawn anything;
/// * framebuffer-dependent values (`RED_BITS`…`STENCIL_BITS`) — wrong for any
///   context whose attributes differ from the recording's;
/// * `COMPRESSED_TEXTURE_FORMATS`, which the patch derives from the compressed
///   -texture extensions the page has enabled;
/// * the four WebGL strings (VENDOR, RENDERER, VERSION,
///   SHADING_LANGUAGE_VERSION), which stock Firefox answers itself — and whose
///   recorded values are **Chrome-shaped** (`"WebKit"`, `"WebKit WebGL"`,
///   `"WebGL 1.0 (OpenGL ES 2.0 Chromium)"`). Dropping them is also what keeps
///   a Firefox profile from ever reporting a Chrome-only string if the engine's
///   allowlist were widened.
///
/// The list is a *measurement*, so it belongs to one engine build: it was taken
/// against Camoufox `156.0.1-beta.33`. `the_corpus_claims_only_parameters_the_engine_reads`
/// fails if a regenerated corpus reintroduces one.
pub const UNSPOOFED_PARAMETERS: &[u32] = &[
    // Live state and bindings (enables, active texture, blend and clear values,
    // scissor and viewport, pixel-store flags, hints, draw buffers), values
    // that follow the bound framebuffer (the channel bit depths), values the
    // patch derives from the page's enabled extensions, and a few recordings
    // whose stored type the engine's typed read rejects.
    2849, 2884, 2885, 2886, 2928, 2929, 2930, 2931, 2932, 2960, 2961, 2962, 2963, 2964, 2965,
    2966, 2967, 2968, 2978, 3024, 3042, 3074, 3088, 3089, 3106, 3314, 3315, 3316, 3317, 3330,
    3331, 3332, 3333, 3410, 3411, 3412, 3413, 3414, 3415, 10752, 32773, 32777, 32823, 32824,
    32877, 32878, 32926, 32928, 32936, 32937, 32938, 32939, 32968, 32969, 32970, 32971, 33170,
    34016, 34467, 34816, 34817, 34818, 34819, 34853, 34854, 34855, 34856, 34857, 34858, 34859,
    34860, 34877, 35723, 35738, 35739, 35977, 36003, 36004, 36005, 36387, 36388, 37440, 37441,
    37443,
    // The four WebGL strings. Stock Firefox answers these, and the recordings
    // are Chrome-shaped, so claiming them would be a Chrome-only tell if the
    // engine ever started honouring them.
    7936, 7937, 7938, 35724,
];

/// Every GL constant id the corpus records a value for, across both contexts.
///
/// The read-back probe asks the browser for exactly these, so a comparison can
/// never silently skip a parameter: the list is derived from the vendored file
/// rather than written down twice. It is deliberately *not* filtered by
/// [`UNSPOOFED_PARAMETERS`] — the point of asking for an id the identity does
/// not claim is to see the host's own value sitting next to the spoofed
/// renderer, which is what the coverage warning is about.
pub fn recorded_parameter_ids() -> Vec<u32> {
    let mut ids: Vec<u32> = corpus()
        .families
        .values()
        .flat_map(|family| family.variants.iter())
        .flat_map(|variant| {
            [Some(&variant.webgl), variant.webgl2.as_ref()]
                .into_iter()
                .flatten()
                .filter_map(|context| context.get("parameters").and_then(Value::as_object))
                .flat_map(|parameters| parameters.keys().filter_map(|key| key.parse::<u32>().ok()))
        })
        .collect();
    ids.sort_unstable();
    ids.dedup();
    ids
}

/// Refuses the shader-precision query for a GPU with no recorded context.
///
/// Upstream's `blockIfNotDefined` makes `getShaderPrecisionFormat` return null
/// rather than a value (see `webgl-spoofing.patch` in `resources/UPSTREAM.md`).
/// A refusal carries no information about the machine; the host's precision
/// formats would contradict the renderer sitting next to them. Upstream itself
/// never sets this, because it picks its GPU out of the model and so can never
/// have a gap — this crate picks from a curated pool and can.
///
/// It is a mitigation, not a fix: `webGl:parameters` has no equivalent flag, so
/// the parameter table still comes from the host. The fix is coverage.
fn block_unrecorded_precisions(identity: &mut Identity) {
    identity
        .set_bool(keys::WEBGL_SHADER_PRECISION_BLOCK, true)
        .set_bool(keys::WEBGL2_SHADER_PRECISION_BLOCK, true);
}

/// Writes one context's four properties, with the OS extension filter.
fn write_context(identity: &mut Identity, prefix: &str, context: &Value, os: TargetOs) {
    let extensions_key = match prefix {
        "webGl" => keys::WEBGL_EXTENSIONS,
        _ => keys::WEBGL2_EXTENSIONS,
    };
    let parameters_key = match prefix {
        "webGl" => keys::WEBGL_PARAMETERS,
        _ => keys::WEBGL2_PARAMETERS,
    };
    let attributes_key = match prefix {
        "webGl" => keys::WEBGL_CONTEXT_ATTRS,
        _ => keys::WEBGL2_CONTEXT_ATTRS,
    };
    let precision_key = match prefix {
        "webGl" => keys::WEBGL_PRECISION,
        _ => keys::WEBGL2_PRECISION,
    };

    if let Some(list) = context.get("supportedExtensions").and_then(Value::as_array) {
        let extensions: Vec<String> = list
            .iter()
            .filter_map(Value::as_str)
            .filter(|name| !is_blocked(name, os))
            .map(str::to_string)
            .collect();
        identity.set_str_array(extensions_key, extensions);
    }
    if let Some(object) = context.get("parameters").and_then(Value::as_object) {
        // Only the ids the engine reads out of the config. The corpus records
        // more than that, and a claim the engine answers from the real context
        // is not a spoof — it is a value the profile would report as its own if
        // the engine ever started honouring it. See `UNSPOOFED_PARAMETERS`.
        identity.set_object(
            parameters_key,
            object
                .iter()
                .filter(|(key, _)| {
                    key.parse::<u32>()
                        .is_ok_and(|id| !UNSPOOFED_PARAMETERS.contains(&id))
                })
                .map(|(k, v)| (k.clone(), v.clone())),
        );
    }
    if let Some(object) = context.get("contextAttributes").and_then(Value::as_object) {
        identity.set_object(attributes_key, object.iter().map(|(k, v)| (k.clone(), v.clone())));
    }
    if let Some(object) = context.get("shaderPrecisionFormats").and_then(Value::as_object) {
        identity.set_object(precision_key, object.iter().map(|(k, v)| (k.clone(), v.clone())));
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::*;
    use crate::generator::GeneratorOptions;

    /// A renderer from each pool shape, and the family it must normalize to.
    ///
    /// The recorded and the pool spelling of one GPU are different strings on
    /// purpose here: the pairs below are the cases that used to miss.
    #[test]
    fn a_renderer_normalizes_to_its_gpu_family() {
        assert_eq!(
            family_of("ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 (0x00001F0A) Direct3D11 vs_5_0 ps_5_0, D3D11)"),
            "NVIDIA GeForce GTX 1650"
        );
        assert_eq!(
            family_of("ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0), or similar"),
            "NVIDIA GeForce GTX 1650"
        );
        assert_eq!(
            family_of("ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E9B) Direct3D11 vs_5_0 ps_5_0, D3D11)"),
            "Intel(R) UHD Graphics 630"
        );
        assert_eq!(family_of("Apple M1, or similar"), "Apple M1");
        assert_eq!(
            family_of("Mesa Intel(R) UHD Graphics 620 (KBL GT2)"),
            "Mesa Intel(R) UHD Graphics 620 (KBL GT2)"
        );

        // A recorded name that repeats the vendor ANGLE already named, against
        // the pool's sanitised one that does not.
        assert_eq!(
            family_of("ANGLE (AMD, AMD Radeon RX 6600 (0x000073FF) Direct3D11 vs_5_0 ps_5_0, D3D11)"),
            "AMD Radeon RX 6600"
        );
        assert_eq!(
            family_of("ANGLE (AMD, Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0), or similar"),
            "AMD Radeon RX 6600"
        );
        // …and the vendor is not doubled when the name already carries it.
        assert_eq!(
            family_of("ANGLE (AMD, AMD Radeon(TM) Graphics (0x0000164C) Direct3D11 vs_5_0 ps_5_0, D3D11)"),
            "AMD Radeon(TM) Graphics"
        );
        assert_eq!(
            family_of("ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)"),
            "Intel(R) UHD Graphics 620"
        );

        // macOS reports through Metal, and the chip is named after the prefix.
        assert_eq!(
            family_of("ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)"),
            "Apple M4"
        );
        assert_eq!(family_of("Apple M4, or similar"), "Apple M4");

        // Mesa's parenthetical is a driver and version list, not part of the
        // name — and the driver token goes with it, because the corpus records
        // one chip with and without it.
        assert_eq!(
            family_of("AMD Radeon Graphics (radeonsi, renoir LLVM 15.0.7)"),
            "AMD Radeon Graphics (renoir)"
        );
        assert_eq!(
            family_of("ANGLE (AMD, AMD Radeon Graphics (radeonsi renoir ACO), OpenGL 4.6)"),
            "AMD Radeon Graphics (renoir)"
        );
        assert_eq!(
            family_of("ANGLE (AMD, AMD Radeon Graphics (radeonsi renoir LLVM 19.1.1), OpenGL 4.6)"),
            "AMD Radeon Graphics (renoir)"
        );
        // A different codename is a different device, and stays one.
        assert_eq!(
            family_of("ANGLE (AMD, AMD Radeon Graphics (radeonsi rembrandt LLVM 20.1.2), OpenGL ES 3.2)"),
            "AMD Radeon Graphics (rembrandt)"
        );
        // The two recorded spellings of one Vega 8 must meet on one key, or the
        // draw would pick a driver build rather than a device.
        assert_eq!(
            family_of("ANGLE (AMD, AMD Radeon Vega 8 Graphics (radeonsi raven ACO), OpenGL 4.6)"),
            family_of("ANGLE (AMD, AMD Radeon Vega 8 Graphics (raven LLVM 15.0.7), OpenGL ES 3.2)")
        );
        // A parenthetical that is part of the name is left alone.
        assert_eq!(family_of("Radeon(TM) Graphics"), "Radeon(TM) Graphics");
        assert_eq!(
            family_of("ANGLE (Intel Inc., Intel HD Graphics 4000 OpenGL Engine, OpenGL 4.1)"),
            "Intel HD Graphics 4000"
        );
    }

    /// Every pool GPU with a recorded family must resolve to a corpus key.
    ///
    /// This is the cross-language pin: the Rust normalization has to land on
    /// the same family the extraction script indexed, or the draw silently
    /// finds nothing. The list is the coverage the corpus actually has — 11 of
    /// the Windows pool's 11, 2 of the macOS pool's 12, 3 of the Linux pool's
    /// 8. Raising it means re-running the extraction, not editing this list.
    #[test]
    fn every_pool_gpu_with_a_recorded_family_resolves() {
        let corpus = corpus();
        let expectations: &[(TargetOs, &str)] = &[
            (TargetOs::Windows, "ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0), or similar"),
            (TargetOs::Windows, "ANGLE (Intel, Intel(R) HD Graphics 630 Direct3D11 vs_5_0 ps_5_0), or similar"),
            (TargetOs::Windows, "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0), or similar"),
            (TargetOs::Windows, "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0), or similar"),
            (TargetOs::Windows, "ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0), or similar"),
            (TargetOs::Windows, "ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar"),
            (TargetOs::Windows, "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0), or similar"),
            (TargetOs::Windows, "ANGLE (AMD, Radeon R9 200 Series Direct3D11 vs_5_0 ps_5_0), or similar"),
            (TargetOs::Windows, "ANGLE (AMD, Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0), or similar"),
            (TargetOs::Windows, "ANGLE (AMD, Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0), or similar"),
            (TargetOs::Windows, "ANGLE (Intel, Intel(R) Arc(TM) A750 Graphics Direct3D11 vs_5_0 ps_5_0), or similar"),
            (TargetOs::Macos, "Apple M1, or similar"),
            (TargetOs::Macos, "Apple M4, or similar"),
            (TargetOs::Linux, "Mesa Intel(R) UHD Graphics 620 (KBL GT2), or similar"),
            (TargetOs::Linux, "NVIDIA GeForce RTX 3060/PCIe/SSE2, or similar"),
            (TargetOs::Linux, "AMD Radeon Graphics (radeonsi, renoir LLVM 15.0.7), or similar"),
        ];
        for (os, renderer) in expectations {
            let key = format!("{}/{}", os_key(*os), family_of(renderer));
            assert!(
                corpus.families.contains_key(&key),
                "no corpus entry for {key}"
            );
        }
    }

    /// A GPU with no recorded family refuses the precision query instead of
    /// answering it with the host's values.
    #[test]
    fn an_unrecorded_gpu_refuses_its_precisions() {
        let mut identity = Identity::new();
        write_webgl(&mut identity, "Apple M2, or similar", TargetOs::Macos, 7);
        assert_eq!(
            identity.get_object(keys::WEBGL_PARAMETERS),
            None,
            "no family means no parameter table to draw"
        );
        assert_eq!(
            identity.get_bool(keys::WEBGL_SHADER_PRECISION_BLOCK),
            Some(true)
        );
        assert_eq!(
            identity.get_bool(keys::WEBGL2_SHADER_PRECISION_BLOCK),
            Some(true)
        );
    }

    /// A recorded GPU answers the precision query from its recording, so the
    /// refusal flag must not be set on it.
    #[test]
    fn a_recorded_gpu_answers_its_precisions() {
        let mut identity = Identity::new();
        write_webgl(
            &mut identity,
            "ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0), or similar",
            TargetOs::Windows,
            7,
        );
        assert!(identity.get_object(keys::WEBGL_PARAMETERS).is_some());
        assert!(identity.get_object(keys::WEBGL_PRECISION).is_some());
        assert_eq!(identity.get_bool(keys::WEBGL_SHADER_PRECISION_BLOCK), None);
        assert_eq!(identity.get_bool(keys::WEBGL2_SHADER_PRECISION_BLOCK), None);
    }

    /// The engine cannot be told "this device has no extensions" or "this
    /// device has no WebGL2": an empty or absent list falls through to the
    /// host's, which is exactly the leak the corpus exists to close. So every
    /// vendored variant must carry both, and this fails loudly if a future
    /// extraction lets one through.
    #[test]
    fn every_variant_can_be_told_without_falling_back_to_the_host() {
        let corpus = corpus();
        for (key, family) in &corpus.families {
            for (index, variant) in family.variants.iter().enumerate() {
                for (name, context) in [
                    ("webgl1", Some(&variant.webgl)),
                    ("webgl2", variant.webgl2.as_ref()),
                ] {
                    let context = context
                        .unwrap_or_else(|| panic!("{key} variant {index} has no {name}"));
                    let extensions = context
                        .get("supportedExtensions")
                        .and_then(Value::as_array)
                        .unwrap_or_else(|| panic!("{key} variant {index} {name} has no extensions"));
                    assert!(
                        !extensions.is_empty(),
                        "{key} variant {index} {name} has an empty extension list, which the \
                         engine reads as 'use the host's'"
                    );
                    let parameters = context
                        .get("parameters")
                        .and_then(Value::as_object)
                        .unwrap_or_else(|| panic!("{key} variant {index} {name} has no parameters"));
                    assert!(
                        !parameters.is_empty(),
                        "{key} variant {index} {name} has an empty parameter table"
                    );
                }
            }
        }
    }

    #[test]
    fn a_drawn_identity_carries_the_recorded_context() {
        let generated = crate::generator::generate(0xabc, &GeneratorOptions::new(TargetOs::Windows));
        let identity = &generated.identity;
        let parameters = identity
            .get_object(keys::WEBGL_PARAMETERS)
            .expect("a recorded GPU's parameters are drawn");
        assert!(!parameters.is_empty());
        // The recorded shape: parameters keyed by their constant id.
        assert!(parameters.contains_key("3379") || parameters.contains_key("2849"));
        let extensions = identity
            .get_str_array(keys::WEBGL_EXTENSIONS)
            .expect("extensions are drawn");
        assert!(!extensions.is_empty());
        // The never-exposed filter applies on Windows.
        assert!(!extensions.contains(&"WEBGL_multi_draw".to_string()));
        assert!(!extensions.contains(&"WEBGL_compressed_texture_etc1".to_string()));
        // The context attributes and precisions ride along.
        assert!(identity.get_object(keys::WEBGL_CONTEXT_ATTRS).is_some());
        assert!(identity.get_object(keys::WEBGL_PRECISION).is_some());
    }

    /// The extension filter is platform-conditional: the four a release
    /// Firefox never exposes go everywhere, `OVR_multiview2` only off Windows.
    #[test]
    fn the_extension_filter_is_platform_conditional() {
        assert!(is_blocked("WEBGL_multi_draw", TargetOs::Windows));
        assert!(!is_blocked("OVR_multiview2", TargetOs::Windows));
        assert!(is_blocked("WEBGL_multi_draw", TargetOs::Macos));
        assert!(is_blocked("OVR_multiview2", TargetOs::Macos));
        assert!(is_blocked("OVR_multiview2", TargetOs::Linux));
        assert!(!is_blocked("WEBGL_debug_renderer_info", TargetOs::Linux));

        // And the same filter is what a draw applies, on a recorded family.
        let recorded = serde_json::json!({
            "supportedExtensions": [
                "WEBGL_debug_renderer_info",
                "OVR_multiview2",
                "WEBGL_multi_draw",
            ],
            "parameters": { "3379": 16 },
        });
        let mut identity = Identity::new();
        write_context(&mut identity, "webGl", &recorded, TargetOs::Macos);
        let extensions = identity
            .get_str_array(keys::WEBGL_EXTENSIONS)
            .expect("extensions are drawn");
        assert_eq!(extensions, vec!["WEBGL_debug_renderer_info".to_string()]);
    }

    #[test]
    fn the_draw_is_deterministic() {
        let options = GeneratorOptions::new(TargetOs::Windows);
        let first = crate::generator::generate(0x1234, &options);
        let second = crate::generator::generate(0x1234, &options);
        assert_eq!(
            first.identity.get_object(keys::WEBGL_PARAMETERS),
            second.identity.get_object(keys::WEBGL_PARAMETERS)
        );
        assert_eq!(
            first.identity.get_str_array(keys::WEBGL_EXTENSIONS),
            second.identity.get_str_array(keys::WEBGL_EXTENSIONS)
        );
    }

    /// The corpus records more parameters than the engine reads, and a claim
    /// the engine answers from the real context is not a spoof. The draw drops
    /// exactly the ids measured to be unspoofed — no more, no fewer.
    ///
    /// This is the test that fails if a regenerated corpus reintroduces one, and
    /// it is why `UNSPOOFED_PARAMETERS` is a measured list rather than a guess:
    /// it was reproduced independently by `examples/spoofable.rs` and by reading
    /// the patch's `fromTable` allowlist.
    #[test]
    fn the_corpus_claims_only_parameters_the_engine_reads() {
        let parsed: Value = serde_json::from_str(PRESETS_JSON).expect("the corpus parses");
        let mut spoofed: BTreeSet<u32> = BTreeSet::new();
        let mut dropped: BTreeSet<u32> = BTreeSet::new();
        for family in parsed["families"].as_object().expect("families").values() {
            for variant in family["variants"].as_array().expect("variants") {
                for context in [&variant["webgl"], &variant["webgl2"]].into_iter().filter(|c| !c.is_null()) {
                    for id in context["parameters"].as_object().expect("parameters").keys() {
                        let id: u32 = id.parse().expect("a parameter id is a number");
                        if UNSPOOFED_PARAMETERS.contains(&id) {
                            dropped.insert(id);
                        } else {
                            spoofed.insert(id);
                        }
                    }
                }
            }
        }

        // The two sets are disjoint by construction; what matters is that the
        // corpus still carries every unspoofed id (so the prune list is not
        // stale) and that a real, non-trivial set survives.
        assert_eq!(
            dropped.len(),
            UNSPOOFED_PARAMETERS.len(),
            "the corpus no longer records every id in UNSPOOFED_PARAMETERS: {:?}",
            UNSPOOFED_PARAMETERS
                .iter()
                .filter(|id| !dropped.contains(id))
                .collect::<Vec<_>>()
        );
        // 15 of WebGL1's 82 ids and 44 of WebGL2's 132 are spoofed; the union
        // across contexts is 46. Pinned as a range so a corpus refresh that
        // changes coverage is noticed but not spuriously fatal.
        assert!(
            (40..=60).contains(&spoofed.len()),
            "the corpus should keep a substantial spoofable set, got {}",
            spoofed.len()
        );
        // A sanity check that the prune is not accidentally total: the ids the
        // patch is known to spoof must survive.
        for id in [3379, 3408, 3386, 33901, 34024, 34921, 36347, 34852] {
            assert!(spoofed.contains(&id), "{id} must remain spoofable");
        }
    }

    /// A drawn identity carries only spoofable parameters, and the ones it
    /// carries are the engine's own — so a covered GPU's config makes no claim
    /// the engine will not honour.
    #[test]
    fn a_draw_claims_nothing_the_engine_ignores() {
        let generated = crate::generator::generate(0xabc, &GeneratorOptions::new(TargetOs::Windows));
        for key in [keys::WEBGL_PARAMETERS, keys::WEBGL2_PARAMETERS] {
            let Some(parameters) = generated.identity.get_object(key) else {
                continue;
            };
            assert!(!parameters.is_empty());
            for id in parameters.keys() {
                let id: u32 = id.parse().expect("a parameter id is a number");
                assert!(
                    !UNSPOOFED_PARAMETERS.contains(&id),
                    "{key} claims {id}, which the engine answers from the real context"
                );
            }
        }
        // The Chrome-shaped strings in particular must never reach a config.
        let parameters = generated
            .identity
            .get_object(keys::WEBGL_PARAMETERS)
            .expect("a recorded GPU's parameters are drawn");
        for id in ["7936", "7937", "7938", "35724"] {
            assert!(!parameters.contains_key(id), "{id} is Chrome-shaped and must not be claimed");
        }
    }

    #[test]
    fn the_vendored_corpus_is_well_formed() {
        let parsed: Value =
            serde_json::from_str(PRESETS_JSON).expect("the corpus parses");
        let families = parsed
            .get("families")
            .and_then(Value::as_object)
            .expect("the corpus has families");
        assert!(!families.is_empty());
        for (key, entry) in families {
            let variants = entry
                .get("variants")
                .and_then(Value::as_array)
                .unwrap_or_else(|| panic!("{key} has variants"));
            assert!(!variants.is_empty(), "{key} has a variant");
            for variant in variants {
                for context_key in ["webgl", "webgl2"] {
                    if let Some(context) = variant.get(context_key) {
                        if context.is_null() {
                            continue;
                        }
                        for field in [
                            "contextAttributes",
                            "supportedExtensions",
                            "parameters",
                            "shaderPrecisionFormats",
                        ] {
                            assert!(
                                context.get(field).is_some(),
                                "{key} {context_key} carries {field}"
                            );
                        }
                    }
                }
            }
        }
    }
}
