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
const MAX_AUTOMATIC_REBASE_ATTEMPTS: i64 = 3;

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
    value
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite())
}

/**
 * Repairs recoverable Stage 13 completion conflicts without hiding genuine
 * concurrent terminal decisions.
 *
 * The pre-atomic Desktop build could leave a locally-completed receiving-site
 * transaction behind Cloud as either:
 *
 *   LOAD_DETAILS_UPDATED -> ENTITY_VERSION_CONFLICT
 *   LOAD_COMPLETED       -> NET_WEIGHT_REQUIRED
 *
 * or, after the first repair attempt, as a rebased LOAD_COMPLETED that itself
 * hit ENTITY_VERSION_CONFLICT because Cloud advanced again before replay.
 *
 * This repair is deliberately repeatable rather than one-shot. It only rebases
 * a local completed load when:
 *   - the final local net weight is positive;
 *   - there is an entity-version conflict from the completion sequence;
 *   - no newer local event for that load is currently pending/sending;
 *   - the latest deferred Cloud snapshot is still non-terminal and, for an
 *     incoming load, still `accepted`;
 *   - fewer than MAX_AUTOMATIC_REBASE_ATTEMPTS have already been made.
 *
 * Cloud still re-validates Driver arrival, acceptance, permit/EWC and final
 * weight rules. A Cloud load that has become completed/rejected/cancelled is
 * never overwritten automatically and remains a human review item.
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

    let transaction = connection.transaction()?;
    let mut statement = transaction.prepare(
        "SELECT
            l.id,
            l.organisation_id,
            l.own_site_id,
            l.direction,
            l.payload_json,
            l.gross_weight,
            l.tare_weight,
            l.net_weight,
            q.server_entity_version,
            q.device_id,
            q.actor_user_id,
            (SELECT MAX(r.entity_version)
               FROM local_sync_remote_conflict r
              WHERE r.entity_type = 'job_load'
                AND r.entity_id = l.id
                AND r.resolved_at IS NULL) AS remote_entity_version,
            (SELECT r.payload_json
               FROM local_sync_remote_conflict r
              WHERE r.entity_type = 'job_load'
                AND r.entity_id = l.id
                AND r.resolved_at IS NULL
              ORDER BY r.entity_version DESC, r.received_at DESC
              LIMIT 1) AS remote_payload_json
         FROM local_job_load l
         INNER JOIN local_sync_queue q
           ON q.event_id = (
                SELECT q2.event_id
                  FROM local_sync_queue q2
                 WHERE q2.entity_type = 'job_load'
                   AND q2.entity_id = l.id
                   AND q2.status = 'CONFLICT'
                   AND q2.last_error = 'CONFLICT:ENTITY_VERSION_CONFLICT'
                   AND q2.server_entity_version IS NOT NULL
                   AND q2.event_type IN ('LOAD_DETAILS_UPDATED', 'LOAD_COMPLETED')
                 ORDER BY q2.device_sequence DESC
                 LIMIT 1
              )
         WHERE l.status = 'completed'
           AND CAST(COALESCE(l.net_weight, '0') AS REAL) > 0
           AND NOT EXISTS (
                SELECT 1
                  FROM local_sync_queue active
                 WHERE active.entity_type = 'job_load'
                   AND active.entity_id = l.id
                   AND active.status IN ('PENDING', 'SENDING')
           )
         ORDER BY q.device_sequence",
    )?;

    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, Option<String>>(7)?,
            row.get::<_, i64>(8)?,
            row.get::<_, String>(9)?,
            row.get::<_, String>(10)?,
            row.get::<_, Option<i64>>(11)?,
            row.get::<_, Option<String>>(12)?,
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

    for (
        load_id,
        organisation_id,
        own_site_id,
        direction,
        payload_json,
        gross_weight,
        tare_weight,
        net_weight,
        conflict_server_version,
        device_id,
        actor_user_id,
        remote_entity_version,
        remote_payload_json,
    ) in candidates
    {
        let attempts: i64 = transaction.query_row(
            "SELECT COUNT(*)
               FROM local_audit_event
              WHERE action = 'STAGE13_COMPLETION_CONFLICT_REBASED'
                AND entity_type = 'job_load'
                AND entity_id = ?1",
            params![load_id],
            |row| row.get(0),
        )?;
        if attempts >= MAX_AUTOMATIC_REBASE_ATTEMPTS {
            continue;
        }

        /* Wait until pull has shown us the current Cloud snapshot. This makes
         * the rebase decision based on state, not merely a version number. */
        let Some(remote_payload_json) = remote_payload_json else {
            continue;
        };
        let remote_payload: Value = serde_json::from_str(&remote_payload_json)
            .map_err(|e| error(format!("Could not read deferred Cloud payload for {load_id}: {e}")))?;
        let remote_status = scalar_string(&remote_payload, "status").unwrap_or_default();
        let remote_is_terminal = matches!(remote_status.as_str(), "completed" | "rejected" | "cancelled");
        if remote_is_terminal {
            continue;
        }
        if direction == "incoming" && remote_status != "accepted" {
            continue;
        }

        let mut payload: Value = serde_json::from_str(&payload_json)
            .map_err(|e| error(format!("Could not read local completion payload for {load_id}: {e}")))?;
        let gross = decimal_number(gross_weight.as_deref());
        let tare = decimal_number(tare_weight.as_deref());
        let net = decimal_number(net_weight.as_deref());
        let Some(valid_net) = net.filter(|value| *value > 0.0) else {
            continue;
        };

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
        let cloud_version = conflict_server_version.max(remote_entity_version.unwrap_or(0));
        next_sequence += 1;

        transaction.execute(
            "UPDATE local_sync_queue
                SET status = 'SYNCED',
                    last_error = 'LOCAL_SUPERSEDED:Rebased atomic LOAD_COMPLETED from latest accepted Cloud state',
                    updated_at = ?1
              WHERE entity_type = 'job_load'
                AND entity_id = ?2
                AND (
                     (status = 'CONFLICT'
                      AND last_error = 'CONFLICT:ENTITY_VERSION_CONFLICT'
                      AND event_type IN ('LOAD_DETAILS_UPDATED', 'LOAD_COMPLETED'))
                  OR (status = 'FAILED'
                      AND last_error = 'REJECTED:NET_WEIGHT_REQUIRED'
                      AND event_type = 'LOAD_COMPLETED')
                )",
            params![now, load_id],
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
            params![
                cloud_version + 1,
                serde_json::to_string(&payload)?,
                now,
                load_id,
                organisation_id,
            ],
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
             ) VALUES (?1, ?2, 'STAGE13_COMPLETION_CONFLICT_REBASED', 'job_load', ?3, ?4, ?5)",
            params![
                event_id,
                actor_user_id,
                load_id,
                json!({
                    "replacementBaseVersion": cloud_version,
                    "remoteStatus": remote_status,
                    "attempt": attempts + 1,
                })
                .to_string(),
                now,
            ],
        )?;
    }

    transaction.execute(
        "INSERT INTO local_sync_metadata (key, value, updated_at)
         VALUES ('device_sequence', ?1, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![next_sequence.to_string()],
    )?;

    transaction.commit()?;
    Ok(())
}
