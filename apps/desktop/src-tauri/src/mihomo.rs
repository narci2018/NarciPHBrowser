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
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

use narrc_core::StoredSubscription;

/// The repository the core is downloaded from.
const MIHOMO_REPO: &str = "MetaCubeX/mihomo";

/// The pinned core release.
///
/// Pinned rather than `latest` for the same reason the engine pin is: a fresh
/// install has to get the core this build was tested against, and an update
/// should be a deliberate edit here rather than a surprise on the next
/// install. Re-vendor by confirming the release still carries a
/// `mihomo-windows-amd64` asset, bumping this string, and re-testing a launch.
const MIHOMO_TAG: &str = "v1.19.32";

/// The expected SHA-256 digest of the pinned compatible *Windows* archive.
///
/// Only the Windows install falls back to it: a recorded digest is a claim
/// about one file, and the other platforms' gzip archives hash differently.
/// They verify against the release metadata's digest, and say so when the
/// metadata carries none.
const PINNED_SHA256: &str = "974a4d7ad69aed27aa2e8f91d61113573c14dadb14562c63e58effabf59816f0";

/// The install directory, beside the Camoufox engine.
const CORE_DIR: &str = "mihomo";

/// The controller's `select` group that speed tests run through.
const SPEED_GROUP: &str = "SPEEDTEST";

/// The listener bound to [`SPEED_GROUP`], for downloads.
const SPEED_LISTENER: &str = "speedtest";

/// The controller's `select` group a profile instance routes through.
const PROFILE_GROUP: &str = "SELECTED";

/// The listener bound to [`PROFILE_GROUP`], for a profile's browser.
const PROFILE_LISTENER: &str = "profile-in";

/// The URL a latency check fetches. A `204` endpoint is the convention: small,
/// cacheable and served from anywhere. Plain `http` is deliberate — the check
/// already travels *through* the node, and an inner TLS handshake on top of
/// that path would tax every reading: measured on this machine, the same
/// request through the same node answers in ~1.3 s over http and ~1.9 s over
/// https, and both are equally real requests through the exit.
const DELAY_URL: &str = "http://www.gstatic.com/generate_204";

/// How long a latency check waits, in milliseconds.
///
/// The check is a real request through the node's exit, not a ping, so the
/// window is generous: measurements sit in the low seconds, and the limit
/// exists only to stop a dead node from holding the whole test hostage.
const DELAY_TIMEOUT_MS: u64 = 7000;

/// The file a speed test downloads. Cloudflare's endpoint is generous with
/// bandwidth and reachable from most exits.
const SPEED_URL: &str = "https://speed.cloudflare.com/__down?bytes=5000000";

/// Fallback URL used when the primary speed endpoint is rejected by a node's
/// WebSocket path (some VLESS-WSS nodes only accept traffic addressed to the
/// origin site they were provisioned for). generate_204 always returns 204 so
/// it cannot produce a rate, but it confirms the exit is alive.
const SPEED_FALLBACK_URL: &str = "http://www.gstatic.com/generate_204";

/// How long a speed test may take from request to last byte, in seconds.
///
/// A dead exit never answers the socks connect at all, so without this bound
/// one dead node holds a batch for as long as the client is willing to wait.
/// Ten seconds is a ceiling, not a target: a healthy node finishes well
/// inside it, and a node that cannot finish reports the rate of the bytes
/// that did arrive.
const SPEED_TIMEOUT_SECS: u64 = 10;

/// How long of arriving bytes the rate is measured over, in seconds.
///
/// The rate is bytes over the time they actually took, so a slow-but-live
/// node reports a slow speed instead of failing, and a stalled body ends
/// with the window instead of the whole download.
const SPEED_WINDOW_SECS: u64 = 8;

/// How many times the fallback generate_204 is retried to confirm the exit
/// is reachable when the primary endpoint is rejected.
const SPEED_FALLBACK_PINGS: u32 = 5;

/// How long to wait for the controller to answer after a start.
const READY_TIMEOUT_SECS: u64 = 20;

