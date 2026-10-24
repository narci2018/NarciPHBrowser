// Prevents an extra console window on Windows in release mode.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod job;
mod local_api;
mod mihomo;
mod special_subscriptions;
mod state;
mod streamcap;
mod window_title;

use streamcap::{
    get_streamcap_status, list_streamcap_downloads, open_streamcap_directory,
    open_streamcap_in_browser, start_streamcap_service, stop_streamcap_service,
};

use commands::{
    add_addon, app_info, assign_node, assign_proxy, bulk_set_group, bulk_trash, check_proxy,
    clear_override, collect_diagnostics, core_status, create_group, create_profile, create_proxy,
    create_subscription, delete_group, delete_proxy, delete_subscription, ensure_engine,
    ensure_special_subscriptions, export_profile, export_profiles, import_profile, inspect_profile,
    launch_profile, list_assignments, list_automation, list_groups, list_profiles, list_proxies,
    list_special_nodes, list_subscription_nodes, list_subscriptions, list_trash, property_schema,
    purge_all_trash, purge_trash, refresh_special_subscription, refresh_subscription, remove_addon,
    rename_group, restore_profile, screen_presets, security_info, set_override, set_profile_group,
    start_automation, stop_automation, test_node_delay, test_node_exit, test_node_speed,
    test_subscription_delays, trash_profile, unassign_node, update_profile, update_proxy,
    update_subscription, validate_profile, verify_profile, warmup_profile, run_workflow,
    get_vpngate_transit_node, set_vpngate_transit_node, prune_special_subscription_nodes,
    get_advanced_proxy_settings, save_advanced_proxy_settings,
    get_routing_rule_set, save_routing_rule_set, reset_routing_rule_set,
    get_routing_collection, save_routing_collection, reset_routing_collection,
    stop_all_browsers, rbac_http_request,
    detect_automation_env, get_local_api_status,
    run_sync_command, tile_browser_windows, bring_browser_windows_to_front,
    start_live_sync, stop_live_sync, get_live_sync_status,
    start_action_recorder, stop_action_recorder, get_action_recorder_status,
    batch_add_addon, batch_remove_addon, list_all_profile_addons,
    pick_media_file, pick_multiple_media_files, open_path_in_explorer, open_url_in_browser, get_media_stream_url,
    generate_edge_tts, remix_video_dedup, remix_and_merge_videos, download_no_watermark_video, fetch_author_posts, generate_ai_copywriting, test_llm_connection, fetch_real_account_analytics, launch_profile_with_url,
};
use state::AppState;

fn log_boot(msg: &str) {
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("C:\\Tools2\\fingerBrowsers2\\NarciPHBrowser\\boot.log")
    {
        let _ = writeln!(f, "[{:?}] {}", std::time::SystemTime::now(), msg);
    }
}

