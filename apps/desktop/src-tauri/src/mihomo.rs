//! The Mihomo proxy core bridge.
//!
//! # Why a core at all
//!
//! The app launches a browser that understands `http` and `socks5`, and stores
//! proxies in that shape. A subscription, though, is a list of *nodes* in
//! protocols the browser has never heard of — `vless`, `vmess`, `trojan`,
//! `hysteria2`, `tuic` and the rest. Something has to speak those protocols and
//! turn each node into a local `socks5` port. That something is Mihomo.
//!
//! # One manager, many processes
//!
//! [`MihomoManager`] is the single owner of every Mihomo process the app runs.
//! It holds two kinds:
//!
//! * one **network** instance, serving the Network page — node lists, latency
//!   and speed tests;
//! * one **profile** instance per profile that is routed through a node, each
//!   exposing its own local `socks5` port.
//!
//! Each process is a singleton: a profile's instance is created once, reused
//! while the profile's browser runs, and stopped when that browser exits. The
//! manager is the only place a process is started or stopped, so a process can
//! never be leaked by a second caller.
//!
//! # What is deliberately not here
//!
//! Storage. Subscriptions are stored by [`narrc_core::SubscriptionStore`] and
//! assignments by [`narrc_core::AssignmentStore`]; this module is handed them
//! and knows only how to run the core against them.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

use narrc_core::StoredSubscription;

/// The repository the core is downloaded from.
const MIHOMO_REPO: &str = "MetaCubeX/mihomo";

/// The install directory, beside the Camoufox engine.
const CORE_DIR: &str = "mihomo";

/// The binary name the archive is extracted to.
const CORE_BINARY: &str = "mihomo.exe";

/// The controller's `select` group that speed tests run through.
const SPEED_GROUP: &str = "SPEEDTEST";

/// The listener bound to [`SPEED_GROUP`], for downloads.
const SPEED_LISTENER: &str = "speedtest";

/// The controller's `select` group a profile instance routes through.
const PROFILE_GROUP: &str = "SELECTED";

/// The listener bound to [`PROFILE_GROUP`], for a profile's browser.
const PROFILE_LISTENER: &str = "profile-in";

/// The URL a latency check fetches. A `204` endpoint is the convention: small,
/// cacheable and served from anywhere.
const DELAY_URL: &str = "https://www.gstatic.com/generate_204";

/// How long a latency check waits, in milliseconds.
const DELAY_TIMEOUT_MS: u64 = 5000;

/// The file a speed test downloads. Cloudflare's endpoint is generous with
/// bandwidth and reachable from most exits.
const SPEED_URL: &str = "https://speed.cloudflare.com/__down?bytes=10000000";

/// How long a speed test may take before it is abandoned.
const SPEED_TIMEOUT_SECS: u64 = 45;

/// How long to wait for the controller to answer after a start.
const READY_TIMEOUT_SECS: u64 = 20;

/// The user agent the provider fetch advertises. A Clash-style agent makes most
/// providers serve the format their own client expects.
const PROVIDER_USER_AGENT: &str = "clash-verge/v1.7.7";

/// Where the core binary lives.
pub struct CorePaths {
    /// The directory holding the binary and its working files.
    pub dir: PathBuf,
    /// The `mihomo.exe` itself.
    pub binary: PathBuf,
}