/// How long a core may take to fetch a subscription before its nodes can be
/// named.
///
/// The controller binds almost at once while the provider fetch — a whole
/// subscription, hundreds of kilobytes — runs behind it, taking seconds. A
/// `select` group lists only `DIRECT` until then, and naming a node before it
/// arrives is refused with `proxy not exist`.
const PROVIDER_TIMEOUT_SECS: u64 = 30;

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
    let binary = dir.join(core_binary_name(core_platform_tokens().0));
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
        .get(format!(
            "https://api.github.com/repos/{MIHOMO_REPO}/releases/tags/{MIHOMO_TAG}"
        ))
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
    // worse failure than one that is a little slower. Windows ships a zip;
    // everywhere else a single-file gzip.
    let (os, arch) = core_platform_tokens();
    let wanted = core_asset_names(tag, os, arch);
    let asset_name = wanted
        .iter()
        .find(|name| assets.iter().any(|asset| asset["name"].as_str() == Some(name.as_str())))
        .ok_or_else(|| format!("no asset for {os} {arch} on the core release {tag}"))?;
    let asset = assets
        .iter()
        .find(|asset| asset["name"].as_str() == Some(asset_name.as_str()))
        .ok_or("the chosen asset vanished from the release")?;
    let url = asset["browser_download_url"]
        .as_str()
        .ok_or_else(|| "the core asset has no download url".to_string())?;
    // The release metadata carries each asset's sha256 digest. A mismatch
    // after download means the file is truncated or tampered with, and it is
    // deleted rather than extracted. A missing digest is not a mismatch — the
    // field is absent when the API changes shape — so it degrades with a
    // warning rather than breaking every future install. The recorded digest
    // below is the Windows zip's, so only that asset falls back to it.
    let expected_digest = asset["digest"]
        .as_str()
        .and_then(|digest| digest.strip_prefix("sha256:"))
        .map(str::to_owned)
        .or_else(|| (os == "windows").then(|| PINNED_SHA256.to_string()));

    std::fs::create_dir_all(&dir).map_err(|error| format!("could not create {}: {error}", dir.display()))?;
    let part_path = dir.join(format!("{asset_name}.part"));
    let archive_path = dir.join(asset_name);
    // The advertised size is what the resumed transfer is measured against:
    // Content-Length of a ranged response only covers the remaining bytes.
    let total = asset["size"].as_u64().unwrap_or(0);

    app.emit(
        "core-download-progress",
        json!({ "phase": format!("Downloading the proxy core {tag}…"), "percent": 10.0 }),
    )
    .map_err(|error| error.to_string())?;

    // A connection does not always survive the transfer, so the bytes stream
    // into a part file and every failed attempt resumes with a Range request
    // instead of restarting from zero.
    let mut last_error = String::new();
    let mut attempt = 0u32;
    loop {
        attempt += 1;
        if attempt > 10 {
            let _ = std::fs::remove_file(&part_path);
            return Err(format!("could not download the core archive: {last_error}"));
        }
        let existing = std::fs::metadata(&part_path).map(|file| file.len()).unwrap_or(0);
        if total > 0 && existing >= total {
            break;
        }
        if attempt > 1 {
            let percent = if total > 0 {
                10.0 + 70.0 * (existing as f64 / total as f64)
            } else {
                10.0
            };
            app.emit(
                "core-download-progress",
                json!({
                    "phase": if existing > 0 {
                        format!("Resuming the core download… {:.0}%", percent)
                    } else {
                        format!("Downloading the proxy core {tag}…")
                    },
                    "percent": percent,
                }),
            )
            .map_err(|error| error.to_string())?;
            std::thread::sleep(Duration::from_secs(3));
        }

        let mut request = client
            .get(url)
            .header("User-Agent", "NarciPHBrowser");
        if existing > 0 {
            request = request.header(reqwest::header::RANGE, format!("bytes={existing}-"));
        }
        let mut response = match request.send() {
            Ok(response) => response,
            Err(error) => {
                last_error = format!("download failed: {error}");
                continue;
            }
        };
        let status = response.status();
        if status.as_u16() == 416 {
            // The part file is not usable as a resume point; start over.
            let _ = std::fs::remove_file(&part_path);
            continue;
        }
        let appending = existing > 0 && status.as_u16() == 206;
        if !appending && !status.is_success() {
            last_error = format!("download returned status {status}");
            continue;
        }
        // A 200 answer to a Range request means the server ignored the range —
        // the file is rewritten rather than appended to, or the copy would be
        // spliced out of two different archives.
        let mut file = match std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(appending)
            .truncate(!appending)
            .open(&part_path)
        {
            Ok(file) => file,
            Err(error) => return Err(format!("could not write {}: {error}", part_path.display())),
        };
        let mut written = if appending { existing } else { 0 };
        let mut last_emit = Instant::now();
        let mut transfer_error = None;
        let mut buffer = [0u8; 64 * 1024];
        loop {
            match response.read(&mut buffer) {
                Ok(0) => break,
                Ok(read) => {
                    if let Err(error) = file.write_all(&buffer[..read]) {
                        transfer_error = Some(format!("could not write the archive: {error}"));
                        break;
                    }
                    written += read as u64;
                    if total > 0 && last_emit.elapsed() >= Duration::from_millis(300) {
                        last_emit = Instant::now();
                        let percent = 10.0 + 70.0 * (written as f64 / total as f64);
                        let _ = app.emit(
                            "core-download-progress",
                            json!({
                                "phase": format!("Downloading the proxy core {tag}…"),
                                "percent": percent,
                            }),
                        );
                    }
                }
                Err(error) => {
                    transfer_error = Some(format!("read failed: {error}"));
                    break;
                }
            }
        }
        drop(file);
        if let Some(error) = transfer_error {
            last_error = error;
            continue;
        }
        let finished = std::fs::metadata(&part_path).map(|file| file.len()).unwrap_or(0);
        if total > 0 && finished < total {
            last_error = format!("download truncated: received {finished} of {total} bytes");
            continue;
        }
        break;
    }

    if let Some(expected) = &expected_digest {
        let actual = sha256_hex(&part_path)?;
        if &actual != expected {
            let _ = std::fs::remove_file(&part_path);
            return Err(format!(
                "the core download failed its checksum (expected sha256 {expected}, got {actual}); it was deleted"
            ));
        }
    }

    if let Err(error) = std::fs::rename(&part_path, &archive_path) {
        let _ = std::fs::remove_file(&part_path);
        return Err(format!("could not finalize archive: {error}"));
    }

    app.emit(
        "core-download-progress",
        json!({ "phase": "Unpacking the proxy core…", "percent": 90.0 }),
    )
    .map_err(|error| error.to_string())?;

    if core_archive_kind(asset_name) == "zip" {
        extract_binary(&archive_path, &binary)?;
    } else {
        gunzip_to(&archive_path, &binary)?;
    }
    #[cfg(unix)]
    mark_executable(&binary);
    let _ = std::fs::remove_file(&archive_path);

    app.emit(
        "core-download-progress",
        json!({ "phase": "The proxy core is ready.", "percent": 100.0 }),
    )
    .map_err(|error| error.to_string())?;

    Ok(CorePaths { dir, binary })
}

/// The OS and architecture tokens the release names this build's asset with.
///
/// `compatible` amd64 assets run on any amd64 CPU and the plain ones need
/// newer instruction sets, so the tokens decide which two assets are tried;
/// the release carries no `compatible` build for arm64, and none is needed.
pub fn core_platform_tokens() -> (&'static str, &'static str) {
    let arch = match std::env::consts::ARCH {
        "aarch64" => "arm64",
        _ => "amd64",
    };
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        "linux" => "linux",
        _ => "windows",
    };
    (os, arch)
}

