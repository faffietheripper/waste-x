use keyring::Entry;
use rusqlite::Connection;
use tauri::{AppHandle, Manager};

const DB_FILE_NAME: &str = "waste-x-local.db";
const DATABASE_KEYRING_SERVICE: &str = "com.wastex.desktop.local-database";
const DATABASE_KEYRING_ACCOUNT: &str = "database-key-v1";

fn error(message: impl Into<String>) -> Box<dyn std::error::Error> {
    Box::new(std::io::Error::new(std::io::ErrorKind::Other, message.into()))
}

/**
 * Stage 13 local database rules preserve Driver-origin authority metadata and
 * protect the locally-issued receiving-site ticket document.
 *
 * IMPORTANT: workflow preconditions such as Driver arrival, site acceptance,
 * rejection and completion are intentionally NOT implemented as aborting
 * triggers on local_job_load. Bootstrap and Cloud pull apply many unrelated
 * loads in a transaction; one load that is not yet eligible must never block
 * authentication, bootstrap, sync, or access to other jobs. Those workflow
 * preconditions belong to the selected-load Web/Desktop commands instead.
 */
pub fn initialise(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| error(format!("Could not resolve Waste X application data directory: {e}")))?;
    let path = app_data_dir.join(DB_FILE_NAME);

    let entry = Entry::new(DATABASE_KEYRING_SERVICE, DATABASE_KEYRING_ACCOUNT)
        .map_err(|e| error(format!("Could not access the OS credential store: {e}")))?;
    let key = entry
        .get_password()
        .map_err(|e| error(format!("Could not read the Waste X database key: {e}")))?;

    let connection = Connection::open(path)
        .map_err(|e| error(format!("Could not open the Waste X local database: {e}")))?;
    connection
        .execute_batch(&format!(
            "PRAGMA key = \"x'{key}'\";\n             PRAGMA foreign_keys = ON;\n             PRAGMA busy_timeout = 5000;"
        ))
        .map_err(|e| error(format!("Could not unlock the Waste X local database: {e}")))?;

    connection
        .execute_batch(
            r#"
            /* Drop every earlier Stage 13 guard first so an existing encrypted
             * Desktop database cannot retain a global workflow-blocking trigger
             * after upgrading to the per-load authority model. */
            DROP TRIGGER IF EXISTS stage13_ticket_before_completion;
            DROP TRIGGER IF EXISTS stage13_preserve_field_workflow;
            DROP TRIGGER IF EXISTS stage13_preserve_driver_collection_rejection;
            DROP TRIGGER IF EXISTS stage13_driver_owns_arrival;
            DROP TRIGGER IF EXISTS stage13_site_decision_after_driver_arrival;
            DROP TRIGGER IF EXISTS stage13_completion_after_driver_arrival;
            DROP TRIGGER IF EXISTS stage13_ticket_number_after_completion;
            DROP TRIGGER IF EXISTS stage13_site_ticket_after_completion;

            /* Synthetic Driver workflow metadata can arrive before an ordinary
             * Cloud load snapshot. Preserve it when the later snapshot omits
             * the synthetic field so Desktop does not forget Mobile arrival. */
            CREATE TRIGGER stage13_preserve_field_workflow
            AFTER UPDATE OF payload_json ON local_job_load
            WHEN json_type(OLD.payload_json, '$.fieldWorkflow') = 'object'
              AND json_type(NEW.payload_json, '$.fieldWorkflow') IS NULL
            BEGIN
              UPDATE local_job_load
                 SET payload_json = json_set(
                       NEW.payload_json,
                       '$.fieldWorkflow',
                       json(json_extract(OLD.payload_json, '$.fieldWorkflow'))
                     )
               WHERE id = NEW.id;
            END;

            /* Preserve the Driver's pre-collection refusal authority marker
             * across later ordinary load snapshots that do not repeat it. */
            CREATE TRIGGER stage13_preserve_driver_collection_rejection
            AFTER UPDATE OF payload_json ON local_job_load
            WHEN json_type(OLD.payload_json, '$.driverCollectionRejection') = 'object'
              AND json_type(NEW.payload_json, '$.driverCollectionRejection') IS NULL
            BEGIN
              UPDATE local_job_load
                 SET payload_json = json_set(
                       NEW.payload_json,
                       '$.driverCollectionRejection',
                       json(json_extract(OLD.payload_json, '$.driverCollectionRejection'))
                     )
               WHERE id = NEW.id;
            END;

            /* local_ticket is written only by the Desktop ticket command, not
             * by generic bootstrap/pull. It is therefore safe to keep this
             * narrow immutable-document guard at the database boundary. */
            CREATE TRIGGER stage13_site_ticket_after_completion
            BEFORE INSERT ON local_ticket
            WHEN NEW.job_load_id IS NOT NULL
              AND COALESCE((SELECT status FROM local_job_load WHERE id = NEW.job_load_id), '') != 'completed'
            BEGIN
              SELECT RAISE(
                ABORT,
                'STAGE13_SITE_TICKET_REQUIRES_COMPLETED_LOAD: Complete the receiving-site transaction before issuing its ticket.'
              );
            END;
            "#,
        )
        .map_err(|e| error(format!("Could not install Stage 13 local workflow guards: {e}")))?;

    Ok(())
}
