use chrono::{SecondsFormat, Utc};
use keyring::Entry;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use crate::offline_auth::{self, DesktopAuthState};

const DB_FILE_NAME: &str = "waste-x-local.db";
const DATABASE_KEYRING_SERVICE: &str = "com.wastex.desktop.local-database";
const DATABASE_KEYRING_ACCOUNT: &str = "database-key-v1";

const REJECTION_CATEGORIES: &[&str] = &[
    "WASTE_MISMATCH",
    "CONTAMINATION",
    "PERMIT_OR_COMPLIANCE",
    "UNSAFE_LOAD",
    "DOCUMENTATION",
    "SITE_CAPACITY",
    "OTHER",
];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RejectSiteLoadInput {
    load_id: String,
    category: String,
    reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RejectSiteLoadResult {
    ok: bool,
    event_id: String,
    status: String,
    projected_entity_version: i64,
    pending_events: i64,
}

struct ActorContext {
    organisation_id: String,
    device_id: String,
    user_id: String,
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

fn set_metadata(transaction: &Transaction<'_>, key: &str, value: &str) -> Result<(), String> {
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

fn next_device_sequence(transaction: &Transaction<'_>) -> Result<i64, String> {
    let current = transaction
        .query_row(
            "SELECT value FROM local_sync_metadata WHERE key = 'device_sequence'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0);
    let next = current + 1;
    set_metadata(transaction, "device_sequence", &next.to_string())?;
    Ok(next)
}

fn actor_context(connection: &Connection) -> Result<ActorContext, String> {
    let (device_id, organisation_id): (String, String) = connection
        .query_row(
            "SELECT device_id, organisation_id
             FROM local_device_configuration
             WHERE singleton_id = 1 AND device_id IS NOT NULL AND organisation_id IS NOT NULL",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "This Waste X Desktop installation is not provisioned.".to_string())?;
    let user_id = metadata(connection, "offline_auth_user_id")?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Waste X user identity is unavailable. Sign in online once.".to_string())?;
    Ok(ActorContext {
        organisation_id,
        device_id,
        user_id,
    })
}

fn payload_object(payload: &mut Value) -> Result<&mut Map<String, Value>, String> {
    payload
        .as_object_mut()
        .ok_or_else(|| "Stored Waste X load data is not an object.".to_string())
}

fn value_string(payload: &Value, key: &str) -> Option<String> {
    payload
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn driver_arrival_step(payload: &Value) -> Option<&str> {
    payload
        .get("fieldWorkflow")
        .and_then(|workflow| workflow.get("step"))
        .and_then(Value::as_str)
}

fn validate_category(value: &str) -> bool {
    REJECTION_CATEGORIES.contains(&value)
}

#[tauri::command]
pub fn desktop_reject_site_load(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
    input: RejectSiteLoadInput,
) -> Result<RejectSiteLoadResult, String> {
    offline_auth::require_unlocked(&auth_state)?;

    let category = input.category.trim().to_uppercase();
    if !validate_category(&category) {
        return Err("Choose a valid receiving-site rejection category.".to_string());
    }
    let reason = input.reason.trim().to_string();
    if reason.len() < 3 || reason.len() > 2000 {
        return Err("A rejection reason between 3 and 2000 characters is required.".to_string());
    }

    let mut connection = open_local_connection(&app)?;
    let actor = actor_context(&connection)?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;

    let row = transaction
        .query_row(
            "SELECT l.job_id, l.direction, l.status, l.entity_version, l.payload_json, j.status
             FROM local_job_load l
             INNER JOIN local_job j ON j.id = l.job_id
             WHERE l.id = ?1 AND l.organisation_id = ?2",
            params![input.load_id.trim(), actor.organisation_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Waste X load was not found in the encrypted Desktop working set.".to_string())?;

    if matches!(row.5.as_str(), "draft" | "cancelled") {
        return Err("The parent job is not operational.".to_string());
    }
    if row.1 != "incoming" {
        return Err("Receiving-site rejection is only valid for incoming loads.".to_string());
    }
    if row.2 != "arrived" {
        return Err("The load must be at the receiving site before it can be rejected.".to_string());
    }

    let mut load_payload: Value = serde_json::from_str(&row.4)
        .map_err(|e| format!("Stored Waste X load data is invalid: {e}"))?;
    let own_transport = value_string(&load_payload, "haulierCounterpartyId").is_none();
    let has_driver = value_string(&load_payload, "driverId").is_some();
    if own_transport && has_driver {
        let arrived = matches!(
            driver_arrival_step(&load_payload),
            Some("ARRIVED_DESTINATION") | Some("DELIVERED")
        );
        if !arrived {
            return Err(
                "Wait for the assigned Driver to mark Arrived at destination before the site rejects this load."
                    .to_string(),
            );
        }
    }

    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let existing_notes = value_string(&load_payload, "notes").unwrap_or_default();
    let rejection_note = format!("[SITE REJECTED · {category} · {now}] {reason}");
    let notes = if existing_notes.trim().is_empty() {
        rejection_note
    } else {
        format!("{}\n{}", existing_notes.trim(), rejection_note)
    };

    let object = payload_object(&mut load_payload)?;
    object.insert("status".to_string(), Value::String("rejected".to_string()));
    object.insert("notes".to_string(), Value::String(notes));
    object.insert("completedAt".to_string(), Value::String(now.clone()));

    let event_id = Uuid::now_v7().to_string();
    let sequence = next_device_sequence(&transaction)?;
    let cloud_reason = format!("[CATEGORY:{category}] {reason}");
    let event_payload = json!({ "reason": cloud_reason });
    let payload_json = serde_json::to_string(&event_payload)
        .map_err(|e| format!("Could not encode Waste X rejection sync event: {e}"))?;
    let payload_hash = hex::encode(Sha256::digest(payload_json.as_bytes()));
    let site_id = value_string(&load_payload, "ownSiteId");
    let projected_version = row.3 + 1;

    transaction
        .execute(
            "UPDATE local_job_load
             SET status = 'rejected', entity_version = ?1, payload_json = ?2, updated_at = ?3
             WHERE id = ?4 AND organisation_id = ?5",
            params![
                projected_version,
                serde_json::to_string(&load_payload).map_err(|e| e.to_string())?,
                now,
                input.load_id.trim(),
                actor.organisation_id,
            ],
        )
        .map_err(|e| e.to_string())?;

    transaction
        .execute(
            "INSERT INTO local_sync_queue (
                event_id, organisation_id, site_id, device_id, actor_user_id,
                entity_type, entity_id, event_type, base_version, device_sequence,
                payload_json, payload_hash, occurred_at, recorded_at, status,
                attempt_count, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, 'job_load', ?6, 'LOAD_REJECTED', ?7, ?8, ?9, ?10, ?11, ?11, 'PENDING', 0, ?11)",
            params![
                event_id,
                actor.organisation_id,
                site_id,
                actor.device_id,
                actor.user_id,
                input.load_id.trim(),
                row.3,
                sequence,
                payload_json,
                payload_hash,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;

    let audit_payload = json!({
        "authority": "RECEIVING_SITE",
        "category": category,
        "reason": reason,
        "jobId": row.0,
        "loadId": input.load_id.trim(),
        "rejectedAt": now,
    });
    transaction
        .execute(
            "INSERT INTO local_audit_event (
                event_id, actor_user_id, action, entity_type, entity_id, payload_json, created_at
             ) VALUES (?1, ?2, 'LOAD_REJECTED', 'job_load', ?3, ?4, ?5)",
            params![
                event_id,
                actor.user_id,
                input.load_id.trim(),
                audit_payload.to_string(),
                now,
            ],
        )
        .map_err(|e| e.to_string())?;

    let pending_events: i64 = transaction
        .query_row(
            "SELECT COUNT(*) FROM local_sync_queue WHERE status IN ('PENDING','SENDING','FAILED')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    transaction.commit().map_err(|e| e.to_string())?;

    Ok(RejectSiteLoadResult {
        ok: true,
        event_id,
        status: "rejected".to_string(),
        projected_entity_version: projected_version,
        pending_events,
    })
}
