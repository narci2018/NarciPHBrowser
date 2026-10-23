use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::thread;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tiny_http::{Header, Response, Server};

use crate::state::AppState;
use tauri::Manager;

static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);
static BOUND_PORT: AtomicU16 = AtomicU16::new(0);

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AutomationEnvInfo {
    pub node_found: bool,
    pub node_version: Option<String>,
    pub node_path: Option<String>,
    pub driver_found: bool,
    pub driver_path: Option<String>,
    pub ready: bool,
}

fn silent_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

/// 自动侦测系统可用的 Node 运行时与 Playwright 驱动包
pub fn detect_automation_env(
    custom_driver: Option<&str>,
    custom_node: Option<&str>,
) -> AutomationEnvInfo {
    let mut node_found = false;
    let mut node_version = None;
    let mut node_path = None;
    let mut driver_found = false;
    let mut driver_path = None;

    // 1. 探测 Node 运行时
    if let Some(custom) = custom_node.filter(|s| !s.trim().is_empty()) {
        if let Ok(output) = silent_command(custom).arg("-v").output() {
            if output.status.success() {
                node_found = true;
                node_path = Some(custom.to_string());
                node_version = Some(String::from_utf8_lossy(&output.stdout).trim().to_string());
            }
        }
    }

    if !node_found {
        // 尝试系统环境变量中的 node
        if let Ok(output) = silent_command("node").arg("-v").output() {
            if output.status.success() {
                node_found = true;
                node_path = Some("node".to_string());
                node_version = Some(String::from_utf8_lossy(&output.stdout).trim().to_string());
            }
        }
    }

    // 2. 探测 Playwright 驱动包路径 (driver package)
    if let Some(custom) = custom_driver.filter(|s| !s.trim().is_empty()) {
        let p = Path::new(custom);
        if p.exists() && (p.join("package.json").exists() || p.join("index.js").exists()) {
            driver_found = true;
            driver_path = Some(custom.to_string());
        }
    }

    if !driver_found {
        let mut candidates = Vec::new();

        if let Some(home) = dirs_next::home_dir() {
            // miniconda
            candidates.push(home.join("miniconda3/lib/site-packages/playwright/driver/package"));
            candidates.push(home.join("miniconda/lib/site-packages/playwright/driver/package"));
            // anaconda
            candidates.push(home.join("anaconda3/lib/site-packages/playwright/driver/package"));
            candidates.push(home.join("anaconda/lib/site-packages/playwright/driver/package"));
            // .local
            candidates.push(home.join(".local/lib/python3.11/site-packages/playwright/driver/package"));
            candidates.push(home.join(".local/lib/python3.10/site-packages/playwright/driver/package"));
            candidates.push(home.join(".local/lib/python3.12/site-packages/playwright/driver/package"));
        }

        if let Some(local_app_data) = dirs_next::data_local_dir() {
            candidates.push(local_app_data.join("Programs/Python/Python311/Lib/site-packages/playwright/driver/package"));
            candidates.push(local_app_data.join("Programs/Python/Python312/Lib/site-packages/playwright/driver/package"));
            candidates.push(local_app_data.join("Programs/Python/Python310/Lib/site-packages/playwright/driver/package"));
        }

        // 当前工作目录 node_modules
        candidates.push(PathBuf::from("node_modules/playwright-core"));
        candidates.push(PathBuf::from("../node_modules/playwright-core"));

        for candidate in candidates {
            if candidate.exists() && candidate.join("package.json").exists() {
                driver_found = true;
                driver_path = Some(candidate.to_string_lossy().to_string());
                break;
            }
        }
    }

    // 如果还没找到，尝试动态问一下 python (若存在)
    if !driver_found {
        if let Ok(output) = silent_command("python")
            .args(["-c", "import playwright, os; print(os.path.join(os.path.dirname(playwright.__file__), 'driver', 'package'))"])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let p = Path::new(&stdout);
                if p.exists() && p.join("package.json").exists() {
                    driver_found = true;
                    driver_path = Some(stdout);
                }
            }
        }
    }

    // 如果 node 仍未找到，但在 python playwright 目录下有 node.exe，则自动借用该 node.exe
    if !node_found {
        if let Some(ref dpath) = driver_path {
            let parent = Path::new(dpath).parent();
            if let Some(par) = parent {
                let bundled_node = if cfg!(target_os = "windows") {
                    par.join("node.exe")
                } else {
                    par.join("node")
                };
                if bundled_node.exists() {
                    node_found = true;
                    node_path = Some(bundled_node.to_string_lossy().to_string());
                    node_version = Some("bundled-playwright-node".to_string());
                }
            }
        }
    }

    let ready = node_found && driver_found;

    AutomationEnvInfo {
        node_found,
        node_version,
        node_path,
        driver_found,
        driver_path,
        ready,
    }
}

