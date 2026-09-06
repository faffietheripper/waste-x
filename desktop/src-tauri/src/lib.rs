use tauri::Manager;

mod bootstrap;
mod bridge_client;
mod cloud_access;
mod local_db;
mod offline_auth;
mod operations;
mod provisioning;
mod stage13_guards;
mod stage13_repairs;
mod sync_engine;
mod sync_review;
mod tickets;
mod vehicle_tare;
mod working_set;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let local_db = local_db::initialise(app.handle())?;
            app.manage(local_db);
            stage13_guards::initialise(app.handle())?;
            stage13_repairs::run(app.handle())?;
            app.manage(offline_auth::DesktopAuthState::default());
            app.manage(sync_engine::SyncEngineState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            local_db::local_db_status,
            local_db::local_db_self_test,
            provisioning::desktop_provisioning_status,
            provisioning::desktop_provision_and_bootstrap,
            provisioning::desktop_refresh_bootstrap,
            offline_auth::desktop_auth_status,
            offline_auth::desktop_unlock,
            offline_auth::desktop_lock,
            offline_auth::desktop_operational_summary,
            operations::desktop_daily_operations,
            operations::desktop_save_load_details,
            operations::desktop_mark_load_arrived,
            operations::desktop_accept_load,
            operations::desktop_reject_load,
            operations::desktop_complete_load,
            tickets::desktop_ticket_status,
            tickets::desktop_issue_ticket,
            vehicle_tare::desktop_vehicle_tare,
            sync_engine::desktop_sync_status,
            sync_engine::desktop_sync_now,
            sync_review::desktop_sync_review_items,
            cloud_access::desktop_cloud_context,
            cloud_access::desktop_cloud_catalogue,
            bridge_client::desktop_bridge_status,
            bridge_client::desktop_bridge_create_mobile_pairing,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Waste X Desktop");
}
