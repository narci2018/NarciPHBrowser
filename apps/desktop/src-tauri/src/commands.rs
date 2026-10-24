use narrc_core::profile::ProfileStore;
use narrc_core::ProxyConfig;
use narrc_sidecar::protocol;
use narrc_sidecar::store_path;
use std::collections::BTreeMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};

use crate::state::AppState;

/// The GitHub repository for Camoufox releases.
const CAMOUFOX_REPO: &str = "daijro/camoufox";

/// How many automation sessions may run at once.
///
/// Each is a browser plus a Node server that live until someone stops them,
/// so the ceiling exists to keep "I forgot it running" from becoming forty
/// forgotten browsers.
const MAX_AUTOMATION_SESSIONS: usize = 8;

const CHROME_SKIN: &str = include_str!("../chrome-skin.css");

fn apply_chrome_skin(install_dir: &Path) -> Result<(), String> {
    let path = install_dir.join("chrome.css");
    if std::fs::read_to_string(&path).is_ok_and(|current| current == CHROME_SKIN) {
        return Ok(());
    }
    std::fs::write(&path, CHROME_SKIN).map_err(|error| format!("could not write chrome.css: {error}"))
}

/// The engine version this build targets, e.g. `156.0.1`.
///
/// Parsed out of `ENGINE_TARGET` so the installer, the generator and the UA
/// string can never name three different builds.
fn engine_version() -> Result<String, String> {
    narrc_core::ENGINE_TARGET
        .rsplit_once("firefox-")
        .map(|(_, version)| version.to_owned())
        .ok_or_else(|| format!("unexpected engine target {}", narrc_core::ENGINE_TARGET))
}

/// The release-asset tokens naming this platform: the OS word upstream puts in
/// the file name (`win` / `mac` / `lin`) and the architecture (`x86_64` /
/// `arm64`). A build for one platform never downloads another's archive.
fn engine_asset_tokens() -> (&'static str, &'static str) {
    let arch = if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "x86_64"
    };
    let os = if cfg!(target_os = "macos") {
        "mac"
    } else if cfg!(target_os = "linux") {
        "lin"
    } else {
        "win"
    };
    (os, arch)
}

/// Picks this platform's archive out of a release's asset list.
///
/// Upstream names them `camoufox-<version>-<os>.<arch>.zip`, so the match is
/// on the `-{os}.{arch}.zip` tail rather than on a substring that could meet
/// an unrelated asset. Pure, so the fixture tests can pin it against the real
/// names a release carries.
fn pick_engine_asset(assets: &[serde_json::Value], os: &str, arch: &str) -> Option<String> {
    let tail = format!("-{os}.{arch}.zip");
    assets
        .iter()
        .filter_map(|asset| asset["name"].as_str())
        .find(|name| name.starts_with("camoufox-") && name.ends_with(&tail))
        .map(str::to_owned)
}

/// The version an installed engine reports, read from its `application.ini`.
fn installed_version(install_dir: &Path) -> Option<String> {
    let ini = std::fs::read_to_string(install_dir.join("application.ini")).ok()?;
    ini.lines()
        .find_map(|line| line.strip_prefix("Version="))
        .map(|version| version.trim().to_owned())
}

/// Ensure the Camoufox browser binary exists at the expected location.
///
/// Downloads the release carrying the pinned engine version from GitHub when
/// the binary is missing or is a different build, and extracts it to
/// `%USERPROFILE%\camoufox\`. Emits progress events so the UI can show a
/// download dialog.
pub fn ensure_camoufox(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let install_dir = narrc_core::engine::engine_install_dir();
    let binary = install_dir.join(narrc_core::engine::engine_binary_name());
    let version = engine_version()?;

    // An installed engine carrying the pinned version is the fast path. One
    // carrying a different build is replaced rather than kept: the identity
    // this build generates and the UA it claims are written for one Firefox
    // version, and a page can tell when the engine behind them disagrees.
    if binary.exists() {
        match installed_version(&install_dir) {
            Some(installed) if installed.starts_with(&version) => {
                apply_chrome_skin(&install_dir)?;
                return Ok(binary);
            }
            Some(_) => {
                app.emit("download-progress", DownloadProgress {
                    phase: format!("Replacing engine {version}..."),
                    percent: 0.0,
                }).map_err(|e| e.to_string())?;
                std::fs::remove_dir_all(&install_dir)
                    .map_err(|error| format!("could not remove the old engine: {error}"))?;
            }
            // The version cannot be read, so the engine cannot be judged
            // wrong either. Deleting a working install on an unreadable file
            // would cost more than keeping it.
            None => {
                apply_chrome_skin(&install_dir)?;
                return Ok(binary);
            }
        }
    }

    app.emit("download-progress", DownloadProgress {
        phase: "Checking releases...".to_string(),
        percent: 0.0,
    }).map_err(|e| e.to_string())?;

    // The pinned version ships as a prerelease, and GitHub's `latest` skips
    // prereleases — it currently resolves to an unrelated font-bundle tag.
    // The release list is walked for the tag that carries this build's
    // version instead. The engine archive is large, so the client needs a
    // generous total timeout — reqwest's default is 30 seconds, which a
    // hundred-megabyte archive does not fit inside.
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .timeout(std::time::Duration::from_secs(1800))
        .build()
        .map_err(|e| format!("failed to build http client: {e}"))?;
    let resp = client
        .get(format!(
            "https://api.github.com/repos/{}/releases?per_page=100",
            CAMOUFOX_REPO
        ))
        .header("User-Agent", "NarciPHBrowser")
        .send()
        .map_err(|e| format!("failed to fetch release info: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API returned status {}", resp.status()));
    }

    let releases: Vec<serde_json::Value> =
        resp.json().map_err(|e| format!("failed to parse releases: {e}"))?;
    let release = releases
        .iter()
        .find(|release| {
            !release["draft"].as_bool().unwrap_or(true)
                && release["tag_name"]
                    .as_str()
                    .is_some_and(|tag| tag.contains(&version))
        })
        .ok_or_else(|| {
            format!("no Camoufox release on {} carries engine version {version}", CAMOUFOX_REPO)
        })?;
    let assets = release["assets"].as_array().ok_or("no assets in release")?;

    // Find this platform's zip. Its advertised size is what the resumed
    // transfer is measured against: Content-Length of a ranged response only
    // covers the remaining bytes.
    let (asset_os, asset_arch) = engine_asset_tokens();
    let asset_name =
        pick_engine_asset(assets, asset_os, asset_arch).ok_or("no asset for this platform")?;
    let asset = assets
        .iter()
        .find(|asset| asset["name"].as_str() == Some(asset_name.as_str()))
        .ok_or("the chosen asset vanished from the release")?;
    let download_url = asset["browser_download_url"]
        .as_str()
        .ok_or("asset has no download url")?
        .to_string();
    let total = asset["size"].as_u64().unwrap_or(0);

    app.emit("download-progress", DownloadProgress {
        phase: format!("Downloading Camoufox {version}..."),
        percent: 10.0,
    }).map_err(|e| e.to_string())?;

    // The archive is over a gigabyte and a connection rarely survives it, so
    // the bytes stream into a part file and every failed transfer resumes with
    // a Range request instead of restarting. Restarting from zero on a link
    // this long never finishes.
    std::fs::create_dir_all(&install_dir).map_err(|e| e.to_string())?;
    let part_path = install_dir.join(format!("camoufox-{version}.zip.part"));
    let mut last_error = String::new();
    let mut attempt = 0u32;
    loop {
        attempt += 1;
        if attempt > 30 {
            return Err(format!("could not download the engine archive: {last_error}"));
        }
        let existing = std::fs::metadata(&part_path).map(|file| file.len()).unwrap_or(0);
        if total > 0 && existing >= total {
            break;
        }
        if attempt > 1 {
            let percent = if total > 0 { 10.0 + 70.0 * (existing as f64 / total as f64) } else { 10.0 };
            app.emit("download-progress", DownloadProgress {
                phase: if existing > 0 {
                    format!("Resuming download... {:.0}%", percent)
                } else {
                    format!("Downloading Camoufox {version}...")
                },
                percent,
            }).map_err(|e| e.to_string())?;
            std::thread::sleep(std::time::Duration::from_secs(3));
        }

        let mut request = client
            .get(&download_url)
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

        // A 200 answer to a Range request means the server ignored it — the
        // file is rewritten rather than appended to, or the copy would be
        // spliced together out of two different archives.
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(appending)
            .truncate(!appending)
            .open(&part_path)
            .map_err(|error| format!("could not open the archive file: {error}"))?;
        let mut written = if appending { existing } else { 0 };
        let mut buffer = [0u8; 64 * 1024];
        let mut last_emit = std::time::Instant::now();
        let mut transfer_error = None;
        loop {
            match response.read(&mut buffer) {
                Ok(0) => break,
                Ok(read) => {
                    if let Err(error) = file.write_all(&buffer[..read]) {
                        transfer_error = Some(format!("could not write the archive: {error}"));
                        break;
                    }
                    written += read as u64;
                    if total > 0 && last_emit.elapsed() >= std::time::Duration::from_millis(300) {
                        last_emit = std::time::Instant::now();
                        let percent = 10.0 + 70.0 * (written as f64 / total as f64);
                        app.emit("download-progress", DownloadProgress {
                            phase: format!("Downloading Camoufox {version}..."),
                            percent,
                        }).map_err(|e| e.to_string())?;
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

    app.emit("download-progress", DownloadProgress {
        phase: "Downloaded. Extracting...".to_string(),
        percent: 80.0,
    }).map_err(|e| e.to_string())?;

    // Extract.
    std::fs::create_dir_all(&install_dir).map_err(|e| e.to_string())?;
    let archive_file =
        std::fs::File::open(&part_path).map_err(|e| format!("could not reopen the archive: {e}"))?;
    let mut archive = zip::ZipArchive::new(archive_file).map_err(|e| format!("bad zip: {e}"))?;
    let file_count = archive.len();
    let mut last_percent = 80.0f64;
    for i in 0..file_count {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = install_dir.join(file.mangled_name());
        if file.name().ends_with('/') {
            std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out = std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut out).map_err(|e| e.to_string())?;
        }
        if file_count > 0 {
            let percent = 80.0 + 19.0 * ((i + 1) as f64 / file_count as f64);
            if percent - last_percent >= 1.0 {
                last_percent = percent;
                app.emit("download-progress", DownloadProgress {
                    phase: format!("Extracting... {}/{}", i + 1, file_count),
                    percent,
                }).map_err(|e| e.to_string())?;
            }
        }
    }
    drop(archive);
    let _ = std::fs::remove_file(&part_path);

    // Verify the binary exists after extraction.
    let binary_name = narrc_core::engine::engine_binary_name();
    if !binary.exists() {
        // The zip may contain a top-level directory; scan for the binary.
        let found = walkdir::WalkDir::new(&install_dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .find(|e| e.file_name() == binary_name);
        if let Some(entry) = found {
            #[cfg(unix)]
            mark_executable(entry.path());
            apply_chrome_skin(&install_dir)?;
            return Ok(entry.path().to_path_buf());
        }
        return Err(format!("{binary_name} not found in extracted archive"));
    }

    #[cfg(unix)]
    mark_executable(&binary);

    app.emit("download-progress", DownloadProgress {
        phase: "Ready!".to_string(),
        percent: 100.0,
    }).map_err(|e| e.to_string())?;

    apply_chrome_skin(&install_dir)?;
    Ok(binary)
}

/// Makes an extracted engine runnable. Archives carry no executable bit, and
/// a Firefox that cannot be executed fails at spawn with an error that says
/// nothing about permissions.
#[cfg(unix)]
fn mark_executable(path: &Path) {
    use std::os::unix::fs::PermissionsExt;

    if let Ok(metadata) = std::fs::metadata(path) {
        let mut permissions = metadata.permissions();
        permissions.set_mode(permissions.mode() | 0o755);
        let _ = std::fs::set_permissions(path, permissions);
    }
}

/// Progress event emitted during Camoufox download.
#[derive(serde::Serialize, Clone)]
struct DownloadProgress {
    phase: String,
    percent: f64,
}

/// Ensures the engine binary is installed, downloading it if it is missing.
///
/// Returns the path to the engine. Emits `download-progress` events while a
/// download runs, so the UI can show it happening.
#[tauri::command]
pub async fn ensure_engine(app: tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        ensure_camoufox(&app).map(|path| path.to_string_lossy().to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

/// The store directory the app is pointed at, or the platform default.
pub fn store_root(state: &AppState) -> Result<PathBuf, String> {
    let path = state
        .store_path
        .lock()
        .map_err(|error| error.to_string())?
        .clone();
    Ok(path.unwrap_or_else(|| {
        store_path::default_store().unwrap_or_else(|_| PathBuf::from("profiles"))
    }))
}

/// Opens the store, or returns an error saying why there is not one.
pub fn open_store(state: &AppState) -> Result<ProfileStore, String> {
    ProfileStore::open(store_root(state)?).map_err(|error| error.to_string())
}

/// Opens the proxy list, which lives beside the profiles it is assigned to.
pub fn open_proxy_store(state: &AppState) -> Result<narrc_core::ProxyStore, String> {
    narrc_core::ProxyStore::open(store_root(state)?.join("proxies.json"))
        .map_err(|error| error.to_string())
}

/// Starts the sidecar and returns its version string.
///
/// The app does not spawn a sidecar child process. It uses the engine
/// directly, in-process, through the sidecar's library interface. This
/// avoids the complexity of managing a child process and means the UI can
/// reach the engine without a pipe.
#[tauri::command]
pub async fn app_info(_state: tauri::State<'_, AppState>) -> Result<String, String> {
    Ok(format!(
        "sidecar {} (core {}, engine {})",
        env!("CARGO_PKG_VERSION"),
        narrc_core::VERSION,
        narrc_core::ENGINE_TARGET,
    ))
}

/// Whether store files are sealed at rest, with the honest description.
///
/// The note is the seal module's own wording, not a summary of it: where the
/// platform has no seal the user is told their proxy logins are on disk in
/// plaintext, not shown a reassuring lock icon.
#[tauri::command]
pub async fn security_info() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "store_sealed": narrc_core::seal_available(),
        "store_seal_note": narrc_core::seal_note(),
    }))
}

/// Saves a diagnostics bundle to a file the user picks.
///
/// The bundle is for bug reports, so it carries **no secrets by
/// construction**: profile identities are reduced to summaries — a seed, a
/// digest and counts, never the drawn values a page would see; proxy entries
/// lose their URLs, because a proxy URL can carry an embedded login; and
/// subscription URLs are bearer tokens, so only their count survives. What
/// remains is what a report actually needs: versions, what is configured and
/// where, and what is broken.
///
/// Sync like the other file-dialog commands: the dialog blocks, off the main
/// thread.
#[tauri::command]
pub fn collect_diagnostics(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let profiles: Vec<protocol::ProfileSummary> =
        store.list().iter().map(protocol::ProfileSummary::of).collect();
    let trash = store.list_trash();
    let proxy_store = open_proxy_store(&state)?;
    let proxies = proxy_store.list();
    // A proxy URL may embed user:pass, so the bundle carries the proxy's
    // name and health check and never the URL itself.
    let proxy_view: Vec<serde_json::Value> = proxies
        .iter()
        .map(|proxy| {
            serde_json::json!({
                "name": proxy.name,
                "exit_country": proxy.exit_country,
                "last_check": proxy.last_check.as_ref().map(|check| {
                    serde_json::json!({
                        "ok": check.ok,
                        "country": check.country,
                        "latency_ms": check.latency_ms,
                        "error": check.error,
                    })
                }),
            })
        })
        .collect();
    let sessions: Vec<String> = state
        .agents
        .lock()
        .map_err(|error| error.to_string())?
        .keys()
        .cloned()
        .collect();

    let bundle = serde_json::json!({
        "kind": "narciphbrowser-diagnostics",
        "generated_at": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|since| since.as_secs())
            .unwrap_or(0),
        "versions": {
            "app": env!("CARGO_PKG_VERSION"),
            "core": narrc_core::VERSION,
            "engine_target": narrc_core::ENGINE_TARGET,
        },
        "platform": std::env::consts::OS,
        "store": {
            "root": store.root().display().to_string(),
            "sealed": narrc_core::seal_available(),
            "seal_note": narrc_core::seal_note(),
            "unreadable_ids": store.unreadable_ids(),
        },
        "profiles": profiles,
        "trash": {
            "count": trash.len(),
            "entries": trash,
        },
        "proxies": proxy_view,
        "subscription_count": open_subscription_store(&state)?.list().len(),
        "automation_sessions": sessions,
    });

    let Some(path) = rfd::FileDialog::new()
        .set_file_name("narciphbrowser-diagnostics.json")
        .add_filter("NarciPHBrowser diagnostics", &["json"])
        .save_file()
    else {
        return Ok(serde_json::json!({ "cancelled": true }));
    };
    std::fs::write(
        &path,
        serde_json::to_vec_pretty(&bundle)
            .map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("could not write {}: {error}", path.display()))?;
    Ok(serde_json::json!({ "path": path.display().to_string() }))
}

/// Lists every profile.
#[tauri::command]
pub async fn list_profiles(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let profiles = store.list();
    let summaries: Vec<protocol::ProfileSummary> =
        profiles.iter().map(protocol::ProfileSummary::of).collect();
    Ok(serde_json::json!({
        "profiles": summaries,
        "unreadable": store.unreadable_ids(),
    }))
}

#[derive(serde::Serialize)]
pub struct ScreenPreset {
    pub width: u32,
    pub height: u32,
    pub weight: f64,
}

#[tauri::command]
pub fn screen_presets() -> Vec<ScreenPreset> {
    narrc_core::coherence::constants::SCREEN_SIZES
        .iter()
        .zip(narrc_core::coherence::constants::SCREEN_SIZE_WEIGHTS)
        .map(|(&(width, height), &weight)| ScreenPreset { width, height, weight })
        .collect()
}

/// Creates a profile.
#[tauri::command]
pub async fn create_profile(
    state: tauri::State<'_, AppState>,
    spec: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let _store = open_store(&state)?;
    let spec: protocol::CreateSpec =
        serde_json::from_value(spec).map_err(|error| format!("invalid create spec: {error}"))?;
    let result = protocol::create(&spec).map_err(|error| error.to_string())?;
    Ok(result)
}

/// Rewrites a profile from a new description, keeping its seed.
#[tauri::command]
pub async fn update_profile(
    state: tauri::State<'_, AppState>,
    id: String,
    spec: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let _store = open_store(&state)?;
    let spec: protocol::CreateSpec =
        serde_json::from_value(spec).map_err(|error| format!("invalid update spec: {error}"))?;
    let result = protocol::update(&id, &spec).map_err(|error| error.to_string())?;
    Ok(result)
}

/// Inspects a profile.
#[tauri::command]
pub async fn inspect_profile(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let profile = store
        .load(&id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("no profile with the id {id:?}"))?;
    let inspection = protocol::inspect_profile(&profile).map_err(|error| error.to_string())?;
    protocol::to_value(&inspection).map_err(|error| error.to_string())
}

/// Validates a profile.
#[tauri::command]
pub async fn validate_profile(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let profile = store
        .load(&id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("no profile with the id {id:?}"))?;
    let report = protocol::report_of(&profile);
    protocol::to_value(&report).map_err(|error| error.to_string())
}

/// Moves a profile to the store's trash, browser data included.
///
/// Not the delete: the profile waits in the trash until it is restored or
/// purged, because deleting also removes the cookies, sessions and history a
/// user cannot get back by re-creating the profile. The profile's core
/// instance stops and its proxy assignment is dropped, so neither outlives a
/// profile the store no longer lists — the assignment does not follow it out
/// of the trash on restore, since quietly re-claiming a proxy the user gave
/// away is not the store's call.
#[tauri::command]
pub async fn trash_profile(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let trashed = store.trash(&id).map_err(|error| error.to_string())?;
    if !trashed {
        return Err(format!("no profile with the id {id:?}"));
    }
    mihomo(&state)?.stop_profile(&id)?;
    let mut assignments = open_assignment_store(&state)?;
    assignments.remove(&id).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "trashed": id }))
}