#[cfg(windows)]
fn ensure_single_instance() -> bool {
    use std::ffi::c_void;

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

    extern "system" {
        fn CreateToolhelp32Snapshot(dw_flags: u32, th32_process_id: u32) -> *mut c_void;
        fn Process32FirstW(h_snapshot: *mut c_void, lppe: *mut ProcessEntry32W) -> i32;
        fn Process32NextW(h_snapshot: *mut c_void, lppe: *mut ProcessEntry32W) -> i32;
        fn GetCurrentProcessId() -> u32;
        fn OpenProcess(dw_desired_access: u32, b_inherit_handle: u32, dw_process_id: u32) -> *mut c_void;
        fn TerminateProcess(h_process: *mut c_void, u_exit_code: u32) -> i32;
        fn CloseHandle(h_object: *mut c_void) -> i32;
        fn EnumWindows(lp_enum_func: Option<extern "system" fn(isize, isize) -> i32>, lparam: isize) -> i32;
        fn GetWindowThreadProcessId(h_wnd: isize, lpdw_process_id: *mut u32) -> u32;
        fn IsWindowVisible(h_wnd: isize) -> i32;
        fn ShowWindow(h_wnd: isize, n_cmd_show: i32) -> i32;
        fn SetForegroundWindow(h_wnd: isize) -> i32;
    }

    struct WindowSearch {
        target_pid: u32,
        found_window: isize,
    }

    extern "system" fn enum_proc(hwnd: isize, lparam: isize) -> i32 {
        let search = unsafe { &mut *(lparam as *mut WindowSearch) };
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        if pid == search.target_pid && unsafe { IsWindowVisible(hwnd) } != 0 {
            search.found_window = hwnd;
            return 0; // 找到目标窗口，停止枚举
        }
        1 // 继续枚举
    }

    let my_pid = unsafe { GetCurrentProcessId() };
    const TH32CS_SNAPPROCESS: u32 = 0x00000002;
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot.is_null() || snapshot as isize == -1 {
        return true;
    }

    let mut entry = ProcessEntry32W {
        dw_size: std::mem::size_of::<ProcessEntry32W>() as u32,
        cnt_usage: 0,
        th32_process_id: 0,
        th32_default_heap_id: 0,
        th32_module_id: 0,
        cnt_threads: 0,
        th32_parent_process_id: 0,
        pc_pri_class_base: 0,
        dw_flags: 0,
        sz_exe_file: [0; 260],
    };

    let mut other_pids = Vec::new();
    if unsafe { Process32FirstW(snapshot, &mut entry) } != 0 {
        loop {
            if entry.th32_process_id != my_pid && entry.th32_process_id != 0 {
                let len = entry
                    .sz_exe_file
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.sz_exe_file.len());
                let exe_name = String::from_utf16_lossy(&entry.sz_exe_file[..len]).to_lowercase();
                if exe_name == "narrc-desktop.exe" || exe_name == "narrc-desktop" {
                    other_pids.push(entry.th32_process_id);
                }
            }
            if unsafe { Process32NextW(snapshot, &mut entry) } == 0 {
                break;
            }
        }
    }
    unsafe { CloseHandle(snapshot) };

    for pid in other_pids {
        let mut search = WindowSearch {
            target_pid: pid,
            found_window: 0,
        };
        unsafe {
            EnumWindows(Some(enum_proc), &mut search as *mut WindowSearch as isize);
        }

        if search.found_window != 0 {
            // 已有真实可见窗口，激活并前置展示
            log_boot(&format!("Existing active window found on pid {}. Focusing it.", pid));
            unsafe {
                ShowWindow(search.found_window, 9); // SW_RESTORE
                SetForegroundWindow(search.found_window);
            }
            return false;
        } else {
            // 无可见窗口的残留僵尸进程，自动清理以释放系统和 WebView2 资源
            log_boot(&format!("Terminating ghost/zombie background process pid {}.", pid));
            const PROCESS_TERMINATE: u32 = 0x0001;
            unsafe {
                let h = OpenProcess(PROCESS_TERMINATE, 0, pid);
                if !h.is_null() {
                    TerminateProcess(h, 1);
                    CloseHandle(h);
                }
            }
        }
    }

    true
}

