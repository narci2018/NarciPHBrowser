use narrc_core::profile::ProfileStore;
use narrc_core::ProxyConfig;
use narrc_sidecar::protocol;
use narrc_sidecar::store_path;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};

use crate::state::AppState;

/// The GitHub repository for Camoufox releases.
const CAMOUFOX_REPO: &str = "daijro/camoufox";

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
    let home = dirs_next::home_dir().ok_or_else(|| "could not determine home directory".to_string())?;
    let install_dir = home.join("camoufox");
    let binary = install_dir.join("camoufox.exe");
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

    // Find the Windows x86_64 zip. Its advertised size is what the resumed
    // transfer is measured against: Content-Length of a ranged response only
    // covers the remaining bytes.
    let asset = assets
        .iter()
        .find(|asset| {
            asset["name"].as_str().is_some_and(|name| {
                name.contains("win") && name.contains("x86_64") && name.ends_with(".zip")
            })
        })
        .ok_or("no Windows x86_64 asset found")?;
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
    let part_path = home.join(format!("camoufox-{version}.zip.part"));
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
    if !binary.exists() {
        // The zip may contain a top-level directory; scan for the exe.
        let found = walkdir::WalkDir::new(&install_dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .find(|e| e.file_name() == "camoufox.exe");
        if let Some(entry) = found {
            apply_chrome_skin(&install_dir)?;
            return Ok(entry.path().to_path_buf());
        }
        return Err("camoufox.exe not found in extracted archive".to_string());
    }

    app.emit("download-progress", DownloadProgress {
        phase: "Ready!".to_string(),
        percent: 100.0,
    }).map_err(|e| e.to_string())?;

    apply_chrome_skin(&install_dir)?;
    Ok(binary)
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
fn store_root(state: &tauri::State<'_, AppState>) -> Result<PathBuf, String> {
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
fn open_store(state: &tauri::State<'_, AppState>) -> Result<ProfileStore, String> {
    ProfileStore::open(store_root(state)?).map_err(|error| error.to_string())
}

/// Opens the proxy list, which lives beside the profiles it is assigned to.
fn open_proxy_store(state: &tauri::State<'_, AppState>) -> Result<narrc_core::ProxyStore, String> {
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
pub async fn start_sidecar(_state: tauri::State<'_, AppState>) -> Result<String, String> {
    Ok(format!(
        "sidecar {} (core {}, engine {})",
        env!("CARGO_PKG_VERSION"),
        narrc_core::VERSION,
        narrc_core::ENGINE_TARGET,
    ))
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

/// Deletes a profile.
#[tauri::command]
pub async fn delete_profile(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let store = open_store(&state)?;
    let removed = store.delete(&id).map_err(|error| error.to_string())?;
    if !removed {
        return Err(format!("no profile with the id {id:?}"));
    }
    // Stop the profile's core instance and drop its assignment, so neither
    // outlives the profile.
    mihomo(&state)?.stop_profile(&id)?;
    let mut assignments = open_assignment_store(&state)?;
    assignments.remove(&id).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "deleted": id }))
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

    // Ensure Camoufox is installed.
    let camoufox_path = ensure_camoufox(&app)?;

    let dir = store.browser_dir(&id);
    let (plan, discarded) = profile
        .launch_plan_after_discarding_conflicts(&dir, engine.as_deref(), false)
        .map_err(|error| error.to_string())?;

    // Use the ensured binary path, overriding any configured path.
    let prog = camoufox_path.to_string_lossy().to_string();
    let pid = protocol::spawn_with_program(&plan, &prog)
        .map_err(|error| format!("could not start browser: {error}"))?;

    // The browser is detached, so its exit is learned by polling its pid. When
    // it goes, the profile's core instance goes with it — a core left running
    // after its browser is a leak.
    if assignment.is_some() {
        if let Some(pid) = pid {
            let app2 = app.clone();
            let profile_id = id.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let state = app2.state::<AppState>();
                while crate::mihomo::process_alive(pid) {
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
        "discarded": discarded,
        "headless": plan.headless,
    }))
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
struct Echo {
    ip: String,
    country: Option<String>,
    city: Option<String>,
}

/// Echo services asked, in order, for the IP they saw.
///
/// Several because any one of them rate-limits, blocks a datacentre range or
/// is down; the check passes when any answers. Every request goes *through*
/// the proxy, so these see the exit address and nothing about this machine.
const ECHO_ENDPOINTS: &[&str] = &[
    "https://ipinfo.io/json",
    "https://ifconfig.co/json",
    "https://api.ipify.org?format=json",
    "https://checkip.amazonaws.com",
    "https://icanhazip.com",
];

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
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(12))
        .user_agent("NarciPHBrowser")
        .build()
        .map_err(|error| error.to_string())?;

    let mut last = "no echo service answered".to_string();
    for endpoint in ECHO_ENDPOINTS {
        match fetch_echo(&client, endpoint).await {
            Ok(echo) => return Ok(echo),
            Err(error) => last = error,
        }
    }
    Err(last)
}

/// One endpoint's answer, read as JSON first and as a bare IP second.
async fn fetch_echo(client: &reqwest::Client, endpoint: &str) -> Result<Echo, String> {
    let response = client
        .get(endpoint)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("{endpoint} returned status {status}"));
    }
    let body = response.text().await.map_err(|error| error.to_string())?;
    let body = body.trim();

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(body) {
        let ip = value
            .get("ip")
            .and_then(|ip| ip.as_str())
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
fn text_field(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|field| field.as_str())
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
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
fn open_subscription_store(
    state: &tauri::State<'_, AppState>,
) -> Result<narrc_core::SubscriptionStore, String> {
    narrc_core::SubscriptionStore::open(store_root(state)?.join("subscriptions.json"))
        .map_err(|error| error.to_string())
}

/// Opens the assignment list, which lives beside the profiles.
fn open_assignment_store(
    state: &tauri::State<'_, AppState>,
) -> Result<narrc_core::AssignmentStore, String> {
    narrc_core::AssignmentStore::open(store_root(state)?.join("assignments.json"))
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
            .map(|home| home.join("mihomo").join("mihomo.exe").exists())
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
        let nodes = read_nodes(&client, api, &secret, &provider, false, 25)?;
        Ok(serde_json::json!({ "nodes": nodes }))
    })
    .await
    .map_err(|error| error.to_string())?
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
        let nodes = match read_nodes(&client, api, &secret, &provider, true, 25) {
            Ok(nodes) => nodes,
            Err(_) => {
                reload_network(&app2, state.inner(), &subs)?;
                let (api, secret, _speed) = network_handle(&app2, state.inner(), &subs)?;
                let client = crate::mihomo::blocking_client(60);
                read_nodes(&client, api, &secret, &provider, false, 25)?
            }
        };
        let mut store = open_subscription_store(&state)?;
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
    let node = spec.node.clone();
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        let (api, secret, _speed) = network_handle(&app2, state.inner(), &subs)?;
        let client = crate::mihomo::blocking_client(20);
        let delay = crate::mihomo::node_delay(&client, api, &secret, &provider, &node)?;
        Ok(serde_json::json!({ "delay": delay }))
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
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        let (api, secret, speed) = network_handle(&app2, state.inner(), &subs)?;
        let client = crate::mihomo::blocking_client(20);
        let mbps = crate::mihomo::node_speed(&client, api, &secret, speed, &node)?;
        Ok(serde_json::json!({ "mbps": mbps }))
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