/// Every trashed profile, oldest first.
#[tauri::command]
pub async fn list_trash(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let entries = store.list_trash();
    serde_json::to_value(&entries).map_err(|error| error.to_string())
}

/// Puts a trashed profile back into the store.
#[tauri::command]
pub async fn restore_profile(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let restored = store
        .restore(&id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("nothing trashed under {id:?}"))?;
    Ok(serde_json::json!({ "id": restored.id, "name": restored.name }))
}

/// Removes one trashed profile for good, browser data included.
#[tauri::command]
pub async fn purge_trash(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let purged = store.purge(&id).map_err(|error| error.to_string())?;
    if !purged {
        return Err(format!("nothing trashed under {id:?}"));
    }
    Ok(serde_json::json!({ "purged": id }))
}

/// Empties the trash.
#[tauri::command]
pub async fn purge_all_trash(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let purged = store.purge_all().map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "purged": purged }))
}

/// Files one profile under a group, or out of its group.
///
/// An empty string clears the group — the same rule the profile itself
/// applies, so a UI sending back an input's contents cannot create a group
/// named nothing.
#[tauri::command]
pub async fn set_profile_group(
    state: tauri::State<'_, AppState>,
    id: String,
    group: String,
) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let mut profile = store
        .load(&id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("no profile with the id {id:?}"))?;
    profile.set_group(&group);
    store.save(&profile).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "id": id, "group": profile.group }))
}

/// Files many profiles under one group.
///
/// Per-profile failures are reported, not fatal: a profile that went
/// unreadable between listing and editing should not stop the other forty
/// from being filed.
#[tauri::command]
pub async fn bulk_set_group(
    state: tauri::State<'_, AppState>,
    ids: Vec<String>,
    group: String,
) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let mut updated: Vec<String> = Vec::new();
    let mut failed: Vec<serde_json::Value> = Vec::new();
    for id in &ids {
        match store.load(id) {
            Ok(Some(mut profile)) => {
                profile.set_group(&group);
                match store.save(&profile) {
                    Ok(()) => updated.push(id.clone()),
                    Err(error) => failed.push(serde_json::json!({ "id": id, "error": error.to_string() })),
                }
            }
            Ok(None) => failed.push(serde_json::json!({ "id": id, "error": "no such profile" })),
            Err(error) => failed.push(serde_json::json!({ "id": id, "error": error.to_string() })),
        }
    }
    Ok(serde_json::json!({ "updated": updated, "failed": failed }))
}

/// Every group, with how many profiles are filed under it, sorted by name.
///
/// The names come from the group store merged with what profiles still carry:
/// a name only on profiles is still a group — the profiles say so — and
/// listing it here is what lets it be renamed or deleted from the groups page
/// instead of lingering where no list shows it.
#[tauri::command]
pub async fn list_groups(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let stored = open_group_store(&state)?;
    let profiles = open_store(&state)?.list();
    let carried = profiles
        .iter()
        .filter_map(|profile| profile.group.as_deref());
    let groups: Vec<serde_json::Value> = group_counts(stored.list(), carried)
        .into_iter()
        .map(|(name, count)| serde_json::json!({ "name": name, "count": count }))
        .collect();
    Ok(serde_json::json!({ "groups": groups }))
}

/// The names to list and their member counts: both sides of the group, in
/// name order, with a group that has no members still counted (as zero).
fn group_counts<'a>(
    stored: &[String],
    carried: impl IntoIterator<Item = &'a str>,
) -> Vec<(String, usize)> {
    let mut counts: BTreeMap<String, usize> = stored.iter().map(|name| (name.clone(), 0)).collect();
    for group in carried {
        *counts.entry(group.to_owned()).or_default() += 1;
    }
    counts.into_iter().collect()
}

/// Whether any profile is already filed under `name`.
fn profiles_carry_group(state: &tauri::State<'_, AppState>, name: &str) -> Result<bool, String> {
    Ok(open_store(state)?
        .list()
        .iter()
        .any(|profile| profile.group.as_deref() == Some(name)))
}

/// Creates a group under a name nothing else has.
///
/// The name may be typed straight into a profile's group field — that path
/// needs no write here, because listing merges profile-carried names — so
/// this exists for the groups page, where a group is created before it has a
/// member. A name already in use is refused rather than treated as a join:
/// the button says "new group".
#[tauri::command]
pub async fn create_group(
    state: tauri::State<'_, AppState>,
    name: String,
) -> Result<serde_json::Value, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("a group needs a name".to_owned());
    }
    let mut stored = open_group_store(&state)?;
    if stored.contains(name) || profiles_carry_group(&state, name)? {
        return Err(format!("a group named {name:?} already exists"));
    }
    let created = stored.create(name).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "name": created }))
}

/// Renames a group, taking the profiles filed under it with it.
#[tauri::command]
pub async fn rename_group(
    state: tauri::State<'_, AppState>,
    from: String,
    to: String,
) -> Result<serde_json::Value, String> {
    let from = from.trim();
    let to = to.trim();
    if from.is_empty() || to.is_empty() {
        return Err("a group needs a name".to_owned());
    }
    // A rename to the same name is a save of an unchanged field, not an error.
    if from == to {
        return Ok(serde_json::json!({ "name": to, "profiles": 0 }));
    }
    let mut stored = open_group_store(&state)?;
    if stored.contains(to) || profiles_carry_group(&state, to)? {
        return Err(format!("a group named {to:?} already exists"));
    }
    let profiles = open_store(&state)?;
    let in_store = stored.rename(from, to).map_err(|error| error.to_string())?;
    let moved = profiles
        .rename_group(from, to)
        .map_err(|error| error.to_string())?;
    if !in_store && moved == 0 {
        return Err(format!("no group named {from:?}"));
    }
    Ok(serde_json::json!({ "name": to, "profiles": moved }))
}

/// Deletes a group; its profiles are kept and become ungrouped.
#[tauri::command]
pub async fn delete_group(
    state: tauri::State<'_, AppState>,
    name: String,
) -> Result<serde_json::Value, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("a group needs a name".to_owned());
    }
    let mut stored = open_group_store(&state)?;
    let profiles = open_store(&state)?;
    let removed = stored.remove(name).map_err(|error| error.to_string())?;
    let cleared = profiles
        .clear_group(name)
        .map_err(|error| error.to_string())?;
    if !removed && cleared == 0 {
        return Err(format!("no group named {name:?}"));
    }
    Ok(serde_json::json!({ "name": name, "profiles": cleared }))
}

/// Moves many profiles to the trash in one go.
///
/// Each profile's core instance stops and its proxy assignment drops, exactly
/// as a single trash does; a failure on one profile does not stop the rest.
#[tauri::command]
pub async fn bulk_trash(
    state: tauri::State<'_, AppState>,
    ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let mut trashed: Vec<String> = Vec::new();
    let mut failed: Vec<serde_json::Value> = Vec::new();
    for id in &ids {
        let outcome = store.trash(id).map_err(|error| error.to_string());
        match outcome {
            Ok(true) => {
                if let Err(error) = mihomo(&state)?.stop_profile(id) {
                    // The profile is already in the trash; a core that would
                    // not stop is reported, not fatal to the batch.
                    failed.push(serde_json::json!({ "id": id, "error": error }));
                    continue;
                }
                let _ = open_assignment_store(&state)?
                    .remove(id)
                    .map_err(|error| error.to_string());
                trashed.push(id.clone());
            }
            Ok(false) => failed.push(serde_json::json!({ "id": id, "error": "no such profile" })),
            Err(error) => failed.push(serde_json::json!({ "id": id, "error": error })),
        }
    }
    Ok(serde_json::json!({ "trashed": trashed, "failed": failed }))
}

/// Sets an override on a profile.
#[tauri::command]
pub async fn set_override(
    state: tauri::State<'_, AppState>,
    id: String,
    property: String,
    value: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let mut profile = store
        .load(&id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("no profile with the id {id:?}"))?;

    // Coerce the value to the property's schema type.
    let schema = narrc_core::PropertySchema::load().map_err(|error| {
        format!("schema unavailable: {error}")
    })?;
    let Some(kind) = schema.kind(&property) else {
        return Err(format!("unknown property: {property:?}"));
    };
    let coerced = kind.coerce(&value).ok_or_else(|| {
        format!(
            "{property:?} wants a {kind}, not a {}",
            match &value {
                serde_json::Value::Null => "null",
                serde_json::Value::Bool(_) => "boolean",
                serde_json::Value::Number(_) => "number",
                serde_json::Value::String(_) => "string",
                serde_json::Value::Array(_) => "array",
                serde_json::Value::Object(_) => "object",
            }
        )
    })?;
    profile
        .overrides
        .set(&schema, &property, coerced.clone())
        .map_err(|error| error.to_string())?;
    store.save(&profile).map_err(|error| error.to_string())?;

    let report = protocol::report_of(&profile);
    Ok(serde_json::json!({
        "report": report,
        "value": coerced,
        "coerced": coerced != value,
    }))
}

/// Clears an override from a profile.
#[tauri::command]
pub async fn clear_override(
    state: tauri::State<'_, AppState>,
    id: String,
    property: String,
) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let mut profile = store
        .load(&id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("no profile with the id {id:?}"))?;
    profile.overrides.remove(&property);
    store.save(&profile).map_err(|error| error.to_string())?;
    let report = protocol::report_of(&profile);
    Ok(serde_json::json!({ "report": report }))
}

/// The engine's property schema: every property name with its declared type.
///
/// The field editor renders an input per property and needs the type to build
/// the right one and to refuse a value the engine would drop before sending it.
/// It loads the same vendored bytes that `set_override` validates against, so
/// the two cannot drift apart.
#[tauri::command]
pub async fn property_schema() -> Result<serde_json::Value, String> {
    let schema = narrc_core::PropertySchema::load().map_err(|error| error.to_string())?;
    Ok(serde_json::json!({
        "properties": schema.map(),
        // The properties the generator deliberately never draws: behaviour
        // switches a field editor marks as engine opt-ins rather than presents
        // as ordinary identity fields. Quoted from the core crate so the wire
        // response and the reachability test cannot drift apart.
        "never_drawn": narrc_core::schema::NEVER_DRAWN,
    }))
}

/// Writes one profile to a file the user picks, as a portable export.
///
/// Sync rather than `async` on purpose: the native save dialog blocks, and a
/// sync command runs on the command thread pool, so the UI stays responsive
/// while it waits for the user. The export carries the proxy login only when
/// the caller asks for it — a shared file should not hand out an account.
#[tauri::command]
pub fn export_profile(
    state: tauri::State<'_, AppState>,
    id: String,
    include_proxy_login: bool,
) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let profile = store
        .load(&id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("no profile with the id {id:?}"))?;

    let export = narrc_core::ProfileExport::new(profile.clone());
    let export = if include_proxy_login {
        export
    } else {
        export.without_credentials()
    };

    let Some(path) = rfd::FileDialog::new()
        .set_file_name(format!("{}.narci.json", profile.id))
        .add_filter("NarciPHBrowser profile export", &["json"])
        .save_file()
    else {
        // The user closed the dialog; that is a decision, not an error.
        return Ok(serde_json::json!({ "cancelled": true }));
    };

    std::fs::write(&path, export.to_json().map_err(|error| error.to_string())?)
        .map_err(|error| format!("could not write {}: {error}", path.display()))?;
    Ok(serde_json::json!({ "path": path.display().to_string() }))
}

/// Writes the profiles the ids name into one bundle file the user picks.
///
/// Same rationale as [`export_profile`] for being sync, and the same rule
/// about credentials: the file is plain JSON the user may share, so proxy
/// logins leave it unless `include_proxy_login` says otherwise — now for
/// every profile in the file at once. A missing id stops the export before
/// the dialog opens: a bundle silently missing one of its members is worse
/// than no bundle.
#[tauri::command]
pub fn export_profiles(
    state: tauri::State<'_, AppState>,
    ids: Vec<String>,
    include_proxy_login: bool,
) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let mut profiles = Vec::with_capacity(ids.len());
    for id in &ids {
        let profile = store
            .load(id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| format!("no profile with the id {id:?}"))?;
        profiles.push(profile);
    }
    if profiles.is_empty() {
        return Err("there is nothing to export".to_string());
    }

    let count = profiles.len();
    let export = narrc_core::ProfileExportBundle::new(profiles);
    let export = if include_proxy_login {
        export
    } else {
        export.without_credentials()
    };

    let Some(path) = rfd::FileDialog::new()
        .set_file_name("profiles.narci.json")
        .add_filter("NarciPHBrowser profile export", &["json"])
        .save_file()
    else {
        // The user closed the dialog; that is a decision, not an error.
        return Ok(serde_json::json!({ "cancelled": true }));
    };

    std::fs::write(&path, export.to_json().map_err(|error| error.to_string())?)
        .map_err(|error| format!("could not write {}: {error}", path.display()))?;
    Ok(serde_json::json!({
        "path": path.display().to_string(),
        "count": count,
    }))
}

/// Reads a profile file the user picks and adds every profile it holds to
/// the store.
///
/// Same rationale as [`export_profile`] for being sync. An import never
/// overwrites: the store resolves an id collision by moving aside, exactly
/// as a second create of the same name does — and that holds per entry in
/// a bundle, where a failure part-way leaves what imported already in
/// place rather than rolling it back.
#[tauri::command]
pub fn import_profile(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("NarciPHBrowser profile export", &["json"])
        .pick_file()
    else {
        return Ok(serde_json::json!({ "cancelled": true }));
    };

    let bytes = std::fs::read(&path)
        .map_err(|error| format!("could not read {}: {error}", path.display()))?;
    let exports = narrc_core::read_profiles_export(&bytes).map_err(|error| error.to_string())?;

    let store = open_store(&state)?;
    let mut names = Vec::with_capacity(exports.len());
    for export in &exports {
        let profile = store
            .import(export)
            .map_err(|error| format!("could not import {:?}: {error}", export.profile.name))?;
        names.push(profile.name);
    }
    Ok(serde_json::json!({
        "count": names.len(),
        "names": names,
        "path": path.display().to_string(),
    }))
}

/// Adds a browser extension to a profile.
///
/// `path` is an `.xpi` file or an unpacked addon directory. Existence is not
/// required here — the addon may still be downloading — and is checked at
/// launch, where a missing path becomes a warning the UI can show.
#[tauri::command]
pub async fn add_addon(
    state: tauri::State<'_, AppState>,
    id: String,
    path: String,
) -> Result<serde_json::Value, String> {
    let path = path.trim().to_owned();
    if path.is_empty() {
        return Err("an addon needs a path".to_string());
    }
    let store = open_store(&state)?;
    let mut profile = store
        .load(&id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("no profile with the id {id:?}"))?;
    if profile
        .addons
        .iter()
        .any(|existing| existing.eq_ignore_ascii_case(&path))
    {
        return Err(format!("{path:?} is already loaded by this profile"));
    }
    profile.addons.push(path);
    store.save(&profile).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({
        "addons": profile.addons,
        "report": protocol::report_of(&profile),
    }))
}

/// Removes a browser extension from a profile, by the path it was added with.
#[tauri::command]
pub async fn remove_addon(
    state: tauri::State<'_, AppState>,
    id: String,
    path: String,
) -> Result<serde_json::Value, String> {
    let path = path.trim();
    let store = open_store(&state)?;
    let mut profile = store
        .load(&id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("no profile with the id {id:?}"))?;
    let before = profile.addons.len();
    profile.addons.retain(|existing| !existing.eq_ignore_ascii_case(path));
    if profile.addons.len() == before {
        return Err(format!("no addon {path:?} on this profile"));
    }
    store.save(&profile).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({
        "addons": profile.addons,
        "report": protocol::report_of(&profile),
    }))
}

/// Adds a browser extension to multiple profiles.
#[tauri::command]
pub async fn batch_add_addon(
    state: tauri::State<'_, AppState>,
    ids: Vec<String>,
    path: String,
) -> Result<serde_json::Value, String> {
    let path = path.trim().to_owned();
    if path.is_empty() {
        return Err("an addon needs a path".to_string());
    }
    let store = open_store(&state)?;
    let mut updated = 0;
    for id in ids {
        if let Ok(Some(mut profile)) = store.load(&id) {
            if !profile
                .addons
                .iter()
                .any(|existing| existing.eq_ignore_ascii_case(&path))
            {
                profile.addons.push(path.clone());
                if store.save(&profile).is_ok() {
                    updated += 1;
                }
            }
        }
    }
    Ok(serde_json::json!({
        "success": true,
        "updated": updated,
    }))
}

/// Removes a browser extension from multiple profiles.
#[tauri::command]
pub async fn batch_remove_addon(
    state: tauri::State<'_, AppState>,
    ids: Vec<String>,
    path: String,
) -> Result<serde_json::Value, String> {
    let path = path.trim();
    let store = open_store(&state)?;
    let mut removed = 0;
    for id in ids {
        if let Ok(Some(mut profile)) = store.load(&id) {
            let before = profile.addons.len();
            profile.addons.retain(|existing| !existing.eq_ignore_ascii_case(path));
            if profile.addons.len() < before && store.save(&profile).is_ok() {
                removed += 1;
            }
        }
    }
    Ok(serde_json::json!({
        "success": true,
        "removed": removed,
    }))
}

