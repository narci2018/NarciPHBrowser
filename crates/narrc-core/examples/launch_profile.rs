use narrc_core::profile::ProfileStore;
use std::path::PathBuf;
use std::process::Stdio;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let app_data = std::env::var("APPDATA")?;
    let store_root = PathBuf::from(app_data).join("NarciPHBrowser").join("profiles");
    let store = ProfileStore::open(&store_root)?;
    let profile = store.load("profile-1-d5843f44")?
        .expect("profile-1-d5843f44 not found");

    let browser_dir = store.browser_dir(&profile.id);
    let (mut plan, discarded) = profile.launch_plan_after_discarding_conflicts(
        &browser_dir,
        None,
        false,
    )?;

    println!("Profile: {}", profile.name);
    println!("Browser dir: {}", browser_dir.display());
    println!("Discarded conflicts: {:?}", discarded);
    println!("Plan program: {}", plan.program);
    println!("Plan env count: {}", plan.env.len());

    println!("Plan args: {:?}", plan.args);
    for (k, v) in &plan.env {
        println!("ENV {}: {}", k, &v[..v.len().min(80)]);
    }

    plan.args.push("https://signup.live.com/signup".to_owned());

    let mut cmd = std::process::Command::new(&plan.program);
    cmd.args(&plan.args)
        .envs(&plan.env);

    let output = cmd.output()?;
    println!("Status: {}", output.status);
    println!("Stdout: {}", String::from_utf8_lossy(&output.stdout));
    println!("Stderr: {}", String::from_utf8_lossy(&output.stderr));
    Ok(())
}
