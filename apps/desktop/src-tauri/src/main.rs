// Prevents an extra console window on Windows in release mode.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod job;
mod mihomo;
mod state;

use commands::{
    assign_node, assign_proxy, check_proxy, clear_override, core_status, create_profile,
    create_proxy, create_subscription, delete_profile, delete_proxy, delete_subscription,
    ensure_engine, inspect_profile, launch_profile, list_assignments, list_proxies, list_profiles,
    list_subscription_nodes, list_subscriptions, refresh_subscription, screen_presets, set_override,
    start_sidecar, test_node_delay, test_node_speed, unassign_node, update_profile, update_proxy,
    update_subscription, validate_profile,
};
use state::AppState;

fn main() {
    // Tie every proxy core's lifetime to this process: when the app exits,
    // gracefully or not, the job closes and Windows kills every core still in
    // it. Forgotten on purpose — the handle must outlive `main` so the OS
    // closes it on process exit rather than us closing it mid-run.
    std::mem::forget(job::JobObject::assign_current_process());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            start_sidecar,
            ensure_engine,
            list_profiles,
            screen_presets,
            create_profile,
            update_profile,
            inspect_profile,
            validate_profile,
            delete_profile,
            launch_profile,
            set_override,
            clear_override,
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
            test_node_speed,
            assign_node,
            unassign_node,
            list_assignments,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the NarciPHBrowser application");
}