/// The release assets to try, in order, for a core on this platform.
///
/// Windows ships a zip and everywhere else a single-file gzip, matching what
/// the pinned release actually carries (v1.19.32, verified 2026-10-03):
/// `mihomo-windows-amd64-compatible-v1.19.32.zip`,
/// `mihomo-darwin-amd64-compatible-v1.19.32.gz`,
/// `mihomo-linux-arm64-v1.19.32.gz`, and so on.
pub fn core_asset_names(tag: &str, os: &str, arch: &str) -> Vec<String> {
    if os == "windows" {
        vec![
            format!("mihomo-windows-{arch}-compatible-{tag}.zip"),
            format!("mihomo-windows-{arch}-{tag}.zip"),
        ]
    } else {
        vec![
            format!("mihomo-{os}-{arch}-compatible-{tag}.gz"),
            format!("mihomo-{os}-{arch}-{tag}.gz"),
        ]
    }
}

/// The file name the installed core answers to, per platform.
pub fn core_binary_name(os: &str) -> &'static str {
    if os == "windows" {
        "mihomo.exe"
    } else {
        "mihomo"
    }
}

/// What unpacking the named archive needs: a zip to walk, or a gzip to expand.
pub fn core_archive_kind(asset_name: &str) -> &'static str {
    if asset_name.ends_with(".zip") {
        "zip"
    } else {
        "gz"
    }
}

/// Where the installed core lives, for anything that checks rather than installs.
pub fn core_binary_path() -> PathBuf {
    let (os, _) = core_platform_tokens();
    match dirs_next::home_dir() {
        Some(home) => home.join(CORE_DIR).join(core_binary_name(os)),
        None => PathBuf::from(CORE_DIR).join(core_binary_name(os)),
    }
}

/// Expands a single-file gzip archive into the binary.
fn gunzip_to(archive_path: &Path, binary: &Path) -> Result<(), String> {
    use flate2::read::GzDecoder;

    let archive = std::fs::File::open(archive_path)
        .map_err(|error| format!("could not open {}: {error}", archive_path.display()))?;
    let mut decoder = GzDecoder::new(archive);
    let mut out = std::fs::File::create(binary)
        .map_err(|error| format!("could not write {}: {error}", binary.display()))?;
    std::io::copy(&mut decoder, &mut out)
        .map_err(|error| format!("could not extract the core: {error}"))?;
    Ok(())
}

/// Makes an extracted core runnable; zip and gzip both carry no mode bits.
#[cfg(unix)]
fn mark_executable(path: &Path) {
    use std::os::unix::fs::PermissionsExt;

    if let Ok(metadata) = std::fs::metadata(path) {
        let mut permissions = metadata.permissions();
        permissions.set_mode(permissions.mode() | 0o755);
        let _ = std::fs::set_permissions(path, permissions);
    }
}

/// The lowercase hex sha256 of a file, for the download checksum.
fn sha256_hex(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};

    let mut file = std::fs::File::open(path)
        .map_err(|error| format!("could not open {}: {error}", path.display()))?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher)
        .map_err(|error| format!("could not read {}: {error}", path.display()))?;
    Ok(format!("{:x}", hasher.finalize()))
}