pub fn get_server_status() -> serde_json::Value {
    let port = BOUND_PORT.load(Ordering::SeqCst);
    let running = SERVER_RUNNING.load(Ordering::SeqCst);
    let env_info = detect_automation_env(None, None);

    json!({
        "running": running,
        "port": port,
        "url": if running { format!("http://127.0.0.1:{}", port) } else { "".to_string() },
        "driver_ready": env_info.ready,
        "driver_path": env_info.driver_path,
        "node_path": env_info.node_path,
    })
}

pub fn get_bound_port() -> u16 {
    BOUND_PORT.load(Ordering::SeqCst)
}

/// 启动轻量 Local REST API 服务 (运行于后台常驻线程)
pub fn start_local_api(app: tauri::AppHandle, preferred_port: u16) {
    if SERVER_RUNNING.load(Ordering::SeqCst) {
        return;
    }

    let ports_to_try = [preferred_port, preferred_port + 1, preferred_port + 2, 50325, 29995];

    let mut server = None;
    let mut bound_port = preferred_port;

    for port in ports_to_try {
        let addr = format!("127.0.0.1:{}", port);
        match Server::http(&addr) {
            Ok(s) => {
                server = Some(s);
                bound_port = port;
                break;
            }
            Err(_) => {
                // 端口被占用，静默尝试候选端口
            }
        }
    }

    let server = match server {
        Some(s) => s,
        None => {
            return;
        }
    };

    SERVER_RUNNING.store(true, Ordering::SeqCst);
    BOUND_PORT.store(bound_port, Ordering::SeqCst);

    let app_handle = app.clone();
    thread::spawn(move || {
        for mut request in server.incoming_requests() {
            // 处理 OPTIONS 预检请求以支持跨域 (CORS)
            if request.method().as_str() == "OPTIONS" {
                let mut response = Response::empty(204);
                add_cors_headers(&mut response);
                let _ = request.respond(response);
                continue;
            }

            let raw_url = request.url().to_string();
            let (path, query) = parse_url(&raw_url);

            // 专为 HTML5 <video> / <audio> 媒体播放器设计的高性能流式端点 (支持 HTTP 206 Partial Content 与 Byte Range 寻道)
            if path == "/api/v1/media/stream" {
                thread::spawn(move || {
                    handle_media_stream(request, &query);
                });
                continue;
            }

            let response_json = match (request.method().as_str(), path.as_str()) {
                ("GET", "/api/v1/health") | ("GET", "/api/v1/status") => {
                    handle_status(&app_handle, bound_port)
                }
                ("GET", "/api/v1/profile/list") => {
                    handle_list_profiles(&app_handle)
                }
                ("GET", "/api/v1/profile/start") | ("POST", "/api/v1/profile/start") => {
                    handle_start_profile(&app_handle, &mut request, &query)
                }
                ("GET", "/api/v1/profile/stop") | ("POST", "/api/v1/profile/stop") => {
                    handle_stop_profile(&app_handle, &mut request, &query)
                }
                ("GET", "/api/v1/profile/active") => {
                    handle_active_profiles(&app_handle)
                }
                _ => {
                    json!({
                        "code": 404,
                        "success": false,
                        "message": format!("Endpoint '{}' not found", path)
                    })
                }
            };

            let response_body = serde_json::to_string(&response_json).unwrap_or_default();
            let mut response = Response::from_string(response_body);
            if let Ok(h) = Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]) {
                response.add_header(h);
            }
            add_cors_headers(&mut response);
            let _ = request.respond(response);
        }
        SERVER_RUNNING.store(false, Ordering::SeqCst);
    });
}

fn add_cors_headers<R: std::io::Read>(response: &mut Response<R>) {
    if let Ok(h) = Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]) {
        response.add_header(h);
    }
    if let Ok(h) = Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, POST, OPTIONS"[..]) {
        response.add_header(h);
    }
    if let Ok(h) = Header::from_bytes(
        &b"Access-Control-Allow-Headers"[..],
        &b"Content-Type, Authorization, x-requested-with"[..],
    ) {
        response.add_header(h);
    }
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut result = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..=i + 2]).unwrap_or(""), 16) {
                result.push(byte);
                i += 3;
                continue;
            }
        } else if bytes[i] == b'+' {
            result.push(b' ');
            i += 1;
            continue;
        }
        result.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&result).to_string()
}

fn parse_url(raw: &str) -> (String, HashMap<String, String>) {
    let mut parts = raw.splitn(2, '?');
    let path = parts.next().unwrap_or("").to_string();
    let query_str = parts.next().unwrap_or("");
    let mut query = HashMap::new();

    for pair in query_str.split('&') {
        if pair.is_empty() {
            continue;
        }
        let mut kv = pair.splitn(2, '=');
        let key = kv.next().unwrap_or("").trim().to_string();
        let val = kv.next().unwrap_or("").trim();
        if !key.is_empty() {
            let decoded_val = percent_decode(val);
            query.insert(key, decoded_val);
        }
    }

    (path, query)
}

