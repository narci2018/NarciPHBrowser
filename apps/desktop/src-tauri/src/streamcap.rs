use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct StreamCapStatus {
    pub running: bool,
    pub port: u16,
    pub url: String,
    pub work_dir: String,
    pub python_path: String,
    pub pid: Option<u32>,
    pub downloads_dir: String,
}

static STREAMCAP_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

pub fn detect_python() -> Option<PathBuf> {
    // 1. Check known miniconda3 path
    let candidates = [
        "C:\\Users\\narci\\miniconda3\\python.exe",
        "C:\\ProgramData\\miniconda3\\python.exe",
        "C:\\miniconda3\\python.exe",
        "C:\\Python310\\python.exe",
        "C:\\Python311\\python.exe",
        "C:\\Python312\\python.exe",
    ];

    for c in &candidates {
        let p = PathBuf::from(c);
        if p.exists() {
            return Some(p);
        }
    }

    // 2. Check if python is on PATH
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        if let Ok(output) = Command::new("where")
            .arg("python")
            .creation_flags(0x0800_0000)
            .output()
        {
            if output.status.success() {
                if let Ok(s) = String::from_utf8(output.stdout) {
                    for line in s.lines() {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() && Path::new(trimmed).exists() {
                            return Some(PathBuf::from(trimmed));
                        }
                    }
                }
            }
        }
    }

    None
}

pub fn get_default_work_dir() -> PathBuf {
    let p = PathBuf::from("C:\\Tools2\\StreamCap");
    if p.exists() {
        return p;
    }
    // Fallback: check relative to exe or current dir
    if let Ok(curr) = std::env::current_dir() {
        let rel = curr.join("StreamCap");
        if rel.exists() {
            return rel;
        }
    }
    p
}

pub fn is_port_listening(port: u16) -> bool {
    let addr = format!("127.0.0.1:{}", port);
    if let Ok(stream) = TcpStream::connect_timeout(
        &addr.parse().unwrap(),
        Duration::from_millis(300),
    ) {
        drop(stream);
        return true;
    }
    false
}