fn main() {
    // 捕获 panic 并记录日志，防止 Windows GUI 模式下静默 fastfail 闪退
    std::panic::set_hook(Box::new(|info| {
        let backtrace = std::backtrace::Backtrace::capture();
        let msg = format!(
            "[{:?}] PANIC: {}\nBacktrace:\n{:?}\n",
            std::time::SystemTime::now(),
            info,
            backtrace
        );
        let _ = std::fs::write("C:\\Tools2\\fingerBrowsers2\\NarciPHBrowser\\panic.log", &msg);
        log_boot(&msg);
        if let Ok(exe) = std::env::current_exe() {
            if let Some(p) = exe.parent() {
                let _ = std::fs::write(p.join("panic.log"), &msg);
            }
        }
    }));

    #[cfg(windows)]
    if !ensure_single_instance() {
        log_boot("Another instance of NarciPHBrowser is already running. Exiting cleanly to avoid WebView2 lock conflict.");
        return;
    }

    log_boot("Step 1: main started");

    // Tie every proxy core's lifetime to this process: when the app exits,
    // gracefully or not, the job closes and Windows kills every core still in
    // it. Forgotten on purpose — the handle must outlive `main` so the OS
    // closes it on process exit rather than us closing it mid-run.
    std::mem::forget(job::JobObject::assign_current_process());
    log_boot("Step 2: job assigned");

    let run_result = tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            app_info,
            security_info,
            collect_diagnostics,
            ensure_engine,
            list_profiles,
            screen_presets,
            create_profile,
            update_profile,
            inspect_profile,
            validate_profile,
            trash_profile,
            list_trash,
            restore_profile,
            purge_trash,
            purge_all_trash,
            set_profile_group,
            bulk_set_group,
            list_groups,
            create_group,
            rename_group,
            delete_group,
            bulk_trash,
            warmup_profile,
            run_workflow,
            launch_profile,
            stop_all_browsers,
            verify_profile,
            start_automation,
            stop_automation,
            list_automation,
            run_sync_command,
            start_live_sync,
            stop_live_sync,
            get_live_sync_status,
            start_action_recorder,
            stop_action_recorder,
            get_action_recorder_status,
            tile_browser_windows,
            bring_browser_windows_to_front,
            set_override,
            clear_override,
            property_schema,
            export_profile,
            export_profiles,
            import_profile,
            add_addon,
            remove_addon,
            batch_add_addon,
            batch_remove_addon,
            list_all_profile_addons,
            list_proxies,
            create_proxy,
            update_proxy,
            delete_proxy,
            assign_proxy,
            check_proxy,
            core_status,
            list_subscriptions,
            create_subscription,
            update_subscription,
            delete_subscription,
            list_subscription_nodes,
            refresh_subscription,
            test_node_delay,
            test_node_exit,
            test_node_speed,
            test_subscription_delays,
            assign_node,
            unassign_node,
            list_assignments,
            ensure_special_subscriptions,
            refresh_special_subscription,
            list_special_nodes,
            get_vpngate_transit_node,
            set_vpngate_transit_node,
            prune_special_subscription_nodes,
            get_advanced_proxy_settings,
            save_advanced_proxy_settings,
            get_routing_rule_set,
            save_routing_rule_set,
            reset_routing_rule_set,
            get_routing_collection,
            save_routing_collection,
            reset_routing_collection,
            rbac_http_request,
            detect_automation_env,
            get_local_api_status,
            get_streamcap_status,
            start_streamcap_service,
            stop_streamcap_service,
            open_streamcap_in_browser,
            open_streamcap_directory,
            list_streamcap_downloads,
            pick_media_file,
            pick_multiple_media_files,
            open_path_in_explorer,
            open_url_in_browser,
            get_media_stream_url,
            generate_edge_tts,
            remix_video_dedup,
            remix_and_merge_videos,
            download_no_watermark_video,
            fetch_author_posts,
            generate_ai_copywriting,
            test_llm_connection,
            fetch_real_account_analytics,
            launch_profile_with_url,
        ])
        .setup(|app| {
            log_boot("Step 3: setup started");
            // 在后台常驻线程启动 Local REST API 服务器 (默认端口 29995)
            local_api::start_local_api(app.handle().clone(), 29995);
            log_boot("Step 4: local_api started");
            Ok(())
        })
        .run(tauri::generate_context!());

    log_boot(&format!("Step 5: run finished: {:?}", run_result));

    if let Err(e) = run_result {
        let msg = format!("NarciPHBrowser failed to start: {}\n", e);
        log_boot(&msg);
        let _ = std::fs::write("C:\\Tools2\\fingerBrowsers2\\NarciPHBrowser\\panic.log", &msg);
        if let Ok(exe) = std::env::current_exe() {
            if let Some(p) = exe.parent() {
                let _ = std::fs::write(p.join("panic.log"), &msg);
            }
        }
    }
}
