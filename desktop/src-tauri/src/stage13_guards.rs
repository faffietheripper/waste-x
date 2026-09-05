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
 * in React/Rust command validation. Driver arrival chronology is preserved,
 * while receiving-site tickets are explicitly post-completion documents.
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
            /* Remove the earlier experimental rule that required a ticket
             * before completion. That chronology was backwards. */
            DROP TRIGGER IF EXISTS stage13_ticket_before_completion;

            /* Driver transport chronology is synthetic field metadata and some
             * ordinary Cloud job-load payloads do not include it. Preserve the
             * last local mirror instead of erasing ARRIVED_DESTINATION. */
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

            /* A normal receiving-site ticket is evidence of a finished site
             * transaction. Local code cannot create it against an uncompleted
             * load even if an older UI accidentally exposes the command. */
            CREATE TRIGGER IF NOT EXISTS stage13_site_ticket_after_completion
            BEFORE INSERT ON local_ticket
            WHEN NEW.job_load_id IS NOT NULL
              AND COALESCE(
                    (SELECT status FROM local_job_load WHERE id = NEW.job_load_id),
                    ''
                  ) != 'completed'
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
