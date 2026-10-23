//! Prints the config payload a seed generates, for inspecting what the engine
//! is actually handed. A debugging aid; see `examples/probe.rs` for the
//! read-back verifier.

use narrc_core::generator::{generate, GeneratorOptions};
use narrc_core::os::TargetOs;

fn main() {
    let mut args = std::env::args().skip(1);
    let arg1 = args.next().unwrap_or_else(|| "0x5eed".to_owned());
    if std::path::Path::new(&arg1).exists() {
        let bytes = narrc_core::seal::read_store(std::path::Path::new(&arg1)).unwrap().unwrap();
        let profile: narrc_core::profile::Profile = serde_json::from_slice(&bytes).unwrap();
        println!("NAME: {}", profile.name);
        println!("OPTIONS: {}", serde_json::to_string_pretty(&profile.options).unwrap());
        println!("EFFECTIVE IDENTITY:\n{}", profile.effective_identity().to_config_json());
        println!("EFFECTIVE PREFS:\n{}", profile.effective_identity().to_prefs_json());
        return;
    }
    let seed: u64 = arg1.parse().ok().unwrap_or(0x5eed);
    let os = match args.next().as_deref() {
        Some("macos") => TargetOs::Macos,
        Some("linux") => TargetOs::Linux,
        _ => TargetOs::Windows,
    };
    let generated = generate(seed, &GeneratorOptions::new(os));
    println!("{}", generated.identity.to_config_json());
}
