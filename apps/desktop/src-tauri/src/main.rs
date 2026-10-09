// Prevents an extra console window on Windows in release mode.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod job;
mod mihomo;
mod state;
mod window_title;

use commands::{
    add_addon, app_info, assign_node, assign_proxy, bulk_set_group, bulk_trash, check_proxy,
    clear_override, collect_diagnostics, core_status, create_group, create_profile, create_proxy,
    create_subscription, delete_group, delete_proxy, delete_subscription, ensure_engine,
    export_profile, export_profiles, import_profile, inspect_profile, launch_profile,
    list_assignments, list_automation, list_groups, list_profiles, list_proxies,
    list_subscription_nodes, list_subscriptions, list_trash, property_schema, purge_all_trash,
    purge_trash, refresh_subscription, remove_addon, rename_group, restore_profile, screen_presets,
    security_info, set_override, set_profile_group, start_automation, stop_automation,
    test_node_delay, test_node_exit, test_node_speed, test_subscription_delays, trash_profile,
    unassign_node, update_profile, update_proxy, update_subscription, validate_profile,
    verify_profile, warmup_profile,
};
use state::AppState;

fn main() {
    // Tie every proxy core's lifetime to this process: when the app exits,
    // gracefully or not, the job closes and Windows kills every core still in
    // it. Forgotten on purpose — the handle must outlive `main` so the OS
    // closes it on process exit rather than us closing it mid-run.
    std::mem::forget(job::JobObject::assign_current_process());

    tauri::Builder::default()
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
            launch_profile,
            verify_profile,
            start_automation,
            stop_automation,
            list_automation,
            set_override,
            clear_override,
            property_schema,
            export_profile,
            export_profiles,
            import_profile,
            add_addon,
            remove_addon,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running the NarciPHBrowser application");
}
