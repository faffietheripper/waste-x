#![recursion_limit = "512"]

use tauri::Manager;

mod bootstrap;
mod bridge_client;
mod cloud_access;
mod local_db;
mod local_records;
mod offline_auth;
mod offline_master_data;
mod offline_partner_data;
mod offline_jobs;
mod operations;
mod provisioning;
mod site_rejection;
mod stage13_guards;
mod stage13_hash_repair;
mod stage13_repairs;
mod sync_engine;
mod sync_review;
mod support;
mod ticket_io;
mod tickets;
mod vehicle_tare;
mod working_set;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let local_db = local_db::initialise(app.handle())?;
            app.manage(local_db);
            support::recover_interrupted_support_sends(app.handle())?;
            stage13_guards::initialise(app.handle())?;
            stage13_repairs::run(app.handle())?;
            stage13_hash_repair::run(app.handle())?;
            app.manage(offline_auth::DesktopAuthState::default());
            app.manage(sync_engine::SyncEngineState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            local_db::local_db_status,
            local_db::local_db_self_test,
            local_records::desktop_local_records,
            local_records::desktop_local_job_history,
            provisioning::desktop_provisioning_status,
            provisioning::desktop_provision_options,
            provisioning::desktop_provision_and_bootstrap,
            provisioning::desktop_refresh_bootstrap,
            offline_auth::desktop_auth_status,
            offline_auth::desktop_unlock,
            offline_auth::desktop_lock,
            offline_auth::desktop_sign_out,
            offline_auth::desktop_operational_summary,
            operations::desktop_daily_operations,
            operations::desktop_save_load_details,
            operations::desktop_mark_load_arrived,
            operations::desktop_accept_load,
            operations::desktop_reject_load,
            operations::desktop_complete_load,
            site_rejection::desktop_reject_site_load,
            tickets::desktop_ticket_status,
            tickets::desktop_issue_ticket,
            ticket_io::desktop_download_ticket_pdf,
            ticket_io::desktop_print_ticket,
            vehicle_tare::desktop_vehicle_tare,
            sync_engine::desktop_sync_status,
            sync_engine::desktop_sync_now,
            sync_review::desktop_sync_review_items,
            cloud_access::desktop_cloud_context,
            cloud_access::desktop_cloud_catalogue,
            cloud_access::desktop_job_options,
            cloud_access::desktop_create_job,
            cloud_access::desktop_transport_master_data,
            cloud_access::desktop_mutate_transport_master_data,
            offline_master_data::desktop_mutate_transport_local,
            offline_master_data::desktop_sync_transport_mutations,
            offline_partner_data::desktop_mutate_partner_local,
            offline_partner_data::desktop_sync_partner_mutations,
            offline_jobs::desktop_create_job_local,
            offline_jobs::desktop_sync_job_mutations,
            cloud_access::desktop_partner_master_data,
            cloud_access::desktop_mutate_partner_master_data,
            support::desktop_support_tickets,
            support::desktop_mutate_support,
            support::desktop_sync_support,
            cloud_access::desktop_cloud_job_history,
            bridge_client::desktop_bridge_status,
            bridge_client::desktop_bridge_create_mobile_pairing,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Waste X Desktop");
}
