use keyring::Entry;
use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::offline_auth::{self, DesktopAuthState};

const DB_FILE_NAME: &str = "waste-x-local.db";
const DATABASE_KEYRING_SERVICE: &str = "com.wastex.desktop.local-database";
const DATABASE_KEYRING_ACCOUNT: &str = "database-key-v1";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReviewItem {
    source: String,
    item_id: String,
    job_number: Option<String>,
    load_number: Option<i64>,
    entity_type: String,
    entity_id: String,
    event_type: Option<String>,
    status: String,
    reason: String,
    base_version: Option<i64>,
    server_version: Option<i64>,
    occurred_at: Option<String>,
}

fn open_local_connection(app: &AppHandle) -> Result<Connection, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve Waste X application data directory: {e}"))?;
    let path = app_data_dir.join(DB_FILE_NAME);

    let entry = Entry::new(DATABASE_KEYRING_SERVICE, DATABASE_KEYRING_ACCOUNT)
        .map_err(|e| format!("Could not access the OS credential store: {e}"))?;
    let key = entry
        .get_password()
        .map_err(|e| format!("Could not read the Waste X database key: {e}"))?;

    let connection = Connection::open(path)
        .map_err(|e| format!("Could not open the Waste X local database: {e}"))?;
    connection
        .execute_batch(&format!(
            "PRAGMA key = \"x'{key}'\";\n             PRAGMA foreign_keys = ON;\n             PRAGMA busy_timeout = 5000;"
        ))
        .map_err(|e| format!("Could not unlock the Waste X local database: {e}"))?;
    Ok(connection)
}

#[tauri::command]
pub fn desktop_sync_review_items(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
) -> Result<Vec<SyncReviewItem>, String> {
    offline_auth::require_unlocked(&auth_state)?;
    let connection = open_local_connection(&app)?;
    let mut items = Vec::new();

    let mut queue_statement = connection
        .prepare(
            "SELECT
                q.event_id,
                j.job_number,
                l.load_number,
                q.entity_type,
                q.entity_id,
                q.event_type,
                q.status,
                COALESCE(q.last_error, 'Review required'),
                q.base_version,
                q.server_entity_version,
                q.occurred_at
             FROM local_sync_queue q
             LEFT JOIN local_job_load l
               ON q.entity_type = 'job_load' AND l.id = q.entity_id
             LEFT JOIN local_job j ON j.id = l.job_id
             WHERE q.status = 'CONFLICT'
                OR (
                    q.status = 'FAILED'
                    AND NOT (
                        COALESCE(q.last_error, '') LIKE 'NETWORK:%'
                        OR COALESCE(q.last_error, '') LIKE 'RETRYABLE:%'
                        OR COALESCE(q.last_error, '') LIKE 'INTERRUPTED:%'
                    )
                )
             ORDER BY q.device_sequence DESC
             LIMIT 100",
        )
        .map_err(|e| e.to_string())?;

    let queue_rows = queue_statement
        .query_map([], |row| {
            Ok(SyncReviewItem {
                source: "LOCAL_EVENT".to_string(),
                item_id: row.get(0)?,
                job_number: row.get(1)?,
                load_number: row.get(2)?,
                entity_type: row.get(3)?,
                entity_id: row.get(4)?,
                event_type: row.get(5)?,
                status: row.get(6)?,
                reason: row.get(7)?,
                base_version: row.get(8)?,
                server_version: row.get(9)?,
                occurred_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;
    for row in queue_rows {
        items.push(row.map_err(|e| e.to_string())?);
    }

    let mut remote_statement = connection
        .prepare(
            "SELECT
                r.cursor,
                j.job_number,
                l.load_number,
                r.entity_type,
                r.entity_id,
                r.reason,
                r.entity_version,
                r.received_at
             FROM local_sync_remote_conflict r
             LEFT JOIN local_job_load l
               ON r.entity_type = 'job_load' AND l.id = r.entity_id
             LEFT JOIN local_job j ON j.id = l.job_id
             WHERE r.resolved_at IS NULL
             ORDER BY r.received_at DESC
             LIMIT 100",
        )
        .map_err(|e| e.to_string())?;

    let remote_rows = remote_statement
        .query_map(params![], |row| {
            Ok(SyncReviewItem {
                source: "CLOUD_CHANGE".to_string(),
                item_id: row.get(0)?,
                job_number: row.get(1)?,
                load_number: row.get(2)?,
                entity_type: row.get(3)?,
                entity_id: row.get(4)?,
                event_type: None,
                status: "DEFERRED".to_string(),
                reason: row.get(5)?,
                base_version: None,
                server_version: row.get(6)?,
                occurred_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    for row in remote_rows {
        items.push(row.map_err(|e| e.to_string())?);
    }

    Ok(items)
}