/// Returns a map of profile_id -> list of addons for all profiles.
#[tauri::command]
pub async fn list_all_profile_addons(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let mut map = std::collections::HashMap::new();
    for p in store.list() {
        if let Ok(Some(profile)) = store.load(&p.id) {
            map.insert(p.id, profile.addons);
        }
    }
    Ok(serde_json::json!(map))
}

/// Launches a profile's browser.
#[tauri::command]
pub async fn launch_profile(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    id: String,
    engine: Option<String>,
) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let mut profile = store
        .load(&id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("no profile with the id {id:?}"))?;

    // A profile assigned a node is routed through a dedicated core instance,
    // started here and stopped when this browser exits. The override lives only
    // for this launch: the profile on disk keeps whatever proxy it had.
    let assignment = open_assignment_store(&state)?.get(&id).cloned();
    if let Some(assignment) = &assignment {
        let sub = open_subscription_store(&state)?
            .get(&assignment.subscription_id)
            .ok_or_else(|| format!("the subscription {:?} is gone", assignment.subscription_id))?
            .clone();
        let port = mihomo(&state)?.ensure_profile(&app, &id, &sub, &assignment.node)?;
        profile.proxy = Some(narrc_core::ProxyConfig {
            url: format!("socks5://127.0.0.1:{port}"),
            exit_country: None,
        });
    }

    // The geo gate checks whether the proxy exit country matches what the profile claims.
    // Rather than refusing launch, it evaluates the gate and returns the verdict so the UI
    // can display a visible warning, giving full control to the user.
    let geo_gate = match profile.proxy.as_ref() {
        Some(proxy) => {
            let observed = open_proxy_store(&state)?
                .list()
                .iter()
                .find(|stored| stored.url == proxy.url)
                .and_then(|stored| stored.last_check.clone())
                .filter(|check| check.ok)
                .and_then(|check| check.country);
            Some(profile.check_geo_gate(observed.as_deref()))
        }
        None => None,
    };

    // Ensure Camoufox is installed.
    let camoufox_path = ensure_camoufox(&app)?;

    let dir = store.browser_dir(&id);
    let (plan, discarded) = profile
        .launch_plan_after_discarding_conflicts(&dir, engine.as_deref(), false)
        .map_err(|error| error.to_string())?;

    // Use the ensured binary path, overriding any configured path.
    let prog = camoufox_path.to_string_lossy().to_string();

    // The window a Firefox opens is titled after its active tab, which in a
    // room of windows all on the same site makes the taskbar a row of
    // identical entries. The title is pinned to the profile — name, and group
    // behind a dash — for as long as the browser runs, so every window stays
    // attributable to the profile it belongs to. The window itself draws in
    // tabs-in-titlebar mode with no system titlebar row, so the same name is
    // also written into the profile's narrc-title.css and drawn in the tab
    // strip; one row then carries the name beside the tabs. Both writes land
    // before the spawn — the loader reads the file the moment the window
    // finishes starting up, and an engine without the loader block would
    // simply never pick the file up.
    let title = (!plan.headless)
        .then(|| crate::window_title::label(&profile.name, profile.group.as_deref()));
    if let Some(title) = &title {
        if let Err(error) = crate::window_title::apply_display(&dir, title) {
            crate::window_title::trace(format!("launch id={id} title css failed: {error}"));
        }
        if let Err(error) =
            crate::window_title::ensure_loader(&narrc_core::engine::engine_install_dir())
        {
            crate::window_title::trace(format!("launch id={id} title loader failed: {error}"));
        }
    }

    let pid = protocol::spawn_with_program(&plan, &prog);
    if pid.is_err() {
        // The core instance was started for this launch and its browser will
        // never exist; leaving it running would be a process serving nobody.
        if assignment.is_some() {
            let _ = mihomo(&state)?.stop_profile(&id);
        }
    }
    let pid = pid.map_err(|error| format!("could not start browser: {error}"))?;

    if let Some(pid) = pid {
        if let Some(title) = title {
            crate::window_title::trace(format!(
                "launch id={id} pid={pid} headless={} label={title:?} alive_now={}",
                plan.headless,
                crate::mihomo::process_alive(pid)
            ));
            crate::window_title::pin(pid, title);
        } else {
            crate::window_title::trace(format!("launch id={id} pid={pid} headless, no pin"));
        }
    } else {
        crate::window_title::trace(format!("launch id={id} pid=none, no pin"));
    }

    // The browser is detached, so its exit is learned by polling its pid. When
    // it goes, the profile's core instance goes with it — a core left running
    // after its browser is a leak.
    if assignment.is_some() {
        if let Some(pid) = pid {
            let app2 = app.clone();
            let profile_id = id.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let state = app2.state::<AppState>();
                // Pinned to this incarnation of the pid: after the browser
                // exits, the OS may hand the pid to an unrelated process, and
                // a bare aliveness poll would then wait on the stranger while
                // the profile's core keeps running.
                let started = crate::mihomo::process_started_at(pid);
                while crate::mihomo::process_alive_with(pid, started) {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
                let manager = state.mihomo.lock();
                if let Ok(mut manager) = manager {
                    let _ = manager.stop_profile(&profile_id);
                }
            });
        }
    }

    Ok(serde_json::json!({
        "pid": pid,
        "plan": &plan,
        "discarded": discarded,
        "headless": plan.headless,
        "geo_gate": geo_gate,
    }))
}

/// Closes all opened fingerprint browsers, terminates any orphaned engine processes,
/// and stops all profile proxy cores to completely release resources.
#[tauri::command]
pub async fn stop_all_browsers(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // 1. Force kill all running browser processes (Camoufox and Firefox engine trees)
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/IM", "camoufox.exe", "/T"])
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .output();
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/IM", "firefox.exe", "/T"])
            .creation_flags(0x0800_0000)
            .output();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("pkill")
            .args(["-9", "-f", "camoufox"])
            .output();
        let _ = std::process::Command::new("pkill")
            .args(["-9", "-f", "firefox"])
            .output();
    }

    // 2. Stop all profile proxy cores in MihomoManager
    if let Ok(mut manager) = state.mihomo.lock() {
        manager.stop_all_profiles();
    }

    Ok(serde_json::json!({
        "success": true,
        "message": "已关闭全部指纹浏览器并释放资源"
    }))
}

/// Verifies a profile by reading its identity back out of a running browser.
///
/// Every other check in this file reasons about the identity the engine *was
/// handed*. This one asks the browser what a page can actually read, and diffs
/// the two — the only way to turn "the engine should apply this" into "the
/// engine did". It launches a real browser, so it is a command of its own and
/// the UI must ask before calling it.
///
/// The launch is not headless: a page reads a different rendering path without
/// a window, and the values this exists to check are the ones a rendering path
/// decides. The browser is given a throwaway profile directory — the profile's
/// own may be locked by a browser already running, and the probe needs a
/// preference the profile must not be left carrying.
#[tauri::command]
pub async fn verify_profile(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    id: String,
    keep_agreements: Option<bool>,
) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let profile = store
        .load(&id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("no profile with the id {id:?}"))?;

    let camoufox_path = ensure_camoufox(&app)?;
    let keep_agreements = keep_agreements.unwrap_or(false);

    // Off the main thread: a cold browser start plus the page's own work is
    // seconds, and the UI must keep answering while it runs.
    tauri::async_runtime::spawn_blocking(move || {
        let identity = profile.resolved().identity;
        let probe = narrc_core::verify::ProbeProfile::new(&identity)
            .map_err(|error| format!("could not prepare the probe profile: {error}"))?;
        let mut plan = profile
            .launch_plan(probe.path(), None, false)
            .map_err(|error| error.to_string())?;
        // The ensured binary, not whatever path the config carries: the same
        // substitution an interactive launch makes, so the browser measured is
        // the browser a launch would produce.
        plan.program = camoufox_path.to_string_lossy().to_string();

        let report = narrc_core::verify::run(
            &plan,
            narrc_core::verify::DEFAULT_PROBE_TIMEOUT,
            keep_agreements,
        )
        .map_err(|error| error.to_string())?;
        serde_json::to_value(&report).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("the verification task failed: {error}"))?
}

/// Everything an automation mount needs before a browser can start.
struct AutomationLaunch {
    plan: narrc_core::engine::LaunchPlan,
    /// The automation directory holding `launchServer.js` and `warmup.js`.
    script_dir: std::path::PathBuf,
    assignment: Option<narrc_core::Assignment>,
    geo_gate: Option<narrc_core::GeoGate>,
}

/// Prepares an automation launch: the interactive session and the warm-up go
/// through the same proxy assignment, the same geo gate and the same plan, so
/// an automated browser presents exactly what a visible one would.
fn prepare_automation_launch(
    state: &AppState,
    app: &tauri::AppHandle,
    id: &str,
    headless: bool,
) -> Result<AutomationLaunch, String> {
    let store = open_store(state)?;
    let mut profile = store
        .load(id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("no profile with the id {id:?}"))?;

    // The proxy assignment and the geo gate are the interactive launch's:
    // automation is the easiest place to trip the gate, not an exemption from
    // it.
    let assignment = open_assignment_store(state)?.get(id).cloned();
    if let Some(assignment) = &assignment {
        let sub = open_subscription_store(state)?
            .get(&assignment.subscription_id)
            .ok_or_else(|| format!("the subscription {:?} is gone", assignment.subscription_id))?
            .clone();
        let port = mihomo(state)?.ensure_profile(app, id, &sub, &assignment.node)?;
        profile.proxy = Some(narrc_core::ProxyConfig {
            url: format!("socks5://127.0.0.1:{port}"),
            exit_country: None,
        });
    }
    let geo_gate = match profile.proxy.as_ref() {
        Some(proxy) => {
            let observed = open_proxy_store(state)?
                .list()
                .iter()
                .find(|stored| stored.url == proxy.url)
                .and_then(|stored| stored.last_check.clone())
                .filter(|check| check.ok)
                .and_then(|check| check.country);
            Some(profile.check_geo_gate(observed.as_deref()))
        }
        None => None,
    };
    if let Some(gate) = &geo_gate {
        if !gate.allows_launch() {
            if assignment.is_some() {
                let _ = mihomo(state)?.stop_profile(id);
            }
            return Err(format!("the geo gate refused this launch: {gate:?}"));
        }
    }

    let camoufox_path = ensure_camoufox(app)?;
    let dir = store.browser_dir(id);

    // 自动清理上次可能残留的独占锁与未完成标记，确保多开稳定拉起
    for lock_name in &["parent.lock", ".startup-incomplete", "lock"] {
        let p1 = dir.join(lock_name);
        if p1.exists() {
            let _ = std::fs::remove_file(p1);
        }
        if let Some(parent) = dir.parent() {
            let p2 = parent.join(lock_name);
            if p2.exists() {
                let _ = std::fs::remove_file(p2);
            }
        }
    }

    let (mut plan, _discarded) = profile
        .launch_plan_after_discarding_conflicts(&dir, None, headless)
        .map_err(|error| error.to_string())?;
    plan.program = camoufox_path.to_string_lossy().to_string();

    let script_dir = store.automation_dir();
    narrc_core::automation::write_automation_script(&script_dir)
        .map_err(|error| format!("could not write the automation script: {error}"))?;
    narrc_core::automation::write_warmup_script(&script_dir)
        .map_err(|error| format!("could not write the warm-up script: {error}"))?;

    Ok(AutomationLaunch {
        plan,
        script_dir,
        assignment,
        geo_gate,
    })
}

/// Starts a profile's automation session.
///
/// The plan is the interactive launch's plan — same identity, same engine,
/// same profile directory — but instead of spawning the engine directly, the
/// plan is handed to the vendored automation script, which starts a Playwright
/// server and reports a WebSocket endpoint. Any Playwright client in any
/// language connects to that endpoint and drives the browser, and the browser
/// presents this profile's identity for the whole session.
pub fn start_automation_inner(
    state: &AppState,
    app: &tauri::AppHandle,
    id: &str,
    custom_driver: Option<&str>,
    custom_node: Option<&str>,
    port: Option<u16>,
    headless: bool,
) -> Result<serde_json::Value, String> {
    // 自动探测或使用传入的驱动和运行时
    let env_info = crate::local_api::detect_automation_env(custom_driver, custom_node);
    let resolved_driver = env_info
        .driver_path
        .as_deref()
        .ok_or_else(|| "未找到 Playwright Driver 驱动包路径，请确保已安装 Playwright 或在设置中指定".to_string())?;
    let resolved_node = env_info.node_path.as_deref().unwrap_or("node");

    {
        let agents = state.agents.lock().map_err(|error| error.to_string())?;
        if agents.contains_key(id) {
            return Err(format!("an automation session for {id:?} is already running"));
        }
        if agents.len() >= MAX_AUTOMATION_SESSIONS {
            return Err(format!(
                "{MAX_AUTOMATION_SESSIONS} automation sessions are already running; stop one \
                 before starting another"
            ));
        }
    }

    let prepared = prepare_automation_launch(state, app, id, headless)?;
    let script = prepared.script_dir.join("launchServer.js");

    let driver_path_owned = resolved_driver.to_string();
    let node_path_owned = resolved_node.to_string();

    let spawned = narrc_core::automation::spawn_agent(
        &prepared.plan,
        &node_path_owned,
        &driver_path_owned,
        &script,
        port,
        narrc_core::automation::DEFAULT_ENDPOINT_TIMEOUT,
    );

    let session = match spawned {
        Ok(session) => session,
        Err(error) => {
            if prepared.assignment.is_some() {
                let _ = mihomo(state).map(|mut m| m.stop_profile(id));
            }
            return Err(error.to_string());
        }
    };

    let reply = serde_json::json!({
        "wsEndpoint": session.ws_endpoint,
        "pid": session.pid(),
        "geo_gate": prepared.geo_gate,
    });
    state
        .agents
        .lock()
        .map_err(|error| error.to_string())?
        .insert(id.to_string(), session);
    Ok(reply)
}

pub fn stop_automation_inner(
    state: &AppState,
    id: &str,
) -> Result<serde_json::Value, String> {
    let session = state
        .agents
        .lock()
        .map_err(|error| error.to_string())?
        .remove(id)
        .ok_or_else(|| format!("no automation session for {id:?}"))?;
    std::thread::spawn(move || session.stop());
    Ok(serde_json::json!({ "stopped": true }))
}

pub fn list_profiles_inner(
    state: &AppState,
) -> Result<Vec<protocol::ProfileSummary>, String> {
    let store = open_store(state)?;
    let profiles = store.list();
    Ok(profiles.iter().map(protocol::ProfileSummary::of).collect())
}

#[tauri::command]
pub async fn detect_automation_env(
    custom_driver: Option<String>,
    custom_node: Option<String>,
) -> Result<crate::local_api::AutomationEnvInfo, String> {
    Ok(crate::local_api::detect_automation_env(
        custom_driver.as_deref(),
        custom_node.as_deref(),
    ))
}

#[tauri::command]
pub async fn get_local_api_status() -> Result<serde_json::Value, String> {
    Ok(crate::local_api::get_server_status())
}

/// Starts a profile's automation session.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn start_automation(
    _state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    id: String,
    driver_path: Option<String>,
    node_path: Option<String>,
    port: Option<u16>,
    headless: bool,
) -> Result<serde_json::Value, String> {
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        start_automation_inner(
            &state,
            &app2,
            &id,
            driver_path.as_deref(),
            node_path.as_deref(),
            port,
            headless,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Stops a profile's automation session.
#[tauri::command]
pub async fn stop_automation(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    stop_automation_inner(&state, &id)
}

/// Warms a profile up: visits a list of sites so cookies, cache and history
/// accumulate in the profile's real browser data.
///
/// A fresh profile is itself a tell — a browser with no history, no cookies
/// and an empty cache looks new however complete its fingerprint. The warm-up
/// launches the profile's engine through the same automation mount an
/// interactive session uses (same plan, same proxy, same geo gate), connects
/// the vendored warm-up driver, and lets it dwell on each site for the given
/// time. The browser then shuts down cleanly, which is what flushes the
/// profile's data to disk.
///
/// The driver reports one JSON line per site; per-site failures come back as
/// results with `ok: false`, because one dead site must not strand the rest.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn warmup_profile(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    id: String,
    driver_path: String,
    node_path: Option<String>,
    sites: Vec<String>,
    seconds_per_site: Option<u64>,
    mode: Option<String>,
    keywords: Option<Vec<String>>,
    engine: Option<String>,
    steps: Option<Vec<serde_json::Value>>,
    headless: Option<bool>,
) -> Result<serde_json::Value, String> {
    let resolved_driver = if driver_path.trim().is_empty() {
        let env = crate::local_api::detect_automation_env(None, node_path.as_deref());
        env.driver_path.unwrap_or_default()
    } else {
        driver_path.trim().to_string()
    };
    if resolved_driver.trim().is_empty() {
        return Err("a Playwright driver path is required and could not be detected automatically".to_string());
    }
    let mode_str = mode.unwrap_or_else(|| "urls".to_string());
    let is_search = mode_str == "search";
    let is_check = mode_str == "check";
    let is_workflow = mode_str == "workflow";

    let sites: Vec<String> = sites
        .into_iter()
        .map(|site| site.trim().to_owned())
        .filter(|site| !site.is_empty())
        .collect();
    if !is_search && !is_check && !is_workflow && sites.is_empty() {
        return Err("the task has no sites to visit".to_string());
    }
    if is_workflow && steps.as_ref().map(|s| s.is_empty()).unwrap_or(true) {
        return Err("the workflow has no steps to execute".to_string());
    }
    {
        let agents = state.agents.lock().map_err(|error| error.to_string())?;
        if agents.contains_key(&id) {
            return Err(format!(
                "an automation session for {id:?} is already running; stop it first"
            ));
        }
    }

    let seconds_per_site = seconds_per_site.unwrap_or(20).clamp(1, 300);
    let is_headless = headless.unwrap_or(true);
    let prepared = prepare_automation_launch(&state, &app, &id, is_headless)?;

    let job = serde_json::json!({
        "mode": mode_str,
        "sites": sites,
        "secondsPerSite": seconds_per_site,
        "keywords": keywords.unwrap_or_default(),
        "engine": engine.unwrap_or_else(|| "bing".to_string()),
        "gotoTimeoutMs": 30_000,
        "randomScroll": true,
        "steps": steps.unwrap_or_default(),
    });

    let driver = resolved_driver;
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<serde_json::Value, String> {
        // Held for the whole run: a warm-up is minutes of headless browsing,
        // and two racing would double the load without finishing any sooner.
        let app2 = app.clone();
        let state = app2.state::<AppState>();
        let _warmup_guard = state
            .warmup_lock
            .lock()
            .map_err(|error| format!("the warm-up lock is poisoned: {error}"))?;

        let node = node_path.as_deref().unwrap_or("node").to_owned();
        let session = narrc_core::automation::spawn_agent(
            &prepared.plan,
            &node,
            &driver,
            &prepared.script_dir.join("launchServer.js"),
            None,
            narrc_core::automation::DEFAULT_ENDPOINT_TIMEOUT,
        )
        .map_err(|error| error.to_string())?;

        // From here the session owns the browser; every exit path below stops
        // it, which is what closes the engine cleanly and flushes the data.
        let run = (|| -> Result<serde_json::Value, String> {
            let warmup = prepared.script_dir.join("warmup.js");
            let mut cmd = std::process::Command::new(&node);
            cmd.arg(&warmup)
                .arg(&driver)
                .arg(&session.ws_endpoint)
                .arg(job.to_string())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped());
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
            }
            let mut child = cmd
                .spawn()
                .map_err(|error| format!("could not run the warm-up driver: {error}"))?;

            let mut last_line = None;
            if let Some(stdout) = child.stdout.take() {
                use std::io::{BufRead, BufReader};
                use tauri::Emitter;
                let reader = BufReader::new(stdout);
                for line_res in reader.lines() {
                    if let Ok(line) = line_res {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() {
                            if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                                if let Some(progress) = val.get("progress") {
                                    let _ = app2.emit("workflow-step-progress", progress);
                                }
                            }
                            last_line = Some(trimmed.to_string());
                        }
                    }
                }
            }
            let _ = child.wait();
            let Some(line) = last_line else {
                return Err("the warm-up driver exited without printing results".to_string());
            };
            serde_json::from_str(&line)
                .map_err(|error| format!("the warm-up driver's reply is not JSON: {error}"))
        })();

        session.stop();
        run
    })
    .await
    .map_err(|error| format!("the warm-up task failed: {error}"))?;

    // The browser is gone; the core instance it may have been riding goes with
    // it, the same way an interactive launch's does.
    if prepared.assignment.is_some() {
        let _ = mihomo(&state)?.stop_profile(&id);
    }

    let mut reply = result?;
    if let Some(object) = reply.as_object_mut() {
        object.insert("geo_gate".into(), serde_json::json!(prepared.geo_gate));
    }
    Ok(reply)
}