/// Ensures the Mihomo binary exists, downloading it if it is missing.
pub fn ensure_core(app: &tauri::AppHandle) -> Result<CorePaths, String> {
    use tauri::Emitter;

    let home = dirs_next::home_dir().ok_or_else(|| "could not determine home directory".to_string())?;
    let dir = home.join(CORE_DIR);
    let binary = dir.join(CORE_BINARY);
    if binary.exists() {
        return Ok(CorePaths { dir, binary });
    }

    app.emit(
        "core-download-progress",
        json!({ "phase": "Checking the proxy core release…", "percent": 0.0 }),
    )
    .map_err(|error| error.to_string())?;

    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|error| format!("failed to build http client: {error}"))?;

    let release: Value = client
        .get(format!("https://api.github.com/repos/{MIHOMO_REPO}/releases/latest"))
        .header("User-Agent", "NarciPHBrowser")
        .send()
        .map_err(|error| format!("failed to fetch the core release: {error}"))?
        .json()
        .map_err(|error| format!("failed to read the core release: {error}"))?;

    let tag = release["tag_name"]
        .as_str()
        .ok_or_else(|| "the core release has no tag".to_string())?;
    let assets = release["assets"]
        .as_array()
        .ok_or_else(|| "the core release has no assets".to_string())?;

    // The `compatible` build runs on older CPUs; the plain one is faster. The
    // compatible build is preferred because a core that will not start is a
    // worse failure than one that is a little slower.
    let wanted = [
        format!("mihomo-windows-amd64-compatible-{tag}.zip"),
        format!("mihomo-windows-amd64-{tag}.zip"),
    ];
    let asset = wanted
        .iter()
        .find_map(|name| {
            assets
                .iter()
                .find(|asset| asset["name"].as_str() == Some(name.as_str()))
        })
        .ok_or_else(|| format!("no Windows amd64 asset on the core release {tag}"))?;
    let url = asset["browser_download_url"]
        .as_str()
        .ok_or_else(|| "the core asset has no download url".to_string())?;

    std::fs::create_dir_all(&dir).map_err(|error| format!("could not create {}: {error}", dir.display()))?;
    let archive_path = dir.join("mihomo.zip");

    app.emit(
        "core-download-progress",
        json!({ "phase": format!("Downloading the proxy core {tag}…"), "percent": 10.0 }),
    )
    .map_err(|error| error.to_string())?;

    let mut response = client
        .get(url)
        .header("User-Agent", "NarciPHBrowser")
        .send()
        .map_err(|error| format!("core download failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("core download returned status {}", response.status()));
    }
    let mut file = std::fs::File::create(&archive_path)
        .map_err(|error| format!("could not write {}: {error}", archive_path.display()))?;
    response
        .copy_to(&mut file)
        .map_err(|error| format!("core download failed: {error}"))?;
    drop(file);

    app.emit(
        "core-download-progress",
        json!({ "phase": "Unpacking the proxy core…", "percent": 90.0 }),
    )
    .map_err(|error| error.to_string())?;

    extract_binary(&archive_path, &binary)?;
    let _ = std::fs::remove_file(&archive_path);

    app.emit(
        "core-download-progress",
        json!({ "phase": "The proxy core is ready.", "percent": 100.0 }),
    )
    .map_err(|error| error.to_string())?;

    Ok(CorePaths { dir, binary })
}

/// Pulls the first `.exe` out of a zip archive.
fn extract_binary(archive_path: &Path, binary: &Path) -> Result<(), String> {
    let file = std::fs::File::open(archive_path)
        .map_err(|error| format!("could not open {}: {error}", archive_path.display()))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|error| format!("the core archive is unreadable: {error}"))?;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("the core archive is unreadable: {error}"))?;
        if entry.name().to_ascii_lowercase().ends_with(".exe") {
            let mut out = std::fs::File::create(binary)
                .map_err(|error| format!("could not write {}: {error}", binary.display()))?;
            std::io::copy(&mut entry, &mut out)
                .map_err(|error| format!("could not extract the core: {error}"))?;
            return Ok(());
        }
    }
    Err("the core archive carried no executable".to_string())
}

/// One running core process.
///
/// Killed on drop, so a process cannot outlive the owner that holds it.
pub struct NetworkCore {
    /// The child process, killed on drop.
    child: Child,
    /// The controller's listening port.
    api_port: u16,
    /// The controller's bearer secret.
    secret: String,
    /// The `socks` port traffic is routed through.
    speed_port: u16,
    /// The instance's working directory.
    dir: PathBuf,
    /// The configuration file last written.
    config_path: PathBuf,
}