#[tauri::command]
pub fn get_streamcap_status() -> Result<StreamCapStatus, String> {
    let work_dir = get_default_work_dir();
    let python = detect_python().unwrap_or_else(|| PathBuf::from("python"));
    let downloads_dir = work_dir.join("downloads");

    let mut lock = STREAMCAP_PROCESS.lock().unwrap();
    let mut pid = None;

    if let Some(child) = lock.as_mut() {
        match child.try_wait() {
            Ok(Some(_status)) => {
                // Process has terminated
                *lock = None;
            }
            Ok(None) => {
                // Still running
                pid = Some(child.id());
            }
            Err(_) => {
                *lock = None;
            }
        }
    }

    let port: u16 = 6006;
    let listening = is_port_listening(port);
    let running = pid.is_some() || listening;

    Ok(StreamCapStatus {
        running,
        port,
        url: format!("http://127.0.0.1:{}", port),
        work_dir: work_dir.to_string_lossy().to_string(),
        python_path: python.to_string_lossy().to_string(),
        pid,
        downloads_dir: downloads_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn start_streamcap_service(
    port: Option<u16>,
    custom_dir: Option<String>,
) -> Result<StreamCapStatus, String> {
    let target_port = port.unwrap_or(6006);
    let work_dir = custom_dir
        .map(PathBuf::from)
        .unwrap_or_else(get_default_work_dir);

    if !work_dir.exists() {
        return Err(format!(
            "StreamCap 目录不存在: {}",
            work_dir.to_string_lossy()
        ));
    }

    let main_py = work_dir.join("main.py");
    if !main_py.exists() {
        return Err(format!(
            "StreamCap 启动文件不存在: {}",
            main_py.to_string_lossy()
        ));
    }

    // Ensure downloads dir exists
    let downloads_dir = work_dir.join("downloads");
    let _ = std::fs::create_dir_all(&downloads_dir);

    // If port is already listening, return existing status
    if is_port_listening(target_port) {
        return get_streamcap_status();
    }

    let python = detect_python().ok_or_else(|| {
        "未在系统中检测到 Python 环境 (已检索 miniconda3 及 PATH)。请确保已安装 Python 3.10+".to_string()
    })?;

    // Prepare child spawn
    let mut cmd = Command::new(&python);
    cmd.current_dir(&work_dir)
        .args([
            "main.py",
            "--web",
            "--host",
            "127.0.0.1",
            "--port",
            &target_port.to_string(),
        ])
        .env("FLET_FORCE_WEB_SERVER", "true")
        .env("FLET_ALLOW_EMBED", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUNBUFFERED", "1")
        .env("HOST", "127.0.0.1")
        .env("PORT", target_port.to_string());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: prevent black console window
    }

    let child = cmd.spawn().map_err(|e| format!("启动 StreamCap 失败: {}", e))?;
    let child_pid = child.id();

    {
        let mut lock = STREAMCAP_PROCESS.lock().unwrap();
        *lock = Some(child);
    }

    // Poll until port 6006 is listening (up to 8 seconds)
    let start_time = std::time::Instant::now();
    let mut ready = false;
    while start_time.elapsed() < Duration::from_secs(8) {
        if is_port_listening(target_port) {
            ready = true;
            break;
        }
        std::thread::sleep(Duration::from_millis(300));
    }

    if !ready {
        // Child might still be initializing, but we return status with running=true
    }

    Ok(StreamCapStatus {
        running: true,
        port: target_port,
        url: format!("http://127.0.0.1:{}", target_port),
        work_dir: work_dir.to_string_lossy().to_string(),
        python_path: python.to_string_lossy().to_string(),
        pid: Some(child_pid),
        downloads_dir: downloads_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn stop_streamcap_service() -> Result<StreamCapStatus, String> {
    let mut lock = STREAMCAP_PROCESS.lock().unwrap();
    if let Some(mut child) = lock.take() {
        let _ = child.kill();
        let _ = child.wait();
    }

    // Safety measure: on Windows kill any python.exe running main.py on 6006 if still bound
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Kill by port or command pattern if needed
        let _ = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*StreamCap*main.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
            ])
            .creation_flags(0x0800_0000)
            .output();
    }

    get_streamcap_status()
}

#[tauri::command]
pub fn open_streamcap_in_browser(url: Option<String>) -> Result<(), String> {
    let target_url = url.unwrap_or_else(|| "http://127.0.0.1:6006".to_string());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        Command::new("cmd")
            .args(["/C", "start", "", &target_url])
            .creation_flags(0x0800_0000)
            .spawn()
            .map_err(|e| format!("打开系统浏览器失败: {}", e))?;
    }
    #[cfg(not(windows))]
    {
        Command::new("xdg-open")
            .arg(&target_url)
            .spawn()
            .map_err(|e| format!("无法打开浏览器: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_streamcap_directory(path: Option<String>) -> Result<(), String> {
    let target = path
        .map(PathBuf::from)
        .unwrap_or_else(|| get_default_work_dir().join("downloads"));

    let _ = std::fs::create_dir_all(&target);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        Command::new("explorer")
            .arg(&target)
            .creation_flags(0x0800_0000)
            .spawn()
            .map_err(|e| format!("打开目录失败: {}", e))?;
    }
    #[cfg(not(windows))]
    {
        Command::new("xdg-open")
            .arg(&target)
            .spawn()
            .map_err(|e| format!("无法打开目录: {}", e))?;
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DownloadedVideoInfo {
    pub name: String,
    pub path: String,
    pub size_mb: f64,
    pub modified: String,
}

#[tauri::command]
pub fn list_streamcap_downloads() -> Result<Vec<DownloadedVideoInfo>, String> {
    let dir = get_default_work_dir().join("downloads");
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut results = Vec::new();
    let walker = walkdir::WalkDir::new(&dir)
        .max_depth(3)
        .into_iter()
        .filter_map(|e| e.ok());

    for entry in walker {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                let ext_lower = ext.to_lowercase();
                if ["mp4", "ts", "flv", "mkv", "mov"].contains(&ext_lower.as_str()) {
                    let metadata = entry.metadata().ok();
                    let size_mb = metadata
                        .as_ref()
                        .map(|m| (m.len() as f64) / (1024.0 * 1024.0))
                        .unwrap_or(0.0);
                    let modified = metadata
                        .and_then(|m| m.modified().ok())
                        .map(|t| {
                            let duration = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
                            format!("{}", duration.as_secs())
                        })
                        .unwrap_or_default();

                    results.push(DownloadedVideoInfo {
                        name: entry.file_name().to_string_lossy().to_string(),
                        path: path.to_string_lossy().to_string(),
                        size_mb: (size_mb * 100.0).round() / 100.0,
                        modified,
                    });
                }
            }
        }
    }

    // Sort newest first
    results.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(results)
}