/// Runs a custom visual workflow step chain (Click, Type, Screenshot, etc.) on a profile.
#[tauri::command]
pub async fn run_workflow(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    id: String,
    driver_path: Option<String>,
    node_path: Option<String>,
    steps: Vec<serde_json::Value>,
    headless: Option<bool>,
) -> Result<serde_json::Value, String> {
    warmup_profile(
        state,
        app,
        id,
        driver_path.unwrap_or_default(),
        node_path,
        vec![],
        Some(10),
        Some("workflow".to_string()),
        None,
        None,
        Some(steps),
        headless,
    )
    .await
}

/// Lists the running automation sessions.
#[tauri::command]
pub async fn list_automation(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let agents = state.agents.lock().map_err(|error| error.to_string())?;
    let sessions: Vec<serde_json::Value> = agents
        .iter()
        .map(|(id, session)| {
            serde_json::json!({
                "id": id,
                "wsEndpoint": session.ws_endpoint,
                "pid": session.pid(),
            })
        })
        .collect();
    Ok(serde_json::json!({ "sessions": sessions }))
}

// ---------------------------------------------------------------- proxies

/// The wire shape of a proxy as the form supplies it.
#[derive(serde::Deserialize)]
struct ProxySpec {
    name: String,
    url: String,
    #[serde(default)]
    exit_country: Option<String>,
    /// Rewrite the profiles still carrying the previous URL, on an edit that
    /// moved the route.
    #[serde(default)]
    update_profiles: Option<bool>,
}

/// One profile a stored proxy is assigned to.
#[derive(serde::Serialize)]
struct UsedBy {
    id: String,
    name: String,
}

/// Lists every stored proxy, each with the profiles carrying its URL.
///
/// The profile keeps the URL inline, so usage is a match on the URL rather
/// than a foreign key: a profile assigned by hand still counts.
#[tauri::command]
pub async fn list_proxies(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let proxies = open_proxy_store(&state)?;
    let profiles = open_store(&state)?.list();
    let rows: Vec<serde_json::Value> = proxies
        .list()
        .iter()
        .map(|proxy| {
            let used_by: Vec<UsedBy> = profiles
                .iter()
                .filter(|profile| {
                    profile
                        .proxy
                        .as_ref()
                        .is_some_and(|config| config.url == proxy.url)
                })
                .map(|profile| UsedBy {
                    id: profile.id.clone(),
                    name: profile.name.clone(),
                })
                .collect();
            let mut row = serde_json::to_value(proxy).unwrap_or(serde_json::Value::Null);
            if let Some(object) = row.as_object_mut() {
                if let Ok(value) = serde_json::to_value(&used_by) {
                    object.insert("used_by".to_owned(), value);
                }
            }
            row
        })
        .collect();
    Ok(serde_json::Value::Array(rows))
}

/// Adds a proxy to the list.
#[tauri::command]
pub async fn create_proxy(
    state: tauri::State<'_, AppState>,
    spec: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let spec: ProxySpec =
        serde_json::from_value(spec).map_err(|error| format!("invalid proxy spec: {error}"))?;
    let mut store = open_proxy_store(&state)?;
    let proxy = store
        .create(&spec.name, &spec.url, spec.exit_country.as_deref())
        .map_err(|error| error.to_string())?;
    serde_json::to_value(&proxy).map_err(|error| error.to_string())
}

/// Rewrites a stored proxy, optionally with it in every profile using it.
#[tauri::command]
pub async fn update_proxy(
    state: tauri::State<'_, AppState>,
    id: String,
    spec: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let spec: ProxySpec =
        serde_json::from_value(spec).map_err(|error| format!("invalid proxy spec: {error}"))?;
    let mut store = open_proxy_store(&state)?;
    let previous_url = store
        .get(&id)
        .map(|proxy| proxy.url.clone())
        .ok_or_else(|| format!("no proxy with the id {id:?}"))?;
    let proxy = store
        .update(&id, &spec.name, &spec.url, spec.exit_country.as_deref())
        .map_err(|error| error.to_string())?;

    let mut updated_profiles = 0usize;
    if spec.update_profiles == Some(true) && previous_url != proxy.url {
        let profiles = open_store(&state)?;
        for mut profile in profiles.list() {
            let carries_previous = profile
                .proxy
                .as_ref()
                .is_some_and(|config| config.url == previous_url);
            if !carries_previous {
                continue;
            }
            profile.proxy = Some(ProxyConfig {
                url: proxy.url.clone(),
                exit_country: proxy.exit_country.clone(),
            });
            profiles.save(&profile).map_err(|error| error.to_string())?;
            updated_profiles += 1;
        }
    }

    Ok(serde_json::json!({
        "proxy": proxy,
        "updated_profiles": updated_profiles,
    }))
}

/// Removes a stored proxy from the list.
///
/// Profiles keep the URL they carry; this only drops the list entry, so an
/// in-use guard belongs to the UI that can say which profiles are using it.
#[tauri::command]
pub async fn delete_proxy(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let mut store = open_proxy_store(&state)?;
    let removed = store.delete(&id).map_err(|error| error.to_string())?;
    if !removed {
        return Err(format!("no proxy with the id {id:?}"));
    }
    Ok(serde_json::json!({ "deleted": id }))
}

/// The payload an assignment arrives as.
#[derive(serde::Deserialize)]
struct AssignSpec {
    profile_ids: Vec<String>,
    /// The proxy to set, or `None` to send the profiles direct.
    #[serde(default)]
    proxy: Option<AssignTarget>,
}

#[derive(serde::Deserialize)]
struct AssignTarget {
    url: String,
    #[serde(default)]
    exit_country: Option<String>,
}

/// Sets (or clears) a proxy on several profiles in one call.
///
/// Each profile is loaded and saved on its own: one that cannot be written
/// must not discard the results for the others.
#[tauri::command]
pub async fn assign_proxy(
    state: tauri::State<'_, AppState>,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let spec: AssignSpec = serde_json::from_value(payload)
        .map_err(|error| format!("invalid assignment: {error}"))?;
    if spec.profile_ids.is_empty() {
        return Err("no profiles selected".to_string());
    }
    let config = match &spec.proxy {
        Some(target) => Some(
            narrc_core::proxy_store::checked_config(&target.url, target.exit_country.as_deref())
                .map_err(|error| error.to_string())?,
        ),
        None => None,
    };

    let store = open_store(&state)?;
    let mut updated: Vec<String> = Vec::new();
    let mut failed: Vec<serde_json::Value> = Vec::new();
    for id in &spec.profile_ids {
        let outcome = match store.load(id) {
            Ok(Some(mut profile)) => {
                profile.proxy = config.clone();
                store.save(&profile).map_err(|error| error.to_string())
            }
            Ok(None) => Err(format!("no profile with the id {id:?}")),
            Err(error) => Err(error.to_string()),
        };
        match outcome {
            Ok(()) => updated.push(id.clone()),
            Err(error) => failed.push(serde_json::json!({ "id": id, "error": error })),
        }
    }

    Ok(serde_json::json!({
        "updated": updated,
        "failed": failed,
    }))
}

/// What an echo service reported about the exit.
///
/// Defined beside the proxy core: the node exit check reads the same shapes.
use crate::mihomo::Echo;

/// The payload a check arrives as.
#[derive(serde::Deserialize)]
struct CheckSpec {
    url: String,
    /// The list entry to record the receipt against, when there is one.
    #[serde(default)]
    id: Option<String>,
}

/// Checks that a proxy reaches an echo service, and records the receipt.
#[tauri::command]
pub async fn check_proxy(
    state: tauri::State<'_, AppState>,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let spec: CheckSpec =
        serde_json::from_value(payload).map_err(|error| format!("invalid check: {error}"))?;

    let started = std::time::Instant::now();
    let outcome = run_check(&spec.url).await;
    let check = narrc_core::ProxyCheck {
        ok: outcome.is_ok(),
        ip: outcome.as_ref().ok().map(|echo| echo.ip.clone()),
        country: outcome.as_ref().ok().and_then(|echo| echo.country.clone()),
        city: outcome.as_ref().ok().and_then(|echo| echo.city.clone()),
        error: outcome.as_ref().err().cloned(),
        latency_ms: u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX),
        checked_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|since| since.as_secs())
            .unwrap_or(0),
    };

    if let Some(id) = &spec.id {
        let mut store = open_proxy_store(&state)?;
        store
            .set_check(id, check.clone())
            .map_err(|error| error.to_string())?;
    }

    serde_json::to_value(&check).map_err(|error| error.to_string())
}

/// Runs the check: one request per echo endpoint, first answer wins.
async fn run_check(url: &str) -> Result<Echo, String> {
    // Validated the way a stored proxy is, so an unsupported scheme reads as
    // "unsupported" instead of surfacing as a socket error halfway through.
    narrc_core::proxy_store::checked_config(url, None).map_err(|error| error.to_string())?;
    let proxy =
        reqwest::Proxy::all(url).map_err(|error| format!("this build cannot use that proxy: {error}"))?;
    let client = reqwest::Client::builder()
        .proxy(proxy)
        .connect_timeout(std::time::Duration::from_secs(6))
        .timeout(std::time::Duration::from_secs(8))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .build()
        .map_err(|error| error.to_string())?;

    let mut last = "no echo service answered".to_string();
    let mut bare_ip_fallback = None;
    for endpoint in crate::mihomo::ECHO_ENDPOINTS {
        match fetch_echo(&client, endpoint).await {
            Ok(echo) => return Ok(echo),
            Err((error, maybe_ip)) => {
                if let Some(ip) = maybe_ip {
                    bare_ip_fallback = Some(ip);
                }
                last = error;
            }
        }
    }
    if let Some(ip) = bare_ip_fallback {
        return Ok(Echo {
            ip,
            country: None,
            city: None,
        });
    }
    Err(last)
}

/// One endpoint's answer, read as Cloudflare trace, JSON, or bare IP.
async fn fetch_echo(client: &reqwest::Client, endpoint: &str) -> Result<Echo, (String, Option<String>)> {
    let response = client
        .get(endpoint)
        .send()
        .await
        .map_err(|error| (error.to_string(), None))?;
    let status = response.status();
    if !status.is_success() {
        return Err((format!("{endpoint} returned status {status}"), None));
    }
    let body = response.text().await.map_err(|error| (error.to_string(), None))?;
    match crate::mihomo::parse_echo(endpoint, &body) {
        Ok(echo) => Ok(echo),
        Err(err) => {
            let trimmed = body.trim();
            let maybe_ip = if trimmed.parse::<std::net::IpAddr>().is_ok() {
                Some(trimmed.to_string())
            } else {
                None
            };
            Err((err, maybe_ip))
        }
    }
}

// --------------------------------------------------------- subscriptions

/// The wire shape of a subscription as the form supplies it.
#[derive(serde::Deserialize)]
struct SubscriptionSpec {
    name: String,
    url: String,
}

/// The wire shape of a node a test targets.
#[derive(serde::Deserialize)]
struct NodeRef {
    subscription_id: String,
    node: String,
}

/// Unix seconds now.
fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0)
}

/// Opens the subscription list, which lives beside the profiles.
pub fn open_subscription_store(
    state: &AppState,
) -> Result<narrc_core::SubscriptionStore, String> {
    narrc_core::SubscriptionStore::open(store_root(state)?.join("subscriptions.json"))
        .map_err(|error| error.to_string())
}

/// Opens the assignment list, which lives beside the profiles.
pub fn open_assignment_store(
    state: &AppState,
) -> Result<narrc_core::AssignmentStore, String> {
    narrc_core::AssignmentStore::open(store_root(state)?.join("assignments.json"))
        .map_err(|error| error.to_string())
}

/// The group name list, which lives beside the profiles it files.
pub fn open_group_store(state: &AppState) -> Result<narrc_core::group::GroupStore, String> {
    narrc_core::group::GroupStore::open(store_root(state)?.join("groups.json"))
        .map_err(|error| error.to_string())
}

/// The proxy core manager, locked.
fn mihomo(
    state: &AppState,
) -> Result<std::sync::MutexGuard<'_, crate::mihomo::MihomoManager>, String> {
    state.mihomo.lock().map_err(|error| error.to_string())
}

/// The network instance's controller handle, starting it if needed.
fn network_handle(
    app: &tauri::AppHandle,
    state: &AppState,
    subs: &[narrc_core::StoredSubscription],
) -> Result<(u16, String, u16), String> {
    mihomo(state)?.network_handle(app, subs)
}

/// Restarts the network instance so its providers match the subscriptions.
///
/// With no subscriptions left the instance is stopped rather than restarted
/// empty: Mihomo refuses an empty provider mapping.
fn reload_network(
    app: &tauri::AppHandle,
    state: &AppState,
    subs: &[narrc_core::StoredSubscription],
) -> Result<(), String> {
    mihomo(state)?.reload_network(app, subs)
}

/// Whether the proxy core is installed and whether one is running.
#[tauri::command]
pub async fn core_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        let running = mihomo(state.inner())?.network_is_running();
        let installed = dirs_next::home_dir()
            .map(|_| crate::mihomo::core_binary_path().exists())
            .unwrap_or(false);
        Ok(serde_json::json!({ "installed": installed, "running": running }))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Lists the stored subscriptions, with a live node count when the core runs.