impl NetworkCore {
    /// Spawns the core and waits until its controller answers.
    fn spawn_and_wait(
        binary: &Path,
        dir: &Path,
        config_path: &Path,
        api_port: u16,
        secret: &str,
        speed_port: u16,
    ) -> Result<Self, String> {
        std::fs::create_dir_all(dir)
            .map_err(|error| format!("could not create {}: {error}", dir.display()))?;
        let child = spawn_core(binary, dir, config_path)?;
        let mut core = Self {
            child,
            api_port,
            secret: secret.to_owned(),
            speed_port,
            dir: dir.to_path_buf(),
            config_path: config_path.to_path_buf(),
        };

        // The controller needs a moment to bind; polling `/version` is the
        // cheapest way to know it is up rather than guessing at a sleep.
        let deadline = Instant::now() + Duration::from_secs(READY_TIMEOUT_SECS);
        let client = blocking_client(2);
        loop {
            if let Some(status) = core.child.try_wait().map_err(|error| error.to_string())? {
                return Err(format!("the proxy core exited on start ({status})"));
            }
            if api_get(&client, api_port, secret, "/version").is_ok() {
                return Ok(core);
            }
            if Instant::now() >= deadline {
                return Err("the proxy core did not come up in time".to_string());
            }
            std::thread::sleep(Duration::from_millis(250));
        }
    }

    /// The Network page's instance: one provider per subscription, a `select`
    /// group for speed tests, and a `socks` listener bound to it.
    pub fn start(app: &tauri::AppHandle, subs: &[StoredSubscription]) -> Result<Self, String> {
        let paths = ensure_core(app)?;
        let dir = paths.dir.join("network");
        std::fs::create_dir_all(&dir)
            .map_err(|error| format!("could not create {}: {error}", dir.display()))?;
        let api_port = free_port()?;
        let speed_port = free_port()?;
        let secret = random_secret();
        let config_path = dir.join("config.yaml");
        let config = network_config(subs, api_port, &secret, speed_port);
        std::fs::write(&config_path, config)
            .map_err(|error| format!("could not write {}: {error}", config_path.display()))?;
        Self::spawn_and_wait(&paths.binary, &dir, &config_path, api_port, &secret, speed_port)
    }

    /// A profile's instance: one provider, a `select` group, and a `socks`
    /// listener bound to it, so the profile's browser has a stable local port.
    pub fn start_profile(
        app: &tauri::AppHandle,
        profile_id: &str,
        sub: &StoredSubscription,
    ) -> Result<Self, String> {
        let paths = ensure_core(app)?;
        let dir = paths.dir.join("profiles").join(profile_id);
        std::fs::create_dir_all(&dir)
            .map_err(|error| format!("could not create {}: {error}", dir.display()))?;
        let api_port = free_port()?;
        let speed_port = free_port()?;
        let secret = random_secret();
        let config_path = dir.join("config.yaml");
        let config = profile_config(sub, api_port, &secret, speed_port);
        std::fs::write(&config_path, config)
            .map_err(|error| format!("could not write {}: {error}", config_path.display()))?;
        Self::spawn_and_wait(&paths.binary, &dir, &config_path, api_port, &secret, speed_port)
    }

    /// Points the instance's `select` group at a node.
    pub fn select_node(&self, node: &str) -> Result<(), String> {
        let client = blocking_client(10);
        api_put(
            &client,
            self.api_port,
            &self.secret,
            &format!("/proxies/{PROFILE_GROUP}"),
            Some(json!({ "name": node })),
        )
    }

    /// Rewrites the configuration and restarts, for when the subscriptions
    /// changed. Restarting is cruder than a reload but leaves nothing stale.
    pub fn restart(&mut self, app: &tauri::AppHandle, config: String) -> Result<(), String> {
        let paths = ensure_core(app)?;
        std::fs::write(&self.config_path, config)
            .map_err(|error| format!("could not write {}: {error}", self.config_path.display()))?;
        let _ = self.child.kill();
        let _ = self.child.wait();
        self.child = spawn_core(&paths.binary, &self.dir, &self.config_path)?;

        let deadline = Instant::now() + Duration::from_secs(READY_TIMEOUT_SECS);
        let client = blocking_client(2);
        loop {
            if let Some(status) = self.child.try_wait().map_err(|error| error.to_string())? {
                return Err(format!("the proxy core exited on restart ({status})"));
            }
            if api_get(&client, self.api_port, &self.secret, "/version").is_ok() {
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err("the proxy core did not come back up in time".to_string());
            }
            std::thread::sleep(Duration::from_millis(250));
        }
    }

    /// Stops the process, reporting whether one was running.
    pub fn stop(&mut self) -> Result<(), String> {
        let _ = self.child.kill();
        let _ = self.child.wait();
        Ok(())
    }

