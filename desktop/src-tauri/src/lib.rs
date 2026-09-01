use tauri::Manager;

mod bootstrap;
mod local_db;
mod offline_auth;
mod provisioning;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let local_db = local_db::initialise(app.handle())?;
            app.manage(local_db);
            app.manage(offline_auth::DesktopAuthState::default());
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Waste X Desktop");
}
