use std::collections::HashSet;

use keyring::Entry;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

const DB_FILE_NAME: &str = "waste-x-local.db";
const DATABASE_KEYRING_SERVICE: &str = "com.wastex.desktop.local-database";
const DATABASE_KEYRING_ACCOUNT: &str = "database-key-v1";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingSetReconciliation {
    jobs_pruned: usize,
    jobs_stale_protected: usize,
    job_loads_pruned: usize,
    job_loads_stale_protected: usize,
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
            "PRAGMA key = \"x'{key}'\";\n             PRAGMA foreign_keys = ON;\n             PRAGMA journal_mode = WAL;\n             PRAGMA synchronous = FULL;\n             PRAGMA busy_timeout = 5000;"
        ))
        .map_err(|e| format!("Could not unlock the Waste X local database: {e}"))?;
    Ok(connection)
}

fn bootstrap_ids(bootstrap: &Value, key: &str) -> Result<HashSet<String>, String> {
    let rows = bootstrap
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("Bootstrap payload is missing array '{key}'."))?;

    let mut ids = HashSet::with_capacity(rows.len());
    for row in rows {
        let id = row
            .get("id")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| format!("Bootstrap array '{key}' contains a record without an id."))?;
        ids.insert(id.to_string());
    }
    Ok(ids)
}

fn has_unsynced_entity_change(
    transaction: &Transaction<'_>,
    entity_type: &str,
    entity_id: &str,
) -> Result<bool, String> {
    transaction
        .query_row(
            "SELECT 1
             FROM local_sync_queue
             WHERE entity_type = ?1
               AND entity_id = ?2
               AND status IN ('PENDING','SENDING','CONFLICT','FAILED')
             LIMIT 1",
            params![entity_type, entity_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map(|value| value.is_some())
        .map_err(|e| e.to_string())
}

fn job_or_child_has_unsynced_change(
    transaction: &Transaction<'_>,
    job_id: &str,
) -> Result<bool, String> {
    if has_unsynced_entity_change(transaction, "job", job_id)? {
        return Ok(true);
    }

    transaction
        .query_row(
            "SELECT 1
             FROM local_sync_queue q
             INNER JOIN local_job_load l ON l.id = q.entity_id
             WHERE q.entity_type = 'job_load'
               AND l.job_id = ?1
               AND q.status IN ('PENDING','SENDING','CONFLICT','FAILED')
             LIMIT 1",
            params![job_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map(|value| value.is_some())
        .map_err(|e| e.to_string())
}

fn local_ids(
    transaction: &Transaction<'_>,
    table: &str,
    organisation_id: &str,
) -> Result<Vec<String>, String> {
    let sql = format!("SELECT id FROM {table} WHERE organisation_id = ?1");
    let mut statement = transaction.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = statement
        .query_map(params![organisation_id], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut ids = Vec::new();
    for row in rows {
        ids.push(row.map_err(|e| e.to_string())?);
    }
    Ok(ids)
}

pub fn reconcile_bootstrap(
    app: &AppHandle,
    bootstrap: &Value,
) -> Result<WorkingSetReconciliation, String> {
    let organisation_id = bootstrap
        .get("organisation")
        .and_then(|value| value.get("id"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Bootstrap payload does not contain an organisation id.".to_string())?;
    let generated_at = bootstrap
        .get("generatedAt")
        .and_then(Value::as_str)
        .unwrap_or("unknown");

    let cloud_job_ids = bootstrap_ids(bootstrap, "jobs")?;
    let cloud_load_ids = bootstrap_ids(bootstrap, "jobLoads")?;

    let mut connection = open_local_connection(app)?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;

    // Loads are pruned first. A stale load with unresolved local work is retained,
    // which then protects its stale parent job in the second pass below.
    let existing_load_ids = local_ids(&transaction, "local_job_load", organisation_id)?;
    let mut job_loads_pruned = 0_usize;
    let mut job_loads_stale_protected = 0_usize;
    for load_id in existing_load_ids {
        if cloud_load_ids.contains(&load_id) {
            continue;
        }
        if has_unsynced_entity_change(&transaction, "job_load", &load_id)? {
            job_loads_stale_protected += 1;
            continue;
        }
        transaction
            .execute(
                "DELETE FROM local_job_load WHERE id = ?1 AND organisation_id = ?2",
                params![load_id, organisation_id],
            )
            .map_err(|e| e.to_string())?;
        job_loads_pruned += 1;
    }

    let existing_job_ids = local_ids(&transaction, "local_job", organisation_id)?;
    let mut jobs_pruned = 0_usize;
    let mut jobs_stale_protected = 0_usize;
    for job_id in existing_job_ids {
        if cloud_job_ids.contains(&job_id) {
            continue;
        }
        if job_or_child_has_unsynced_change(&transaction, &job_id)? {
            jobs_stale_protected += 1;
            continue;
        }
        transaction
            .execute(
                "DELETE FROM local_job WHERE id = ?1 AND organisation_id = ?2",
                params![job_id, organisation_id],
            )
            .map_err(|e| e.to_string())?;
        jobs_pruned += 1;
    }

    transaction
        .execute(
            "INSERT INTO local_audit_event (
                action, entity_type, entity_id, payload_json, created_at
             ) VALUES ('BOOTSTRAP_RECONCILED', 'organisation', ?1, ?2, datetime('now'))",
            params![
                organisation_id,
                serde_json::json!({
                    "generatedAt": generated_at,
                    "cloudJobs": cloud_job_ids.len(),
                    "cloudJobLoads": cloud_load_ids.len(),
                    "jobsPruned": jobs_pruned,
                    "jobsStaleProtected": jobs_stale_protected,
                    "jobLoadsPruned": job_loads_pruned,
                    "jobLoadsStaleProtected": job_loads_stale_protected,
                })
                .to_string()
            ],
        )
        .map_err(|e| e.to_string())?;

    transaction.commit().map_err(|e| e.to_string())?;

    Ok(WorkingSetReconciliation {
        jobs_pruned,
        jobs_stale_protected,
        job_loads_pruned,
        job_loads_stale_protected,
    })
}
