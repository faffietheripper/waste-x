use tauri::Manager;

mod bootstrap;
mod local_db;
mod provisioning;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let local_db = local_db::initialise(app.handle())?;
            app.manage(local_db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            local_db::local_db_status,
            local_db::local_db_self_test,
            bootstrap::local_db_apply_bootstrap,
            bootstrap::local_db_operational_summary,
            provisioning::desktop_provisioning_status,
            provisioning::desktop_provision_and_bootstrap,
            provisioning::desktop_refresh_bootstrap,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Waste X Desktop");
}
