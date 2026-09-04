use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::Duration as StdDuration,
};

use chrono::{SecondsFormat, Utc};
use keyring::Entry;
use reqwest::{Client, StatusCode};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use crate::offline_auth::{self, DesktopAuthState};

const DB_FILE_NAME: &str = "waste-x-local.db";
const DATABASE_KEYRING_SERVICE: &str = "com.wastex.desktop.local-database";
const DATABASE_KEYRING_ACCOUNT: &str = "database-key-v1";
const CLOUD_KEYRING_SERVICE: &str = "com.wastex.desktop.cloud-credentials";
const CLOUD_KEYRING_ACCOUNT: &str = "credentials-v1";
const PUSH_BATCH_SIZE: usize = 100;
const PULL_PAGE_SIZE: i64 = 500;
const MAX_PUSH_BATCHES: usize = 20;
const MAX_PULL_PAGES: usize = 20;

#[derive(Default)]
pub struct SyncEngineState {
    running: AtomicBool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CloudCredentials {
    device_secret: String,
    session_token: String,
    session_expires_at: String,
}

#[derive(Clone)]
struct DeviceConfiguration {
    device_id: String,
    organisation_id: String,
}

#[derive(Clone)]
struct QueueRow {
    event_id: String,
    organisation_id: String,
    site_id: Option<String>,
    device_id: String,
    actor_user_id: String,
    entity_type: String,
    entity_id: String,
    event_type: String,
    base_version: Option<i64>,
    device_sequence: i64,
    payload_json: String,
    payload_hash: String,
    occurred_at: String,
    recorded_at: String,
    status: String,
    last_error: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSyncStatus {
    running: bool,
    cloud_reachable: bool,
    auth_required: bool,
    last_attempt_at: Option<String>,
    last_success_at: Option<String>,
    last_error: Option<String>,
    cursor: Option<String>,
    pending: i64,
    retryable_failed: i64,
    permanent_failed: i64,
    conflicts: i64,
    deferred_remote_changes: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSyncRunResult {
    status: DesktopSyncStatus,
    pushed_applied: i64,
    pushed_duplicates: i64,
    pushed_conflicts: i64,
    pushed_failed: i64,
    pulled_changes: i64,
    deferred_remote_changes: i64,
}

#[derive(Default)]
struct RunCounters {
    pushed_applied: i64,
    pushed_duplicates: i64,
    pushed_conflicts: i64,
    pushed_failed: i64,
    pulled_changes: i64,
    deferred_remote_changes: i64,
}

fn cloud_base_url() -> String {
    option_env!("WASTE_X_DESKTOP_API_BASE_URL")
        .unwrap_or("http://localhost:3000")
        .trim_end_matches('/')
        .to_string()
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
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

fn load_cloud_credentials() -> Result<CloudCredentials, String> {
    let entry = Entry::new(CLOUD_KEYRING_SERVICE, CLOUD_KEYRING_ACCOUNT)
        .map_err(|e| format!("Could not access the OS credential store for Waste X Cloud: {e}"))?;
    let encoded = entry
        .get_password()
        .map_err(|e| format!("Waste X Cloud credentials are unavailable: {e}"))?;
    serde_json::from_str(&encoded)
        .map_err(|e| format!("Stored Waste X Cloud credentials are invalid: {e}"))
}

fn device_configuration(connection: &Connection) -> Result<DeviceConfiguration, String> {
    connection
        .query_row(
            "SELECT device_id, organisation_id
             FROM local_device_configuration
             WHERE singleton_id = 1 AND device_id IS NOT NULL AND organisation_id IS NOT NULL",
            [],
            |row| {
                Ok(DeviceConfiguration {
                    device_id: row.get(0)?,
                    organisation_id: row.get(1)?,
                })
            },
        )
        .map_err(|_| "This Waste X Desktop installation is not provisioned.".to_string())
}

fn metadata(connection: &Connection, key: &str) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT value FROM local_sync_metadata WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())
}

fn set_metadata(connection: &Connection, key: &str, value: &str) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO local_sync_metadata (key, value, updated_at)
             VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn set_metadata_tx(transaction: &Transaction<'_>, key: &str, value: &str) -> Result<(), String> {
    transaction
        .execute(
            "INSERT INTO local_sync_metadata (key, value, updated_at)
             VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn clear_metadata(connection: &Connection, key: &str) -> Result<(), String> {
    connection
        .execute("DELETE FROM local_sync_metadata WHERE key = ?1", params![key])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn count(connection: &Connection, sql: &str) -> Result<i64, String> {
    connection
        .query_row(sql, [], |row| row.get(0))
        .map_err(|e| e.to_string())
}

fn sync_status(connection: &Connection, running: bool) -> Result<DesktopSyncStatus, String> {
    let last_error = metadata(connection, "sync_last_error")?.filter(|value| !value.is_empty());
    Ok(DesktopSyncStatus {
        running,
        cloud_reachable: metadata(connection, "sync_cloud_reachable")?.as_deref() == Some("true"),
        auth_required: metadata(connection, "sync_auth_required")?.as_deref() == Some("true"),
        last_attempt_at: metadata(connection, "sync_last_attempt_at")?,
        last_success_at: metadata(connection, "sync_last_success_at")?,
        last_error,
        cursor: metadata(connection, "sync_cursor")?,
        pending: count(connection, "SELECT COUNT(*) FROM local_sync_queue WHERE status = 'PENDING'")?,
        retryable_failed: count(connection, "SELECT COUNT(*) FROM local_sync_queue WHERE status = 'FAILED' AND (last_error LIKE 'NETWORK:%' OR last_error LIKE 'RETRYABLE:%' OR last_error LIKE 'INTERRUPTED:%')")?,
        permanent_failed: count(connection, "SELECT COUNT(*) FROM local_sync_queue WHERE status = 'FAILED' AND NOT (COALESCE(last_error, '') LIKE 'NETWORK:%' OR COALESCE(last_error, '') LIKE 'RETRYABLE:%' OR COALESCE(last_error, '') LIKE 'INTERRUPTED:%')")?,
        conflicts: count(connection, "SELECT COUNT(*) FROM local_sync_queue WHERE status = 'CONFLICT'")?,
        deferred_remote_changes: count(connection, "SELECT COUNT(*) FROM local_sync_remote_conflict WHERE resolved_at IS NULL")?,
    })
}

fn retryable_failure(last_error: Option<&str>) -> bool {
    matches!(
        last_error,
        Some(value)
            if value.starts_with("NETWORK:")
                || value.starts_with("RETRYABLE:")
                || value.starts_with("INTERRUPTED:")
    )
}

fn recover_interrupted_sends(connection: &Connection) -> Result<(), String> {
    connection
        .execute(
            "UPDATE local_sync_queue
             SET status = 'FAILED',
                 last_error = 'INTERRUPTED:Previous sync stopped before acknowledgement',
                 updated_at = datetime('now')
             WHERE status = 'SENDING'",
            [],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn next_push_batch(connection: &Connection) -> Result<Vec<QueueRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT event_id, organisation_id, site_id, device_id, actor_user_id,
                    entity_type, entity_id, event_type, base_version, device_sequence,
                    payload_json, payload_hash, occurred_at, recorded_at, status, last_error
             FROM local_sync_queue
             WHERE status != 'SYNCED'
             ORDER BY device_sequence
             LIMIT 250",
        )
        .map_err(|e| e.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(QueueRow {
                event_id: row.get(0)?,
                organisation_id: row.get(1)?,
                site_id: row.get(2)?,
                device_id: row.get(3)?,
                actor_user_id: row.get(4)?,
                entity_type: row.get(5)?,
                entity_id: row.get(6)?,
                event_type: row.get(7)?,
                base_version: row.get(8)?,
                device_sequence: row.get(9)?,
                payload_json: row.get(10)?,
                payload_hash: row.get(11)?,
                occurred_at: row.get(12)?,
                recorded_at: row.get(13)?,
                status: row.get(14)?,
                last_error: row.get(15)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut batch = Vec::new();
    for row in rows {
        let row = row.map_err(|e| e.to_string())?;
        let eligible = row.status == "PENDING"
            || (row.status == "FAILED" && retryable_failure(row.last_error.as_deref()));
        if !eligible {
            break;
        }
        batch.push(row);
        if batch.len() >= PUSH_BATCH_SIZE {
            break;
        }
    }
    Ok(batch)
}

fn mark_batch_sending(connection: &mut Connection, batch: &[QueueRow]) -> Result<(), String> {
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    for event in batch {
        transaction
            .execute(
                "UPDATE local_sync_queue
                 SET status = 'SENDING', attempt_count = attempt_count + 1,
                     last_error = NULL, updated_at = datetime('now')
                 WHERE event_id = ?1",
                params![event.event_id],
            )
            .map_err(|e| e.to_string())?;
    }
    transaction.commit().map_err(|e| e.to_string())
}

fn mark_batch_transport_failure(
    connection: &mut Connection,
    batch: &[QueueRow],
    prefix: &str,
    detail: &str,
) -> Result<(), String> {
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    let error = format!("{prefix}:{detail}");
    for event in batch {
        transaction
            .execute(
                "UPDATE local_sync_queue
                 SET status = 'FAILED', last_error = ?1, updated_at = datetime('now')
                 WHERE event_id = ?2",
                params![error, event.event_id],
            )
            .map_err(|e| e.to_string())?;
    }
    transaction.commit().map_err(|e| e.to_string())
}

fn mark_batch_auth_required(connection: &mut Connection, batch: &[QueueRow]) -> Result<(), String> {
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    for event in batch {
        transaction
            .execute(
                "UPDATE local_sync_queue
                 SET status = 'PENDING', last_error = 'AUTH_REQUIRED:Cloud session must be renewed',
                     updated_at = datetime('now')
                 WHERE event_id = ?1",
                params![event.event_id],
            )
            .map_err(|e| e.to_string())?;
    }
    transaction.commit().map_err(|e| e.to_string())
}

fn push_request_body(device_id: &str, batch: &[QueueRow]) -> Result<Value, String> {
    let mut events = Vec::with_capacity(batch.len());
    for event in batch {
        let payload: Value = serde_json::from_str(&event.payload_json)
            .map_err(|e| format!("Stored sync event {} has invalid JSON: {e}", event.event_id))?;
        events.push(json!({
            "schemaVersion": 1,
            "eventId": event.event_id,
            "organisationId": event.organisation_id,
            "siteId": event.site_id,
            "deviceId": event.device_id,
            "actorUserId": event.actor_user_id,
            "entityType": event.entity_type,
            "entityId": event.entity_id,
            "eventType": event.event_type,
            "baseVersion": event.base_version,
            "deviceSequence": event.device_sequence,
            "occurredAt": event.occurred_at,
            "recordedAt": event.recorded_at,
            "payload": payload,
            "payloadHash": event.payload_hash,
        }));
    }

    Ok(json!({
        "protocolVersion": 1,
        "deviceId": device_id,
        "batchId": format!("desktop-sync-{}", Uuid::now_v7()),
        "events": events,
    }))
}

fn apply_push_results(
    connection: &mut Connection,
    batch: &[QueueRow],
    body: &Value,
    counters: &mut RunCounters,
) -> Result<bool, String> {
    let results = body
        .get("results")
        .and_then(Value::as_array)
        .ok_or_else(|| "Waste X Cloud sync push response is missing results.".to_string())?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    let mut halt = false;

    for event in batch {
        let result = results
            .iter()
            .find(|value| value.get("eventId").and_then(Value::as_str) == Some(event.event_id.as_str()));

        let (status, last_error, server_version) = if let Some(result) = result {
            let apply_status = result.get("status").and_then(Value::as_str).unwrap_or("RETRYABLE_ERROR");
            let reason = result
                .get("reasonCode")
                .and_then(Value::as_str)
                .unwrap_or("UNKNOWN");
            let server_version = result.get("entityVersion").and_then(Value::as_i64);
            match apply_status {
                "APPLIED" => {
                    counters.pushed_applied += 1;
                    ("SYNCED", None, server_version)
                }
                "DUPLICATE" => {
                    counters.pushed_duplicates += 1;
                    ("SYNCED", None, server_version)
                }
                "CONFLICT" => {
                    counters.pushed_conflicts += 1;
                    halt = true;
                    ("CONFLICT", Some(format!("CONFLICT:{reason}")), server_version)
                }
                "REJECTED" => {
                    counters.pushed_failed += 1;
                    halt = true;
                    ("FAILED", Some(format!("REJECTED:{reason}")), server_version)
                }
                _ => {
                    counters.pushed_failed += 1;
                    ("FAILED", Some(format!("RETRYABLE:{reason}")), server_version)
                }
            }
        } else {
            counters.pushed_failed += 1;
            ("FAILED", Some("RETRYABLE:MISSING_RESULT".to_string()), None)
        };

        transaction
            .execute(
                "UPDATE local_sync_queue
                 SET status = ?1, last_error = ?2, server_entity_version = ?3,
                     updated_at = datetime('now')
                 WHERE event_id = ?4",
                params![status, last_error, server_version, event.event_id],
            )
            .map_err(|e| e.to_string())?;
    }

    transaction.commit().map_err(|e| e.to_string())?;
    Ok(halt)
}

fn scalar_string(payload: &Value, key: &str) -> Option<String> {
    match payload.get(key) {
        Some(Value::String(value)) => Some(value.clone()),
        Some(Value::Number(value)) => Some(value.to_string()),
        Some(Value::Bool(value)) => Some(value.to_string()),
        _ => None,
    }
}

fn required_string(payload: &Value, key: &str) -> Result<String, String> {
    scalar_string(payload, key)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("Cloud sync payload is missing required field '{key}'."))
}

fn bool_int(payload: &Value, key: &str, default: bool) -> i64 {
    payload.get(key).and_then(Value::as_bool).unwrap_or(default) as i64
}

fn record_remote_conflict(
    transaction: &Transaction<'_>,
    cursor: &str,
    entity_type: &str,
    entity_id: &str,
    entity_version: i64,
    change_type: &str,
    payload: &Value,
    reason: &str,
) -> Result<(), String> {
    transaction
        .execute(
            "INSERT INTO local_sync_remote_conflict (
                cursor, entity_type, entity_id, entity_version, change_type,
                payload_json, reason, received_at, resolved_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), NULL)
             ON CONFLICT(cursor) DO UPDATE SET
                entity_type = excluded.entity_type,
                entity_id = excluded.entity_id,
                entity_version = excluded.entity_version,
                change_type = excluded.change_type,
                payload_json = excluded.payload_json,
                reason = excluded.reason,
                received_at = excluded.received_at,
                resolved_at = NULL",
            params![
                cursor,
                entity_type,
                entity_id,
                entity_version,
                change_type,
                serde_json::to_string(payload).map_err(|e| e.to_string())?,
                reason,
            ],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn protected_local_change(
    transaction: &Transaction<'_>,
    entity_type: &str,
    entity_id: &str,
) -> Result<bool, String> {
    let direct: Option<i64> = transaction
        .query_row(
            "SELECT 1 FROM local_sync_queue
             WHERE entity_type = ?1 AND entity_id = ?2
               AND status IN ('PENDING','SENDING','FAILED','CONFLICT')
             LIMIT 1",
            params![entity_type, entity_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if direct.is_some() {
        return Ok(true);
    }

    if entity_type == "job" {
        let child: Option<i64> = transaction
            .query_row(
                "SELECT 1
                 FROM local_sync_queue q
                 INNER JOIN local_job_load l ON l.id = q.entity_id
                 WHERE q.entity_type = 'job_load'
                   AND l.job_id = ?1
                   AND q.status IN ('PENDING','SENDING','FAILED','CONFLICT')
                 LIMIT 1",
                params![entity_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        return Ok(child.is_some());
    }

    Ok(false)
}

fn upsert_change(
    transaction: &Transaction<'_>,
    organisation_id: &str,
    entity_type: &str,
    entity_id: &str,
    entity_version: i64,
    changed_at: &str,
    payload: &Value,
) -> Result<(), String> {
    let payload_json = serde_json::to_string(payload).map_err(|e| e.to_string())?;

    match entity_type {
        "job" => {
            transaction.execute(
                "INSERT INTO local_job (
                    id, organisation_id, own_site_id, job_number, job_date,
                    direction, status, entity_version, payload_json, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(id) DO UPDATE SET
                    organisation_id = excluded.organisation_id,
                    own_site_id = excluded.own_site_id,
                    job_number = excluded.job_number,
                    job_date = excluded.job_date,
                    direction = excluded.direction,
                    status = excluded.status,
                    entity_version = excluded.entity_version,
                    payload_json = excluded.payload_json,
                    updated_at = excluded.updated_at",
                params![
                    entity_id,
                    organisation_id,
                    scalar_string(payload, "ownSiteId"),
                    scalar_string(payload, "jobNumber"),
                    scalar_string(payload, "jobDate"),
                    scalar_string(payload, "direction"),
                    scalar_string(payload, "status"),
                    entity_version,
                    payload_json,
                    changed_at,
                ],
            ).map_err(|e| e.to_string())?;
        }
        "job_load" => {
            let job_id = required_string(payload, "jobId")?;
            transaction.execute(
                "INSERT INTO local_job_load (
                    id, organisation_id, job_id, own_site_id, load_number, direction,
                    status, gross_weight, tare_weight, net_weight, entity_version,
                    payload_json, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                 ON CONFLICT(id) DO UPDATE SET
                    organisation_id = excluded.organisation_id,
                    job_id = excluded.job_id,
                    own_site_id = excluded.own_site_id,
                    load_number = excluded.load_number,
                    direction = excluded.direction,
                    status = excluded.status,
                    gross_weight = excluded.gross_weight,
                    tare_weight = excluded.tare_weight,
                    net_weight = excluded.net_weight,
                    entity_version = excluded.entity_version,
                    payload_json = excluded.payload_json,
                    updated_at = excluded.updated_at",
                params![
                    entity_id,
                    organisation_id,
                    job_id,
                    scalar_string(payload, "ownSiteId"),
                    payload.get("loadNumber").and_then(Value::as_i64),
                    required_string(payload, "direction")?,
                    required_string(payload, "status")?,
                    scalar_string(payload, "grossWeight"),
                    scalar_string(payload, "tareWeight"),
                    scalar_string(payload, "netWeight"),
                    entity_version,
                    payload_json,
                    changed_at,
                ],
            ).map_err(|e| e.to_string())?;
        }
        "site" => {
            transaction.execute(
                "INSERT INTO local_site (id, organisation_id, name, status, payload_json, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET organisation_id = excluded.organisation_id,
                   name = excluded.name, status = excluded.status,
                   payload_json = excluded.payload_json, updated_at = excluded.updated_at",
                params![entity_id, organisation_id, scalar_string(payload, "name"), scalar_string(payload, "status"), payload_json, changed_at],
            ).map_err(|e| e.to_string())?;
        }
        "driver" => {
            transaction.execute(
                "INSERT INTO local_driver (id, organisation_id, haulier_counterparty_id, active, payload_json, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET organisation_id = excluded.organisation_id,
                   haulier_counterparty_id = excluded.haulier_counterparty_id,
                   active = excluded.active, payload_json = excluded.payload_json,
                   updated_at = excluded.updated_at",
                params![entity_id, organisation_id, scalar_string(payload, "haulierCounterpartyId"), bool_int(payload, "isActive", true), payload_json, changed_at],
            ).map_err(|e| e.to_string())?;
        }
        "vehicle" => {
            transaction.execute(
                "INSERT INTO local_vehicle (id, organisation_id, haulier_counterparty_id, active, payload_json, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET organisation_id = excluded.organisation_id,
                   haulier_counterparty_id = excluded.haulier_counterparty_id,
                   active = excluded.active, payload_json = excluded.payload_json,
                   updated_at = excluded.updated_at",
                params![entity_id, organisation_id, scalar_string(payload, "haulierCounterpartyId"), bool_int(payload, "isActive", true), payload_json, changed_at],
            ).map_err(|e| e.to_string())?;
        }
        "counterparty" => {
            transaction.execute(
                "INSERT INTO local_counterparty (id, organisation_id, active, payload_json, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(id) DO UPDATE SET organisation_id = excluded.organisation_id,
                   active = excluded.active, payload_json = excluded.payload_json,
                   updated_at = excluded.updated_at",
                params![entity_id, organisation_id, bool_int(payload, "isActive", true), payload_json, changed_at],
            ).map_err(|e| e.to_string())?;
        }
        "counterparty_role" => {
            let counterparty_id = required_string(payload, "counterpartyId")?;
            let role = required_string(payload, "role")?;
            transaction.execute(
                "INSERT INTO local_counterparty_role (entity_id, organisation_id, counterparty_id, role, payload_json, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(entity_id) DO UPDATE SET organisation_id = excluded.organisation_id,
                   counterparty_id = excluded.counterparty_id, role = excluded.role,
                   payload_json = excluded.payload_json, updated_at = excluded.updated_at",
                params![entity_id, organisation_id, counterparty_id, role, payload_json, changed_at],
            ).map_err(|e| e.to_string())?;
            if role == "haulier" {
                let counterparty_payload: Option<String> = transaction.query_row(
                    "SELECT payload_json FROM local_counterparty WHERE id = ?1",
                    params![counterparty_id],
                    |row| row.get(0),
                ).optional().map_err(|e| e.to_string())?;
                if let Some(counterparty_payload) = counterparty_payload {
                    transaction.execute(
                        "INSERT INTO local_haulier (counterparty_id, organisation_id, payload_json, updated_at)
                         VALUES (?1, ?2, ?3, ?4)
                         ON CONFLICT(counterparty_id) DO UPDATE SET organisation_id = excluded.organisation_id,
                           payload_json = excluded.payload_json, updated_at = excluded.updated_at",
                        params![counterparty_id, organisation_id, counterparty_payload, changed_at],
                    ).map_err(|e| e.to_string())?;
                }
            }
        }
        "counterparty_site" => {
            transaction.execute(
                "INSERT INTO local_counterparty_site (id, organisation_id, counterparty_id, site_type, active, payload_json, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(id) DO UPDATE SET organisation_id = excluded.organisation_id,
                   counterparty_id = excluded.counterparty_id, site_type = excluded.site_type,
                   active = excluded.active, payload_json = excluded.payload_json,
                   updated_at = excluded.updated_at",
                params![entity_id, organisation_id, required_string(payload, "counterpartyId")?, scalar_string(payload, "siteType"), bool_int(payload, "isActive", true), payload_json, changed_at],
            ).map_err(|e| e.to_string())?;
        }
        "counterparty_site_authorisation" => {
            transaction.execute(
                "INSERT INTO local_counterparty_site_authorisation (id, organisation_id, counterparty_site_id, status, payload_json, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET organisation_id = excluded.organisation_id,
                   counterparty_site_id = excluded.counterparty_site_id, status = excluded.status,
                   payload_json = excluded.payload_json, updated_at = excluded.updated_at",
                params![entity_id, organisation_id, required_string(payload, "counterpartySiteId")?, scalar_string(payload, "status"), payload_json, changed_at],
            ).map_err(|e| e.to_string())?;
        }
        "counterparty_site_ewc_code" => {
            transaction.execute(
                "INSERT INTO local_counterparty_site_ewc (entity_id, organisation_id, authorisation_id, ewc_code_id, active, payload_json, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(entity_id) DO UPDATE SET organisation_id = excluded.organisation_id,
                   authorisation_id = excluded.authorisation_id, ewc_code_id = excluded.ewc_code_id,
                   active = excluded.active, payload_json = excluded.payload_json,
                   updated_at = excluded.updated_at",
                params![entity_id, organisation_id, required_string(payload, "authorisationId")?, required_string(payload, "ewcCodeId")?, bool_int(payload, "isActive", true), payload_json, changed_at],
            ).map_err(|e| e.to_string())?;
        }
        "permit" => {
            transaction.execute(
                "INSERT INTO local_permit (id, organisation_id, site_id, status, payload_json, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET organisation_id = excluded.organisation_id,
                   site_id = excluded.site_id, status = excluded.status,
                   payload_json = excluded.payload_json, updated_at = excluded.updated_at",
                params![entity_id, organisation_id, required_string(payload, "siteId")?, scalar_string(payload, "status"), payload_json, changed_at],
            ).map_err(|e| e.to_string())?;
        }
        "permit_ewc_code" => {
            transaction.execute(
                "INSERT INTO local_permit_ewc_snapshot (entity_id, organisation_id, permit_id, ewc_code_id, active, payload_json, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(entity_id) DO UPDATE SET organisation_id = excluded.organisation_id,
                   permit_id = excluded.permit_id, ewc_code_id = excluded.ewc_code_id,
                   active = excluded.active, payload_json = excluded.payload_json,
                   updated_at = excluded.updated_at",
                params![entity_id, organisation_id, required_string(payload, "permitId")?, required_string(payload, "ewcCodeId")?, bool_int(payload, "isActive", true), payload_json, changed_at],
            ).map_err(|e| e.to_string())?;
        }
        _ => {
            return Err(format!("Unsupported Cloud pull entity type: {entity_type}"));
        }
    }

    Ok(())
}

fn delete_change(
    transaction: &Transaction<'_>,
    entity_type: &str,
    entity_id: &str,
    payload: &Value,
) -> Result<(), String> {
    match entity_type {
        "job" => transaction.execute("DELETE FROM local_job WHERE id = ?1", params![entity_id]),
        "job_load" => transaction.execute("DELETE FROM local_job_load WHERE id = ?1", params![entity_id]),
        "site" => transaction.execute("DELETE FROM local_site WHERE id = ?1", params![entity_id]),
        "driver" => transaction.execute("DELETE FROM local_driver WHERE id = ?1", params![entity_id]),
        "vehicle" => transaction.execute("DELETE FROM local_vehicle WHERE id = ?1", params![entity_id]),
        "counterparty" => transaction.execute("DELETE FROM local_counterparty WHERE id = ?1", params![entity_id]),
        "counterparty_role" => {
            if scalar_string(payload, "role").as_deref() == Some("haulier") {
                if let Some(counterparty_id) = scalar_string(payload, "counterpartyId") {
                    transaction.execute("DELETE FROM local_haulier WHERE counterparty_id = ?1", params![counterparty_id]).map_err(|e| e.to_string())?;
                }
            }
            transaction.execute("DELETE FROM local_counterparty_role WHERE entity_id = ?1", params![entity_id])
        }
        "counterparty_site" => transaction.execute("DELETE FROM local_counterparty_site WHERE id = ?1", params![entity_id]),
        "counterparty_site_authorisation" => transaction.execute("DELETE FROM local_counterparty_site_authorisation WHERE id = ?1", params![entity_id]),
        "counterparty_site_ewc_code" => transaction.execute("DELETE FROM local_counterparty_site_ewc WHERE entity_id = ?1", params![entity_id]),
        "permit" => transaction.execute("DELETE FROM local_permit WHERE id = ?1", params![entity_id]),
        "permit_ewc_code" => transaction.execute("DELETE FROM local_permit_ewc_snapshot WHERE entity_id = ?1", params![entity_id]),
        _ => return Err(format!("Unsupported Cloud delete entity type: {entity_type}")),
    }
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn apply_pull_change(
    transaction: &Transaction<'_>,
    organisation_id: &str,
    change: &Value,
) -> Result<bool, String> {
    let cursor = change
        .get("cursor")
        .and_then(Value::as_str)
        .ok_or_else(|| "Cloud sync change is missing cursor.".to_string())?;
    let entity_type = change
        .get("entityType")
        .and_then(Value::as_str)
        .ok_or_else(|| "Cloud sync change is missing entityType.".to_string())?;
    let entity_id = change
        .get("entityId")
        .and_then(Value::as_str)
        .ok_or_else(|| "Cloud sync change is missing entityId.".to_string())?;
    let entity_version = change
        .get("entityVersion")
        .and_then(Value::as_i64)
        .ok_or_else(|| "Cloud sync change is missing entityVersion.".to_string())?;
    let change_type = change
        .get("changeType")
        .and_then(Value::as_str)
        .ok_or_else(|| "Cloud sync change is missing changeType.".to_string())?;
    let changed_at = change
        .get("changedAt")
        .and_then(Value::as_str)
        .unwrap_or_else(|| "");
    let payload = change.get("payload").cloned().unwrap_or(Value::Null);

    if protected_local_change(transaction, entity_type, entity_id)? {
        record_remote_conflict(
            transaction,
            cursor,
            entity_type,
            entity_id,
            entity_version,
            change_type,
            &payload,
            "LOCAL_UNSYNCED_CHANGE",
        )?;
        return Ok(true);
    }

    let supported = matches!(
        entity_type,
        "job"
            | "job_load"
            | "site"
            | "driver"
            | "vehicle"
            | "counterparty"
            | "counterparty_role"
            | "counterparty_site"
            | "counterparty_site_authorisation"
            | "counterparty_site_ewc_code"
            | "permit"
            | "permit_ewc_code"
    );
    if !supported {
        record_remote_conflict(
            transaction,
            cursor,
            entity_type,
            entity_id,
            entity_version,
            change_type,
            &payload,
            "UNSUPPORTED_PULL_ENTITY",
        )?;
        return Ok(true);
    }

    if change_type == "DELETE" {
        delete_change(transaction, entity_type, entity_id, &payload)?;
    } else {
        upsert_change(
            transaction,
            organisation_id,
            entity_type,
            entity_id,
            entity_version,
            if changed_at.is_empty() { &now_iso() } else { changed_at },
            &payload,
        )?;
    }

    transaction
        .execute(
            "INSERT INTO local_audit_event (action, entity_type, entity_id, payload_json, created_at)
             VALUES (?1, ?2, ?3, ?4, datetime('now'))",
            params![format!("SYNC_PULL_{change_type}"), entity_type, entity_id, serde_json::to_string(change).map_err(|e| e.to_string())?],
        )
        .map_err(|e| e.to_string())?;

    Ok(false)
}

async fn run_sync(app: &AppHandle) -> Result<DesktopSyncRunResult, String> {
    let mut counters = RunCounters::default();
    let credentials = load_cloud_credentials()?;
    let mut connection = open_local_connection(app)?;
    let device = device_configuration(&connection)?;
    recover_interrupted_sends(&connection)?;

    let attempt_at = now_iso();
    set_metadata(&connection, "sync_last_attempt_at", &attempt_at)?;
    set_metadata(&connection, "sync_auth_required", "false")?;

    let client = Client::builder()
        .timeout(StdDuration::from_secs(8))
        .build()
        .map_err(|e| format!("Could not initialise Waste X sync client: {e}"))?;

    let health = client
        .get(format!("{}/api/desktop/v1/health", cloud_base_url()))
        .send()
        .await;

    let health = match health {
        Ok(response) if response.status().is_success() => response,
        Ok(response) => {
            let message = format!("Cloud health check returned HTTP {}", response.status());
            set_metadata(&connection, "sync_cloud_reachable", "false")?;
            set_metadata(&connection, "sync_last_error", &message)?;
            let status = sync_status(&connection, false)?;
            return Ok(DesktopSyncRunResult {
                status,
                pushed_applied: 0,
                pushed_duplicates: 0,
                pushed_conflicts: 0,
                pushed_failed: 0,
                pulled_changes: 0,
                deferred_remote_changes: 0,
            });
        }
        Err(error) => {
            let message = format!("Cloud unavailable: {error}");
            set_metadata(&connection, "sync_cloud_reachable", "false")?;
            set_metadata(&connection, "sync_last_error", &message)?;
            let status = sync_status(&connection, false)?;
            return Ok(DesktopSyncRunResult {
                status,
                pushed_applied: 0,
                pushed_duplicates: 0,
                pushed_conflicts: 0,
                pushed_failed: 0,
                pulled_changes: 0,
                deferred_remote_changes: 0,
            });
        }
    };
    drop(health);
    set_metadata(&connection, "sync_cloud_reachable", "true")?;

    for _ in 0..MAX_PUSH_BATCHES {
        let batch = next_push_batch(&connection)?;
        if batch.is_empty() {
            break;
        }
        mark_batch_sending(&mut connection, &batch)?;
        let request_body = push_request_body(&device.device_id, &batch)?;

        let response = client
            .post(format!("{}/api/desktop/v1/sync/push", cloud_base_url()))
            .bearer_auth(&credentials.session_token)
            .header("X-Waste-X-Device-Secret", &credentials.device_secret)
            .json(&request_body)
            .send()
            .await;

        let response = match response {
            Ok(response) => response,
            Err(error) => {
                mark_batch_transport_failure(&mut connection, &batch, "NETWORK", &error.to_string())?;
                set_metadata(&connection, "sync_last_error", &format!("Push failed: {error}"))?;
                break;
            }
        };

        if matches!(response.status(), StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN) {
            mark_batch_auth_required(&mut connection, &batch)?;
            set_metadata(&connection, "sync_auth_required", "true")?;
            set_metadata(&connection, "sync_last_error", "Cloud session expired or device authorisation changed. Sign in online to renew sync access.")?;
            let status = sync_status(&connection, false)?;
            return Ok(DesktopSyncRunResult {
                status,
                pushed_applied: counters.pushed_applied,
                pushed_duplicates: counters.pushed_duplicates,
                pushed_conflicts: counters.pushed_conflicts,
                pushed_failed: counters.pushed_failed,
                pulled_changes: counters.pulled_changes,
                deferred_remote_changes: counters.deferred_remote_changes,
            });
        }

        if response.status().is_server_error() {
            let status_code = response.status();
            mark_batch_transport_failure(&mut connection, &batch, "RETRYABLE", &format!("HTTP {status_code}"))?;
            set_metadata(&connection, "sync_last_error", &format!("Cloud push temporarily failed with HTTP {status_code}."))?;
            break;
        }

        let status_code = response.status();
        let body = response
            .json::<Value>()
            .await
            .map_err(|e| format!("Cloud push returned unreadable JSON: {e}"))?;
        if !status_code.is_success() {
            mark_batch_transport_failure(&mut connection, &batch, "REJECTED", &format!("HTTP {status_code}"))?;
            set_metadata(&connection, "sync_last_error", &format!("Cloud rejected sync batch with HTTP {status_code}."))?;
            break;
        }

        let halt = apply_push_results(&mut connection, &batch, &body, &mut counters)?;
        if halt {
            set_metadata(&connection, "sync_last_error", "Sync stopped at a conflict or permanently rejected event. Later device events remain queued in order.")?;
            break;
        }
    }

    if metadata(&connection, "sync_auth_required")?.as_deref() != Some("true") {
        for _ in 0..MAX_PULL_PAGES {
            let cursor = metadata(&connection, "sync_cursor")?;
            let response = client
                .post(format!("{}/api/desktop/v1/sync/pull", cloud_base_url()))
                .bearer_auth(&credentials.session_token)
                .header("X-Waste-X-Device-Secret", &credentials.device_secret)
                .json(&json!({
                    "protocolVersion": 1,
                    "deviceId": device.device_id,
                    "cursor": cursor,
                    "limit": PULL_PAGE_SIZE,
                }))
                .send()
                .await;

            let response = match response {
                Ok(response) => response,
                Err(error) => {
                    set_metadata(&connection, "sync_last_error", &format!("Pull failed: {error}"))?;
                    break;
                }
            };

            if matches!(response.status(), StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN) {
                set_metadata(&connection, "sync_auth_required", "true")?;
                set_metadata(&connection, "sync_last_error", "Cloud session expired or device authorisation changed. Sign in online to renew sync access.")?;
                break;
            }
            if !response.status().is_success() {
                set_metadata(&connection, "sync_last_error", &format!("Cloud pull failed with HTTP {}.", response.status()))?;
                break;
            }

            let body = response
                .json::<Value>()
                .await
                .map_err(|e| format!("Cloud pull returned unreadable JSON: {e}"))?;
            let changes = body
                .get("changes")
                .and_then(Value::as_array)
                .ok_or_else(|| "Cloud pull response is missing changes.".to_string())?;
            let next_cursor = body
                .get("nextCursor")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or(cursor.clone());
            let has_more = body.get("hasMore").and_then(Value::as_bool).unwrap_or(false);

            let transaction = connection.transaction().map_err(|e| e.to_string())?;
            for change in changes {
                if apply_pull_change(&transaction, &device.organisation_id, change)? {
                    counters.deferred_remote_changes += 1;
                }
                counters.pulled_changes += 1;
            }
            if let Some(next_cursor) = next_cursor.as_deref() {
                set_metadata_tx(&transaction, "sync_cursor", next_cursor)?;
            }
            transaction.commit().map_err(|e| e.to_string())?;

            if !has_more {
                break;
            }
        }
    }

    let success_at = now_iso();
    set_metadata(&connection, "sync_last_success_at", &success_at)?;
    if metadata(&connection, "sync_auth_required")?.as_deref() != Some("true") {
        clear_metadata(&connection, "sync_last_error")?;
    }

    let status = sync_status(&connection, false)?;
    Ok(DesktopSyncRunResult {
        status,
        pushed_applied: counters.pushed_applied,
        pushed_duplicates: counters.pushed_duplicates,
        pushed_conflicts: counters.pushed_conflicts,
        pushed_failed: counters.pushed_failed,
        pulled_changes: counters.pulled_changes,
        deferred_remote_changes: counters.deferred_remote_changes,
    })
}

#[tauri::command]
pub fn desktop_sync_status(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
    sync_state: State<'_, SyncEngineState>,
) -> Result<DesktopSyncStatus, String> {
    offline_auth::require_unlocked(&auth_state)?;
    let connection = open_local_connection(&app)?;
    sync_status(&connection, sync_state.running.load(Ordering::SeqCst))
}

#[tauri::command]
pub async fn desktop_sync_now(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
    sync_state: State<'_, SyncEngineState>,
) -> Result<DesktopSyncRunResult, String> {
    offline_auth::require_unlocked(&auth_state)?;

    if sync_state
        .running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        let connection = open_local_connection(&app)?;
        let status = sync_status(&connection, true)?;
        return Ok(DesktopSyncRunResult {
            status,
            pushed_applied: 0,
            pushed_duplicates: 0,
            pushed_conflicts: 0,
            pushed_failed: 0,
            pulled_changes: 0,
            deferred_remote_changes: 0,
        });
    }

    let result = run_sync(&app).await;
    sync_state.running.store(false, Ordering::SeqCst);
    result
}