/// Pulls the first `.exe` out of a zip archive.
fn extract_binary(archive_path: &Path, binary: &Path) -> Result<(), String> {    let file = std::fs::File::open(archive_path)
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
        seed_profile_provider(sub, &dir)?;
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
    ///
    /// The core binds its controller before it has fetched the subscription,
    /// so a node named inside that window is refused: the group still holds
    /// only `DIRECT`. The fetch is what takes seconds, so the group is watched
    /// until the subscription's nodes arrive and only then is the node
    /// selected — otherwise every launch would lose the race the same way.
    pub fn select_node(&self, node: &str) -> Result<(), String> {
        let client = blocking_client(10);
        let group = format!("/proxies/{PROFILE_GROUP}");
        let deadline = Instant::now() + Duration::from_secs(PROVIDER_TIMEOUT_SECS);
        loop {
            if group_carries_nodes(&api_get(&client, self.api_port, &self.secret, &group)?) {
                break;
            }
            if Instant::now() >= deadline {
                return Err(format!(
                    "the nodes of this subscription did not arrive within {PROVIDER_TIMEOUT_SECS} seconds"
                ));
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        api_put(
            &client,
            self.api_port,
            &self.secret,
            &group,
            Some(json!({ "name": node })),
        )
        .map_err(|error| {
            format!(
                "the node {node:?} could not be selected: {error}; the node's name embeds a \
                 latency the subscription re-measures, so pick the node again on the profile"
            )
        })
    }

    /// Asks the node itself whether it still answers.
    ///
    /// A node's *name* staying in the group says nothing about the node: a
    /// subscription's server can go quiet while the name remains selectable,
    /// and the core then accepts the browser's traffic and drops it on the far
    /// side. The user's first sign of that is a browser with no connection at
    /// all, so the launch measures the node here — with the same call the
    /// profile's latency test uses — and refuses with a reason when it cannot
    /// answer, instead of opening a browser that will not load a page.
    pub fn check_node(&self, provider: &str, node: &str) -> Result<(), String> {
        let client = blocking_client(DELAY_TIMEOUT_MS / 1000 + 5);
        node_verdict(
            node,
            node_delay(&client, self.api_port, &self.secret, provider, node),
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
        let provider = sub.provider_name();
        if let Some(core) = self.profiles.get(profile_id) {
            // Measured before the selection moves: this instance may be serving
            // a browser this launch does not own, and a node that turns out to
            // be dead must not have repointed the traffic already flowing.
            core.check_node(&provider, node)?;
            core.select_node(node)?;
            return Ok(core.speed_port());
        }
        let core = NetworkCore::start_profile(app, profile_id, sub)?;
        core.select_node(node)?;
        // Selecting proves the name is in the group; only this proves the node
        // behind it answers. Refused here the instance is dropped — and its
        // process with it — so a dead route costs a reason, never a browser
        // that silently cannot reach anything.
        core.check_node(&provider, node)?;
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

/// Deletes a subscription's cached provider files.
///
/// The core fetched the subscription into these YAML files — credentials
/// included — and nothing else removes them: a deleted subscription must not
/// leave its node list, and its bearer token, readable under the core's
/// directory. Best effort, because the cache is a derived artifact.
pub fn purge_provider_cache(subscription_id: &str) {
    let Some(home) = dirs_next::home_dir() else {
        return;
    };
    let core = home.join(CORE_DIR);
    let _ = std::fs::remove_file(
        core.join("network")
            .join("providers")
            .join(format!("{subscription_id}.yaml")),
    );
    let Ok(entries) = std::fs::read_dir(core.join("profiles")) else {
        return;
    };
    for entry in entries.flatten() {
        let _ = std::fs::remove_file(
            entry
                .path()
                .join("providers")
                .join(format!("{subscription_id}.yaml")),
        );
    }
}

/// Seeds a profile core's provider from the network core's cached copy of the
/// subscription.
///
/// The subscription's node names embed the latency the provider measured when
/// it generated them, and a profile core whose provider file is missing
/// fetches its own — a newer download with newer names. A route stored against
/// one download can then name no node in the next. Mihomo reuses a provider
/// file that is already on disk instead of re-fetching it (verified: starting
/// a core beside a seated file of any age does not rewrite it), and the
/// picker's names come from the network core's cache. Copying that cache into
/// the profile's directory pins the launched group to the very nodes people
/// pick from.
fn seed_profile_provider(sub: &StoredSubscription, dir: &Path) -> Result<(), String> {
    let Some(home) = dirs_next::home_dir() else {
        return Ok(());
    };
    let file = format!("{}.yaml", sub.id);
    let source = home
        .join(CORE_DIR)
        .join("network")
        .join("providers")
        .join(&file);
    if !source.is_file() {
        return Ok(());
    }
    let target = dir.join("providers").join(&file);
    let source_modified = source.metadata().and_then(|meta| meta.modified()).ok();
    let target_modified = target.metadata().and_then(|meta| meta.modified()).ok();
    match (source_modified, target_modified) {
        // The profile already carries its own, at least as fresh, download.
        // That download is the one its route was picked from, so keep it.
        (Some(source), Some(target)) if source <= target => return Ok(()),
        _ => {}
    }
    let providers = target
        .parent()
        .expect("a file path always names its directory");
    std::fs::create_dir_all(providers)
        .map_err(|error| format!("could not create {}: {error}", providers.display()))?;
    std::fs::copy(&source, &target)
        .map_err(|error| format!("could not seed {}: {error}", target.display()))?;
    Ok(())
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

/// The core's own resolver configuration.
///
/// Subscriptions routinely ship nodes with ECH enabled (`ech-opts`), and
/// mihomo bootstraps ECH by resolving the query server's HTTPS (type 65) DNS
/// record. Whatever resolver the OS hands it may not answer type 65 — Chinese
/// ISP resolvers return an empty answer — and mihomo then aborts the dial
/// outright instead of falling back to plain TLS, failing every node in the
/// subscription. These public resolvers do answer type 65, so the dials the
/// nodes were built for actually happen.
const DNS_BLOCK: &str = "dns:\n  enable: true\n  ipv6: false\n  nameserver:\n    - 223.5.5.5\n    - 119.29.29.29\n";

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
    out.push_str(DNS_BLOCK);

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

    // A latency group per subscription: a batch must measure the dialog's own
    // nodes and nothing else. The shared group above spans every
    // subscription, and testing it would race hundreds of unrelated dials and
    // DNS lookups against the same reading — inflated numbers, and live nodes
    // pushed past the timeout.
    for sub in subs {
        out.push_str(&format!("  - name: {}\n", sub.node_group_name()));
        out.push_str("    type: select\n");
        out.push_str("    proxies:\n");
        out.push_str("      - DIRECT\n");
        out.push_str("    use:\n");
        out.push_str(&format!("      - {}\n", sub.provider_name()));
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
    out.push_str(DNS_BLOCK);

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

/// Whether a `select` group lists anything beyond `DIRECT`, which is how a
/// group whose subscription has not been fetched yet looks.
fn group_carries_nodes(group: &Value) -> bool {
    match group.get("all") {
        Some(Value::Array(all)) => all.len() > 1,
        _ => false,
    }
}

/// A non-success answer from the controller, carrying the reason.
///
/// The body is where the core says what went wrong — `proxy not exist`, for
/// one — and a bare status would hand the user a number they cannot act on.
fn core_answered(status: reqwest::StatusCode, body: String) -> String {
    let body: String = body.trim().chars().take(200).collect();
    if body.is_empty() {
        format!("the proxy core answered {status}")
    } else {
        format!("the proxy core answered {status}: {body}")
    }
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
    let status = response.status();
    if !status.is_success() {
        return Err(core_answered(status, response.text().unwrap_or_default()));
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
    let status = response.status();
    if !status.is_success() {
        return Err(core_answered(status, response.text().unwrap_or_default()));
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
/// `None` means the core reached the node but the answer did not arrive
/// within the window — the core says so with a `504` and no delay at all,
/// which is a failed *measurement*, not a failed call — and an `Err` means
/// the request itself could not be made, or the core refused it for any
/// other reason.
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
    let response = client
        .get(format!("http://127.0.0.1:{port}{path}"))
        .header("Authorization", format!("Bearer {secret}"))
        .send()
        .map_err(|error| format!("the proxy core did not answer: {error}"))?;
    let status = response.status();
    if status == reqwest::StatusCode::GATEWAY_TIMEOUT {
        return Ok(None);
    }
    if !status.is_success() {
        return Err(core_answered(status, response.text().unwrap_or_default()));
    }
    let value = response
        .json::<Value>()
        .map_err(|error| format!("the proxy core sent unreadable json: {error}"))?;
    Ok(value["delay"]
        .as_u64()
        .and_then(|delay| u32::try_from(delay).ok()))
}

/// What a node's measured answer means for a launch about to route through it.
///
/// The core answers a node that timed out with no `delay` field at all — the
/// `None` [`node_delay`] reads — and a request it cannot serve as an `Err`.
/// Neither is a node a browser can browse through, so both are refused with the
/// node named, which is the part the user needs to go and replace.
fn node_verdict(node: &str, delay: Result<Option<u32>, String>) -> Result<(), String> {
    match delay {
        Ok(Some(measured)) if measured > 0 => Ok(()),
        Ok(_) => Err(format!(
            "the node {node:?} did not answer within {DELAY_TIMEOUT_MS} ms, so the browser \
             would open with no connection; pick a live node on the profile (edit it and run \
             a latency test)"
        )),
        Err(error) => Err(format!("the node {node:?} could not be measured: {error}")),
    }
}

/// Reads the group batch answer: node name to milliseconds, keeping only the
/// entries the core measured — a failed node is simply absent.
fn parse_group_delays(value: Value) -> HashMap<String, u32> {
    value
        .as_object()
        .into_iter()
        .flatten()
        .filter_map(|(name, delay)| {
            let delay = delay.as_u64().and_then(|delay| u32::try_from(delay).ok())?;
            Some((name.clone(), delay))
        })
        .collect()
}

/// Measures every node of one group in one request, name to milliseconds.
///
/// The core runs the whole membership's tests concurrently, so a full
/// subscription answers within a single timeout window — the same batch run
/// as per-node healthchecks takes nodes ÷ concurrency × timeout. A node whose
/// test failed is simply absent from the answer.
///
/// The group is the caller's to scope: a group spanning every subscription
/// would measure them all at once, and that contention would show up in the
/// numbers rather than in any visible error.
pub fn group_delay(
    client: &reqwest::blocking::Client,
    port: u16,
    secret: &str,
    group: &str,
) -> Result<HashMap<String, u32>, String> {
    let path = format!(
        "/group/{}/delay?url={}&timeout={DELAY_TIMEOUT_MS}",
        percent_encode(group),
        percent_encode(DELAY_URL),
    );
    let value = api_get(client, port, secret, &path)?;
    Ok(parse_group_delays(value))
}

/// Measures one node's download speed, in megabits per second.
///
/// Returns `Ok(None)` when the primary endpoint is reachable but returns no
/// body (the exit is alive but bandwidth cannot be measured through it — this
/// happens with VLESS-WSS nodes whose websocket path only accepts the origin
/// site's traffic). The caller should treat `None` as "limited" rather than
/// "failed".
pub fn node_speed(
    client: &reqwest::blocking::Client,
    port: u16,
    secret: &str,
    speed_port: u16,
    node: &str,
) -> Result<Option<f64>, String> {
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

    let mut response = downloader
        .get(SPEED_URL)
        .send()
        .map_err(|error| format!("the speed test did not connect: {error}"))?;
    if !response.status().is_success() {
        // The primary endpoint was rejected (common with VLESS-WSS nodes whose
        // websocket path only accepts the origin site). Fall back to pinging
        // gstatic to confirm the exit is alive but bandwidth is unmeasurable.
        return Ok(check_fallback(client, port, secret, speed_port, node)?);
    }

    let mut buffer = vec![0u8; 16 * 1024];
    let mut bytes: u64 = 0;
    let mut reading: Option<Instant> = None;
    loop {
        if let Some(start) = reading {
            if start.elapsed() >= Duration::from_secs(SPEED_WINDOW_SECS) {
                break;
            }
        }
        match std::io::Read::read(&mut response, &mut buffer) {
            Ok(0) => break,
            Ok(got) => {
                if reading.is_none() {
                    reading = Some(Instant::now());
                }
                bytes += got as u64;
            }
            // The bound cut the body short: the bytes that arrived already
            // tell the truth about this exit's rate.
            Err(_) if reading.is_some() => break,
            Err(error) => return Err(format!("the speed test did not finish: {error}")),
        }
    }
    let start = match reading {
        Some(start) => start,
        None => return Ok(None), // 204 or similar: alive but no body to measure
    };
    let seconds = start.elapsed().as_secs_f64().max(0.1);
    Ok(Some(bytes as f64 * 8.0 / seconds / 1_000_000.0))
}

fn check_fallback(
    client: &reqwest::blocking::Client,
    port: u16,
    secret: &str,
    speed_port: u16,
    node: &str,
) -> Result<Option<f64>, String> {
    // Repoint the group again: the previous PUT may have been consumed by the
    // failed request, and some nodes need a fresh select to clear state.
    api_put(
        client,
        port,
        secret,
        &format!("/proxies/{SPEED_GROUP}"),
        Some(json!({ "name": node })),
    )?;
    std::thread::sleep(Duration::from_millis(200));

    let downloader = reqwest::blocking::Client::builder()
        .proxy(
            reqwest::Proxy::all(format!("socks5h://127.0.0.1:{speed_port}"))
                .map_err(|error| format!("could not route through the core: {error}"))?,
        )
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|error| format!("could not build the fallback client: {error}"))?;

    for _ in 0..SPEED_FALLBACK_PINGS {
        match downloader.get(SPEED_FALLBACK_URL).send() {
            Ok(resp) if resp.status().is_success() => return Ok(None),
            _ => {}
        }
    }
    Err("the speed test could not reach the fallback endpoint".to_owned())
}

/// What an echo service reported about an exit.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Echo {
    /// The exit IP the service saw.
    pub ip: String,
    /// The two-letter country that IP sits in, when reported.
    pub country: Option<String>,
    /// The city, when reported.
    pub city: Option<String>,
}

/// Echo services asked, in order, for the IP they saw.
///
/// Several because any one of them rate-limits, blocks a datacentre range or
/// is down; the check passes when any answers. Every request goes *through*
/// the proxy, so these see the exit address and nothing about this machine.
pub const ECHO_ENDPOINTS: &[&str] = &[
    "https://ipinfo.io/json",
    "https://ifconfig.co/json",
    "https://api.ipify.org?format=json",
    "https://checkip.amazonaws.com",
    "https://icanhazip.com",
];

/// Reads one endpoint's answer: JSON first, a bare IP second.
pub fn parse_echo(endpoint: &str, body: &str) -> Result<Echo, String> {
    let body = body.trim();
    if let Ok(value) = serde_json::from_str::<Value>(body) {
        let ip = value
            .get("ip")
            .and_then(Value::as_str)
            .filter(|ip| !ip.is_empty())
            .ok_or_else(|| format!("{endpoint} reported no IP"))?;
        return Ok(Echo {
            ip: ip.to_owned(),
            country: text_field(&value, "country"),
            city: text_field(&value, "city"),
        });
    }
    // The plain-text endpoints answer with the IP and nothing else.
    if body.parse::<std::net::IpAddr>().is_ok() {
        return Ok(Echo {
            ip: body.to_owned(),
            country: None,
            city: None,
        });
    }
    Err(format!("{endpoint} replied with something that is not an IP"))
}

/// A non-empty string field of an echo response.
fn text_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}

/// Which country a node's traffic really exits from.
///
/// The node is selected into the shared speed group, then one echo endpoint
/// after another is fetched *through* the core's listener, so the answer is
/// the exit the browser would actually use. The caller must hold the speed
/// lock: the selection is group state two concurrent tests would fight over.
pub fn node_exit(
    client: &reqwest::blocking::Client,
    port: u16,
    secret: &str,
    speed_port: u16,
    node: &str,
) -> Result<Echo, String> {
    api_put(
        client,
        port,
        secret,
        &format!("/proxies/{SPEED_GROUP}"),
        Some(json!({ "name": node })),
    )?;
    // The switch is applied asynchronously; let it settle before trusting
    // where the route goes.
    std::thread::sleep(Duration::from_millis(250));

    let routed = reqwest::blocking::Client::builder()
        .proxy(
            reqwest::Proxy::all(format!("socks5h://127.0.0.1:{speed_port}"))
                .map_err(|error| format!("could not route through the core: {error}"))?,
        )
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(12))
        .user_agent("NarciPHBrowser")
        .build()
        .map_err(|error| format!("could not build the exit client: {error}"))?;

    let mut last = "no echo service answered".to_string();
    for endpoint in ECHO_ENDPOINTS {
        match routed
            .get(*endpoint)
            .send()
            .map_err(|error| error.to_string())
            .and_then(|response| {
                let status = response.status();
                if !status.is_success() {
                    return Err(format!("{endpoint} returned status {status}"));
                }
                response
                    .text()
                    .map_err(|error| format!("{endpoint} was unreadable: {error}"))
            })
            .and_then(|body| parse_echo(endpoint, &body))
        {
            Ok(echo) => return Ok(echo),
            Err(error) => last = error,
        }
    }
    Err(last)
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
        // The OS RNG has never failed in practice; if it ever does, say so
        // loudly rather than quietly falling back to a guessable secret.
        eprintln!("warning: the system random source failed; the proxy core secret fell back to a low-entropy value");
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

/// The moment `pid` started, as the platform's raw timestamp, when it is running.
///
/// A pid that has exited can be recycled by the OS for an unrelated process;
/// a poll that only asks "is this pid alive" would then wait on a stranger
/// forever, and the profile's proxy core would never be reaped. The creation
/// time pins the poll to one incarnation of the pid.
#[cfg(windows)]
pub fn process_started_at(pid: u32) -> Option<u64> {
    use std::ffi::c_void;
    type Handle = *mut c_void;
    extern "system" {
        fn OpenProcess(dwdesiredaccess: u32, binherithandle: u32, dwprocessid: u32) -> Handle;
        fn GetProcessTimes(
            hprocess: Handle,
            lpcreationfiletime: *mut u64,
            lpexitfiletime: *mut u64,
            lpkernelfiletime: *mut u64,
            lpusertime: *mut u64,
        ) -> i32;
        fn CloseHandle(hobject: Handle) -> i32;
    }
    const PROCESS_QUERY_INFORMATION: u32 = 0x0400;
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_INFORMATION, 0, pid);
        if handle.is_null() {
            return None;
        }
        let (mut creation, mut exit, mut kernel, mut user) = (0u64, 0u64, 0u64, 0u64);
        let ok = GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user);
        CloseHandle(handle);
        (ok != 0).then_some(creation)
    }
}

/// Where a poll starts: [`Self::process_started_at`] on Windows, `None` where
/// the platform offers no cheap answer (and the poll keeps the old behaviour).
#[cfg(not(windows))]
pub fn process_started_at(_pid: u32) -> Option<u64> {
    None
}

/// Whether the poll's pid is still *this* launch's browser: alive, and the
/// same incarnation of the pid that was there when the poll began. When the
/// creation time cannot be read on either side, this degrades to plain
/// aliveness rather than guessing at a mismatch.
pub fn process_alive_with(pid: u32, started_at: Option<u64>) -> bool {
    if !process_alive(pid) {
        return false;
    }
    match (process_started_at(pid), started_at) {
        (Some(now), Some(started)) => now == started,
        _ => true,
    }
}

#[cfg(test)]
mod tests {
    //! Tests for the generated configuration, the one place a hostile or
    //! merely odd subscription URL could break out of its YAML scalar and
    //! rewrite the core's behaviour.

    use super::*;

    fn subscription(id: &str, url: &str) -> StoredSubscription {
        StoredSubscription {
            id: id.to_owned(),
            name: "Test".to_owned(),
            url: url.to_owned(),
            updated_at: None,
            delays: None,
        }
    }

    #[test]
    fn the_network_config_locks_the_controller_to_the_loopback() {
        let config = network_config(
            &[subscription("abc123", "https://example.example/sub")],
            19090,
            "s3cret",
            19091,
        );
        assert!(config.contains("external-controller: 127.0.0.1:19090"));
        assert!(config.contains("secret: \"s3cret\""));
        assert!(config.contains("allow-lan: false"));
        assert!(config.contains("listen: 127.0.0.1"));
    }

    #[test]
    fn a_subscription_url_is_a_quoted_scalar_no_matter_what_it_carries() {
        let hostile = "https://host/token?x=\"quoted\"\\back\nnewline\ttab";
        let config = network_config(&[subscription("abc123", hostile)], 19090, "s", 19091);
        for line in config.lines() {
            assert!(
                !line.contains("\"quoted\"\\back"),
                "the raw hostile URL reached a config line: {line}"
            );
        }
        // Everything hostile survives as an escaped *character* inside one
        // double-quoted scalar: the quote, the backslash, the newline, the tab.
        assert!(config.contains("url: \"https://host/token?x=\\\"quoted\\\"\\\\back\\nnewline\\ttab\""));
    }

    #[test]
    fn the_secret_is_never_a_bare_yaml_scalar() {
        let config = network_config(&[], 19090, "1: padding matters", 19091);
        assert!(config.contains("secret: \"1: padding matters\""));
    }

    #[test]
    fn an_empty_list_still_yields_a_non_empty_select_group() {
        let config = network_config(&[], 19090, "s", 19091);
        assert!(!config.contains("proxy-providers"));
        assert!(config.contains("- DIRECT"));
        assert!(config.contains("MATCH,SPEEDTEST"));
    }

    /// The block of config lines belonging to one named group.
    fn group_block<'a>(config: &'a str, group: &str) -> &'a str {
        let start = config
            .find(&format!("- name: {group}\n"))
            .unwrap_or_else(|| panic!("no group named {group} in the config"));
        let next = config[start + 1..]
            .find("\n  - name:")
            .map(|offset| start + 1 + offset)
            .unwrap_or(config.len());
        &config[start..next]
    }

    #[test]
    fn each_subscription_gets_a_latency_group_of_its_own() {
        let config = network_config(
            &[
                subscription("fs", "https://a.example/sub"),
                subscription("ilyou", "https://b.example/sub"),
            ],
            19090,
            "s",
            19091,
        );

        let fs = group_block(&config, "nodes-fs");
        assert!(fs.contains("- sub-fs"), "{fs}");
        assert!(!fs.contains("- sub-ilyou"), "{fs}");

        let ilyou = group_block(&config, "nodes-ilyou");
        assert!(ilyou.contains("- sub-ilyou"), "{ilyou}");
        assert!(!ilyou.contains("- sub-fs"), "{ilyou}");

        // The shared speed group still spans everything, so speed tests and
        // exit checks keep their reach.
        let speed = group_block(&config, "SPEEDTEST");
        assert!(speed.contains("- sub-fs"), "{speed}");
        assert!(speed.contains("- sub-ilyou"), "{speed}");
    }

    #[test]
    fn a_profile_config_routes_through_its_own_group_and_listener() {
        let config = profile_config(
            &subscription("abc123", "https://example.example/sub"),
            19090,
            "s3cret",
            19091,
        );
        assert!(config.contains("SELECTED"));
        assert!(config.contains("proxy: SELECTED"));
        assert!(config.contains("port: 19091"));
        assert!(config.contains("MATCH,SELECTED"));
        assert!(!config.contains("SPEEDTEST"));
    }

    #[test]
    fn the_core_gets_resolvers_that_answer_https_records() {
        // Without this block the core falls back to the OS resolver, and a
        // resolver that stays silent on type 65 kills every ECH-enabled dial.
        let network = network_config(&[], 19090, "s", 19091);
        assert!(network.contains("dns:"));
        assert!(network.contains("- 223.5.5.5"));
        assert!(network.contains("- 119.29.29.29"));
        let profile = profile_config(
            &subscription("abc123", "https://example.example/sub"),
            19090,
            "s3cret",
            19091,
        );
        assert!(profile.contains("dns:"));
        assert!(profile.contains("- 223.5.5.5"));
        assert!(profile.contains("- 119.29.29.29"));
    }

    #[test]
    fn a_group_delay_answer_keeps_only_measured_nodes() {
        let parsed = parse_group_delays(json!({
            "fast": 120,
            "broken": "an error message",
            "zero": 0,
            "DIRECT": 55,
        }));
        assert_eq!(parsed.get("fast"), Some(&120));
        assert_eq!(parsed.get("zero"), Some(&0));
        assert!(!parsed.contains_key("broken"));
        // The caller matches names against its own node list, so the group's
        // DIRECT entry passes through harmlessly.
        assert_eq!(parsed.get("DIRECT"), Some(&55));
    }

    #[test]
    fn the_provider_name_cannot_collide_with_a_node_or_group() {
        let sub = subscription("abc123", "https://example.example/sub");
        assert_eq!(sub.provider_name(), "sub-abc123");
    }

    #[test]
    fn percent_encoding_covers_everything_unreserved() {
        assert_eq!(percent_encode("aB3-_.~"), "aB3-_.~");
        assert_eq!(percent_encode("a b/c?d"), "a%20b%2Fc%3Fd");
        assert_eq!(percent_encode("香港"), "%E9%A6%99%E6%B8%AF");
    }

    #[test]
    fn an_echo_answer_reads_as_json_first_and_a_bare_ip_second() {
        let json = parse_echo(
            "https://ipinfo.io/json",
            r#"{"ip":"203.0.113.9","country":"DE","city":"Berlin"}"#,
        )
        .unwrap();
        assert_eq!(json.ip, "203.0.113.9");
        assert_eq!(json.country.as_deref(), Some("DE"));
        assert_eq!(json.city.as_deref(), Some("Berlin"));

        let bare = parse_echo("https://icanhazip.com", "203.0.113.9\n").unwrap();
        assert_eq!(bare.ip, "203.0.113.9");
        assert_eq!(bare.country, None);

        assert!(parse_echo("https://example.example", "<html>nope</html>").is_err());
        // JSON that carries no IP is an error naming the endpoint, not a panic.
        assert!(parse_echo("https://example.example", "{}").is_err());
    }

    #[test]
    fn the_asset_names_match_what_the_pinned_release_carries() {
        // Real names from v1.19.32 (verified against the GitHub release,
        // 2026-10-03): windows zips, and single-file gzips everywhere else.
        assert_eq!(
            core_asset_names("v1.19.32", "windows", "amd64"),
            vec![
                "mihomo-windows-amd64-compatible-v1.19.32.zip".to_owned(),
                "mihomo-windows-amd64-v1.19.32.zip".to_owned(),
            ]
        );
        assert_eq!(
            core_asset_names("v1.19.32", "darwin", "amd64"),
            vec![
                "mihomo-darwin-amd64-compatible-v1.19.32.gz".to_owned(),
                "mihomo-darwin-amd64-v1.19.32.gz".to_owned(),
            ]
        );
        assert_eq!(
            core_asset_names("v1.19.32", "linux", "arm64"),
            vec![
                // arm64 ships no `compatible` build; the plain name matches.
                "mihomo-linux-arm64-compatible-v1.19.32.gz".to_owned(),
                "mihomo-linux-arm64-v1.19.32.gz".to_owned(),
            ]
        );
    }

    #[test]
    fn the_archive_kind_decides_how_unpacking_reads_it() {
        assert_eq!(core_archive_kind("mihomo-windows-amd64-compatible-v1.19.32.zip"), "zip");
        assert_eq!(core_archive_kind("mihomo-linux-amd64-v1.19.32.gz"), "gz");
    }

    #[test]
    fn a_gzip_archive_expands_back_to_its_bytes() {
        use flate2::write::GzEncoder;
        use std::io::Write;

        let dir = std::env::temp_dir().join(format!("narci-gz-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let original: Vec<u8> = (0..10_000u32).map(|i| (i % 251) as u8).collect();
        let archive_path = dir.join("core.gz");
        let binary_path = dir.join("mihomo");

        let mut encoder = GzEncoder::new(
            std::fs::File::create(&archive_path).unwrap(),
            flate2::Compression::default(),
        );
        encoder.write_all(&original).unwrap();
        encoder.finish().unwrap();

        gunzip_to(&archive_path, &binary_path).unwrap();
        assert_eq!(std::fs::read(&binary_path).unwrap(), original);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_group_still_without_its_subscription_reads_as_not_ready() {
        // Before the provider fetch lands, the core exposes the group with
        // only DIRECT in it — and naming a node then is refused. This is the
        // signal select_node waits on.
        assert!(!group_carries_nodes(&json!({
            "all": ["DIRECT"],
            "now": "DIRECT"
        })));
        assert!(group_carries_nodes(&json!({
            "all": ["DIRECT", "[US 美国 302.39ms]"],
            "now": "DIRECT"
        })));
        // Anything that is not the group shape we expect reads as not ready
        // rather than as an answer we could act on.
        assert!(!group_carries_nodes(&json!({})));
        assert!(!group_carries_nodes(&json!({ "all": "DIRECT" })));
    }

    #[test]
    fn a_refusal_from_the_core_carries_the_reason_it_gave() {
        let status = reqwest::StatusCode::BAD_REQUEST;
        let text = core_answered(
            status,
            "{\"message\":\"Selector update error: proxy not exist\"}\n".to_owned(),
        );
        assert!(text.contains("400 Bad Request"), "{text}");
        assert!(text.contains("proxy not exist"), "{text}");

        // A refusal with an empty body still names the status.
        assert_eq!(
            core_answered(status, String::new()),
            "the proxy core answered 400 Bad Request"
        );

        // A chatty refusal is cut short instead of dumped whole.
        let text = core_answered(status, "x".repeat(5_000));
        assert!(text.len() < 300, "the body was not truncated: {}", text.len());
    }

    #[test]
    fn a_node_that_does_not_answer_is_refused_with_the_node_named() {
        // The shape a timed-out node comes back in: no delay field at all. The
        // launch is stopped rather than handed a browser with no connection,
        // and the refusal names the node to go and replace.
        let refused = node_verdict("[US 美国 299.17ms]", Ok(None)).unwrap_err();
        assert!(refused.contains("299.17ms"), "{refused}");
        assert!(refused.contains("no connection"), "{refused}");

        // A measured answer lets the launch through…
        assert!(node_verdict("[US 美国 302.39ms]", Ok(Some(563))).is_ok());
        // …a zero, which reads as unmeasured everywhere else, does not…
        assert!(node_verdict("[US 美国 302.39ms]", Ok(Some(0))).is_err());
        // …and neither does a request the core would not serve at all.
        assert!(
            node_verdict("[US 美国 302.39ms]", Err("500 Internal Server Error".to_owned())).is_err()
        );
    }
}

#[cfg(test)]
mod process_tests {
    //! Tests for the pid-poll helpers. Recycling itself cannot be forced in a
    //! test, but the pieces the fix relies on can: reading a start time, and
    //! treating an exited process as gone.

    use super::*;
    use std::time::Duration;

    #[test]
    fn the_current_process_has_a_start_time_and_stays_alive() {
        let pid = std::process::id();
        let started = process_started_at(pid);
        assert!(started.is_some(), "the process's own start time is readable");
        assert!(process_alive_with(pid, started));
    }

    #[test]
    fn a_recycled_looking_pid_is_recognised_as_a_stranger() {
        // The poll's guard is an equality between the incarnation it captured
        // and the one it sees now. Simulate the mismatch directly: a different
        // "creation time" on a live pid must read as not-our-process, which is
        // exactly what a recycled pid is.
        let pid = std::process::id();
        let impostor = process_started_at(pid).map(|t| t.wrapping_add(1));
        assert!(!process_alive_with(pid, impostor));
    }

    #[test]
    fn an_exited_process_is_not_alive() {
        let mut child = std::process::Command::new("cmd")
            .args(["/C", "exit"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("a child to exit");
        let pid = child.id();
        let started = process_started_at(pid);
        child.wait().expect("wait for the exit");
        // The exit can take a moment to become visible to OpenProcess.
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if !process_alive_with(pid, started) {
                return;
            }
            assert!(Instant::now() < deadline, "the exited child still polls alive");
            std::thread::sleep(Duration::from_millis(25));
        }
    }

    #[test]
    fn an_unreadable_start_time_degrades_to_plain_aliveness() {
        let pid = std::process::id();
        assert!(process_alive_with(pid, None));
    }
}
