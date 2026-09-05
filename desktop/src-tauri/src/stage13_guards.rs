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
 * Stage 13 authority rules are enforced at the encrypted local-database
 * boundary as well as in UI/commands. Own-transport Driver arrival hands the
 * load to the site; site acceptance/rejection/completion comes afterwards;
 * the receiving-site ticket comes after completion.
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
            DROP TRIGGER IF EXISTS stage13_ticket_before_completion;

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

            /* For own transport with an assigned Driver, the Mobile arrival is
             * the authoritative physical arrival. Desktop must not duplicate
             * it with a manual Mark Arrived action. */
            CREATE TRIGGER IF NOT EXISTS stage13_driver_owns_arrival
            BEFORE UPDATE OF status ON local_job_load
            WHEN NEW.status = 'arrived'
              AND COALESCE(trim(json_extract(NEW.payload_json, '$.driverId')), '') != ''
              AND COALESCE(trim(json_extract(NEW.payload_json, '$.haulierCounterpartyId')), '') = ''
              AND COALESCE(json_extract(NEW.payload_json, '$.fieldWorkflow.step'), '') NOT IN ('ARRIVED_DESTINATION', 'DELIVERED')
            BEGIN
              SELECT RAISE(
                ABORT,
                'STAGE13_DRIVER_ARRIVAL_REQUIRED: The assigned Driver must mark Arrived at destination on Mobile.'
              );
            END;

            CREATE TRIGGER IF NOT EXISTS stage13_site_decision_after_driver_arrival
            BEFORE UPDATE OF status ON local_job_load
            WHEN NEW.status IN ('accepted', 'rejected')
              AND COALESCE(trim(json_extract(NEW.payload_json, '$.driverId')), '') != ''
              AND COALESCE(trim(json_extract(NEW.payload_json, '$.haulierCounterpartyId')), '') = ''
              AND COALESCE(json_extract(NEW.payload_json, '$.fieldWorkflow.step'), '') NOT IN ('ARRIVED_DESTINATION', 'DELIVERED')
            BEGIN
              SELECT RAISE(
                ABORT,
                'STAGE13_DRIVER_ARRIVAL_REQUIRED: Site acceptance or rejection is available only after Driver destination arrival.'
              );
            END;

            CREATE TRIGGER IF NOT EXISTS stage13_completion_after_driver_arrival
            BEFORE UPDATE OF status ON local_job_load
            WHEN NEW.status = 'completed'
              AND COALESCE(trim(json_extract(NEW.payload_json, '$.driverId')), '') != ''
              AND COALESCE(trim(json_extract(NEW.payload_json, '$.haulierCounterpartyId')), '') = ''
              AND COALESCE(json_extract(NEW.payload_json, '$.fieldWorkflow.step'), '') NOT IN ('ARRIVED_DESTINATION', 'DELIVERED')
            BEGIN
              SELECT RAISE(
                ABORT,
                'STAGE13_DRIVER_ARRIVAL_REQUIRED: The site cannot complete this own-transport load before Driver arrival.'
              );
            END;

            /* Ticket number is a post-completion site authority field. This
             * blocks the older editable-load form from mutating it earlier. */
            CREATE TRIGGER IF NOT EXISTS stage13_ticket_number_after_completion
            BEFORE UPDATE OF payload_json ON local_job_load
            WHEN COALESCE(json_extract(NEW.payload_json, '$.ticketNumber'), '')
                   != COALESCE(json_extract(OLD.payload_json, '$.ticketNumber'), '')
              AND NEW.status != 'completed'
            BEGIN
              SELECT RAISE(
                ABORT,
                'STAGE13_SITE_TICKET_REQUIRES_COMPLETED_LOAD: Ticket number is controlled by the completed receiving-site transaction.'
              );
            END;

            CREATE TRIGGER IF NOT EXISTS stage13_site_ticket_after_completion
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
