//! Measures which WebGL parameter ids the engine actually spoofs.
//!
//! The corpus records a value for every id the fingerprint model captured, but
//! Camoufox only reads *some* of them out of the config — the patch's
//! `fromTable` allowlist answers the rest from the real GL context, because
//! they are live state, or strings, or values that follow the bound
//! framebuffer. A corpus entry the engine never reads is dead weight, and for
//! the WebGL *strings* it is worse than dead weight: the model's recordings are
//! Chrome-shaped (`"WebKit"`, `"WebKit WebGL"`), so if the engine ever widened
//! its allowlist, a Firefox profile would start reporting a Chrome-only string.
//!
//! Reading the patch tells you which ids *should* be spoofed. This tool
//! measures which ids *are*, by claiming a sentinel for every corpus id and
//! seeing which sentinels come back. An id whose sentinel is returned is
//! spoofed; an id that returns the host's value is not, whatever the corpus
//! says.
//!
//! ```sh
//! cargo run -p narrc-core --example spoofable
//! ```
//!
//! It launches a real browser, so it is a manual tool, not a test.

use std::collections::BTreeMap;
use std::time::Duration;

use serde_json::{json, Map, Value};

use narrc_core::engine::{build_plan, EngineConfig};
use narrc_core::schema::keys;
use narrc_core::verify::{self, ProbeProfile};
use narrc_core::Identity;

/// A value that cannot be a real GL limit, in the shape the corpus recorded.
///
/// The element types are preserved, not just the array-ness: the engine reads
/// an array parameter through a typed cast, and handing `COLOR_WRITEMASK` an
/// array of numbers where the corpus records booleans does not fall back — it
/// takes the browser down. (That the engine treats a config type error as fatal
/// is worth knowing, but it is not a bug this tool should be tripping.)
fn sentinel(sample: &Value) -> Value {
    match sample {
        Value::Bool(recorded) => Value::Bool(!recorded),
        Value::Number(_) => json!(999_983),
        // The length is preserved too: the patch reads a 2-element array as
        // `std::array<T, 2UL>` and a 4-element one as `std::array<T, 4UL>`, so
        // a padded claim would come back truncated and look unspoofed.
        Value::Array(items) => Value::Array(items.iter().map(sentinel).collect()),
        _ => json!("NARC-SENTINEL"),
    }
}

/// Every id the corpus records for each context, with one recorded value as the
/// shape to mimic.
fn corpus_ids() -> (Map<String, Value>, Map<String, Value>) {
    let text = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/resources/webgl-presets.json"
    ))
    .expect("the vendored corpus is readable");
    let corpus: Value = serde_json::from_str(&text).expect("the vendored corpus is valid JSON");
    let mut webgl1 = Map::new();
    let mut webgl2 = Map::new();
    for family in corpus["families"].as_object().expect("families").values() {
        for variant in family["variants"].as_array().expect("variants") {
            for (context, target) in [("webgl", &mut webgl1), ("webgl2", &mut webgl2)] {
                let Some(parameters) = variant[context].get("parameters").and_then(Value::as_object)
                else {
                    continue;
                };
                for (id, sample) in parameters {
                    target.entry(id.clone()).or_insert_with(|| sample.clone());
                }
            }
        }
    }
    (webgl1, webgl2)
}

fn main() {
    // An optional `only=<id,id,...>` argument, so a config the engine refuses
    // can be bisected down to the value that broke it.
    let only: Option<Vec<u32>> = std::env::args()
        .skip(1)
        .find_map(|argument| argument.strip_prefix("only=").map(str::to_owned))
        .map(|list| {
            list.split(',')
                .filter_map(|id| id.trim().parse::<u32>().ok())
                .collect()
        });

    let (webgl1, webgl2) = corpus_ids();
    let keep = |id: &String| only.as_ref().is_none_or(|only| only.contains(&id.parse().unwrap_or(0)));
    let sentinels1: Map<String, Value> = webgl1
        .iter()
        .filter(|(id, _)| keep(id))
        .map(|(id, v)| (id.clone(), sentinel(v)))
        .collect();
    let sentinels2: Map<String, Value> = webgl2
        .iter()
        .filter(|(id, _)| keep(id))
        .map(|(id, v)| (id.clone(), sentinel(v)))
        .collect();

    let mut identity = Identity::new();
    identity
        .set_str(keys::WEBGL_VENDOR, "Google Inc. (NVIDIA)")
        .set_str(keys::WEBGL_RENDERER, "ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0), or similar")
        .set_object(keys::WEBGL_PARAMETERS, sentinels1.clone())
        .set_object(keys::WEBGL2_PARAMETERS, sentinels2.clone());

    let probe_dir = ProbeProfile::new(&identity).expect("the probe profile is writable");
    let plan = build_plan(&identity, &EngineConfig::new(probe_dir.path())).expect("the plan builds");

    let report = match verify::run(&plan, Duration::from_secs(120), true) {
        Ok(report) => report,
        Err(error) => {
            eprintln!("the probe failed: {error}");
            std::process::exit(1);
        }
    };

    // The sentinels the report compares are the ones that survived the plan, so
    // the classification is against what the engine was actually handed.
    let mut spoofed: BTreeMap<&str, Vec<u32>> = BTreeMap::new();
    let mut ignored: BTreeMap<&str, Vec<u32>> = BTreeMap::new();
    for difference in &report.differences {
        let Some((context, id)) = difference
            .property
            .split_once(":parameters[")
            .map(|(context, id)| (context, id.trim_end_matches(']')))
        else {
            continue;
        };
        let Some(id) = id.parse::<u32>().ok() else {
            continue;
        };
        let target = if difference.expected == difference.observed {
            spoofed.entry(context).or_default()
        } else {
            ignored.entry(context).or_default()
        };
        target.push(id);
    }

    for (context, ids) in &spoofed {
        println!("{context}: {} ids spoofed", ids.len());
    }
    for (context, ids) in &ignored {
        println!("{context}: {} ids IGNORED by the engine: {ids:?}", ids.len());
    }

    // The prune list is the ignored ids, which is what the corpus should stop
    // claiming.
    let pruned: Vec<u32> = ignored
        .values()
        .flatten()
        .copied()
        .collect::<std::collections::BTreeSet<u32>>()
        .into_iter()
        .collect();
    println!("\ncorpus prune list: {pruned:?}");
}
