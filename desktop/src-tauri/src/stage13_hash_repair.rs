use chrono::{SecondsFormat, Utc};
use keyring::Entry;
use rusqlite::{params, Connection};
use tauri::{AppHandle, Manager};

const DB_FILE_NAME: &str = "waste-x-local.db";
const DATABASE_KEYRING_SERVICE: &str = "com.wastex.desktop.local-database";
const DATABASE_KEYRING_ACCOUNT: &str = "database-key-v1";

fn error(message: impl Into<String>) -> Box<dyn std::error::Error> {
    Box::new(std::io::Error::new(std::io::ErrorKind::Other, message.into()))
}

/**
 * Desktop v1 originally hashed the exact Rust JSON serialization bytes. Cloud
 * hashes the logical JavaScript payload, so integral floating values such as
 * `34.0` could be rejected as PAYLOAD_HASH_MISMATCH even though the data was
 * identical.
 *
 * A failed LOAD_DETAILS_UPDATED from that legacy path is safe to supersede only
 * when a later PENDING atomic LOAD_COMPLETED exists for the same load. The
 * completion event carries the final Driver/vehicle/waste/weight/note values,
 * so replaying the earlier details event is both unnecessary and harmful: its
 * stale base version would block the completion behind a permanent review row.
 *
 * Deferred Cloud snapshots up to the completion event's rebased base version
 * have already been consumed by Stage 13's completion rebase. Mark only those
 * snapshots resolved. Anything newer remains visible for human review.
 */
pub fn run(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
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

    let mut connection = Connection::open(path)
        .map_err(|e| error(format!("Could not open the Waste X local database: {e}")))?;
    connection.execute_batch(&format!(
        "PRAGMA key = \"x'{key}'\";\n         PRAGMA foreign_keys = ON;\n         PRAGMA busy_timeout = 5000;"
    ))?;

    let transaction = connection.transaction()?;
    let mut statement = transaction.prepare(
        "SELECT failed.event_id,
                failed.entity_id,
                completion.event_id,
                completion.base_version
           FROM local_sync_queue failed
           INNER JOIN local_sync_queue completion
             ON completion.entity_type = failed.entity_type
            AND completion.entity_id = failed.entity_id
            AND completion.event_type = 'LOAD_COMPLETED'
            AND completion.status = 'PENDING'
            AND completion.device_sequence > failed.device_sequence
          WHERE failed.entity_type = 'job_load'
            AND failed.event_type = 'LOAD_DETAILS_UPDATED'
            AND failed.status = 'FAILED'
            AND failed.last_error = 'REJECTED:PAYLOAD_HASH_MISMATCH'
          ORDER BY failed.device_sequence",
    )?;

    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<i64>>(3)?,
        ))
    })?;

    let mut repairs = Vec::new();
    for row in rows {
        repairs.push(row?);
    }
    drop(statement);

    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    for (failed_event_id, load_id, completion_event_id, completion_base_version) in repairs {
        transaction.execute(
            "UPDATE local_sync_queue
                SET status = 'SYNCED',
                    last_error = 'LOCAL_SUPERSEDED:Atomic LOAD_COMPLETED carries final site details; legacy Desktop hash mismatch ignored',
                    updated_at = ?1
              WHERE event_id = ?2
                AND status = 'FAILED'
                AND last_error = 'REJECTED:PAYLOAD_HASH_MISMATCH'",
            params![now, failed_event_id],
        )?;

        if let Some(base_version) = completion_base_version {
            transaction.execute(
                "UPDATE local_sync_remote_conflict
                    SET resolved_at = ?1
                  WHERE entity_type = 'job_load'
                    AND entity_id = ?2
                    AND resolved_at IS NULL
                    AND reason = 'LOCAL_UNSYNCED_CHANGE'
                    AND entity_version <= ?3",
                params![now, load_id, base_version],
            )?;
        }

        transaction.execute(
            "INSERT INTO local_audit_event (
                action, entity_type, entity_id, payload_json, created_at
             ) VALUES (
                'STAGE13_LEGACY_HASH_DETAILS_SUPERSEDED',
                'job_load', ?1, json_object(
                    'failedEventId', ?2,
                    'completionEventId', ?3,
                    'completionBaseVersion', ?4
                ), ?5
             )",
            params![
                load_id,
                failed_event_id,
                completion_event_id,
                completion_base_version,
                now,
            ],
        )?;
    }

    transaction.commit()?;
    Ok(())
}