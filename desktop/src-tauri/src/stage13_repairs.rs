use chrono::{SecondsFormat, Utc};
use keyring::Entry;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const DB_FILE_NAME: &str = "waste-x-local.db";
const DATABASE_KEYRING_SERVICE: &str = "com.wastex.desktop.local-database";
const DATABASE_KEYRING_ACCOUNT: &str = "database-key-v1";
const REPAIR_KEY: &str = "stage13_completion_pair_repair_v1";

fn error(message: impl Into<String>) -> Box<dyn std::error::Error> {
    Box::new(std::io::Error::new(std::io::ErrorKind::Other, message.into()))
}

fn scalar_string(payload: &Value, key: &str) -> Option<String> {
    match payload.get(key) {
        Some(Value::String(value)) if !value.trim().is_empty() => Some(value.clone()),
        Some(Value::Number(value)) => Some(value.to_string()),
        _ => None,
    }
}

fn decimal_number(value: Option<&str>) -> Option<f64> {
    value.and_then(|value| value.parse::<f64>().ok()).filter(|value| value.is_finite())
}

/**
 * Repairs the exact completion failure produced by the pre-atomic Stage 13
 * Desktop build:
 *
 *   LOAD_DETAILS_UPDATED -> ENTITY_VERSION_CONFLICT
 *   LOAD_COMPLETED       -> NET_WEIGHT_REQUIRED
 *
 * The physical completion is already durable in encrypted SQLite. The first
 * conflict also tells us the exact Cloud entity version that rejected the old
 * details event. We therefore supersede only that exact pair and enqueue one
 * rich LOAD_COMPLETED event rebased on the known Cloud version. Unrelated
 * conflicts and failures are never touched.
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
    connection
        .execute_batch(&format!(
            "PRAGMA key = \"x'{key}'\";\n             PRAGMA foreign_keys = ON;\n             PRAGMA busy_timeout = 5000;"
        ))
        .map_err(|e| error(format!("Could not unlock the Waste X local database: {e}")))?;

    let already_ran: Option<String> = connection
        .query_row(
            "SELECT value FROM local_sync_metadata WHERE key = ?1",
            params![REPAIR_KEY],
            |row| row.get(0),
        )
        .optional()?;
    if already_ran.is_some() {
        return Ok(());
    }

    let transaction = connection.transaction()?;
    let mut statement = transaction.prepare(
        "SELECT
            l.id,
            l.organisation_id,
            l.own_site_id,
            l.payload_json,
            l.gross_weight,
            l.tare_weight,
            l.net_weight,
            d.event_id,
            d.server_entity_version,
            c.event_id,
            c.device_id,
            c.actor_user_id
         FROM local_job_load l
         INNER JOIN local_sync_queue d
           ON d.entity_type = 'job_load'
          AND d.entity_id = l.id
          AND d.event_type = 'LOAD_DETAILS_UPDATED'
          AND d.status = 'CONFLICT'
          AND d.last_error = 'CONFLICT:ENTITY_VERSION_CONFLICT'
          AND d.server_entity_version IS NOT NULL
         INNER JOIN local_sync_queue c
           ON c.entity_type = 'job_load'
          AND c.entity_id = l.id
          AND c.event_type = 'LOAD_COMPLETED'
          AND c.status = 'FAILED'
          AND c.last_error = 'REJECTED:NET_WEIGHT_REQUIRED'
          AND c.device_sequence > d.device_sequence
         WHERE l.status = 'completed'
         ORDER BY c.device_sequence",
    )?;

    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, i64>(8)?,
            row.get::<_, String>(9)?,
            row.get::<_, String>(10)?,
            row.get::<_, String>(11)?,
        ))
    })?;

    let mut candidates = Vec::new();
    for row in rows {
        candidates.push(row?);
    }
    drop(statement);

    let metadata_sequence = transaction
        .query_row(
            "SELECT value FROM local_sync_metadata WHERE key = 'device_sequence'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0);
    let queue_sequence: i64 = transaction.query_row(
        "SELECT COALESCE(MAX(device_sequence), 0) FROM local_sync_queue",
        [],
        |row| row.get(0),
    )?;
    let mut next_sequence = metadata_sequence.max(queue_sequence);
    let mut repaired = 0_i64;

    for (
        load_id,
        organisation_id,
        own_site_id,
        payload_json,
        gross_weight,
        tare_weight,
        net_weight,
        details_event_id,
        cloud_version,
        completion_event_id,
        device_id,
        actor_user_id,
    ) in candidates
    {
        let mut payload: Value = serde_json::from_str(&payload_json)
            .map_err(|e| error(format!("Could not read local completion payload for {load_id}: {e}")))?;

        let gross = decimal_number(gross_weight.as_deref());
        let tare = decimal_number(tare_weight.as_deref());
        let net = decimal_number(net_weight.as_deref());
        let valid_net = net.filter(|value| *value > 0.0);
        if valid_net.is_none() {
            continue;
        }

        if let Some(object) = payload.as_object_mut() {
            object.insert("status".to_string(), Value::String("completed".to_string()));
            object.insert("weightSource".to_string(), Value::String("weighbridge".to_string()));
        }

        let completion_payload = json!({
            "driverId": scalar_string(&payload, "driverId"),
            "vehicleId": scalar_string(&payload, "vehicleId"),
            "wasteDescription": scalar_string(&payload, "wasteDescriptionSnapshot"),
            "grossWeight": gross,
            "tareWeight": tare,
            "netWeight": valid_net,
            "weightMetric": scalar_string(&payload, "weightMetric").unwrap_or_else(|| "Tonnes".to_string()),
            "weightIsEstimate": payload.get("weightIsEstimate").and_then(Value::as_bool).unwrap_or(false),
            "notes": scalar_string(&payload, "notes"),
        });
        let completion_json = serde_json::to_string(&completion_payload)?;
        let payload_hash = hex::encode(Sha256::digest(completion_json.as_bytes()));
        let event_id = Uuid::now_v7().to_string();
        let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
        next_sequence += 1;

        transaction.execute(
            "UPDATE local_sync_queue
             SET status = 'SYNCED',
                 last_error = 'LOCAL_SUPERSEDED:Replaced by atomic LOAD_COMPLETED repair',
                 updated_at = ?1
             WHERE event_id IN (?2, ?3)",
            params![now, details_event_id, completion_event_id],
        )?;

        transaction.execute(
            "UPDATE local_sync_remote_conflict
             SET resolved_at = ?1
             WHERE entity_type = 'job_load'
               AND entity_id = ?2
               AND resolved_at IS NULL
               AND reason = 'LOCAL_UNSYNCED_CHANGE'",
            params![now, load_id],
        )?;

        transaction.execute(
            "UPDATE local_job_load
             SET entity_version = ?1,
                 payload_json = ?2,
                 updated_at = ?3
             WHERE id = ?4 AND organisation_id = ?5",
            params![cloud_version + 1, serde_json::to_string(&payload)?, now, load_id, organisation_id],
        )?;

        transaction.execute(
            "INSERT INTO local_sync_queue (
                event_id, organisation_id, site_id, device_id, actor_user_id,
                entity_type, entity_id, event_type, base_version, device_sequence,
                payload_json, payload_hash, occurred_at, recorded_at, status,
                attempt_count, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, 'job_load', ?6, 'LOAD_COMPLETED', ?7, ?8,
                       ?9, ?10, ?11, ?11, 'PENDING', 0, ?11)",
            params![
                event_id,
                organisation_id,
                own_site_id,
                device_id,
                actor_user_id,
                load_id,
                cloud_version,
                next_sequence,
                completion_json,
                payload_hash,
                now,
            ],
        )?;

        transaction.execute(
            "INSERT INTO local_audit_event (
                event_id, actor_user_id, action, entity_type, entity_id, payload_json, created_at
             ) VALUES (?1, ?2, 'STAGE13_COMPLETION_PAIR_REPAIRED', 'job_load', ?3, ?4, ?5)",
            params![
                event_id,
                actor_user_id,
                load_id,
                json!({
                    "supersededDetailsEventId": details_event_id,
                    "supersededCompletionEventId": completion_event_id,
                    "replacementBaseVersion": cloud_version,
                }).to_string(),
                now,
            ],
        )?;
        repaired += 1;
    }

    transaction.execute(
        "INSERT INTO local_sync_metadata (key, value, updated_at)
         VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![REPAIR_KEY, repaired.to_string()],
    )?;
    transaction.execute(
        "INSERT INTO local_sync_metadata (key, value, updated_at)
         VALUES ('device_sequence', ?1, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![next_sequence.to_string()],
    )?;

    transaction.commit()?;
    Ok(())
}
