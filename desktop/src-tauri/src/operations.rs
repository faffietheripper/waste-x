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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationsReference {
    id: String,
    label: String,
    haulier_counterparty_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyLoad {
    id: String,
    job_id: String,
    job_number: String,
    job_date: Option<String>,
    load_number: Option<i64>,
    direction: String,
    status: String,
    haulier_counterparty_id: Option<String>,
    driver_id: Option<String>,
    vehicle_id: Option<String>,
    waste_description: String,
    ewc_code: Option<String>,
    gross_weight: Option<String>,
    tare_weight: Option<String>,
    net_weight: Option<String>,
    weight_metric: String,
    ticket_number: Option<String>,
    notes: Option<String>,
    entity_version: i64,
    pending_events: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyOperationsSnapshot {
    loads: Vec<DailyLoad>,
    drivers: Vec<OperationsReference>,
    vehicles: Vec<OperationsReference>,
    pending_events: i64,
    conflicts: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadDetailsInput {
    load_id: String,
    driver_id: Option<String>,
    vehicle_id: Option<String>,
    waste_description: String,
    gross_weight: Option<f64>,
    tare_weight: Option<f64>,
    net_weight: Option<f64>,
    weight_metric: String,
    weight_is_estimate: bool,
    ticket_number: Option<String>,
    notes: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadActionInput {
    load_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RejectLoadInput {
    load_id: String,
    reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalOperationResult {
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

struct LocalLoad {
    id: String,
    organisation_id: String,
    job_id: String,
    own_site_id: Option<String>,
    direction: String,
    status: String,
    gross_weight: Option<String>,
    tare_weight: Option<String>,
    net_weight: Option<String>,
    entity_version: i64,
    payload: Value,
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

fn parse_payload(payload_json: String) -> Result<Value, String> {
    serde_json::from_str(&payload_json)
        .map_err(|e| format!("Stored Waste X load data is invalid: {e}"))
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
        .map(ToOwned::to_owned)
}

fn set_optional_string(object: &mut Map<String, Value>, key: &str, value: Option<String>) {
    object.insert(
        key.to_string(),
        value.map(Value::String).unwrap_or(Value::Null),
    );
}

fn local_load(transaction: &Transaction<'_>, load_id: &str, organisation_id: &str) -> Result<LocalLoad, String> {
    let load = transaction
        .query_row(
            "SELECT id, organisation_id, job_id, own_site_id, direction, status,
                    gross_weight, tare_weight, net_weight, entity_version, payload_json
             FROM local_job_load
             WHERE id = ?1 AND organisation_id = ?2",
            params![load_id, organisation_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, i64>(9)?,
                    row.get::<_, String>(10)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Waste X load was not found in the local working set.".to_string())?;

    let job_status: Option<String> = transaction
        .query_row(
            "SELECT status FROM local_job WHERE id = ?1 AND organisation_id = ?2",
            params![load.2, organisation_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if matches!(job_status.as_deref(), None | Some("draft") | Some("cancelled")) {
        return Err("The parent job is not operational.".to_string());
    }

    Ok(LocalLoad {
        id: load.0,
        organisation_id: load.1,
        job_id: load.2,
        own_site_id: load.3,
        direction: load.4,
        status: load.5,
        gross_weight: load.6,
        tare_weight: load.7,
        net_weight: load.8,
        entity_version: load.9,
        payload: parse_payload(load.10)?,
    })
}

fn validate_transport(
    transaction: &Transaction<'_>,
    table: &str,
    id: Option<&str>,
    organisation_id: &str,
    haulier_counterparty_id: Option<&str>,
) -> Result<(), String> {
    let Some(id) = id else { return Ok(()); };
    let sql = format!(
        "SELECT haulier_counterparty_id FROM {table}
         WHERE id = ?1 AND organisation_id = ?2 AND active = 1"
    );
    let stored_haulier: Option<Option<String>> = transaction
        .query_row(&sql, params![id, organisation_id], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())?;

    let stored_haulier = stored_haulier
        .ok_or_else(|| format!("Selected {} is not available offline.", if table == "local_driver" { "driver" } else { "vehicle" }))?;

    if stored_haulier.as_deref() != haulier_counterparty_id {
        return Err(format!(
            "Selected {} does not belong to this load's transport provider.",
            if table == "local_driver" { "driver" } else { "vehicle" }
        ));
    }
    Ok(())
}

fn cached_incoming_permit_allows(transaction: &Transaction<'_>, load: &LocalLoad) -> Result<bool, String> {
    let permit_id = value_string(&load.payload, "sitePermitId");
    let site_id = value_string(&load.payload, "ownSiteId").or_else(|| load.own_site_id.clone());
    let ewc_code_id = value_string(&load.payload, "ewcCodeId");
    let (Some(permit_id), Some(site_id), Some(ewc_code_id)) = (permit_id, site_id, ewc_code_id) else {
        return Ok(false);
    };

    let found: Option<i64> = transaction
        .query_row(
            "SELECT 1
             FROM local_permit p
             INNER JOIN local_permit_ewc_snapshot pe ON pe.permit_id = p.id
             WHERE p.id = ?1
               AND p.organisation_id = ?2
               AND p.site_id = ?3
               AND p.status = 'active'
               AND pe.organisation_id = ?2
               AND pe.ewc_code_id = ?4
               AND pe.active = 1
             LIMIT 1",
            params![permit_id, load.organisation_id, site_id, ewc_code_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(found.is_some())
}

fn cached_outgoing_facility_allows(transaction: &Transaction<'_>, load: &LocalLoad) -> Result<bool, String> {
    let site_id = value_string(&load.payload, "thirdPartyDestinationSiteId");
    let ewc_code_id = value_string(&load.payload, "ewcCodeId");
    let (Some(site_id), Some(ewc_code_id)) = (site_id, ewc_code_id) else {
        return Ok(false);
    };

    let found: Option<i64> = transaction
        .query_row(
            "SELECT 1
             FROM local_counterparty_site s
             INNER JOIN local_counterparty_site_authorisation a ON a.counterparty_site_id = s.id
             INNER JOIN local_counterparty_site_ewc e ON e.authorisation_id = a.id
             WHERE s.id = ?1
               AND s.organisation_id = ?2
               AND s.site_type = 'third_party_tip'
               AND s.active = 1
               AND a.organisation_id = ?2
               AND a.status = 'active'
               AND e.organisation_id = ?2
               AND e.ewc_code_id = ?3
               AND e.active = 1
             LIMIT 1",
            params![site_id, load.organisation_id, ewc_code_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(found.is_some())
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

fn enqueue_load_event(
    transaction: &Transaction<'_>,
    actor: &ActorContext,
    load: &LocalLoad,
    event_type: &str,
    event_payload: &Value,
    updated_payload: &Value,
    new_status: &str,
    gross_weight: Option<&str>,
    tare_weight: Option<&str>,
    net_weight: Option<&str>,
) -> Result<LocalOperationResult, String> {
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let event_id = Uuid::now_v7().to_string();
    let sequence = next_device_sequence(transaction)?;
    let payload_json = serde_json::to_string(event_payload)
        .map_err(|e| format!("Could not encode Waste X sync event: {e}"))?;
    let payload_hash = hex::encode(Sha256::digest(payload_json.as_bytes()));
    let site_id = value_string(updated_payload, "ownSiteId").or_else(|| load.own_site_id.clone());
    let projected_version = load.entity_version + 1;

    transaction
        .execute(
            "UPDATE local_job_load
             SET status = ?1,
                 gross_weight = ?2,
                 tare_weight = ?3,
                 net_weight = ?4,
                 entity_version = ?5,
                 payload_json = ?6,
                 updated_at = ?7
             WHERE id = ?8 AND organisation_id = ?9",
            params![
                new_status,
                gross_weight,
                tare_weight,
                net_weight,
                projected_version,
                serde_json::to_string(updated_payload).map_err(|e| e.to_string())?,
                now,
                load.id,
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
             ) VALUES (?1, ?2, ?3, ?4, ?5, 'job_load', ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12, 'PENDING', 0, ?12)",
            params![
                event_id,
                actor.organisation_id,
                site_id,
                actor.device_id,
                actor.user_id,
                load.id,
                event_type,
                load.entity_version,
                sequence,
                payload_json,
                payload_hash,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;

    transaction
        .execute(
            "INSERT INTO local_audit_event (
                event_id, actor_user_id, action, entity_type, entity_id, payload_json, created_at
             ) VALUES (?1, ?2, ?3, 'job_load', ?4, ?5, ?6)",
            params![event_id, actor.user_id, event_type, load.id, payload_json, now],
        )
        .map_err(|e| e.to_string())?;

    let pending_events: i64 = transaction
        .query_row(
            "SELECT COUNT(*) FROM local_sync_queue WHERE status IN ('PENDING','SENDING','FAILED')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(LocalOperationResult {
        ok: true,
        event_id,
        status: new_status.to_string(),
        projected_entity_version: projected_version,
        pending_events,
    })
}

fn normalise_optional(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() { None } else { Some(trimmed) }
    })
}

fn decimal(value: Option<f64>) -> Result<Option<String>, String> {
    match value {
        Some(value) if !value.is_finite() || value < 0.0 => Err("Weights must be zero or greater.".to_string()),
        Some(value) => Ok(Some(format!("{value:.3}"))),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn desktop_daily_operations(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
) -> Result<DailyOperationsSnapshot, String> {
    offline_auth::require_unlocked(&auth_state)?;
    let connection = open_local_connection(&app)?;
    let actor = actor_context(&connection)?;

    let mut statement = connection
        .prepare(
            "SELECT l.id, l.job_id, COALESCE(j.job_number, ''), j.job_date,
                    l.load_number, l.direction, l.status, l.gross_weight, l.tare_weight,
                    l.net_weight, l.entity_version, l.payload_json,
                    (SELECT COUNT(*) FROM local_sync_queue q
                     WHERE q.entity_type = 'job_load' AND q.entity_id = l.id
                       AND q.status IN ('PENDING','SENDING','FAILED','CONFLICT'))
             FROM local_job_load l
             INNER JOIN local_job j ON j.id = l.job_id
             WHERE l.organisation_id = ?1
             ORDER BY COALESCE(j.job_date, ''), COALESCE(j.job_number, ''), COALESCE(l.load_number, 0)",
        )
        .map_err(|e| e.to_string())?;

    let rows = statement
        .query_map(params![actor.organisation_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<i64>>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, Option<String>>(9)?,
                row.get::<_, i64>(10)?,
                row.get::<_, String>(11)?,
                row.get::<_, i64>(12)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut loads = Vec::new();
    for row in rows {
        let row = row.map_err(|e| e.to_string())?;
        let payload = parse_payload(row.11)?;
        loads.push(DailyLoad {
            id: row.0,
            job_id: row.1,
            job_number: row.2,
            job_date: row.3,
            load_number: row.4,
            direction: row.5,
            status: row.6,
            haulier_counterparty_id: value_string(&payload, "haulierCounterpartyId"),
            driver_id: value_string(&payload, "driverId"),
            vehicle_id: value_string(&payload, "vehicleId"),
            waste_description: value_string(&payload, "wasteDescriptionSnapshot").unwrap_or_default(),
            ewc_code: value_string(&payload, "ewcCodeSnapshot"),
            gross_weight: row.7,
            tare_weight: row.8,
            net_weight: row.9,
            weight_metric: value_string(&payload, "weightMetric").unwrap_or_else(|| "Tonnes".to_string()),
            ticket_number: value_string(&payload, "ticketNumber"),
            notes: value_string(&payload, "notes"),
            entity_version: row.10,
            pending_events: row.12,
        });
    }

    fn references(connection: &Connection, table: &str, label_keys: &[&str]) -> Result<Vec<OperationsReference>, String> {
        let mut statement = connection
            .prepare(&format!(
                "SELECT id, haulier_counterparty_id, payload_json FROM {table} WHERE active = 1 ORDER BY id"
            ))
            .map_err(|e| e.to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut result = Vec::new();
        for row in rows {
            let (id, haulier_counterparty_id, payload_json) = row.map_err(|e| e.to_string())?;
            let payload = parse_payload(payload_json)?;
            let label = label_keys
                .iter()
                .find_map(|key| value_string(&payload, key))
                .unwrap_or_else(|| id.clone());
            result.push(OperationsReference { id, label, haulier_counterparty_id });
        }
        Ok(result)
    }

    let pending_events = connection
        .query_row(
            "SELECT COUNT(*) FROM local_sync_queue WHERE status IN ('PENDING','SENDING','FAILED')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let conflicts = connection
        .query_row(
            "SELECT COUNT(*) FROM local_sync_queue WHERE status = 'CONFLICT'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(DailyOperationsSnapshot {
        loads,
        drivers: references(&connection, "local_driver", &["name", "fullName", "driverName"] )?,
        vehicles: references(&connection, "local_vehicle", &["registrationNumber", "registration", "name"] )?,
        pending_events,
        conflicts,
    })
}

#[tauri::command]
pub fn desktop_save_load_details(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
    input: LoadDetailsInput,
) -> Result<LocalOperationResult, String> {
    offline_auth::require_unlocked(&auth_state)?;
    let mut connection = open_local_connection(&app)?;
    let actor = actor_context(&connection)?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    let load = local_load(&transaction, input.load_id.trim(), &actor.organisation_id)?;

    if matches!(load.status.as_str(), "completed" | "rejected" | "cancelled") {
        return Err("This load is already terminal and cannot be edited.".to_string());
    }
    let waste_description = input.waste_description.trim().to_string();
    if waste_description.is_empty() {
        return Err("Waste description is required.".to_string());
    }
    if !matches!(input.weight_metric.as_str(), "Grams" | "Kilograms" | "Tonnes") {
        return Err("Weight metric must be Grams, Kilograms, or Tonnes.".to_string());
    }

    let driver_id = normalise_optional(input.driver_id);
    let vehicle_id = normalise_optional(input.vehicle_id);
    let haulier_counterparty_id = value_string(&load.payload, "haulierCounterpartyId");
    validate_transport(&transaction, "local_driver", driver_id.as_deref(), &actor.organisation_id, haulier_counterparty_id.as_deref())?;
    validate_transport(&transaction, "local_vehicle", vehicle_id.as_deref(), &actor.organisation_id, haulier_counterparty_id.as_deref())?;

    let gross = decimal(input.gross_weight)?;
    let tare = decimal(input.tare_weight)?;
    let mut net = decimal(input.net_weight)?;
    if let (Some(gross_value), Some(tare_value)) = (input.gross_weight, input.tare_weight) {
        if gross_value < tare_value {
            return Err("Gross weight cannot be below tare weight.".to_string());
        }
        net = Some(format!("{:.3}", gross_value - tare_value));
    }

    let ticket_number = normalise_optional(input.ticket_number);
    let notes = normalise_optional(input.notes);
    let mut updated_payload = load.payload.clone();
    let object = payload_object(&mut updated_payload)?;
    set_optional_string(object, "driverId", driver_id.clone());
    set_optional_string(object, "vehicleId", vehicle_id.clone());
    object.insert("wasteDescriptionSnapshot".to_string(), Value::String(waste_description.clone()));
    set_optional_string(object, "grossWeight", gross.clone());
    set_optional_string(object, "tareWeight", tare.clone());
    set_optional_string(object, "netWeight", net.clone());
    object.insert("weightMetric".to_string(), Value::String(input.weight_metric.clone()));
    object.insert("weightIsEstimate".to_string(), Value::Bool(input.weight_is_estimate));
    object.insert("weightSource".to_string(), Value::String("manual".to_string()));
    set_optional_string(object, "ticketNumber", ticket_number.clone());
    set_optional_string(object, "notes", notes.clone());

    let event_payload = json!({
        "driverId": driver_id,
        "vehicleId": vehicle_id,
        "wasteDescription": waste_description,
        "grossWeight": input.gross_weight,
        "tareWeight": input.tare_weight,
        "netWeight": net.as_ref().and_then(|value| value.parse::<f64>().ok()),
        "weightMetric": input.weight_metric,
        "weightIsEstimate": input.weight_is_estimate,
        "ticketNumber": ticket_number,
        "notes": notes,
    });

    let result = enqueue_load_event(
        &transaction,
        &actor,
        &load,
        "LOAD_DETAILS_UPDATED",
        &event_payload,
        &updated_payload,
        &load.status,
        gross.as_deref(),
        tare.as_deref(),
        net.as_deref(),
    )?;
    transaction.commit().map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub fn desktop_mark_load_arrived(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
    input: LoadActionInput,
) -> Result<LocalOperationResult, String> {
    offline_auth::require_unlocked(&auth_state)?;
    let mut connection = open_local_connection(&app)?;
    let actor = actor_context(&connection)?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    let load = local_load(&transaction, input.load_id.trim(), &actor.organisation_id)?;

    if load.direction != "incoming" { return Err("Arrived is only valid for incoming loads.".to_string()); }
    if load.status != "planned" { return Err("Only a planned load can be marked arrived.".to_string()); }
    if value_string(&load.payload, "wasteDescriptionSnapshot").unwrap_or_default().trim().is_empty() {
        return Err("Waste description is required before arrival.".to_string());
    }
    let driver_id = value_string(&load.payload, "driverId");
    let vehicle_id = value_string(&load.payload, "vehicleId");
    if driver_id.is_none() { return Err("Driver is required before arrival.".to_string()); }
    if vehicle_id.is_none() { return Err("Vehicle is required before arrival.".to_string()); }
    let haulier = value_string(&load.payload, "haulierCounterpartyId");
    validate_transport(&transaction, "local_driver", driver_id.as_deref(), &actor.organisation_id, haulier.as_deref())?;
    validate_transport(&transaction, "local_vehicle", vehicle_id.as_deref(), &actor.organisation_id, haulier.as_deref())?;

    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let mut updated_payload = load.payload.clone();
    let object = payload_object(&mut updated_payload)?;
    object.insert("status".to_string(), Value::String("arrived".to_string()));
    if !object.contains_key("receivedAt") || object.get("receivedAt") == Some(&Value::Null) {
        object.insert("receivedAt".to_string(), Value::String(now.clone()));
    }
    if !object.contains_key("movementAt") || object.get("movementAt") == Some(&Value::Null) {
        object.insert("movementAt".to_string(), Value::String(now));
    }

    let result = enqueue_load_event(&transaction, &actor, &load, "LOAD_ARRIVED", &json!({}), &updated_payload, "arrived", load.gross_weight.as_deref(), load.tare_weight.as_deref(), load.net_weight.as_deref())?;
    transaction.commit().map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub fn desktop_accept_load(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
    input: LoadActionInput,
) -> Result<LocalOperationResult, String> {
    offline_auth::require_unlocked(&auth_state)?;
    let mut connection = open_local_connection(&app)?;
    let actor = actor_context(&connection)?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    let load = local_load(&transaction, input.load_id.trim(), &actor.organisation_id)?;

    if load.direction != "incoming" { return Err("Accept is only valid for incoming loads.".to_string()); }
    if load.status != "arrived" { return Err("The load must be arrived before it can be accepted.".to_string()); }
    if value_string(&load.payload, "wasteDescriptionSnapshot").unwrap_or_default().trim().is_empty() {
        return Err("Waste description is required before acceptance.".to_string());
    }
    if !cached_incoming_permit_allows(&transaction, &load)? {
        return Err("Cached permit/EWC rules do not allow this incoming load. Do not accept it offline.".to_string());
    }

    let mut updated_payload = load.payload.clone();
    payload_object(&mut updated_payload)?.insert("status".to_string(), Value::String("accepted".to_string()));
    let result = enqueue_load_event(&transaction, &actor, &load, "LOAD_ACCEPTED", &json!({}), &updated_payload, "accepted", load.gross_weight.as_deref(), load.tare_weight.as_deref(), load.net_weight.as_deref())?;
    transaction.commit().map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub fn desktop_reject_load(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
    input: RejectLoadInput,
) -> Result<LocalOperationResult, String> {
    offline_auth::require_unlocked(&auth_state)?;
    let reason = input.reason.trim().to_string();
    if reason.len() < 3 || reason.len() > 2000 {
        return Err("A rejection reason between 3 and 2000 characters is required.".to_string());
    }
    let mut connection = open_local_connection(&app)?;
    let actor = actor_context(&connection)?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    let load = local_load(&transaction, input.load_id.trim(), &actor.organisation_id)?;
    if load.direction != "incoming" { return Err("Reject is only valid for incoming loads.".to_string()); }
    if load.status != "arrived" { return Err("The load must be arrived before it can be rejected.".to_string()); }

    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let existing_notes = value_string(&load.payload, "notes").unwrap_or_default();
    let note = format!("[REJECTED · {now}] {reason}");
    let notes = if existing_notes.trim().is_empty() { note } else { format!("{}\n{}", existing_notes.trim(), note) };
    let mut updated_payload = load.payload.clone();
    let object = payload_object(&mut updated_payload)?;
    object.insert("status".to_string(), Value::String("rejected".to_string()));
    object.insert("notes".to_string(), Value::String(notes));
    object.insert("completedAt".to_string(), Value::String(now));

    let result = enqueue_load_event(&transaction, &actor, &load, "LOAD_REJECTED", &json!({ "reason": reason }), &updated_payload, "rejected", load.gross_weight.as_deref(), load.tare_weight.as_deref(), load.net_weight.as_deref())?;
    transaction.commit().map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub fn desktop_complete_load(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
    input: LoadActionInput,
) -> Result<LocalOperationResult, String> {
    offline_auth::require_unlocked(&auth_state)?;
    let mut connection = open_local_connection(&app)?;
    let actor = actor_context(&connection)?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    let load = local_load(&transaction, input.load_id.trim(), &actor.organisation_id)?;

    if load.direction == "incoming" && load.status != "accepted" {
        return Err("Incoming loads must be accepted before completion.".to_string());
    }
    if load.direction == "outgoing" && matches!(load.status.as_str(), "completed" | "rejected" | "cancelled") {
        return Err("This outgoing load is already terminal.".to_string());
    }
    let net = load.net_weight.as_ref().and_then(|value| value.parse::<f64>().ok()).unwrap_or(0.0);
    if !net.is_finite() || net <= 0.0 {
        return Err("A positive net weight is required before completion.".to_string());
    }
    if load.direction == "outgoing" {
        if value_string(&load.payload, "wasteDescriptionSnapshot").unwrap_or_default().trim().is_empty() {
            return Err("Waste description is required before completing an outgoing load.".to_string());
        }
        if !cached_outgoing_facility_allows(&transaction, &load)? {
            return Err("Cached destination authorisation/EWC rules do not allow this outgoing load. Do not complete it offline.".to_string());
        }
    }

    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let mut updated_payload = load.payload.clone();
    let object = payload_object(&mut updated_payload)?;
    object.insert("status".to_string(), Value::String("completed".to_string()));
    object.insert("completedAt".to_string(), Value::String(now.clone()));
    if load.direction == "outgoing" && (object.get("movementAt").is_none() || object.get("movementAt") == Some(&Value::Null)) {
        object.insert("movementAt".to_string(), Value::String(now));
    }

    let result = enqueue_load_event(&transaction, &actor, &load, "LOAD_COMPLETED", &json!({}), &updated_payload, "completed", load.gross_weight.as_deref(), load.tare_weight.as_deref(), load.net_weight.as_deref())?;
    transaction.commit().map_err(|e| e.to_string())?;
    Ok(result)
}
