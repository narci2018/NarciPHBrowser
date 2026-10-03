//! Runs the read-back verifier against the engine installed on this machine.
//!
//! This is not a unit test: it launches a real browser, so it is a manual tool
//! and lives in `examples/` rather than behind `#[test]`. Run it after an engine
//! install to see what a profile actually exposes:
//!
//! ```sh
//! cargo run -p narrc-core --example probe -- [seed] [windows|macos|linux]
//! ```
//!
//! Passing `host` as the seed instead of a number launches the engine with an
//! *empty* identity, which is the host baseline: what this machine's browser
//! exposes with nothing spoofed. Diffing a profile's claims against it is how
//! you tell a value the engine actually applied from a value the host happened
//! to agree on — the report on its own cannot tell those apart.
//!
//! The report is printed as JSON, and a human-readable summary of the
//! disagreements goes to stderr first so a failure is readable without a JSON
//! viewer.

use std::time::Duration;

use narrc_core::engine::{build_plan, EngineConfig};
use narrc_core::generator::{generate, GeneratorOptions};
use narrc_core::os::TargetOs;
use narrc_core::verify::{self, ProbeProfile};
use narrc_core::Identity;

fn main() {
    let mut args = std::env::args().skip(1);
    let seed_arg = args.next().unwrap_or_else(|| "0x5eed".to_owned());
    let os = match args.next().as_deref() {
        Some("macos") => TargetOs::Macos,
        Some("linux") => TargetOs::Linux,
        _ => TargetOs::Windows,
    };

    // `host` is the baseline: no identity, so every value the report carries is
    // the machine's own. The agreements are kept because for this run the
    // observed values *are* the output.
    let baseline = seed_arg == "host";
    let identity = if baseline {
        Identity::new()
    } else {
        let seed: u64 = seed_arg.parse().unwrap_or(0x5eed);
        generate(seed, &GeneratorOptions::new(os)).identity
    };

    let probe_dir = ProbeProfile::new(&identity).expect("the probe profile is writable");
    let config = EngineConfig::new(probe_dir.path());
    let plan = build_plan(&identity, &config).expect("the plan builds");
    for warning in &plan.warnings {
        eprintln!("plan warning: {warning}");
    }

    let started = std::time::Instant::now();
    match verify::run(&plan, Duration::from_secs(120), baseline) {
        Ok(report) => {
            eprintln!(
                "\n{} of {} compared values agreed in {:.1}s",
                report.agreed,
                report.checked,
                started.elapsed().as_secs_f32()
            );
            if let Some(renderer) = &report.unmasked_renderer {
                eprintln!("the page read back renderer: {renderer}");
            }
            if report.is_clean() {
                eprintln!("no disagreements");
            } else {
                for difference in report.mismatches() {
                    eprintln!(
                        "  [{:?}] {}: claimed {:?}, exposed {:?}{}",
                        difference.verdict,
                        difference.property,
                        difference.expected,
                        difference.observed,
                        difference
                            .note
                            .as_ref()
                            .map(|note| format!(" — {note}"))
                            .unwrap_or_default()
                    );
                }
            }
            println!(
                "{}",
                serde_json::to_string_pretty(&report).expect("the report serializes")
            );
        }
        Err(error) => {
            eprintln!("the probe failed: {error}");
            std::process::exit(1);
        }
    }
}