    /// The controller's port.
    pub fn api_port(&self) -> u16 {
        self.api_port
    }

    /// The controller's secret.
    pub fn secret(&self) -> &str {
        &self.secret
    }

    /// The `socks` port traffic is routed through.
    pub fn speed_port(&self) -> u16 {
        self.speed_port
    }
}

impl Drop for NetworkCore {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// The single owner of every Mihomo process.
///
/// A profile's instance is a singleton: [`Self::ensure_profile`] returns the
/// existing one if it is already running, so a second launch of the same
/// profile never starts a second process.
pub struct MihomoManager {
    /// The Network page's instance.
    network: Option<NetworkCore>,
    /// One instance per profile routed through a node.
    profiles: HashMap<String, NetworkCore>,
}

impl Default for MihomoManager {
    fn default() -> Self {
        Self::new()
    }
}

impl MihomoManager {
    /// A manager with nothing running.
    pub fn new() -> Self {
        Self {
            network: None,
            profiles: HashMap::new(),
        }
    }

    /// Starts the network instance if it is not already running.
    pub fn ensure_network(
        &mut self,
        app: &tauri::AppHandle,
        subs: &[StoredSubscription],
    ) -> Result<(), String> {
        if self.network.is_none() {
            self.network = Some(NetworkCore::start(app, subs)?);
        }
        Ok(())
    }

    /// Restarts the network instance so its providers match the subscriptions.
    ///
    /// With no subscriptions left the instance is stopped rather than restarted
    /// empty: Mihomo refuses an empty provider mapping.
    pub fn reload_network(
        &mut self,
        app: &tauri::AppHandle,
        subs: &[StoredSubscription],
    ) -> Result<(), String> {
        if subs.is_empty() {
            self.network = None;
            return Ok(());
        }
        match &mut self.network {
            Some(core) => {
                let config = network_config(subs, core.api_port(), core.secret(), core.speed_port());
                core.restart(app, config)?;
            }
            None => {
                self.network = Some(NetworkCore::start(app, subs)?);
            }
        }
        Ok(())
    }

    /// The network instance's controller handle, starting it if needed.
    pub fn network_handle(
        &mut self,
        app: &tauri::AppHandle,
        subs: &[StoredSubscription],
    ) -> Result<(u16, String, u16), String> {
        self.ensure_network(app, subs)?;
        let core = self
            .network
            .as_ref()
            .ok_or_else(|| "the proxy core is not running".to_string())?;
        Ok((core.api_port(), core.secret().to_owned(), core.speed_port()))
    }

    /// Whether the network instance is running.
    pub fn network_is_running(&self) -> bool {
        self.network.is_some()
    }

    /// The network instance, when one is running.
    pub fn network_core(&self) -> Option<&NetworkCore> {
        self.network.as_ref()
    }

    /// The local `socks` port serving a profile through a node.
    ///
    /// The instance is a singleton: an already-running one is reused, so the
    /// port is stable for as long as the profile's browser runs.
    pub fn ensure_profile(
        &mut self,
        app: &tauri::AppHandle,
        profile_id: &str,
        sub: &StoredSubscription,
        node: &str,
    ) -> Result<u16, String> {
        if let Some(core) = self.profiles.get(profile_id) {
            return Ok(core.speed_port());
        }
        let core = NetworkCore::start_profile(app, profile_id, sub)?;
        core.select_node(node)?;
        let port = core.speed_port();
        self.profiles.insert(profile_id.to_owned(), core);
        Ok(port)
    }

    /// Stops a profile's instance, reporting whether one was running.
    pub fn stop_profile(&mut self, profile_id: &str) -> Result<(), String> {
        if let Some(mut core) = self.profiles.remove(profile_id) {
            core.stop()?;
        }
        Ok(())
    }

    /// Stops every process the manager owns.
    ///
    /// Called when the app exits, so no core outlives it.
    pub fn stop_all(&mut self) {
        self.network = None;
        self.profiles.clear();
    }
}

impl Drop for MihomoManager {
    /// Kills every core the manager still owns.
    ///
    /// The app holds the manager for its whole life, so this is the backstop
    /// that guarantees no proxy core outlives the app — the leak a forgotten
    /// process would be.
    fn drop(&mut self) {
        self.stop_all();
    }
}

/// Spawns the core, with no console window.
fn spawn_core(binary: &Path, dir: &Path, config: &Path) -> Result<Child, String> {
    let mut command = Command::new(binary);
    command
        .arg("-d")
        .arg(dir)
        .arg("-f")
        .arg(config)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: a proxy core has no business flashing a console.
        command.creation_flags(0x0800_0000);
    }
    command
        .spawn()
        .map_err(|error| format!("could not start the proxy core: {error}"))
}

