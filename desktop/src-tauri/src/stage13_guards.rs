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
 * Stage 13 invariants live at the encrypted local-database boundary as well as
 * in the UI. This prevents an older Desktop UI path from accidentally closing
 * a Mobile-linked movement before the management-site ticket exists.
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
            /*
             * A field-workflow mirror is operational chronology, not a mutable
             * form field. Some ordinary Cloud load updates do not carry the
             * synthetic fieldWorkflow object, so preserve the last known local
             * mirror rather than silently erasing DELIVERED after a later pull.
             */
            CREATE TRIGGER IF NOT EXISTS stage13_preserve_field_workflow
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

            /*
             * For any load that has entered the Mobile field workflow, Desktop
             * may not close the site load until the canonical site ticket has
             * been issued. Loads with no Mobile field workflow are left to the
             * existing site-only rules until that separate policy is designed.
             */
            CREATE TRIGGER IF NOT EXISTS stage13_ticket_before_completion
            BEFORE UPDATE OF status ON local_job_load
            WHEN NEW.status = 'completed'
              AND json_extract(OLD.payload_json, '$.fieldWorkflow.step') IS NOT NULL
              AND COALESCE(trim(json_extract(NEW.payload_json, '$.ticketNumber')), '') = ''
            BEGIN
              SELECT RAISE(
                ABORT,
                'STAGE13_TICKET_REQUIRED: Driver delivery and management-site ticket are required before completion.'
              );
            END;
            "#,
        )
        .map_err(|e| error(format!("Could not install Stage 13 local workflow guards: {e}")))?;

    Ok(())
}
