//! Prints the config payload a seed generates, for inspecting what the engine
//! is actually handed. A debugging aid; see `examples/probe.rs` for the
//! read-back verifier.

use narrc_core::generator::{generate, GeneratorOptions};
use narrc_core::os::TargetOs;

fn main() {
    let mut args = std::env::args().skip(1);
    let seed: u64 = args
        .next()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0x5eed);
    let os = match args.next().as_deref() {
        Some("macos") => TargetOs::Macos,
        Some("linux") => TargetOs::Linux,
        _ => TargetOs::Windows,
    };
    let generated = generate(seed, &GeneratorOptions::new(os));
    println!("{}", generated.identity.to_config_json());
}