/// The configuration for the Network page's core.
fn network_config(subs: &[StoredSubscription], api_port: u16, secret: &str, speed_port: u16) -> String {
    let mut out = String::new();
    out.push_str("mixed-port: 0\n");
    out.push_str("allow-lan: false\n");
    out.push_str("mode: rule\n");
    out.push_str("log-level: warning\n");
    out.push_str("ipv6: false\n");
    out.push_str(&format!("external-controller: 127.0.0.1:{api_port}\n"));
    out.push_str(&format!("secret: {}\n", quote(secret)));

    // Mihomo refuses an empty provider mapping, and there is nothing to
    // provide when the list is empty, so the whole block is omitted.
    if !subs.is_empty() {
        out.push_str("proxy-providers:\n");
        for sub in subs {
            out.push_str(&format!("  {}:\n", sub.provider_name()));
            out.push_str("    type: http\n");
            out.push_str(&format!("    url: {}\n", quote(&sub.url)));
            out.push_str(&format!("    path: ./providers/{}.yaml\n", sub.id));
            out.push_str("    interval: 0\n");
            out.push_str("    header:\n");
            out.push_str("      User-Agent:\n");
            out.push_str(&format!("        - {}\n", quote(PROVIDER_USER_AGENT)));
        }
    }

    out.push_str("proxy-groups:\n");
    out.push_str(&format!("  - name: {SPEED_GROUP}\n"));
    out.push_str("    type: select\n");
    // `DIRECT` keeps the group non-empty so the listener always has a target,
    // even before any subscription has been added.
    out.push_str("    proxies:\n");
    out.push_str("      - DIRECT\n");
    if !subs.is_empty() {
        out.push_str("    use:\n");
        for sub in subs {
            out.push_str(&format!("      - {}\n", sub.provider_name()));
        }
    }

    out.push_str("listeners:\n");
    out.push_str(&format!("  - name: {SPEED_LISTENER}\n"));
    out.push_str("    type: socks\n");
    out.push_str("    listen: 127.0.0.1\n");
    out.push_str(&format!("    port: {speed_port}\n"));
    out.push_str(&format!("    proxy: {SPEED_GROUP}\n"));

    out.push_str("rules:\n");
    out.push_str(&format!("  - MATCH,{SPEED_GROUP}\n"));
    out
}

/// The configuration for a profile's core: one provider, one `select` group,
/// one `socks` listener.
fn profile_config(sub: &StoredSubscription, api_port: u16, secret: &str, speed_port: u16) -> String {
    let mut out = String::new();
    out.push_str("mixed-port: 0\n");
    out.push_str("allow-lan: false\n");
    out.push_str("mode: rule\n");
    out.push_str("log-level: warning\n");
    out.push_str("ipv6: false\n");
    out.push_str(&format!("external-controller: 127.0.0.1:{api_port}\n"));
    out.push_str(&format!("secret: {}\n", quote(secret)));

    out.push_str("proxy-providers:\n");
    out.push_str(&format!("  {}:\n", sub.provider_name()));
    out.push_str("    type: http\n");
    out.push_str(&format!("    url: {}\n", quote(&sub.url)));
    out.push_str(&format!("    path: ./providers/{}.yaml\n", sub.id));
    out.push_str("    interval: 0\n");
    out.push_str("    header:\n");
    out.push_str("      User-Agent:\n");
    out.push_str(&format!("        - {}\n", quote(PROVIDER_USER_AGENT)));

    out.push_str("proxy-groups:\n");
    out.push_str(&format!("  - name: {PROFILE_GROUP}\n"));
    out.push_str("    type: select\n");
    out.push_str("    proxies:\n");
    out.push_str("      - DIRECT\n");
    out.push_str("    use:\n");
    out.push_str(&format!("      - {}\n", sub.provider_name()));

    out.push_str("listeners:\n");
    out.push_str(&format!("  - name: {PROFILE_LISTENER}\n"));
    out.push_str("    type: socks\n");
    out.push_str("    listen: 127.0.0.1\n");
    out.push_str(&format!("    port: {speed_port}\n"));
    out.push_str(&format!("    proxy: {PROFILE_GROUP}\n"));

    out.push_str("rules:\n");
    out.push_str(&format!("  - MATCH,{PROFILE_GROUP}\n"));
    out
}