/// 处理多媒体文件流式请求 (支持 HTTP 206 Partial Content 与 Range 寻道)
fn handle_media_stream(request: tiny_http::Request, query: &HashMap<String, String>) {
    let file_path = match query.get("path") {
        Some(p) if !p.trim().is_empty() => p.trim(),
        _ => {
            let mut resp = Response::from_string("Missing 'path' query parameter").with_status_code(400);
            add_cors_headers(&mut resp);
            let _ = request.respond(resp);
            return;
        }
    };

    let p = Path::new(file_path);
    if !p.exists() || !p.is_file() {
        let mut resp = Response::from_string(format!("File not found: {}", file_path)).with_status_code(404);
        add_cors_headers(&mut resp);
        let _ = request.respond(resp);
        return;
    }

    let mut file = match std::fs::File::open(p) {
        Ok(f) => f,
        Err(e) => {
            let mut resp = Response::from_string(format!("Failed to open file: {}", e)).with_status_code(500);
            add_cors_headers(&mut resp);
            let _ = request.respond(resp);
            return;
        }
    };

    let total_len = match file.metadata() {
        Ok(m) => m.len(),
        Err(e) => {
            let mut resp = Response::from_string(format!("Failed to get metadata: {}", e)).with_status_code(500);
            add_cors_headers(&mut resp);
            let _ = request.respond(resp);
            return;
        }
    };

    let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
    let content_type = match ext.as_str() {
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    };

    // 检查是否有 Range 头部 (HTML5 <video> / <audio> 播放器快进、跳转、缓冲均需要 HTTP 206)
    let range_header = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Range"))
        .map(|h| h.value.as_str().to_string());

    if let Some(range_str) = range_header {
        if let Some(range_val) = range_str.strip_prefix("bytes=") {
            let parts: Vec<&str> = range_val.split('-').collect();
            let start: u64 = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
            let end: u64 = parts
                .get(1)
                .and_then(|s| if s.is_empty() { None } else { s.parse().ok() })
                .unwrap_or(total_len.saturating_sub(1));

            let end = end.min(total_len.saturating_sub(1));
            let chunk_len = if end >= start { end - start + 1 } else { 0 };

            use std::io::Seek;
            if file.seek(std::io::SeekFrom::Start(start)).is_ok() {
                use std::io::Read;
                let reader = file.take(chunk_len);

                let mut headers = Vec::new();
                if let Ok(h) = Header::from_bytes(&b"Content-Type"[..], content_type.as_bytes()) {
                    headers.push(h);
                }
                if let Ok(h) = Header::from_bytes(&b"Accept-Ranges"[..], &b"bytes"[..]) {
                    headers.push(h);
                }
                let cr_str = format!("bytes {}-{}/{}", start, end, total_len);
                if let Ok(h) = Header::from_bytes(&b"Content-Range"[..], cr_str.as_bytes()) {
                    headers.push(h);
                }
                if let Ok(h) = Header::from_bytes(&b"Content-Length"[..], chunk_len.to_string().as_bytes()) {
                    headers.push(h);
                }
                if let Ok(h) = Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]) {
                    headers.push(h);
                }

                let response = Response::new(
                    tiny_http::StatusCode(206),
                    headers,
                    reader,
                    Some(chunk_len as usize),
                    None,
                );
                let _ = request.respond(response);
                return;
            }
        }
    }

    // 默认返回全部文件流 (HTTP 200)
    let mut headers = Vec::new();
    if let Ok(h) = Header::from_bytes(&b"Content-Type"[..], content_type.as_bytes()) {
        headers.push(h);
    }
    if let Ok(h) = Header::from_bytes(&b"Accept-Ranges"[..], &b"bytes"[..]) {
        headers.push(h);
    }
    if let Ok(h) = Header::from_bytes(&b"Content-Length"[..], total_len.to_string().as_bytes()) {
        headers.push(h);
    }
    if let Ok(h) = Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]) {
        headers.push(h);
    }

    let response = Response::new(
        tiny_http::StatusCode(200),
        headers,
        file,
        Some(total_len as usize),
        None,
    );
    let _ = request.respond(response);
}

fn handle_status(app: &tauri::AppHandle, port: u16) -> serde_json::Value {
    let state = app.state::<AppState>();
    let active_count = state.agents.lock().map(|a| a.len()).unwrap_or(0);
    let env_info = detect_automation_env(None, None);

    json!({
        "code": 0,
        "success": true,
        "message": "NarciPH Automation Engine is online",
        "data": {
            "version": env!("CARGO_PKG_VERSION"),
            "port": port,
            "active_sessions": active_count,
            "driver_ready": env_info.ready,
            "driver_path": env_info.driver_path,
            "node_path": env_info.node_path,
        }
    })
}