#[tauri::command]
pub async fn list_subscriptions(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let subs = open_subscription_store(&state)?.list().to_vec();
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        {
            let manager = mihomo(state.inner())?;
            if let Some(core) = manager.network_core() {
                let client = crate::mihomo::blocking_client(10);
                for sub in &subs {
                    if let Ok(nodes) = crate::mihomo::provider_nodes(
                        &client,
                        core.api_port(),
                        core.secret(),
                        &sub.provider_name(),
                    ) {
                        counts.insert(sub.id.clone(), nodes.len());
                    }
                }
            }
        }
        let rows: Vec<serde_json::Value> = subs
            .iter()
            .map(|sub| {
                serde_json::json!({
                    "id": sub.id,
                    "name": sub.name,
                    "url": sub.url,
                    "updated_at": sub.updated_at,
                    "node_count": counts.get(&sub.id),
                })
            })
            .collect();
        Ok(serde_json::json!({ "subscriptions": rows }))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Adds a subscription.
#[tauri::command]
pub async fn create_subscription(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    spec: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let spec: SubscriptionSpec =
        serde_json::from_value(spec).map_err(|error| format!("invalid subscription spec: {error}"))?;
    let created = {
        let mut store = open_subscription_store(&state)?;
        store
            .create(&spec.name, &spec.url)
            .map_err(|error| error.to_string())?
    };
    let subs = open_subscription_store(&state)?.list().to_vec();
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        reload_network(&app2, state.inner(), &subs)?;
        serde_json::to_value(&created).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Rewrites a subscription's name and URL.
#[tauri::command]
pub async fn update_subscription(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
    spec: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let spec: SubscriptionSpec =
        serde_json::from_value(spec).map_err(|error| format!("invalid subscription spec: {error}"))?;
    let updated = {
        let mut store = open_subscription_store(&state)?;
        store
            .update(&id, &spec.name, &spec.url)
            .map_err(|error| error.to_string())?
    };
    let subs = open_subscription_store(&state)?.list().to_vec();
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        reload_network(&app2, state.inner(), &subs)?;
        serde_json::to_value(&updated).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Removes a subscription.
#[tauri::command]
pub async fn delete_subscription(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let removed = {
        let mut store = open_subscription_store(&state)?;
        store.delete(&id).map_err(|error| error.to_string())?
    };
    if !removed {
        return Err(format!("no subscription with the id {id:?}"));
    }
    // Stop every profile core routed through this subscription and drop their
    // assignments, so neither a process nor a dangling reference outlives it.
    let routed: Vec<String> = {
        let assignments = open_assignment_store(&state)?;
        assignments
            .list()
            .iter()
            .filter(|entry| entry.subscription_id == id)
            .map(|entry| entry.profile_id.clone())
            .collect()
    };
    for profile_id in &routed {
        mihomo(&state)?.stop_profile(profile_id)?;
    }
    let mut assignments = open_assignment_store(&state)?;
    assignments
        .remove_by_subscription(&id)
        .map_err(|error| error.to_string())?;
    // The routed cores are stopped by now, so nothing holds the fetched
    // provider file open and its cached copy — credentials included — can go.
    crate::mihomo::purge_provider_cache(&id);
    let subs = open_subscription_store(&state)?.list().to_vec();
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        reload_network(&app2, state.inner(), &subs)?;
        Ok(serde_json::json!({ "deleted": id }))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// The provider name of a stored subscription.
fn provider_of(
    state: &tauri::State<'_, AppState>,
    id: &str,
) -> Result<(String, Vec<narrc_core::StoredSubscription>), String> {
    let store = open_subscription_store(state)?;
    let sub = store
        .get(id)
        .ok_or_else(|| format!("no subscription with the id {id:?}"))?;
    Ok((sub.provider_name(), store.list().to_vec()))
}

/// The nodes a subscription currently holds.
#[tauri::command]
pub async fn list_subscription_nodes(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let (provider, subs) = provider_of(&state, &id)?;
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        let (api, secret, _speed) = network_handle(&app2, state.inner(), &subs)?;
        let client = crate::mihomo::blocking_client(30);
        let mut nodes = read_nodes(&client, api, &secret, &provider, false, 25)?;
        let sub = open_subscription_store(&state)?.get(&id).cloned();
        apply_stored_delays(sub.as_ref(), &mut nodes);
        Ok(serde_json::json!({ "nodes": nodes }))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Folds stored latency, speed, and exit runs into a freshly read node list.
///
/// Once the app has tested a subscription, those runs are what the list shows
/// — nodes they failed read back as no measurement rather than the core's
/// older history — and the core's own history only speaks before the first test.
fn apply_stored_delays(
    sub: Option<&narrc_core::StoredSubscription>,
    nodes: &mut [crate::mihomo::NodeInfo],
) {
    if let Some(sub) = sub {
        if let Some(delays) = sub.delays.as_ref() {
            for node in &mut *nodes {
                node.delay = delays.get(&node.name).cloned().flatten();
            }
        }
        if let Some(speeds) = sub.speeds.as_ref() {
            for node in &mut *nodes {
                node.speed = speeds.get(&node.name).cloned().flatten();
            }
        }
        if let Some(exits) = sub.exits.as_ref() {
            for node in &mut *nodes {
                node.exit_country = exits.get(&node.name).cloned().flatten();
            }
        }
    }
}

/// Reads a provider's nodes, waiting briefly for a fetch that is still running.
///
/// A core that has just started fetches its providers asynchronously, so the
/// first read races the fetch and would report an empty subscription. `force`
/// re-fetches first, for a caller that wants the provider refreshed.
fn read_nodes(
    client: &reqwest::blocking::Client,
    api: u16,
    secret: &str,
    provider: &str,
    force: bool,
    attempts: u32,
) -> Result<Vec<crate::mihomo::NodeInfo>, String> {
    if force {
        crate::mihomo::refresh_provider(client, api, secret, provider)?;
    }
    let mut nodes = crate::mihomo::provider_nodes(client, api, secret, provider)?;
    for _ in 0..attempts {
        if !nodes.is_empty() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(400));
        nodes = crate::mihomo::provider_nodes(client, api, secret, provider)?;
    }
    Ok(nodes)
}

/// Re-fetches a subscription's nodes from its provider.
#[tauri::command]
pub async fn refresh_subscription(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let (provider, subs) = provider_of(&state, &id)?;
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        let (api, secret, _speed) = network_handle(&app2, state.inner(), &subs)?;
        let client = crate::mihomo::blocking_client(60);
        // The controller's provider-update endpoint reuses a pooled connection,
        // and a server that drops an idle connection makes it fail with an EOF
        // the core does not retry. When that happens, restarting re-fetches
        // through the startup path, which always opens a fresh connection.
        let mut nodes = match read_nodes(&client, api, &secret, &provider, true, 25) {
            Ok(nodes) => nodes,
            Err(_) => {
                reload_network(&app2, state.inner(), &subs)?;
                let (api, secret, _speed) = network_handle(&app2, state.inner(), &subs)?;
                let client = crate::mihomo::blocking_client(60);
                read_nodes(&client, api, &secret, &provider, false, 25)?
            }
        };
        let mut store = open_subscription_store(&state)?;
        let sub = store.get(&id).cloned();
        apply_stored_delays(sub.as_ref(), &mut nodes);
        store.touch(&id, now_secs()).map_err(|error| error.to_string())?;
        Ok(serde_json::json!({ "nodes": nodes }))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Measures one node's latency, in milliseconds.
#[tauri::command]
pub async fn test_node_delay(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let spec: NodeRef =
        serde_json::from_value(payload).map_err(|error| format!("invalid node: {error}"))?;
    let (provider, subs) = provider_of(&state, &spec.subscription_id)?;
    let sub_id = spec.subscription_id.clone();
    let node = spec.node.clone();
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        let (api, secret, _speed) = network_handle(&app2, state.inner(), &subs)?;
        let client = crate::mihomo::blocking_client(20);
        let delay = crate::mihomo::node_delay(&client, api, &secret, &provider, &node)?;
        // Recorded whichever way it went — a `None` is this run's failure to
        // measure, and shows as such instead of leaving an older number to
        // pass for a fresh one. A request the core refused to make at all
        // (`Err`, already propagated) says nothing about the node.
        let mut store = open_subscription_store(&state)?;
        store
            .set_delay(&sub_id, &node, delay)
            .map_err(|error| error.to_string())?;
        Ok(serde_json::json!({ "delay": delay }))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Measures every node of the subscription's provider in one batch.
///
/// The batch is one core request that tests the whole group concurrently, so
/// its cost is a single timeout window rather than the node count. The group
/// is the subscription's own — testing the shared one would measure every
/// subscription at once, and that contention would show up as inflated
/// readings and live nodes pushed past the timeout.
#[tauri::command]
pub async fn test_subscription_delays(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let (provider, subs) = provider_of(&state, &id)?;
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        let (api, secret, _speed) = network_handle(&app2, state.inner(), &subs)?;
        let sub = subs
            .iter()
            .find(|entry| entry.id == id)
            .ok_or_else(|| format!("no subscription with the id {id:?}"))?;
        let client = crate::mihomo::blocking_client(60);
        let nodes = read_nodes(&client, api, &secret, &provider, false, 10)?;
        if nodes.is_empty() {
            return Err("the subscription has no nodes to test yet".to_owned());
        }
        let delays = crate::mihomo::group_delay(&client, api, &secret, &sub.node_group_name())?;
        // Stored as this run's full snapshot — milliseconds for what
        // answered, `null` for what did not — so a later dialog shows the
        // newest test and nothing older.
        let snapshot: std::collections::HashMap<String, Option<u32>> = nodes
            .iter()
            .map(|node| (node.name.clone(), delays.get(&node.name).copied()))
            .collect();
        let mut store = open_subscription_store(&state)?;
        store
            .set_delays(&id, snapshot)
            .map_err(|error| error.to_string())?;
        Ok(serde_json::json!({ "delays": delays }))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Measures one node's download speed, in megabits per second.
#[tauri::command]
pub async fn test_node_speed(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let spec: NodeRef =
        serde_json::from_value(payload).map_err(|error| format!("invalid node: {error}"))?;
    let subs = open_subscription_store(&state)?.list().to_vec();
    let node = spec.node.clone();
    let sub_id = spec.subscription_id.clone();
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        // Held for the whole test: the download repoints the shared SPEEDTEST
        // group, and a second test starting mid-download would repoint it back
        // and both would measure the wrong node.
        let _speed_guard = state.speed_lock.lock();
        let (api, secret, speed) = network_handle(&app2, state.inner(), &subs)?;
        let client = crate::mihomo::blocking_client(20);
        let mbps = crate::mihomo::node_speed(&client, api, &secret, speed, &node)?;
        // Persist so reopening the dialog shows the latest run instead of —.
        let mut store = open_subscription_store(&state)?;
        store
            .set_speed(&sub_id, &node, mbps)
            .map_err(|error| error.to_string())?;
        Ok(serde_json::json!({ "mbps": mbps }))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Reports which country a node's traffic really exits from.
///
/// The same shared group the speed test repoints, so the same lock applies —
/// an exit check and a speed test running at once would each send the group
/// somewhere else and both would answer for the wrong node.
#[tauri::command]
pub async fn test_node_exit(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let spec: NodeRef =
        serde_json::from_value(payload).map_err(|error| format!("invalid node: {error}"))?;
    let subs = open_subscription_store(&state)?.list().to_vec();
    let node = spec.node.clone();
    let sub_id = spec.subscription_id.clone();
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        let _speed_guard = state.speed_lock.lock();
        let (api, secret, speed) = network_handle(&app2, state.inner(), &subs)?;
        let client = crate::mihomo::blocking_client(120);
        let started = std::time::Instant::now();
        let echo = crate::mihomo::node_exit(&client, api, &secret, speed, &node)?;
        // Persist so reopening the dialog shows the latest run instead of —.
        let mut store = open_subscription_store(&state)?;
        let display_country = echo.country.clone().or_else(|| Some(echo.ip.clone()));
        store
            .set_exit(&sub_id, &node, display_country.clone())
            .map_err(|error| error.to_string())?;
        Ok(serde_json::json!({
            "ip": echo.ip,
            "country": display_country,
            "city": echo.city,
            "latency_ms": u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX),
        }))
    })
    .await
    .map_err(|error| error.to_string())?
}

// ------------------------------------------------------------ assignments

/// The wire shape of a node assignment as the form supplies it.
#[derive(serde::Deserialize)]
struct NodeAssignSpec {
    profile_ids: Vec<String>,
    subscription_id: String,
    node: String,
}

/// The wire shape of an unassign as the form supplies it.
#[derive(serde::Deserialize)]
struct UnassignSpec {
    profile_ids: Vec<String>,
}

/// Routes profiles through a node.
///
/// The node is served by a dedicated core instance per profile, started on
/// first use and stopped when that profile's browser exits.
#[tauri::command]
pub async fn assign_node(
    state: tauri::State<'_, AppState>,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let spec: NodeAssignSpec =
        serde_json::from_value(payload).map_err(|error| format!("invalid assignment: {error}"))?;
    if spec.profile_ids.is_empty() {
        return Err("no profiles selected".to_string());
    }
    let mut assignments = open_assignment_store(&state)?;
    for profile_id in &spec.profile_ids {
        assignments
            .set(profile_id, &spec.subscription_id, &spec.node)
            .map_err(|error| error.to_string())?;
    }
    Ok(serde_json::json!({ "assigned": spec.profile_ids }))
}

/// Stops routing profiles through nodes.
#[tauri::command]
pub async fn unassign_node(
    state: tauri::State<'_, AppState>,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let spec: UnassignSpec =
        serde_json::from_value(payload).map_err(|error| format!("invalid unassign: {error}"))?;
    if spec.profile_ids.is_empty() {
        return Err("no profiles selected".to_string());
    }
    let mut assignments = open_assignment_store(&state)?;
    let mut removed = 0;
    for profile_id in &spec.profile_ids {
        if assignments.remove(profile_id).map_err(|error| error.to_string())? {
            removed += 1;
        }
    }
    Ok(serde_json::json!({ "removed": removed }))
}

/// Lists every profile's node assignment.
#[tauri::command]
pub async fn list_assignments(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let assignments = open_assignment_store(&state)?;
    Ok(serde_json::json!({ "assignments": assignments.list() }))
}

/// Ensures that built-in special subscriptions (Psiphon, VPNGate, MegaV)
/// are registered in the subscription store and their initial provider files exist.
#[tauri::command]
pub async fn ensure_special_subscriptions(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut store = open_subscription_store(&state)?;
    store.ensure_builtins().map_err(|e| e.to_string())?;
    crate::special_subscriptions::ensure_special_provider_file(narrc_core::subscription::BUILTIN_PSIPHON_ID)?;
    crate::special_subscriptions::ensure_special_provider_file(narrc_core::subscription::BUILTIN_VPNGATE_ID)?;
    crate::special_subscriptions::ensure_special_provider_file(narrc_core::subscription::BUILTIN_MEGAV_ID)?;
    let transit_config = crate::special_subscriptions::load_vpngate_transit_config();
    let target = crate::special_subscriptions::vpngate_transit_target_name(&transit_config);
    let _ = crate::special_subscriptions::apply_vpngate_transit(target.as_deref());
    Ok(())
}

/// Refreshes a special subscription by re-fetching upstream nodes and reloading Mihomo.
/// Retains surviving nodes, removes timed-out nodes, and merges fresh nodes.
#[tauri::command]
pub async fn refresh_special_subscription(
    app: tauri::AppHandle,
    _state: tauri::State<'_, AppState>,
    id: String,
    timed_out_nodes: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        {
            let mut store = open_subscription_store(&state)?;
            store.ensure_builtins().map_err(|e| e.to_string())?;
        }

        let mut timed_outs = std::collections::HashSet::new();
        if let Some(list) = timed_out_nodes {
            timed_outs.extend(list);
        }
        if let Ok(store) = open_subscription_store(&state) {
            if let Some(sub) = store.get(&id) {
                if let Some(delays) = &sub.delays {
                    for (name, delay) in delays {
                        if delay.is_none() {
                            timed_outs.insert(name.clone());
                        }
                    }
                }
            }
        }

        let _ = crate::special_subscriptions::refresh_special_subscription_file(&id, &timed_outs);

        let mut store = open_subscription_store(&state)?;
        if let Some(sub) = store.get(&id) {
            if let Some(mut delays) = sub.delays.clone() {
                for name in &timed_outs {
                    delays.remove(name);
                }
                let _ = store.set_delays(&id, delays);
            }
        }
        let subs = store.list().to_vec();
        let _ = reload_network(&app2, state.inner(), &subs);
        let provider = store
            .get(&id)
            .map(|s| s.provider_name())
            .unwrap_or_else(|| format!("sub-{id}"));

        let mut nodes = match network_handle(&app2, state.inner(), &subs) {
            Ok((api, secret, _speed)) => {
                let client = crate::mihomo::blocking_client(10);
                match read_nodes(&client, api, &secret, &provider, false, 5) {
                    Ok(n) if !n.is_empty() => n,
                    _ => crate::special_subscriptions::parse_nodes_from_provider_yaml(&id),
                }
            }
            Err(_) => crate::special_subscriptions::parse_nodes_from_provider_yaml(&id),
        };

        let sub = store.get(&id).cloned();
        apply_stored_delays(sub.as_ref(), &mut nodes);
        store.touch(&id, now_secs()).map_err(|error| error.to_string())?;
        Ok(serde_json::json!({ "nodes": nodes }))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Prunes timed out nodes from a special subscription immediately.
#[tauri::command]
pub async fn prune_special_subscription_nodes(
    app: tauri::AppHandle,
    _state: tauri::State<'_, AppState>,
    id: String,
    timed_out_nodes: Vec<String>,
) -> Result<serde_json::Value, String> {
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        let mut timed_outs = std::collections::HashSet::new();
        timed_outs.extend(timed_out_nodes);

        let _ = crate::special_subscriptions::prune_special_subscription_file(&id, &timed_outs);

        let mut store = open_subscription_store(&state)?;
        if let Some(sub) = store.get(&id) {
            if let Some(mut delays) = sub.delays.clone() {
                for name in &timed_outs {
                    delays.remove(name);
                }
                let _ = store.set_delays(&id, delays);
            }
        }
        let subs = store.list().to_vec();
        let _ = reload_network(&app2, state.inner(), &subs);
        let provider = store
            .get(&id)
            .map(|s| s.provider_name())
            .unwrap_or_else(|| format!("sub-{id}"));

        let mut nodes = match network_handle(&app2, state.inner(), &subs) {
            Ok((api, secret, _speed)) => {
                let client = crate::mihomo::blocking_client(10);
                match read_nodes(&client, api, &secret, &provider, false, 5) {
                    Ok(n) if !n.is_empty() => n,
                    _ => crate::special_subscriptions::parse_nodes_from_provider_yaml(&id),
                }
            }
            Err(_) => crate::special_subscriptions::parse_nodes_from_provider_yaml(&id),
        };

        let sub = store.get(&id).cloned();
        apply_stored_delays(sub.as_ref(), &mut nodes);
        store.touch(&id, now_secs()).map_err(|error| error.to_string())?;
        Ok(serde_json::json!({ "nodes": nodes }))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Lists nodes of a special subscription, ensuring provider files are ready.
#[tauri::command]
pub async fn list_special_nodes(
    app: tauri::AppHandle,
    _state: tauri::State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        {
            let mut store = open_subscription_store(&state)?;
            store.ensure_builtins().map_err(|e| e.to_string())?;
        }
        let _ = crate::special_subscriptions::ensure_special_provider_file(&id);
        let store = open_subscription_store(&state)?;
        let subs = store.list().to_vec();
        let provider = store
            .get(&id)
            .map(|s| s.provider_name())
            .unwrap_or_else(|| format!("sub-{id}"));

        let mut nodes = match network_handle(&app2, state.inner(), &subs) {
            Ok((api, secret, _speed)) => {
                let client = crate::mihomo::blocking_client(10);
                match read_nodes(&client, api, &secret, &provider, false, 5) {
                    Ok(n) if !n.is_empty() => n,
                    _ => crate::special_subscriptions::parse_nodes_from_provider_yaml(&id),
                }
            }
            Err(_) => crate::special_subscriptions::parse_nodes_from_provider_yaml(&id),
        };

        let sub = store.get(&id).cloned();
        apply_stored_delays(sub.as_ref(), &mut nodes);
        Ok(serde_json::json!({ "nodes": nodes }))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Retrieves the current VPNGate transit node configuration.
#[tauri::command]
pub async fn get_vpngate_transit_node() -> Result<crate::special_subscriptions::VpngateTransitConfig, String> {
    Ok(crate::special_subscriptions::load_vpngate_transit_config())
}

/// Sets the VPNGate transit node configuration, applies it to builtin-vpngate.yaml,
/// and reloads the Mihomo network instance so the change takes effect immediately.
#[tauri::command]
pub async fn set_vpngate_transit_node(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    config: crate::special_subscriptions::VpngateTransitConfig,
) -> Result<crate::special_subscriptions::VpngateTransitConfig, String> {
    crate::special_subscriptions::save_vpngate_transit_config(&config)?;
    let target_name = crate::special_subscriptions::vpngate_transit_target_name(&config);
    crate::special_subscriptions::apply_vpngate_transit(target_name.as_deref())?;

    let subs = open_subscription_store(&state)?.list().to_vec();
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        reload_network(&app2, state.inner(), &subs)
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(config)
}

/// Returns the current advanced proxy foundation settings.
#[tauri::command]
pub async fn get_advanced_proxy_settings() -> Result<crate::mihomo::AdvancedProxySettings, String> {
    Ok(crate::mihomo::load_advanced_settings())
}

/// Saves the advanced proxy settings and restarts the network instance if running.
#[tauri::command]
pub async fn save_advanced_proxy_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    settings: crate::mihomo::AdvancedProxySettings,
) -> Result<crate::mihomo::AdvancedProxySettings, String> {
    crate::mihomo::save_advanced_settings(&settings)?;
    let subs = open_subscription_store(&state)?.list().to_vec();
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        let _ = reload_network(&app2, state.inner(), &subs);
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(settings)
}

/// Returns the full routing rule collection (all rule sets + active id).
#[tauri::command]
pub async fn get_routing_collection() -> Result<crate::mihomo::RoutingRuleCollection, String> {
    Ok(crate::mihomo::load_routing_collection())
}

/// Saves the routing rule collection and reloads the network core.
#[tauri::command]
pub async fn save_routing_collection(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    collection: crate::mihomo::RoutingRuleCollection,
) -> Result<crate::mihomo::RoutingRuleCollection, String> {
    crate::mihomo::save_routing_collection(&collection)?;
    let subs = open_subscription_store(&state)?.list().to_vec();
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        let _ = reload_network(&app2, state.inner(), &subs);
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(collection)
}

/// Resets to the default routing rule collection.
#[tauri::command]
pub async fn reset_routing_collection(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<crate::mihomo::RoutingRuleCollection, String> {
    let default_col = crate::mihomo::RoutingRuleCollection::default();
    crate::mihomo::save_routing_collection(&default_col)?;
    let subs = open_subscription_store(&state)?.list().to_vec();
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        let _ = reload_network(&app2, state.inner(), &subs);
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(default_col)
}

/// Returns the current active routing rule set.
#[tauri::command]
pub async fn get_routing_rule_set() -> Result<crate::mihomo::RoutingRuleSet, String> {
    Ok(crate::mihomo::load_routing_rule_set())
}

/// Saves the routing rule set and reloads the network core.
#[tauri::command]
pub async fn save_routing_rule_set(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    rule_set: crate::mihomo::RoutingRuleSet,
) -> Result<crate::mihomo::RoutingRuleSet, String> {
    crate::mihomo::save_routing_rule_set(&rule_set)?;
    let subs = open_subscription_store(&state)?.list().to_vec();
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        let _ = reload_network(&app2, state.inner(), &subs);
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(rule_set)
}

/// Resets to the default "完美分流规则" (Perfect Routing Rules).
#[tauri::command]
pub async fn reset_routing_rule_set(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<crate::mihomo::RoutingRuleSet, String> {
    let perfect = crate::mihomo::RoutingRuleSet::perfect_rules();
    crate::mihomo::save_routing_rule_set(&perfect)?;
    let subs = open_subscription_store(&state)?.list().to_vec();
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        let _ = reload_network(&app2, state.inner(), &subs);
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(perfect)
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct RbacHttpResponse {
    pub status: u16,
    pub body: String,
}

/// Generic HTTP client proxy for RBAC backend requests, bypassing WebView CSP
/// Generic HTTP client proxy for RBAC backend requests, bypassing WebView CSP
/// and automatically utilizing local system/SOCKS/HTTP proxy if direct connection fails.
#[tauri::command]
pub async fn rbac_http_request(
    url: String,
    method: String,
    headers: Option<std::collections::HashMap<String, String>>,
    body: Option<String>,
) -> Result<RbacHttpResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let do_request = |client: &reqwest::blocking::Client| -> Result<(u16, String), String> {
            let mut req = match method.to_uppercase().as_str() {
                "POST" => client.post(&url),
                "PUT" => client.put(&url),
                "DELETE" => client.delete(&url),
                _ => client.get(&url),
            };

            if let Some(ref hdrs) = headers {
                for (k, v) in hdrs {
                    req = req.header(k, v);
                }
            }

            if let Some(ref b) = body {
                req = req.body(b.clone());
            }

            let resp = req.send().map_err(|e| format!("{e}"))?;
            let status = resp.status().as_u16();
            let resp_body = resp.text().unwrap_or_default();
            Ok((status, resp_body))
        };

        // 1. First attempt: Direct connection (or system default)
        let direct_client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(6))
            .build()
            .map_err(|e| e.to_string())?;

        match do_request(&direct_client) {
            Ok((status, body)) => Ok(RbacHttpResponse { status, body }),
            Err(direct_err) => {
                // 2. Second attempt: Check known local proxies (e.g. 10808, 7890, 10809)
                let common_proxy_ports = [10808, 7890, 10809, 20811];
                for port in common_proxy_ports {
                    let proxy_url = format!("socks5h://127.0.0.1:{port}");
                    if let Ok(proxy) = reqwest::Proxy::all(&proxy_url) {
                        if let Ok(proxy_client) = reqwest::blocking::Client::builder()
                            .proxy(proxy)
                            .timeout(std::time::Duration::from_secs(10))
                            .build()
                        {
                            if let Ok((status, body)) = do_request(&proxy_client) {
                                return Ok(RbacHttpResponse { status, body });
                            }
                        }
                    }
                    // Try http proxy on the same port as well
                    let http_proxy_url = format!("http://127.0.0.1:{port}");
                    if let Ok(proxy) = reqwest::Proxy::all(&http_proxy_url) {
                        if let Ok(proxy_client) = reqwest::blocking::Client::builder()
                            .proxy(proxy)
                            .timeout(std::time::Duration::from_secs(10))
                            .build()
                        {
                            if let Ok((status, body)) = do_request(&proxy_client) {
                                return Ok(RbacHttpResponse { status, body });
                            }
                        }
                    }
                }

                Err(format!("直接连接与代理回退均失败: {direct_err}"))
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 执行群控同步器指令 (广播 URL、键盘输入、拟人点击与滚动、实时同步)
#[tauri::command]
pub async fn run_sync_command(
    app: tauri::AppHandle,
    custom_driver: Option<String>,
    custom_node: Option<String>,
    command_json: String,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let env = crate::local_api::detect_automation_env(custom_driver.as_deref(), custom_node.as_deref());
        let resolved_driver = env.driver_path.ok_or_else(|| "未找到 Playwright Driver 驱动包路径".to_string())?;
        let resolved_node = env.node_path.unwrap_or_else(|| "node".to_string());

        let script_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let _ = std::fs::create_dir_all(&script_dir);
        let synchronizer = narrc_core::automation::write_synchronizer_script(&script_dir)
            .map_err(|e| format!("写入同步器脚本失败: {e}"))?;

        let mut cmd = std::process::Command::new(&resolved_node);
        cmd.arg(&synchronizer)
            .arg(&resolved_driver)
            .arg(&command_json)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }

        let output = cmd.output().map_err(|e| format!("执行同步器指令失败: {e}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        if !output.status.success() {
            let err_msg = if !stderr.trim().is_empty() {
                stderr.to_string()
            } else if !stdout.trim().is_empty() {
                stdout.to_string()
            } else {
                format!("同步器退出码: {:?}", output.status.code())
            };
            return Err(err_msg);
        }

        for line in stdout.lines().rev() {
            let line = line.trim();
            if line.starts_with('{') && line.ends_with('}') {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
                    return Ok(val);
                }
            }
        }

        Ok(serde_json::json!({ "ok": true, "rawOutput": stdout.trim() }))
    })
    .await
    .map_err(|e| e.to_string())?
}

static LIVE_SYNC_CHILD: std::sync::Mutex<Option<std::process::Child>> = std::sync::Mutex::new(None);

fn stop_live_sync_inner() -> Result<bool, String> {
    let mut lock = LIVE_SYNC_CHILD.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = lock.take() {
        let _ = child.kill();
        let _ = child.wait();
        return Ok(true);
    }
    Ok(false)
}

/// 开启主从微秒级实时同步 (鼠标点击、滚动、键盘输入全息实时桥接)
#[tauri::command]
pub async fn start_live_sync(
    app: tauri::AppHandle,
    custom_driver: Option<String>,
    custom_node: Option<String>,
    master_endpoint: String,
    slave_endpoints: Vec<String>,
    jitter: bool,
) -> Result<serde_json::Value, String> {
    let _ = stop_live_sync_inner();

    tauri::async_runtime::spawn_blocking(move || {
        let env = crate::local_api::detect_automation_env(custom_driver.as_deref(), custom_node.as_deref());
        let resolved_driver = env.driver_path.ok_or_else(|| "未找到 Playwright Driver 驱动包路径".to_string())?;
        let resolved_node = env.node_path.unwrap_or_else(|| "node".to_string());

        let script_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let _ = std::fs::create_dir_all(&script_dir);
        let synchronizer = narrc_core::automation::write_synchronizer_script(&script_dir)
            .map_err(|e| format!("写入同步器脚本失败: {e}"))?;

        let payload = serde_json::json!({
            "action": "live_sync",
            "masterEndpoint": master_endpoint,
            "slaveEndpoints": slave_endpoints,
            "jitter": jitter,
            "durationMs": 86400000,
        });

        let mut cmd = std::process::Command::new(&resolved_node);
        cmd.arg(&synchronizer)
            .arg(&resolved_driver)
            .arg(payload.to_string())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }

        let mut child = cmd.spawn().map_err(|e| format!("启动实时同步集群失败: {e}"))?;

        // 简短轮询读取前置输出，确认 ready 状态
        if let Some(stdout) = child.stdout.as_mut() {
            use std::io::BufRead;
            let mut reader = std::io::BufReader::new(stdout);
            let mut line = String::new();
            for _ in 0..6 {
                line.clear();
                if reader.read_line(&mut line).is_ok() {
                    let trimmed = line.trim();
                    if trimmed.contains("\"status\":\"ready\"") || trimmed.contains("ready") {
                        break;
                    }
                }
            }
        }

        let mut lock = LIVE_SYNC_CHILD.lock().map_err(|e| e.to_string())?;
        *lock = Some(child);

        Ok(serde_json::json!({ "ok": true, "running": true }))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 停止主从微秒级实时同步
#[tauri::command]
pub fn stop_live_sync() -> Result<bool, String> {
    stop_live_sync_inner()
}

/// 获取当前是否处于实时同步联动中
#[tauri::command]
pub fn get_live_sync_status() -> Result<bool, String> {
    let mut lock = LIVE_SYNC_CHILD.lock().map_err(|e| e.to_string())?;
    if let Some(child) = lock.as_mut() {
        match child.try_wait() {
            Ok(None) => Ok(true),
            _ => {
                *lock = None;
                Ok(false)
            }
        }
    } else {
        Ok(false)
    }
}

static RECORDER_CHILD: std::sync::Mutex<Option<std::process::Child>> = std::sync::Mutex::new(None);

fn stop_recorder_inner(app: &tauri::AppHandle) -> Result<serde_json::Value, String> {
    let mut lock = RECORDER_CHILD.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = lock.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    let script_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let record_file = script_dir.join("recorded_actions.json");
    if record_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&record_file) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                return Ok(serde_json::json!({ "ok": true, "actions": val }));
            }
        }
    }
    Ok(serde_json::json!({ "ok": true, "actions": [] }))
}

/// 开启零代码动作录制器
#[tauri::command]
pub async fn start_action_recorder(
    app: tauri::AppHandle,
    custom_driver: Option<String>,
    custom_node: Option<String>,
    master_endpoint: String,
) -> Result<serde_json::Value, String> {
    let _ = stop_recorder_inner(&app);

    tauri::async_runtime::spawn_blocking(move || {
        let env = crate::local_api::detect_automation_env(custom_driver.as_deref(), custom_node.as_deref());
        let resolved_driver = env.driver_path.ok_or_else(|| "未找到 Playwright Driver 驱动包路径".to_string())?;
        let resolved_node = env.node_path.unwrap_or_else(|| "node".to_string());

        let script_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let _ = std::fs::create_dir_all(&script_dir);
        let synchronizer = narrc_core::automation::write_synchronizer_script(&script_dir)
            .map_err(|e| format!("写入同步器脚本失败: {e}"))?;

        let record_file = script_dir.join("recorded_actions.json");
        let _ = std::fs::write(&record_file, "[]");

        let payload = serde_json::json!({
            "action": "record_session",
            "masterEndpoint": master_endpoint,
            "outputFile": record_file.to_string_lossy().to_string(),
            "durationMs": 86400000,
        });

        let mut cmd = std::process::Command::new(&resolved_node);
        cmd.arg(&synchronizer)
            .arg(&resolved_driver)
            .arg(payload.to_string())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }

        let child = cmd.spawn().map_err(|e| format!("启动动作录制器失败: {e}"))?;
        let mut lock = RECORDER_CHILD.lock().map_err(|e| e.to_string())?;
        *lock = Some(child);

        Ok(serde_json::json!({ "ok": true, "recording": true }))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 停止零代码动作录制并返回捕获到的步骤列表
#[tauri::command]
pub async fn stop_action_recorder(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    stop_recorder_inner(&app)
}

/// 查询录制器是否处于录制中
#[tauri::command]
pub fn get_action_recorder_status() -> Result<bool, String> {
    let mut lock = RECORDER_CHILD.lock().map_err(|e| e.to_string())?;
    if let Some(child) = lock.as_mut() {
        match child.try_wait() {
            Ok(None) => Ok(true),
            _ => {
                *lock = None;
                Ok(false)
            }
        }
    } else {
        Ok(false)
    }
}

#[cfg(target_os = "windows")]
fn get_target_browser_hwnds(target_pids: &[u32]) -> Vec<isize> {
    #[repr(C)]
    struct ProcessEntry32W {
        dw_size: u32,
        cnt_usage: u32,
        th32_process_id: u32,
        th32_default_heap_id: usize,
        th32_module_id: u32,
        cnt_threads: u32,
        th32_parent_process_id: u32,
        pc_pri_class_base: i32,
        dw_flags: u32,
        sz_exe_file: [u16; 260],
    }

    #[repr(C)]
    struct Rect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }

    extern "system" {
        fn CreateToolhelp32Snapshot(dw_flags: u32, th32_process_id: u32) -> *mut std::ffi::c_void;
        fn Process32FirstW(h_snapshot: *mut std::ffi::c_void, lppe: *mut ProcessEntry32W) -> i32;
        fn Process32NextW(h_snapshot: *mut std::ffi::c_void, lppe: *mut ProcessEntry32W) -> i32;
        fn CloseHandle(h_object: *mut std::ffi::c_void) -> i32;
        fn EnumWindows(lp_enum_func: Option<extern "system" fn(isize, isize) -> i32>, lparam: isize) -> i32;
        fn GetWindowThreadProcessId(h_wnd: isize, lpdw_process_id: *mut u32) -> u32;
        fn IsWindowVisible(h_wnd: isize) -> i32;
        fn IsIconic(h_wnd: isize) -> i32;
        fn GetWindow(h_wnd: isize, u_cmd: u32) -> isize;
        fn GetWindowRect(h_wnd: isize, lp_rect: *mut Rect) -> i32;
        fn GetClassNameW(h_wnd: isize, lp_class_name: *mut u16, n_max_count: i32) -> i32;
    }

    let mut expanded_pids = target_pids.to_vec();
    let mut all_browser_pids: Vec<u32> = Vec::new();

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(0x0000_0002, 0); // TH32CS_SNAPPROCESS
        if snapshot as isize != -1 && !snapshot.is_null() {
            let mut entry: ProcessEntry32W = std::mem::zeroed();
            entry.dw_size = std::mem::size_of::<ProcessEntry32W>() as u32;
            let mut proc_list = Vec::new();
            if Process32FirstW(snapshot, &mut entry) != 0 {
                loop {
                    let exe_name = String::from_utf16_lossy(&entry.sz_exe_file)
                        .trim_matches('\0')
                        .to_lowercase();
                    proc_list.push((entry.th32_process_id, entry.th32_parent_process_id, exe_name));
                    if Process32NextW(snapshot, &mut entry) == 0 {
                        break;
                    }
                }
            }
            CloseHandle(snapshot);

            for (pid, _, name) in &proc_list {
                if name.contains("camoufox") || name.contains("firefox") {
                    all_browser_pids.push(*pid);
                }
            }

            // 递归穿透进程树：无论 Node.js 后面嵌套了几层子进程，全部追溯出所有相关 PID
            loop {
                let mut added = false;
                for (pid, parent, _) in &proc_list {
                    if expanded_pids.contains(parent) && !expanded_pids.contains(pid) {
                        expanded_pids.push(*pid);
                        added = true;
                    }
                }
                if !added {
                    break;
                }
            }
        }
    }

    struct EnumCtx {
        expanded_pids: Vec<u32>,
        all_browser_pids: Vec<u32>,
        match_any_browser: bool,
        hwnds: Vec<isize>,
    }

    extern "system" fn enum_proc(hwnd: isize, lparam: isize) -> i32 {
        let ctx = unsafe { &mut *(lparam as *mut EnumCtx) };
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };

        let mut class_buf = [0u16; 64];
        let class_len = unsafe { GetClassNameW(hwnd, class_buf.as_mut_ptr(), 64) };
        let class_name = if class_len > 0 {
            String::from_utf16_lossy(&class_buf[..class_len as usize])
        } else {
            String::new()
        };

        let is_mozilla_win = class_name == "MozillaWindowClass";
        let is_target_pid = ctx.expanded_pids.contains(&pid);
        let is_any_browser = ctx.all_browser_pids.contains(&pid);

        let matches = if ctx.match_any_browser {
            is_mozilla_win || is_any_browser
        } else {
            is_target_pid || (is_mozilla_win && is_any_browser)
        };

        if matches && unsafe { IsWindowVisible(hwnd) } != 0 {
            // GW_OWNER = 4: 仅保留顶级未拥有视窗，过滤浮动下拉菜单与 Tooltip
            let owner = unsafe { GetWindow(hwnd, 4) };
            if owner == 0 {
                let is_minimized = unsafe { IsIconic(hwnd) } != 0;
                let mut rect = Rect { left: 0, top: 0, right: 0, bottom: 0 };
                unsafe { GetWindowRect(hwnd, &mut rect) };
                let w = rect.right - rect.left;
                let h = rect.bottom - rect.top;

                // 最小化窗口或者尺寸大于 150x100 的窗口均是有效视窗
                if is_minimized || (w > 150 && h > 100) {
                    if !ctx.hwnds.contains(&hwnd) {
                        ctx.hwnds.push(hwnd);
                    }
                }
            }
        }
        1
    }

    let match_any_browser = target_pids.is_empty() || expanded_pids.is_empty();
    let mut ctx = EnumCtx {
        expanded_pids,
        all_browser_pids,
        match_any_browser,
        hwnds: Vec::new(),
    };

    unsafe {
        EnumWindows(Some(enum_proc), &mut ctx as *mut EnumCtx as isize);
    }

    ctx.hwnds
}

/// 智能网格平铺多开浏览器窗口
#[tauri::command]
pub fn tile_browser_windows(
    state: tauri::State<'_, AppState>,
    pids: Vec<u32>,
    cols: Option<usize>,
) -> Result<usize, String> {
    #[cfg(target_os = "windows")]
    {
        #[repr(C)]
        struct Rect {
            left: i32,
            top: i32,
            right: i32,
            bottom: i32,
        }

        extern "system" {
            fn SystemParametersInfoW(ui_action: u32, ui_param: u32, pv_param: *mut std::ffi::c_void, f_win_ini: u32) -> i32;
            fn SetWindowPos(h_wnd: isize, h_wnd_insert_after: isize, x: i32, y: i32, cx: i32, cy: i32, u_flags: u32) -> i32;
            fn ShowWindow(h_wnd: isize, n_cmd_show: i32) -> i32;
            fn SetForegroundWindow(h_wnd: isize) -> i32;
            fn GetSystemMetrics(n_index: i32) -> i32;
            fn IsIconic(h_wnd: isize) -> i32;
        }

        let mut target_pids = pids;
        if target_pids.is_empty() {
            if let Ok(agents) = state.agents.lock() {
                for s in agents.values() {
                    target_pids.push(s.pid());
                }
            }
        }

        let hwnds = get_target_browser_hwnds(&target_pids);
        if hwnds.is_empty() {
            return Ok(0);
        }

        // 精确获取主显示器的工作区 (自动规避任务栏)
        let mut work_area = Rect { left: 0, top: 0, right: 0, bottom: 0 };
        let ok = unsafe {
            SystemParametersInfoW(0x0030, 0, &mut work_area as *mut _ as *mut std::ffi::c_void, 0)
        };
        let (screen_x, screen_y, screen_w, screen_h) = if ok != 0 && work_area.right > work_area.left && work_area.bottom > work_area.top {
            (
                work_area.left,
                work_area.top,
                work_area.right - work_area.left,
                work_area.bottom - work_area.top,
            )
        } else {
            let sw = unsafe { GetSystemMetrics(0) };
            let sh = unsafe { GetSystemMetrics(1) };
            (0, 0, sw, (sh - 60).max(400))
        };

        let total = hwnds.len();
        let num_cols = cols.filter(|&c| c > 0).unwrap_or_else(|| {
            if total <= 2 { total.max(1) }
            else if total <= 4 { 2 }
            else if total <= 6 { 3 }
            else if total <= 9 { 3 }
            else { 4 }
        });
        let num_rows = (total + num_cols - 1) / num_cols;

        let win_w = screen_w / num_cols as i32;
        let win_h = screen_h / num_rows as i32;

        let mut moved_count = 0;
        for (i, &hwnd) in hwnds.iter().enumerate() {
            let c = (i % num_cols) as i32;
            let r = (i / num_cols) as i32;
            let x = screen_x + c * win_w;
            let y = screen_y + r * win_h;

            unsafe {
                // 如果当前处于最小化，还原显示但严禁抢占前台焦点 (SW_SHOWNOACTIVATE = 4)
                if IsIconic(hwnd) != 0 {
                    ShowWindow(hwnd, 4);
                }
                // SWP_SHOWWINDOW (0x0040) | SWP_FRAMECHANGED (0x0020) | SWP_NOACTIVATE (0x0010) | SWP_NOZORDER (0x0004)
                // 彻底杜绝平铺时多窗口疯狂交替抢焦点的闪烁问题！
                SetWindowPos(hwnd, 0, x, y, win_w, win_h, 0x0040 | 0x0020 | 0x0010 | 0x0004);
            }
            moved_count += 1;
        }

        Ok(moved_count)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = state;
        let _ = pids;
        let _ = cols;
        Ok(0)
    }
}

/// 一键将多开浏览器窗口置于最前
#[tauri::command]
pub fn bring_browser_windows_to_front(
    state: tauri::State<'_, AppState>,
    pids: Vec<u32>,
) -> Result<usize, String> {
    #[cfg(target_os = "windows")]
    {
        extern "system" {
            fn ShowWindow(h_wnd: isize, n_cmd_show: i32) -> i32;
            fn SetForegroundWindow(h_wnd: isize) -> i32;
            fn SetWindowPos(h_wnd: isize, h_wnd_insert_after: isize, x: i32, y: i32, cx: i32, cy: i32, u_flags: u32) -> i32;
            fn IsIconic(h_wnd: isize) -> i32;
        }

        let mut target_pids = pids;
        if target_pids.is_empty() {
            if let Ok(agents) = state.agents.lock() {
                for s in agents.values() {
                    target_pids.push(s.pid());
                }
            }
        }

        let hwnds = get_target_browser_hwnds(&target_pids);
        let mut count = 0;
        for &hwnd in &hwnds {
            unsafe {
                if IsIconic(hwnd) != 0 {
                    ShowWindow(hwnd, 4); // SW_SHOWNOACTIVATE
                }
                // SWP_NOSIZE (0x0001) | SWP_NOMOVE (0x0002) | SWP_SHOWWINDOW (0x0040) | SWP_NOACTIVATE (0x0010)
                SetWindowPos(hwnd, 0, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0040 | 0x0010);
            }
            count += 1;
        }

        // 仅在全部布局完成后，温和激活首个主控窗口一次，不循环抢焦点
        if let Some(&first) = hwnds.first() {
            unsafe {
                SetForegroundWindow(first);
            }
        }

        Ok(count)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = state;
        let _ = pids;
        Ok(0)
    }
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct PickedMediaInfo {
    pub path: String,
    pub name: String,
    pub size_mb: f64,
}

/// 打开系统原生文件选择器，方便用户直观选择本地视频或封面文件
#[tauri::command]
pub fn pick_media_file(filter_type: String) -> Result<Option<PickedMediaInfo>, String> {
    let mut dialog = rfd::FileDialog::new();
    match filter_type.as_str() {
        "video" => {
            dialog = dialog
                .set_title("选择待发布的短视频文件")
                .add_filter(
                    "常用视频格式 (*.mp4, *.mov, *.mkv, *.flv, *.avi, *.webm, *.ts)",
                    &["mp4", "mov", "mkv", "flv", "avi", "webm", "ts", "m4v"],
                );
        }
        "image" => {
            dialog = dialog
                .set_title("选择封面图片")
                .add_filter(
                    "图片格式 (*.jpg, *.jpeg, *.png, *.webp, *.bmp)",
                    &["jpg", "jpeg", "png", "webp", "bmp"],
                );
        }
        _ => {
            dialog = dialog
                .set_title("选择媒体素材")
                .add_filter(
                    "常用多媒体文件",
                    &["mp4", "mov", "mkv", "flv", "avi", "webm", "ts", "m4v", "jpg", "jpeg", "png", "webp"],
                );
        }
    }

    if let Some(path) = dialog.pick_file() {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let size_mb = match std::fs::metadata(&path) {
            Ok(meta) => (meta.len() as f64) / (1024.0 * 1024.0),
            Err(_) => 0.0,
        };
        Ok(Some(PickedMediaInfo {
            path: path.to_string_lossy().to_string(),
            name,
            size_mb: (size_mb * 100.0).round() / 100.0,
        }))
    } else {
        Ok(None)
    }
}

/// 批量选择媒体文件对话框 (支持多选)
#[tauri::command]
pub fn pick_multiple_media_files(filter_type: String) -> Result<Vec<PickedMediaInfo>, String> {
    let mut dialog = rfd::FileDialog::new();
    match filter_type.as_str() {
        "video" => {
            dialog = dialog
                .set_title("选择短视频文件 (支持按住 Ctrl/Shift 多选)")
                .add_filter(
                    "常用视频格式 (*.mp4, *.mov, *.mkv, *.flv, *.avi, *.webm, *.ts)",
                    &["mp4", "mov", "mkv", "flv", "avi", "webm", "ts", "m4v"],
                );
        }
        _ => {
            dialog = dialog
                .set_title("选择媒体素材")
                .add_filter(
                    "常用多媒体文件",
                    &["mp4", "mov", "mkv", "flv", "avi", "webm", "ts", "m4v"],
                );
        }
    }

    if let Some(paths) = dialog.pick_files() {
        let list = paths
            .into_iter()
            .map(|path| {
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                let size_mb = match std::fs::metadata(&path) {
                    Ok(meta) => (meta.len() as f64) / (1024.0 * 1024.0),
                    Err(_) => 0.0,
                };
                PickedMediaInfo {
                    path: path.to_string_lossy().to_string(),
                    name,
                    size_mb: (size_mb * 100.0).round() / 100.0,
                }
            })
            .collect();
        Ok(list)
    } else {
        Ok(Vec::new())
    }
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct TtsResult {
    pub success: bool,
    pub audio_path: Option<String>,
    pub srt_path: Option<String>,
    pub voice: Option<String>,
    pub size_bytes: Option<u64>,
    pub file_size_kb: Option<f64>,
    pub duration_secs: Option<f64>,
    pub audio_data_url: Option<String>,
    pub error: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct RemixResult {
    pub success: bool,
    pub input_path: Option<String>,
    pub output_path: Option<String>,
    pub original_size_mb: Option<f64>,
    pub new_size_mb: Option<f64>,
    pub original_duration_secs: Option<f64>,
    pub new_duration_secs: Option<f64>,
    pub resolution: Option<String>,
    pub speed: Option<f64>,
    pub zoom: Option<f64>,
    pub flip_h: Option<bool>,
    pub color_tweak: Option<bool>,
    pub vignette: Option<bool>,
    pub noise: Option<bool>,
    pub strip_blind_watermark: Option<bool>,
    pub trim_end_secs: Option<f64>,
    pub trim_start_secs: Option<f64>,
    pub delogo_mode: Option<String>,
    pub dynamic_pan_zoom: Option<bool>,
    pub dynamic_lighting: Option<bool>,
    pub ambient_blurred_bg: Option<bool>,
    pub split_canvas: Option<bool>,
    pub audio_scramble: Option<bool>,
    pub mute_audio: Option<bool>,
    pub frame_jitter: Option<bool>,
    pub curved_speed: Option<bool>,
    pub film_grain: Option<bool>,
    pub micro_rotate: Option<bool>,
    pub chromashift: Option<bool>,
    pub unsharp: Option<bool>,
    pub fake_camera_exif: Option<bool>,
    pub duration_secs: Option<f64>,
    pub error: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct MergeResult {
    pub success: bool,
    pub output_path: Option<String>,
    pub clip_count: Option<usize>,
    pub original_clips: Option<Vec<String>>,
    pub original_total_duration: Option<f64>,
    pub final_duration: Option<f64>,
    pub final_size_mb: Option<f64>,
    pub resolution: Option<String>,
    pub transitions: Option<Vec<String>>,
    pub duration_secs: Option<f64>,
    pub error: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct NoWatermarkResult {
    pub success: bool,
    pub platform: Option<String>,
    pub title: Option<String>,
    pub author: Option<String>,
    pub video_url: Option<String>,
    pub local_path: Option<String>,
    pub file_name: Option<String>,
    pub size_mb: Option<f64>,
    pub error: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct CopywritingResult {
    pub success: bool,
    pub platform: Option<String>,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub tags: Option<Vec<String>>,
    pub error: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct AuthorPostItem {
    pub id: String,
    pub title: String,
    pub url: String,
    pub cover_url: Option<String>,
    pub author: Option<String>,
    pub publish_time: Option<String>,
    pub like_count: Option<String>,
    pub duration_secs: Option<f64>,
    pub video_stream_url: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct FetchAuthorPostsResult {
    pub success: bool,
    pub platform: Option<String>,
    pub author_name: Option<String>,
    pub avatar_url: Option<String>,
    pub posts: Vec<AuthorPostItem>,
    pub count: Option<usize>,
    pub error: Option<String>,
}

/// 智能解析 media_tools.py 脚本的绝对路径 (支持无论是开发环境、打包环境还是通过相对路径执行)
fn resolve_media_tools_script() -> std::path::PathBuf {
    // 1. 优先使用当前工作区开发环境下的主工程脚本（保证实时最新）
    let primary = std::path::PathBuf::from(r"c:\Tools2\fingerBrowsers2\NarciPHBrowser\scripts\media_tools.py");
    if primary.exists() {
        return primary;
    }

    let candidates = [
        // 2. 同级或相对执行目录
        std::env::current_dir().ok().map(|p| p.join("scripts").join("media_tools.py")),
        // 3. 位于 exe 旁边的 scripts 目录 (如 target/release/scripts)
        std::env::current_exe().ok().and_then(|exe| {
            exe.parent().map(|p| p.join("scripts").join("media_tools.py"))
        }),
        // 4. 位于工作区根目录 (如 target/release/../../scripts)
        std::env::current_exe().ok().and_then(|exe| {
            exe.parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .map(|p| p.join("scripts").join("media_tools.py"))
        }),
        std::env::current_exe().ok().and_then(|exe| {
            exe.parent()
                .and_then(|p| p.parent())
                .map(|p| p.join("scripts").join("media_tools.py"))
        }),
    ];

    for candidate in candidates.into_iter().flatten() {
        if candidate.exists() {
            return candidate;
        }
    }

    std::path::PathBuf::from("scripts/media_tools.py")
}

/// 微软 Edge-TTS 零成本超自然人声配音与精准字幕生成器
#[tauri::command]
pub fn generate_edge_tts(
    text: String,
    voice: Option<String>,
    rate: Option<String>,
    pitch: Option<String>,
    outdir: Option<String>,
) -> Result<TtsResult, String> {
    let script_path = resolve_media_tools_script();

    let mut cmd = std::process::Command::new("uv");
    cmd.args(["run", "--with", "edge-tts", "--python", "3.12", "python"])
        .arg(&script_path)
        .arg("tts")
        .arg("--text")
        .arg(&text)
        .arg("--voice")
        .arg(voice.unwrap_or_else(|| "zh-CN-YunxiNeural".to_string()))
        .arg("--rate")
        .arg(rate.unwrap_or_else(|| "+0%".to_string()))
        .arg("--pitch")
        .arg(pitch.unwrap_or_else(|| "+0Hz".to_string()));

    if let Some(d) = outdir {
        cmd.arg("--outdir").arg(d);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|e| format!("Failed to execute uv/edge-tts: {}", e))?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("Edge TTS failed: {}", err_msg));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
    let mut result = serde_json::from_str::<TtsResult>(&stdout_str)
        .map_err(|e| format!("Invalid JSON response from TTS: {} (raw: {})", e, stdout_str))?;

    // 读取生成的本地 MP3 并转为 Base64 Data URL，实现前端 HTML5 audio 控件零跨域、零权限阻塞的即时试听
    if let Some(ref path) = result.audio_path {
        if let Ok(bytes) = std::fs::read(path) {
            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            result.audio_data_url = Some(format!("data:audio/mp3;base64,{}", b64));
        }
    }

    Ok(result)
}

/// 智能视频去重混剪 (微变速、微裁剪、水平镜像、色彩微调、暗角、暗水印切除、片尾裁剪、角标去水印、动态运镜、动态光影、毛玻璃垫底、音频混淆、微抽帧、真机EXIF注入与防查重哈希清洗)
#[tauri::command]
pub fn remix_video_dedup(
    input_path: String,
    speed: Option<f64>,
    zoom: Option<f64>,
    flip_h: Option<bool>,
    color_tweak: Option<bool>,
    vignette: Option<bool>,
    noise: Option<bool>,
    audio_volume: Option<f64>,
    strip_blind_watermark: Option<bool>,
    trim_end_secs: Option<f64>,
    trim_start_secs: Option<f64>,
    delogo_mode: Option<String>,
    dynamic_pan_zoom: Option<bool>,
    dynamic_lighting: Option<bool>,
    ambient_blurred_bg: Option<bool>,
    split_canvas: Option<bool>,
    audio_scramble: Option<bool>,
    mute_audio: Option<bool>,
    frame_jitter: Option<bool>,
    curved_speed: Option<bool>,
    film_grain: Option<bool>,
    micro_rotate: Option<bool>,
    chromashift: Option<bool>,
    unsharp: Option<bool>,
    fake_camera_exif: Option<bool>,
    outdir: Option<String>,
) -> Result<RemixResult, String> {
    let script_path = resolve_media_tools_script();

    let mut cmd = if std::process::Command::new("python").arg("--version").output().map(|o| o.status.success()).unwrap_or(false) {
        let mut c = std::process::Command::new("python");
        c.arg(&script_path);
        c
    } else {
        let mut c = std::process::Command::new("uv");
        c.args(["run", "--python", "3.12", "python"]);
        c.arg(&script_path);
        c
    };

    cmd.arg("remix")
        .arg("--input")
        .arg(&input_path)
        .arg("--speed")
        .arg(speed.unwrap_or(1.03).to_string())
        .arg("--zoom")
        .arg(zoom.unwrap_or(1.02).to_string())
        .arg("--audio-volume")
        .arg(audio_volume.unwrap_or(1.02).to_string());

    if flip_h.unwrap_or(false) {
        cmd.arg("--flip-h");
    }
    if !color_tweak.unwrap_or(true) {
        cmd.arg("--no-color-tweak");
    }
    if vignette.unwrap_or(false) {
        cmd.arg("--vignette");
    }
    if noise.unwrap_or(false) {
        cmd.arg("--noise");
    }
    if !strip_blind_watermark.unwrap_or(true) {
        cmd.arg("--no-strip-blind-watermark");
    }
    if let Some(trim) = trim_end_secs {
        if trim > 0.0 {
            cmd.arg("--trim-end-secs").arg(trim.to_string());
        }
    }
    if let Some(trim_s) = trim_start_secs {
        if trim_s > 0.0 {
            cmd.arg("--trim-start-secs").arg(trim_s.to_string());
        }
    }
    if let Some(ref m) = delogo_mode {
        if !m.trim().is_empty() && m != "none" {
            cmd.arg("--delogo-mode").arg(m.trim());
        }
    }
    if dynamic_pan_zoom.unwrap_or(false) {
        cmd.arg("--dynamic-pan-zoom");
    }
    if dynamic_lighting.unwrap_or(false) {
        cmd.arg("--dynamic-lighting");
    }
    if ambient_blurred_bg.unwrap_or(false) {
        cmd.arg("--ambient-blurred-bg");
    }
    if split_canvas.unwrap_or(false) {
        cmd.arg("--split-canvas");
    }
    if audio_scramble.unwrap_or(false) {
        cmd.arg("--audio-scramble");
    }
    if mute_audio.unwrap_or(false) {
        cmd.arg("--mute-audio");
    }
    if frame_jitter.unwrap_or(false) {
        cmd.arg("--frame-jitter");
    }
    if curved_speed.unwrap_or(false) {
        cmd.arg("--curved-speed");
    }
    if film_grain.unwrap_or(false) {
        cmd.arg("--film-grain");
    }
    if micro_rotate.unwrap_or(false) {
        cmd.arg("--micro-rotate");
    }
    if chromashift.unwrap_or(false) {
        cmd.arg("--chromashift");
    }
    if unsharp.unwrap_or(false) {
        cmd.arg("--unsharp");
    }
    if !fake_camera_exif.unwrap_or(true) {
        cmd.arg("--no-fake-camera-exif");
    }
    if let Some(ref d) = outdir {
        if !d.trim().is_empty() {
            cmd.arg("--outdir").arg(d.trim());
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }

    let output = cmd.output().map_err(|e| format!("Failed to execute remix tool: {}", e))?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("Video remix failed: {}", err_msg));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
    serde_json::from_str::<RemixResult>(&stdout_str)
        .map_err(|e| format!("Invalid JSON from remix tool: {} (raw: {})", e, stdout_str))
}

/// 批量视频去重清洗 + 动态转场特效 + 多视频智能混剪合并
#[tauri::command]
pub fn remix_and_merge_videos(
    input_paths: Vec<String>,
    transition: Option<String>,
    transition_duration: Option<f64>,
    target_resolution: Option<String>,
    speed: Option<f64>,
    zoom: Option<f64>,
    flip_h: Option<bool>,
    color_tweak: Option<bool>,
    vignette: Option<bool>,
    noise: Option<bool>,
    audio_volume: Option<f64>,
    strip_blind_watermark: Option<bool>,
    trim_end_secs: Option<f64>,
    trim_start_secs: Option<f64>,
    delogo_mode: Option<String>,
    dynamic_pan_zoom: Option<bool>,
    dynamic_lighting: Option<bool>,
    ambient_blurred_bg: Option<bool>,
    split_canvas: Option<bool>,
    audio_scramble: Option<bool>,
    mute_audio: Option<bool>,
    frame_jitter: Option<bool>,
    curved_speed: Option<bool>,
    film_grain: Option<bool>,
    micro_rotate: Option<bool>,
    chromashift: Option<bool>,
    unsharp: Option<bool>,
    fake_camera_exif: Option<bool>,
    outdir: Option<String>,
) -> Result<MergeResult, String> {
    if input_paths.is_empty() {
        return Err("请至少选择 1 个待处理视频".to_string());
    }

    let script_path = resolve_media_tools_script();

    let mut cmd = if std::process::Command::new("python").arg("--version").output().map(|o| o.status.success()).unwrap_or(false) {
        let mut c = std::process::Command::new("python");
        c.arg(&script_path);
        c
    } else {
        let mut c = std::process::Command::new("uv");
        c.args(["run", "--python", "3.12", "python"]);
        c.arg(&script_path);
        c
    };

    let inputs_json = serde_json::to_string(&input_paths).map_err(|e| e.to_string())?;

    cmd.arg("dedup-merge")
        .arg("--inputs-json")
        .arg(&inputs_json)
        .arg("--transition")
        .arg(transition.unwrap_or_else(|| "random".to_string()))
        .arg("--transition-duration")
        .arg(transition_duration.unwrap_or(0.8).to_string())
        .arg("--target-resolution")
        .arg(target_resolution.unwrap_or_else(|| "auto".to_string()))
        .arg("--speed")
        .arg(speed.unwrap_or(1.03).to_string())
        .arg("--zoom")
        .arg(zoom.unwrap_or(1.02).to_string())
        .arg("--audio-volume")
        .arg(audio_volume.unwrap_or(1.02).to_string());

    if flip_h.unwrap_or(false) {
        cmd.arg("--flip-h");
    }
    if !color_tweak.unwrap_or(true) {
        cmd.arg("--no-color-tweak");
    }
    if vignette.unwrap_or(false) {
        cmd.arg("--vignette");
    }
    if noise.unwrap_or(false) {
        cmd.arg("--noise");
    }
    if !strip_blind_watermark.unwrap_or(true) {
        cmd.arg("--no-strip-blind-watermark");
    }
    if let Some(trim) = trim_end_secs {
        if trim > 0.0 {
            cmd.arg("--trim-end-secs").arg(trim.to_string());
        }
    }
    if let Some(trim_s) = trim_start_secs {
        if trim_s > 0.0 {
            cmd.arg("--trim-start-secs").arg(trim_s.to_string());
        }
    }
    if let Some(ref m) = delogo_mode {
        if !m.trim().is_empty() && m != "none" {
            cmd.arg("--delogo-mode").arg(m.trim());
        }
    }
    if dynamic_pan_zoom.unwrap_or(false) {
        cmd.arg("--dynamic-pan-zoom");
    }
    if dynamic_lighting.unwrap_or(false) {
        cmd.arg("--dynamic-lighting");
    }
    if ambient_blurred_bg.unwrap_or(false) {
        cmd.arg("--ambient-blurred-bg");
    }
    if split_canvas.unwrap_or(false) {
        cmd.arg("--split-canvas");
    }
    if audio_scramble.unwrap_or(false) {
        cmd.arg("--audio-scramble");
    }
    if mute_audio.unwrap_or(false) {
        cmd.arg("--mute-audio");
    }
    if frame_jitter.unwrap_or(false) {
        cmd.arg("--frame-jitter");
    }
    if curved_speed.unwrap_or(false) {
        cmd.arg("--curved-speed");
    }
    if film_grain.unwrap_or(false) {
        cmd.arg("--film-grain");
    }
    if micro_rotate.unwrap_or(false) {
        cmd.arg("--micro-rotate");
    }
    if chromashift.unwrap_or(false) {
        cmd.arg("--chromashift");
    }
    if unsharp.unwrap_or(false) {
        cmd.arg("--unsharp");
    }
    if !fake_camera_exif.unwrap_or(true) {
        cmd.arg("--no-fake-camera-exif");
    }
    if let Some(ref d) = outdir {
        if !d.trim().is_empty() {
            cmd.arg("--outdir").arg(d.trim());
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }

    let output = cmd.output().map_err(|e| format!("Failed to execute merge tool: {}", e))?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("Batch dedup and merge failed: {}", err_msg));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
    serde_json::from_str::<MergeResult>(&stdout_str)
        .map_err(|e| format!("Invalid JSON from merge tool: {} (raw: {})", e, stdout_str))
}

/// 多平台无水印原片一键解析并下载到本地素材库 (支持抖音、TikTok、快手、小红书分享文本)
#[tauri::command]
pub fn download_no_watermark_video(
    share_text: String,
    outdir: Option<String>,
) -> Result<NoWatermarkResult, String> {
    let script_path = resolve_media_tools_script();

    // 优先使用系统 Python（原生携带 Playwright、yt-dlp 与 Edge 浏览器桥），无缝秒级启动
    let mut cmd = if std::process::Command::new("python").arg("--version").output().map(|o| o.status.success()).unwrap_or(false) {
        let mut c = std::process::Command::new("python");
        c.arg(&script_path);
        c
    } else {
        let mut c = std::process::Command::new("uv");
        c.args(["run", "--with", "playwright", "--with", "yt-dlp", "--python", "3.12", "python"]);
        c.arg(&script_path);
        c
    };

    cmd.arg("parse-download")
        .arg("--text")
        .arg(&share_text);

    if let Some(ref d) = outdir {
        if !d.trim().is_empty() {
            cmd.arg("--outdir").arg(d.trim());
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }

    let output = cmd.output().map_err(|e| format!("Failed to run no-watermark resolver: {}", e))?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("解析下载无水印视频失败: {}", err_msg));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
    serde_json::from_str::<NoWatermarkResult>(&stdout_str)
        .map_err(|e| format!("Invalid JSON from resolver: {} (raw: {})", e, stdout_str))
}

/// 抓取博主主页的最新短视频作品流 (支持抖音、TikTok、B站、YouTube等)
#[tauri::command]
pub fn fetch_author_posts(
    author_url: String,
    platform: Option<String>,
    count: Option<usize>,
) -> Result<FetchAuthorPostsResult, String> {
    let script_path = resolve_media_tools_script();

    let mut cmd = if std::process::Command::new("python").arg("--version").output().map(|o| o.status.success()).unwrap_or(false) {
        let mut c = std::process::Command::new("python");
        c.arg(&script_path);
        c
    } else {
        let mut c = std::process::Command::new("uv");
        c.args(["run", "--with", "playwright", "--with", "yt-dlp", "--python", "3.12", "python"]);
        c.arg(&script_path);
        c
    };

    let p = platform.unwrap_or_else(|| "douyin".to_string());
    let cnt = count.unwrap_or(20);

    cmd.arg("fetch-author-posts")
        .arg("--url")
        .arg(&author_url)
        .arg("--platform")
        .arg(&p)
        .arg("--count")
        .arg(cnt.to_string());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }

    let output = match cmd.output() {
        Ok(out) => out,
        Err(e) => {
            return Ok(FetchAuthorPostsResult {
                success: true,
                platform: Some(p),
                author_name: Some("对标博主".to_string()),
                avatar_url: None,
                posts: vec![],
                count: Some(0),
                error: Some(format!("执行嗅探进程失败: {}", e)),
            });
        }
    };

    let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
    let json_line = stdout_str
        .lines()
        .rev()
        .find(|l| l.trim().starts_with('{') && l.trim().ends_with('}'))
        .unwrap_or(&stdout_str);

    match serde_json::from_str::<FetchAuthorPostsResult>(json_line) {
        Ok(res) => Ok(res),
        Err(e) => {
            let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();
            eprintln!("Failed to parse fetch-author-posts JSON: {}. Stderr: {}", e, stderr_str);
            Ok(FetchAuthorPostsResult {
                success: false,
                platform: Some(p),
                author_name: Some("对标博主".to_string()),
                avatar_url: None,
                posts: vec![],
                count: Some(0),
                error: Some(format!("嗅探结果解析异常: {}. {}", e, stderr_str.chars().take(120).collect::<String>())),
            })
        }
    }
}

/// 在系统资源管理器中打开并高亮选中文件/目录
#[tauri::command]
pub fn open_path_in_explorer(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    #[cfg(windows)]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("explorer");
        if p.is_file() {
            cmd.args(["/select,", &path]);
        } else {
            cmd.arg(&path);
        }
        cmd.creation_flags(0x0800_0000);
        cmd.spawn().map_err(|e| format!("Failed to launch explorer: {}", e))?;
    }
    Ok(())
}

/// 在系统默认外部浏览器中打开指定链接 (解决 WebView2 window.open 无响应问题)
#[tauri::command]
pub fn open_url_in_browser(url: String) -> Result<(), String> {
    let clean = url.trim().to_string();
    if clean.is_empty() {
        return Err("链接为空".to_string());
    }
    #[cfg(windows)]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("cmd");
        cmd.args(["/c", "start", "", &clean]);
        cmd.creation_flags(0x0800_0000);
        cmd.spawn().map_err(|e| format!("无法在系统浏览器中打开链接: {}", e))?;
    }
    #[cfg(not(windows))]
    {
        use std::process::Command;
        Command::new("xdg-open")
            .arg(&clean)
            .spawn()
            .map_err(|e| format!("无法在系统浏览器中打开链接: {}", e))?;
    }
    Ok(())
}

/// 获取本地视频/音频的 HTTP 206 流式在线播放 URL (零 WebView2 权限限制，支持 Range 寻道与任意特殊字符)
#[tauri::command]
pub fn get_media_stream_url(path: String) -> Result<String, String> {
    let port = crate::local_api::get_bound_port();
    let port = if port == 0 { 29995 } else { port };
    let mut encoded = String::new();
    for b in path.as_bytes() {
        match *b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(*b as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", b));
            }
        }
    }
    Ok(format!("http://127.0.0.1:{}/api/v1/media/stream?path={}", port, encoded))
}

/// AI 大模型爆款文案生成器 (支持 OpenAI / DeepSeek / 离线规则模版)
#[tauri::command]
pub fn generate_ai_copywriting(
    platform: Option<String>,
    topic: Option<String>,
    prompt: Option<String>,
    api_key: Option<String>,
    base_url: Option<String>,
    model: Option<String>,
) -> Result<CopywritingResult, String> {
    let resolved_topic = topic.or(prompt).unwrap_or_default();
    let resolved_platform = platform.unwrap_or_else(|| "douyin".to_string());

    let script_path = resolve_media_tools_script();

    let mut cmd = std::process::Command::new("uv");
    cmd.args(["run", "--with", "openai", "--python", "3.12", "python"])
        .arg(&script_path)
        .arg("llm")
        .arg("--platform")
        .arg(&resolved_platform)
        .arg("--topic")
        .arg(&resolved_topic);

    if let Some(key) = api_key {
        if !key.trim().is_empty() {
            cmd.arg("--api-key").arg(key);
        }
    }
    if let Some(url) = base_url {
        if !url.trim().is_empty() {
            cmd.arg("--base-url").arg(url);
        }
    }
    if let Some(m) = model {
        if !m.trim().is_empty() {
            cmd.arg("--model").arg(m);
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }

    let output = cmd.output().map_err(|e| format!("Failed to execute copywriting tool: {}", e))?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("Copywriting failed: {}", err_msg));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
    serde_json::from_str::<CopywritingResult>(&stdout_str)
        .map_err(|e| format!("Invalid JSON from Copywriting: {} (raw: {})", e, stdout_str))
}

/// 测试 LLM 接口连通性
#[tauri::command]
pub fn test_llm_connection(
    api_key: String,
    base_url: Option<String>,
    model: Option<String>,
) -> Result<String, String> {
    let script_path = resolve_media_tools_script();

    let mut cmd = std::process::Command::new("uv");
    cmd.args(["run", "--with", "openai", "--python", "3.12", "python"])
        .arg(&script_path)
        .arg("test-llm")
        .arg("--api-key")
        .arg(&api_key);

    if let Some(url) = base_url {
        if !url.trim().is_empty() {
            cmd.arg("--base-url").arg(url);
        }
    }
    if let Some(m) = model {
        if !m.trim().is_empty() {
            cmd.arg("--model").arg(m);
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }

    let output = cmd.output().map_err(|e| format!("Failed to execute test-llm: {}", e))?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("LLM test connection failed: {}", err_msg));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout_str)
}

/// 提取指定浏览器指纹环境的真实创作者数据与作品分析 (支持 TikTok、抖音等)
#[tauri::command]
pub fn fetch_real_account_analytics(
    profile_id: String,
    platform_id: String,
    account_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let script_path = resolve_media_tools_script();

    let mut cmd = if std::process::Command::new("python").arg("--version").output().map(|o| o.status.success()).unwrap_or(false) {
        let mut c = std::process::Command::new("python");
        c.arg(&script_path);
        c
    } else {
        let mut c = std::process::Command::new("uv");
        c.args(["run", "--python", "3.12", "python"]);
        c.arg(&script_path);
        c
    };

    let acc_id = account_id.unwrap_or_default();

    cmd.arg("fetch-real-analytics")
        .arg("--profile-id")
        .arg(&profile_id)
        .arg("--platform")
        .arg(&platform_id)
        .arg("--account-id")
        .arg(&acc_id);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }

    let output = cmd.output().map_err(|e| format!("Failed to run analytics fetcher: {}", e))?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("抓取创作者分析数据失败: {}", err_msg));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
    serde_json::from_str::<serde_json::Value>(&stdout_str)
        .map_err(|e| format!("Invalid JSON from analytics fetcher: {} (raw: {})", e, stdout_str))
}



#[cfg(test)]
mod tests {
    //! Tests for the platform asset selection, pinned against the asset names
    //! a real release carries (camoufox-152.0.4-beta.30, verified 2026-10-03
    //! against the GitHub release; six assets, one per platform/arch pair).

    use super::*;

    /// The complete asset list of camoufox-152.0.4-beta.30, verbatim.
    fn release_assets() -> Vec<serde_json::Value> {
        [
            "camoufox-152.0.4-beta.30-win.x86_64.zip",
            "camoufox-152.0.4-beta.30-win.i686.zip",
            "camoufox-152.0.4-beta.30-mac.x86_64.zip",
            "camoufox-152.0.4-beta.30-mac.arm64.zip",
            "camoufox-152.0.4-beta.30-lin.x86_64.zip",
            "camoufox-152.0.4-beta.30-lin.arm64.zip",
        ]
        .iter()
        .map(|name| serde_json::json!({ "name": name }))
        .collect()
    }

    #[test]
    fn the_windows_asset_is_picked_by_its_exact_tail() {
        let picked = pick_engine_asset(&release_assets(), "win", "x86_64").unwrap();
        assert_eq!(picked, "camoufox-152.0.4-beta.30-win.x86_64.zip");
        // The i686 build shares the "win" word; the arch token is what
        // separates them, which is why the match is on the full tail.
    }

    #[test]
    fn the_mac_and_linux_assets_are_picked_per_arch() {
        let mac = pick_engine_asset(&release_assets(), "mac", "x86_64").unwrap();
        assert_eq!(mac, "camoufox-152.0.4-beta.30-mac.x86_64.zip");

        let mac_arm = pick_engine_asset(&release_assets(), "mac", "arm64").unwrap();
        assert_eq!(mac_arm, "camoufox-152.0.4-beta.30-mac.arm64.zip");

        let linux = pick_engine_asset(&release_assets(), "lin", "x86_64").unwrap();
        assert_eq!(linux, "camoufox-152.0.4-beta.30-lin.x86_64.zip");
    }

    #[test]
    fn a_platform_the_release_does_not_carry_is_reported_rather_than_guessed() {
        // No linux i686 asset exists upstream; a substring match could pick
        // the x86_64 one and hand a build that will not run to the launcher.
        assert_eq!(pick_engine_asset(&release_assets(), "lin", "i686"), None);
        assert_eq!(pick_engine_asset(&release_assets(), "win", "arm64"), None);
    }

    #[test]
    fn the_asset_tokens_name_the_runtime_platform() {
        let (os, arch) = engine_asset_tokens();
        assert!(
            ["win", "mac", "lin"].contains(&os),
            "unexpected os token {os}"
        );
        assert!(["x86_64", "arm64"].contains(&arch), "unexpected arch {arch}");
    }

    #[test]
    fn the_group_listing_merges_both_sides_of_every_group() {
        // A name stored but with no members is a group and is listed, counted
        // as zero; a name only profiles carry is a group too, counted from
        // them; and the result is name-ordered whatever the input order was.
        let counts = group_counts(&["Empty".to_owned()], ["Shop", "Accounts", "Shop", "Nope"]);
        assert_eq!(
            counts,
            [
                ("Accounts".to_owned(), 1),
                ("Empty".to_owned(), 0),
                ("Nope".to_owned(), 1),
                ("Shop".to_owned(), 2),
            ]
        );

        // With nothing on either side there is nothing to list.
        assert!(group_counts(&[], std::iter::empty::<&str>()).is_empty());
    }
}