/// A YAML double-quoted scalar. Every string that reaches the config is a URL,
/// a secret or a name, and quoting them all sidesteps YAML's many ways of
/// reading a bare scalar as something else.
fn quote(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for character in value.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            other => out.push(other),
        }
    }
    out.push('"');
    out
}

/// The blocking client every controller call uses.
pub fn blocking_client(timeout_secs: u64) -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .unwrap_or_else(|_| reqwest::blocking::Client::new())
}

/// A `GET` against the controller.
fn api_get(
    client: &reqwest::blocking::Client,
    port: u16,
    secret: &str,
    path: &str,
) -> Result<Value, String> {
    let response = client
        .get(format!("http://127.0.0.1:{port}{path}"))
        .header("Authorization", format!("Bearer {secret}"))
        .send()
        .map_err(|error| format!("the proxy core did not answer: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("the proxy core answered {}", response.status()));
    }
    response
        .json::<Value>()
        .map_err(|error| format!("the proxy core sent unreadable json: {error}"))
}

/// A `PUT` against the controller, with an optional JSON body.
fn api_put(
    client: &reqwest::blocking::Client,
    port: u16,
    secret: &str,
    path: &str,
    body: Option<Value>,
) -> Result<(), String> {
    let mut request = client
        .put(format!("http://127.0.0.1:{port}{path}"))
        .header("Authorization", format!("Bearer {secret}"));
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request
        .send()
        .map_err(|error| format!("the proxy core did not answer: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("the proxy core answered {}", response.status()));
    }
    Ok(())
}

/// One node, as the controller reports it.
#[derive(Debug, Clone, serde::Serialize)]
pub struct NodeInfo {
    /// The node's name, unique within its subscription.
    pub name: String,
    /// The protocol the core sees, e.g. `VLESS`.
    pub kind: String,
    /// Whether the node is currently considered alive.
    pub alive: bool,
    /// The last measured delay, when one was recorded.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delay: Option<u32>,
}

/// Lists the nodes a subscription's provider currently holds.
pub fn provider_nodes(
    client: &reqwest::blocking::Client,
    port: u16,
    secret: &str,
    provider: &str,
) -> Result<Vec<NodeInfo>, String> {
    let value = api_get(
        client,
        port,
        secret,
        &format!("/providers/proxies/{}", percent_encode(provider)),
    )?;
    let entries = match value.get("proxies") {
        Some(Value::Array(items)) => items.clone(),
        Some(Value::Object(map)) => map.values().cloned().collect(),
        _ => Vec::new(),
    };
    let mut nodes = Vec::with_capacity(entries.len());
    for entry in entries {
        let name = entry["name"].as_str().unwrap_or_default().to_string();
        if name.is_empty() {
            continue;
        }
        nodes.push(NodeInfo {
            name,
            kind: entry["type"].as_str().unwrap_or("Unknown").to_string(),
            alive: entry["alive"].as_bool().unwrap_or(false),
            delay: latest_delay(&entry),
        });
    }
    Ok(nodes)
}

/// The most recent delay the controller recorded for a node.
fn latest_delay(entry: &Value) -> Option<u32> {
    entry
        .get("history")
        .and_then(Value::as_array)
        .and_then(|history| history.last())
        .and_then(|last| last["delay"].as_u64())
        .and_then(|delay| u32::try_from(delay).ok())
}

/// Forces the core to re-fetch a subscription's provider.
pub fn refresh_provider(
    client: &reqwest::blocking::Client,
    port: u16,
    secret: &str,
    provider: &str,
) -> Result<(), String> {
    api_put(
        client,
        port,
        secret,
        &format!("/providers/proxies/{}", percent_encode(provider)),
        None,
    )
}

/// Measures one node's latency, in milliseconds.
///
/// `None` means the core reached the node but the delay was not a number —
/// which is what a timeout looks like — and an `Err` means the request itself
/// could not be made.
pub fn node_delay(
    client: &reqwest::blocking::Client,
    port: u16,
    secret: &str,
    provider: &str,
    node: &str,
) -> Result<Option<u32>, String> {
    let path = format!(
        "/providers/proxies/{}/{}/healthcheck?url={}&timeout={DELAY_TIMEOUT_MS}",
        percent_encode(provider),
        percent_encode(node),
        percent_encode(DELAY_URL),
    );
    let value = api_get(client, port, secret, &path)?;
    Ok(value["delay"].as_u64().and_then(|delay| u32::try_from(delay).ok()))
}

/// Measures one node's download speed, in megabits per second.
pub fn node_speed(
    client: &reqwest::blocking::Client,
    port: u16,
    secret: &str,
    speed_port: u16,
    node: &str,
) -> Result<f64, String> {
    // Point the speed group at the node under test, then let it settle before
    // the download: the switch is applied asynchronously.
    api_put(
        client,
        port,
        secret,
        &format!("/proxies/{SPEED_GROUP}"),
        Some(json!({ "name": node })),
    )?;
    std::thread::sleep(Duration::from_millis(250));

    let downloader = reqwest::blocking::Client::builder()
        .proxy(
            reqwest::Proxy::all(format!("socks5h://127.0.0.1:{speed_port}"))
                .map_err(|error| format!("could not route through the core: {error}"))?,
        )
        .timeout(Duration::from_secs(SPEED_TIMEOUT_SECS))
        .build()
        .map_err(|error| format!("could not build the speed client: {error}"))?;

    let started = Instant::now();
    let mut response = downloader
        .get(SPEED_URL)
        .send()
        .map_err(|error| format!("the speed test did not connect: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("the speed test answered {}", response.status()));
    }
    let mut sink = std::io::sink();
    let bytes = response
        .copy_to(&mut sink)
        .map_err(|error| format!("the speed test did not finish: {error}"))?;
    let seconds = started.elapsed().as_secs_f64().max(0.001);
    Ok(bytes as f64 * 8.0 / seconds / 1_000_000.0)
}

/// Percent-encodes everything outside the unreserved set, for a path or query
/// segment carrying a node name.
fn percent_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        let unreserved = byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~');
        if unreserved {
            out.push(*byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

/// A free loopback port.
///
/// Bound and dropped rather than held: the port is handed to a child process,
/// and a listener that stayed open would stop the child binding it.
fn free_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("could not find a free port: {error}"))?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| format!("could not read the free port: {error}"))
}

/// A controller secret that is not guessable by another local process.
/// Uses 256 bits (32 bytes) of cryptographically secure random bytes.
fn random_secret() -> String {
    let mut bytes = [0u8; 32];
    if getrandom::getrandom(&mut bytes).is_ok() {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    } else {
        use std::time::{SystemTime, UNIX_EPOCH};
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or(0);
        format!("{nanos:032x}{:08x}", std::process::id())
    }
}

/// Whether a process is still running.
///
/// The browser is spawned detached, so the app holds only its pid; this is how
/// it learns the browser has gone. A pid that has been recycled by another
/// process is the known cost of polling a pid rather than holding the child.
pub fn process_alive(pid: u32) -> bool {
    #[cfg(windows)]
    {
        use std::ffi::c_void;
        type Handle = *mut c_void;
        extern "system" {
            fn OpenProcess(dwdesiredaccess: u32, binherithandle: u32, dwprocessid: u32) -> Handle;
            fn GetExitCodeProcess(hprocess: Handle, lpexitcode: *mut u32) -> i32;
            fn CloseHandle(hobject: Handle) -> i32;
        }
        const PROCESS_QUERY_INFORMATION: u32 = 0x0400;
        const STILL_ACTIVE: u32 = 259;
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_INFORMATION, 0, pid);
            if handle.is_null() {
                return false;
            }
            let mut code: u32 = 0;
            let ok = GetExitCodeProcess(handle, &mut code);
            CloseHandle(handle);
            ok != 0 && code == STILL_ACTIVE
        }
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("kill")
            .arg("-0")
            .arg(pid.to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }
}