fn handle_list_profiles(app: &tauri::AppHandle) -> serde_json::Value {
    let state = app.state::<AppState>();
    match crate::commands::list_profiles_inner(&state) {
        Ok(profiles) => {
            let active_sessions: HashMap<String, String> = state
                .agents
                .lock()
                .map(|agents_guard| {
                    agents_guard
                        .iter()
                        .map(|(id, session)| (id.clone(), session.ws_endpoint.clone()))
                        .collect()
                })
                .unwrap_or_default();

            let items: Vec<serde_json::Value> = profiles
                .into_iter()
                .map(|p| {
                    let is_running = active_sessions.contains_key(&p.id);
                    let ws_endpoint = active_sessions.get(&p.id).cloned();
                    json!({
                        "id": p.id,
                        "name": p.name,
                        "group": p.group,
                        "proxied": p.proxied,
                        "running": is_running,
                        "ws_endpoint": ws_endpoint,
                    })
                })
                .collect();
            json!({
                "code": 0,
                "success": true,
                "data": items
            })
        }
        Err(err) => json!({
            "code": 500,
            "success": false,
            "message": format!("无法获取环境列表: {}", err)
        }),
    }
}

fn handle_start_profile(
    app: &tauri::AppHandle,
    request: &mut tiny_http::Request,
    query: &HashMap<String, String>,
) -> serde_json::Value {
    let mut profile_id = query.get("id").or_else(|| query.get("profile_id")).cloned();
    let mut headless = query
        .get("headless")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);

    if profile_id.is_none() && request.method().as_str() == "POST" {
        let mut body_str = String::new();
        if request.as_reader().read_to_string(&mut body_str).is_ok() {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&body_str) {
                if let Some(id) = val.get("id").or_else(|| val.get("profile_id")).and_then(|v| v.as_str()) {
                    profile_id = Some(id.to_string());
                }
                if let Some(h) = val.get("headless").and_then(|v| v.as_bool()) {
                    headless = h;
                }
            }
        }
    }

    let id = match profile_id {
        Some(id) if !id.trim().is_empty() => id.trim().to_string(),
        _ => {
            return json!({
                "code": 400,
                "success": false,
                "message": "缺少必要参数: id 或 profile_id"
            })
        }
    };

    let state = app.state::<AppState>();
    match crate::commands::start_automation_inner(&state, app, &id, None, None, None, headless) {
        Ok(reply) => json!({
            "code": 0,
            "success": true,
            "message": "指纹浏览器自动化实例已成功启动",
            "data": reply
        }),
        Err(err) => json!({
            "code": 500,
            "success": false,
            "message": format!("启动失败: {}", err)
        }),
    }
}

fn handle_stop_profile(
    app: &tauri::AppHandle,
    request: &mut tiny_http::Request,
    query: &HashMap<String, String>,
) -> serde_json::Value {
    let mut profile_id = query.get("id").or_else(|| query.get("profile_id")).cloned();
    if profile_id.is_none() && request.method().as_str() == "POST" {
        let mut body_str = String::new();
        if request.as_reader().read_to_string(&mut body_str).is_ok() {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&body_str) {
                if let Some(id) = val.get("id").or_else(|| val.get("profile_id")).and_then(|v| v.as_str()) {
                    profile_id = Some(id.to_string());
                }
            }
        }
    }

    let id = match profile_id {
        Some(id) if !id.trim().is_empty() => id.trim().to_string(),
        _ => {
            return json!({
                "code": 400,
                "success": false,
                "message": "缺少必要参数: id 或 profile_id"
            })
        }
    };

    let state = app.state::<AppState>();
    match crate::commands::stop_automation_inner(&state, &id) {
        Ok(reply) => json!({
            "code": 0,
            "success": true,
            "message": "自动化会话已成功停止",
            "data": reply
        }),
        Err(err) => json!({
            "code": 500,
            "success": false,
            "message": format!("停止失败: {}", err)
        }),
    }
}

fn handle_active_profiles(app: &tauri::AppHandle) -> serde_json::Value {
    let state = app.state::<AppState>();
    let agents = match state.agents.lock() {
        Ok(a) => a,
        Err(e) => {
            return json!({
                "code": 500,
                "success": false,
                "message": e.to_string()
            })
        }
    };

    let active: Vec<serde_json::Value> = agents
        .iter()
        .map(|(id, session)| {
            json!({
                "id": id,
                "ws_endpoint": session.ws_endpoint,
                "pid": session.pid()
            })
        })
        .collect();

    json!({
        "code": 0,
        "success": true,
        "data": active
    })
}
