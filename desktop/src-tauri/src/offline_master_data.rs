use keyring::Entry;
use reqwest::Client;
use rusqlite::{params, Connection, OptionalExtension};
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
const TRANSPORT_MASTER_SNAPSHOT_KEY: &str = "desktop_transport_master_snapshot_v1";
const JOB_OPTIONS_SNAPSHOT_KEY: &str = "desktop_job_options_snapshot_v1";

/* WASTE_X_DESKTOP_OFFLINE_TRANSPORT_MUTATIONS_V1 */

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloudCredentials {
    device_secret: String,
    session_token: String,
    session_expires_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransportMutationSyncResult {
    ok: bool,
    synced_now: usize,
    pending: i64,
    failed: i64,
    warning: Option<String>,
}

fn cloud_base_url() -> String {
    option_env!("WASTE_X_DESKTOP_API_BASE_URL")
        .unwrap_or("http://localhost:3000")
        .trim_end_matches('/')
        .to_string()
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
            "PRAGMA key = \"x'{key}'\";\n\
             PRAGMA foreign_keys = ON;\n\
             PRAGMA journal_mode = WAL;\n\
             PRAGMA synchronous = FULL;\n\
             PRAGMA busy_timeout = 5000;"
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

fn now_iso(connection: &Connection) -> Result<String, String> {
    connection
        .query_row(
            "SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
}

fn organisation_id(connection: &Connection) -> Result<String, String> {
    connection
        .query_row(
            "SELECT organisation_id
             FROM local_device_configuration
             WHERE singleton_id = 1",
            [],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "This Waste X Desktop is not provisioned to an organisation.".to_string())
}

fn metadata_json(connection: &Connection, key: &str) -> Result<Option<Value>, String> {
    let encoded = connection
        .query_row(
            "SELECT value FROM local_sync_metadata WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    encoded
        .map(|value| {
            serde_json::from_str(&value)
                .map_err(|e| format!("Cached Waste X data for {key} is unreadable: {e}"))
        })
        .transpose()
}

fn write_metadata_json(connection: &Connection, key: &str, value: &Value) -> Result<(), String> {
    let encoded = serde_json::to_string(value)
        .map_err(|e| format!("Could not encode Waste X offline data: {e}"))?;
    connection
        .execute(
            "INSERT INTO local_sync_metadata (key, value, updated_at)
             VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET
               value = excluded.value,
               updated_at = excluded.updated_at",
            params![key, encoded],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn text(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn required_text(value: &Value, key: &str) -> Result<String, String> {
    text(value, key).ok_or_else(|| format!("Waste X transport change is missing {key}."))
}

fn array<'a>(value: &'a Value, key: &str) -> Result<&'a Vec<Value>, String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("Cached transport master data is missing {key}."))
}

fn array_mut<'a>(value: &'a mut Value, key: &str) -> Result<&'a mut Vec<Value>, String> {
    value
        .get_mut(key)
        .and_then(Value::as_array_mut)
        .ok_or_else(|| format!("Cached transport master data is missing {key}."))
}

fn active_haulier(snapshot: &Value, id: &str) -> Result<bool, String> {
    Ok(array(snapshot, "hauliers")?.iter().any(|row| {
        row.get("id").and_then(Value::as_str) == Some(id)
            && row.get("isActive").and_then(Value::as_bool).unwrap_or(true)
    }))
}

fn normalise_registration(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_whitespace())
        .flat_map(char::to_uppercase)
        .collect()
}

fn normalise_tare(value: Option<String>) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    let parsed = value
        .parse::<f64>()
        .map_err(|_| "Stored tare must be a valid number of kilograms.".to_string())?;
    if !parsed.is_finite() || parsed < 0.0 {
        return Err("Stored tare must be a valid number of kilograms.".to_string());
    }
    Ok(Some(format!("{parsed:.3}")))
}

fn record_id(row: &Value) -> Option<&str> {
    row.get("id").and_then(Value::as_str)
}

fn set_field(record: &mut Value, key: &str, value: Value) -> Result<(), String> {
    let object = record
        .as_object_mut()
        .ok_or_else(|| "Cached Waste X master-data record is invalid.".to_string())?;
    object.insert(key.to_string(), value);
    Ok(())
}

fn optional_json(value: Option<String>) -> Value {
    value.map(Value::String).unwrap_or(Value::Null)
}

fn upsert_driver_local(
    connection: &Connection,
    organisation_id: &str,
    record: &Value,
) -> Result<(), String> {
    let id = required_text(record, "id")?;
    let haulier = text(record, "haulierCounterpartyId");
    let active = record
        .get("isActive")
        .and_then(Value::as_bool)
        .unwrap_or(true) as i64;
    connection
        .execute(
            "INSERT INTO local_driver (
               id, organisation_id, haulier_counterparty_id, active, payload_json, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               organisation_id = excluded.organisation_id,
               haulier_counterparty_id = excluded.haulier_counterparty_id,
               active = excluded.active,
               payload_json = excluded.payload_json,
               updated_at = excluded.updated_at",
            params![id, organisation_id, haulier, active, record.to_string()],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn upsert_vehicle_local(
    connection: &Connection,
    organisation_id: &str,
    record: &Value,
) -> Result<(), String> {
    let id = required_text(record, "id")?;
    let haulier = text(record, "haulierCounterpartyId");
    let active = record
        .get("isActive")
        .and_then(Value::as_bool)
        .unwrap_or(true) as i64;
    connection
        .execute(
            "INSERT INTO local_vehicle (
               id, organisation_id, haulier_counterparty_id, active, payload_json, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               organisation_id = excluded.organisation_id,
               haulier_counterparty_id = excluded.haulier_counterparty_id,
               active = excluded.active,
               payload_json = excluded.payload_json,
               updated_at = excluded.updated_at",
            params![id, organisation_id, haulier, active, record.to_string()],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn clear_default_vehicle(
    connection: &Connection,
    organisation_id: &str,
    snapshot: &mut Value,
    vehicle_id: &str,
) -> Result<(), String> {
    let drivers = array_mut(snapshot, "drivers")?;
    for driver in drivers.iter_mut() {
        if driver.get("defaultVehicleId").and_then(Value::as_str) == Some(vehicle_id) {
            set_field(driver, "defaultVehicleId", Value::Null)?;
            upsert_driver_local(connection, organisation_id, driver)?;
        }
    }
    Ok(())
}

fn sync_job_options_transport(
    connection: &Connection,
    transport_snapshot: &Value,
) -> Result<(), String> {
    let Some(mut job_options) = metadata_json(connection, JOB_OPTIONS_SNAPSHOT_KEY)? else {
        return Ok(());
    };

    let drivers = array(transport_snapshot, "drivers")?
        .iter()
        .filter(|row| row.get("isActive").and_then(Value::as_bool).unwrap_or(true))
        .map(|row| {
            json!({
                "id": row.get("id").cloned().unwrap_or(Value::Null),
                "name": row.get("name").cloned().unwrap_or(Value::Null),
                "telephone": row.get("telephone").cloned().unwrap_or(Value::Null),
                "email": row.get("email").cloned().unwrap_or(Value::Null),
                "haulierCounterpartyId": row.get("haulierCounterpartyId").cloned().unwrap_or(Value::Null),
                "defaultVehicleId": row.get("defaultVehicleId").cloned().unwrap_or(Value::Null)
            })
        })
        .collect::<Vec<_>>();

    let vehicles = array(transport_snapshot, "vehicles")?
        .iter()
        .filter(|row| row.get("isActive").and_then(Value::as_bool).unwrap_or(true))
        .map(|row| {
            json!({
                "id": row.get("id").cloned().unwrap_or(Value::Null),
                "registrationNumber": row.get("registrationNumber").cloned().unwrap_or(Value::Null),
                "vehicleType": row.get("vehicleType").cloned().unwrap_or(Value::Null),
                "tareWeightKg": row.get("tareWeightKg").cloned().unwrap_or(Value::Null),
                "haulierCounterpartyId": row.get("haulierCounterpartyId").cloned().unwrap_or(Value::Null)
            })
        })
        .collect::<Vec<_>>();

    let object = job_options
        .as_object_mut()
        .ok_or_else(|| "Cached Waste X Job options are invalid.".to_string())?;
    object.insert("drivers".to_string(), Value::Array(drivers));
    object.insert("vehicles".to_string(), Value::Array(vehicles));
    write_metadata_json(connection, JOB_OPTIONS_SNAPSHOT_KEY, &job_options)
}

fn transport_data(snapshot: &Value) -> Result<Value, String> {
    Ok(json!({
        "hauliers": array(snapshot, "hauliers")?.clone(),
        "drivers": array(snapshot, "drivers")?.clone(),
        "vehicles": array(snapshot, "vehicles")?.clone()
    }))
}

fn apply_driver_mutation(
    connection: &Connection,
    organisation_id: &str,
    snapshot: &mut Value,
    operation: &str,
    input: &Value,
) -> Result<(String, String), String> {
    if operation == "driver.archive" || operation == "driver.restore" {
        let id = required_text(input, "id")?;
        let drivers = array_mut(snapshot, "drivers")?;
        let record = drivers
            .iter_mut()
            .find(|row| record_id(row) == Some(id.as_str()))
            .ok_or_else(|| "That Driver is not available in this Desktop working set.".to_string())?;
        let active = operation == "driver.restore";
        set_field(record, "isActive", Value::Bool(active))?;
        upsert_driver_local(connection, organisation_id, record)?;
        return Ok((id, if active { "restored" } else { "archived" }.to_string()));
    }

    let data = input
        .get("data")
        .ok_or_else(|| "Driver change is missing data.".to_string())?;
    let id = required_text(data, "id")?;
    let name = required_text(data, "name")?;
    let haulier_id = text(data, "haulierCounterpartyId");
    let default_vehicle_id = text(data, "defaultVehicleId");

    if let Some(ref haulier_id) = haulier_id {
        if !active_haulier(snapshot, haulier_id)? {
            return Err("Choose a valid active haulier.".to_string());
        }
    }

    if let Some(ref vehicle_id) = default_vehicle_id {
        let vehicle = array(snapshot, "vehicles")?
            .iter()
            .find(|row| {
                record_id(row) == Some(vehicle_id.as_str())
                    && row.get("isActive").and_then(Value::as_bool).unwrap_or(true)
            })
            .ok_or_else(|| "Choose a valid active default Vehicle.".to_string())?;
        if text(vehicle, "haulierCounterpartyId") != haulier_id {
            return Err("The default Vehicle belongs to a different carrier.".to_string());
        }
    }

    let now = now_iso(connection)?;
    let drivers = array_mut(snapshot, "drivers")?;
    let existing_index = drivers.iter().position(|row| record_id(row) == Some(id.as_str()));

    if operation == "driver.create" && existing_index.is_some() {
        return Err("That locally generated Driver id is already in use.".to_string());
    }
    if operation == "driver.update" && existing_index.is_none() {
        return Err("That Driver is not available in this Desktop working set.".to_string());
    }

    let mut record = existing_index
        .map(|index| drivers[index].clone())
        .unwrap_or_else(|| {
            json!({
                "id": id.clone(),
                "linkedUserId": null,
                "mobileAccessStatus": "NOT_INVITED",
                "createdAt": now.clone()
            })
        });

    set_field(&mut record, "id", Value::String(id.clone()))?;
    set_field(&mut record, "name", Value::String(name))?;
    set_field(&mut record, "telephone", optional_json(text(data, "telephone")))?;
    set_field(&mut record, "email", optional_json(text(data, "email")))?;
    set_field(
        &mut record,
        "haulierCounterpartyId",
        optional_json(haulier_id.clone()),
    )?;
    set_field(
        &mut record,
        "defaultVehicleId",
        optional_json(default_vehicle_id),
    )?;
    set_field(&mut record, "notes", optional_json(text(data, "notes")))?;
    set_field(&mut record, "isActive", Value::Bool(true))?;
    set_field(&mut record, "updatedAt", Value::String(now))?;

    if let Some(index) = existing_index {
        drivers[index] = record.clone();
    } else {
        drivers.push(record.clone());
    }
    drivers.sort_by_key(|row| text(row, "name").unwrap_or_default().to_lowercase());

    upsert_driver_local(connection, organisation_id, &record)?;

    Ok((
        id,
        if operation == "driver.create" {
            "created"
        } else {
            "updated"
        }
        .to_string(),
    ))
}

fn apply_vehicle_mutation(
    connection: &Connection,
    organisation_id: &str,
    snapshot: &mut Value,
    operation: &str,
    input: &Value,
) -> Result<(String, String), String> {
    if operation == "vehicle.archive" || operation == "vehicle.restore" {
        let id = required_text(input, "id")?;
        let active = operation == "vehicle.restore";
        {
            let vehicles = array_mut(snapshot, "vehicles")?;
            let record = vehicles
                .iter_mut()
                .find(|row| record_id(row) == Some(id.as_str()))
                .ok_or_else(|| "That Vehicle is not available in this Desktop working set.".to_string())?;
            set_field(record, "isActive", Value::Bool(active))?;
            upsert_vehicle_local(connection, organisation_id, record)?;
        }
        if !active {
            clear_default_vehicle(connection, organisation_id, snapshot, &id)?;
        }
        return Ok((id, if active { "restored" } else { "archived" }.to_string()));
    }

    let data = input
        .get("data")
        .ok_or_else(|| "Vehicle change is missing data.".to_string())?;
    let id = required_text(data, "id")?;
    let registration = normalise_registration(&required_text(data, "registrationNumber")?);
    if registration.is_empty() {
        return Err("Enter the Vehicle registration.".to_string());
    }
    let haulier_id = text(data, "haulierCounterpartyId");
    if let Some(ref haulier_id) = haulier_id {
        if !active_haulier(snapshot, haulier_id)? {
            return Err("Choose a valid active haulier.".to_string());
        }
    }
    let tare = normalise_tare(text(data, "tareWeightKg"))?;

    let vehicles_read = array(snapshot, "vehicles")?;
    let existing_index = vehicles_read
        .iter()
        .position(|row| record_id(row) == Some(id.as_str()));
    if operation == "vehicle.create" && existing_index.is_some() {
        return Err("That locally generated Vehicle id is already in use.".to_string());
    }
    if operation == "vehicle.update" && existing_index.is_none() {
        return Err("That Vehicle is not available in this Desktop working set.".to_string());
    }
    if vehicles_read.iter().any(|row| {
        record_id(row) != Some(id.as_str())
            && text(row, "registrationNumber")
                .map(|value| normalise_registration(&value))
                .as_deref()
                == Some(registration.as_str())
    }) {
        return Err("That registration is already stored in Waste X.".to_string());
    }

    let previous_haulier = existing_index
        .and_then(|index| text(&vehicles_read[index], "haulierCounterpartyId"));
    let now = now_iso(connection)?;

    let mut record = existing_index
        .map(|index| vehicles_read[index].clone())
        .unwrap_or_else(|| json!({"id": id.clone(), "createdAt": now.clone()}));

    set_field(&mut record, "id", Value::String(id.clone()))?;
    set_field(
        &mut record,
        "registrationNumber",
        Value::String(registration),
    )?;
    set_field(
        &mut record,
        "vehicleType",
        optional_json(text(data, "vehicleType")),
    )?;
    set_field(
        &mut record,
        "haulierCounterpartyId",
        optional_json(haulier_id.clone()),
    )?;
    set_field(&mut record, "tareWeightKg", optional_json(tare))?;
    set_field(&mut record, "notes", optional_json(text(data, "notes")))?;
    set_field(&mut record, "isActive", Value::Bool(true))?;
    set_field(&mut record, "updatedAt", Value::String(now))?;

    {
        let vehicles = array_mut(snapshot, "vehicles")?;
        if let Some(index) = existing_index {
            vehicles[index] = record.clone();
        } else {
            vehicles.push(record.clone());
        }
        vehicles.sort_by_key(|row| {
            text(row, "registrationNumber")
                .unwrap_or_default()
                .to_lowercase()
        });
    }

    upsert_vehicle_local(connection, organisation_id, &record)?;

    if previous_haulier != haulier_id {
        clear_default_vehicle(connection, organisation_id, snapshot, &id)?;
    }

    Ok((
        id,
        if operation == "vehicle.create" {
            "created"
        } else {
            "updated"
        }
        .to_string(),
    ))
}

fn apply_transport_snapshot(
    connection: &Connection,
    organisation_id: &str,
    snapshot: &Value,
) -> Result<(), String> {
    for driver in array(snapshot, "drivers")? {
        upsert_driver_local(connection, organisation_id, driver)?;
    }
    for vehicle in array(snapshot, "vehicles")? {
        upsert_vehicle_local(connection, organisation_id, vehicle)?;
    }
    write_metadata_json(connection, TRANSPORT_MASTER_SNAPSHOT_KEY, snapshot)?;
    sync_job_options_transport(connection, snapshot)
}

fn canonical_snapshot_from_cloud(body: &Value) -> Result<Value, String> {
    let data = body
        .get("data")
        .and_then(Value::as_object)
        .ok_or_else(|| "Waste X Cloud transport response is missing master data.".to_string())?;

    Ok(json!({
        "ok": true,
        "hauliers": data.get("hauliers").cloned().unwrap_or_else(|| Value::Array(vec![])),
        "drivers": data.get("drivers").cloned().unwrap_or_else(|| Value::Array(vec![])),
        "vehicles": data.get("vehicles").cloned().unwrap_or_else(|| Value::Array(vec![])),
        "boundary": {
            "mobileAccessAdministration": "WEB_ONLY",
            "dwtCarrierAdministration": "WEB_ONLY"
        }
    }))
}

fn mark_queue(
    connection: &Connection,
    mutation_id: &str,
    status: &str,
    last_error: Option<&str>,
    increment_attempt: bool,
) -> Result<(), String> {
    connection
        .execute(
            "UPDATE local_cloud_mutation_queue
             SET status = ?2,
                 attempt_count = attempt_count + CASE WHEN ?4 = 1 THEN 1 ELSE 0 END,
                 last_error = ?3,
                 updated_at = datetime('now')
             WHERE mutation_id = ?1",
            params![
                mutation_id,
                status,
                last_error,
                if increment_attempt { 1_i64 } else { 0_i64 }
            ],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

/* WASTE_X_DESKTOP_PARTNER_DEPENDENCY_ORDERING_V1 */
#[derive(Clone, Copy, PartialEq, Eq)]
enum PartnerDependencyState {
    Ready,
    Pending,
    Failed,
}

fn partner_dependency_state(
    connection: &Connection,
    payload: &Value,
) -> Result<PartnerDependencyState, String> {
    let haulier_id = payload
        .get("data")
        .and_then(|data| text(data, "haulierCounterpartyId"));

    let Some(haulier_id) = haulier_id else {
        return Ok(PartnerDependencyState::Ready);
    };

    let status = connection
        .query_row(
            "SELECT status
             FROM local_cloud_mutation_queue
             WHERE mutation_kind = 'partner'
               AND entity_id = ?1
             ORDER BY created_at DESC, mutation_id DESC
             LIMIT 1",
            params![haulier_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(match status.as_deref() {
        Some("FAILED") => PartnerDependencyState::Failed,
        Some("PENDING") | Some("SENDING") => PartnerDependencyState::Pending,
        _ => PartnerDependencyState::Ready,
    })
}

fn queue_counts(connection: &Connection) -> Result<(i64, i64), String> {
    let pending = connection
        .query_row(
            "SELECT COUNT(*) FROM local_cloud_mutation_queue
             WHERE mutation_kind = 'transport'
               AND status IN ('PENDING','SENDING')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let failed = connection
        .query_row(
            "SELECT COUNT(*) FROM local_cloud_mutation_queue
             WHERE mutation_kind = 'transport' AND status = 'FAILED'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok((pending, failed))
}

#[tauri::command]
pub fn desktop_mutate_transport_local(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
    input: Value,
) -> Result<Value, String> {
    offline_auth::require_unlocked(&auth_state)?;

    let mut connection = open_local_connection(&app)?;
    let organisation_id = organisation_id(&connection)?;
    let operation = required_text(&input, "operation")?;
    let entity_type = if operation.starts_with("driver.") {
        "driver"
    } else if operation.starts_with("vehicle.") {
        "vehicle"
    } else {
        return Err("Unsupported Waste X Driver / Vehicle operation.".to_string());
    };

    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    let mut snapshot = metadata_json(&transaction, TRANSPORT_MASTER_SNAPSHOT_KEY)?
        .ok_or_else(|| {
            "Driver / Vehicle master data has not been cached on this Desktop yet. Connect to Waste X Cloud once before editing it offline.".to_string()
        })?;

    let (entity_id, action) = if entity_type == "driver" {
        apply_driver_mutation(
            &transaction,
            &organisation_id,
            &mut snapshot,
            &operation,
            &input,
        )?
    } else {
        apply_vehicle_mutation(
            &transaction,
            &organisation_id,
            &mut snapshot,
            &operation,
            &input,
        )?
    };

    write_metadata_json(&transaction, TRANSPORT_MASTER_SNAPSHOT_KEY, &snapshot)?;
    sync_job_options_transport(&transaction, &snapshot)?;

    let mutation_id = Uuid::now_v7().to_string();
    transaction
        .execute(
            "INSERT INTO local_cloud_mutation_queue (
               mutation_id, organisation_id, mutation_kind, entity_type, entity_id,
               operation, payload_json, status, attempt_count, last_error,
               created_at, updated_at
             ) VALUES (?1, ?2, 'transport', ?3, ?4, ?5, ?6, 'PENDING', 0, NULL, datetime('now'), datetime('now'))",
            params![
                mutation_id,
                organisation_id,
                entity_type,
                entity_id,
                operation,
                input.to_string()
            ],
        )
        .map_err(|e| e.to_string())?;

    let data = transport_data(&snapshot)?;
    transaction.commit().map_err(|e| e.to_string())?;

    Ok(json!({
        "ok": true,
        "action": action,
        "entityType": entity_type,
        "entityId": entity_id,
        "syncFeedWarning": false,
        "queued": true,
        "data": data
    }))
}

#[tauri::command]
pub async fn desktop_sync_transport_mutations(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
) -> Result<TransportMutationSyncResult, String> {
    offline_auth::require_unlocked(&auth_state)?;

    let connection = open_local_connection(&app)?;
    let organisation_id = organisation_id(&connection)?;

    connection
        .execute(
            "UPDATE local_cloud_mutation_queue
             SET status = 'PENDING',
                 last_error = 'INTERRUPTED:Previous transport sync stopped before Cloud acknowledgement',
                 updated_at = datetime('now')
             WHERE mutation_kind = 'transport' AND status = 'SENDING'",
            [],
        )
        .map_err(|e| e.to_string())?;

    let credentials = match load_cloud_credentials() {
        Ok(credentials) => credentials,
        Err(error) => {
            let (pending, failed) = queue_counts(&connection)?;
            return Ok(TransportMutationSyncResult {
                ok: true,
                synced_now: 0,
                pending,
                failed,
                warning: Some(error),
            });
        }
    };

    let queue = {
        let mut statement = connection
            .prepare(
                "SELECT mutation_id, payload_json
                 FROM local_cloud_mutation_queue
                 WHERE organisation_id = ?1
                   AND mutation_kind = 'transport'
                   AND status = 'PENDING'
                 ORDER BY created_at ASC, mutation_id ASC
                 LIMIT 50",
            )
            .map_err(|e| e.to_string())?;
        let rows = statement
            .query_map(params![organisation_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };

    if queue.is_empty() {
        let (pending, failed) = queue_counts(&connection)?;
        return Ok(TransportMutationSyncResult {
            ok: true,
            synced_now: 0,
            pending,
            failed,
            warning: None,
        });
    }

    let client = Client::new();
    let mut synced_now = 0_usize;
    let mut warning = None;

    let mut last_canonical_snapshot: Option<Value> = None;

    for (mutation_id, payload_json) in queue {
        let payload: Value = serde_json::from_str(&payload_json)
            .map_err(|e| format!("Stored Driver / Vehicle change is unreadable: {e}"))?;

        match partner_dependency_state(&connection, &payload)? {
            PartnerDependencyState::Pending => {
                warning = Some(
                    "A Driver / Vehicle change is waiting for its Haulier to reach Cloud first."
                        .to_string(),
                );
                continue;
            }
            PartnerDependencyState::Failed => {
                mark_queue(
                    &connection,
                    &mutation_id,
                    "FAILED",
                    Some("LOCAL_DEPENDENCY:PARTNER_SYNC_FAILED"),
                    false,
                )?;
                warning = Some(
                    "A Driver / Vehicle change needs review because its Haulier could not sync."
                        .to_string(),
                );
                continue;
            }
            PartnerDependencyState::Ready => {}
        }

        mark_queue(&connection, &mutation_id, "SENDING", None, true)?;

        let response = match client
            .post(format!(
                "{}/api/desktop/v1/operations/transport",
                cloud_base_url()
            ))
            .bearer_auth(&credentials.session_token)
            .header("X-Waste-X-Device-Secret", &credentials.device_secret)
            .json(&payload)
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                let detail = format!("NETWORK:{error}");
                mark_queue(
                    &connection,
                    &mutation_id,
                    "PENDING",
                    Some(&detail),
                    false,
                )?;
                warning = Some(
                    "Driver / Vehicle changes remain encrypted on this Desktop until Waste X Cloud is reachable."
                        .to_string(),
                );
                break;
            }
        };

        let status = response.status();
        let body = response.json::<Value>().await.unwrap_or_else(|_| json!({}));

        if status.as_u16() == 401 || status.as_u16() == 403 {
            mark_queue(
                &connection,
                &mutation_id,
                "PENDING",
                Some("AUTH_REQUIRED:Renew the Waste X Desktop Cloud session"),
                false,
            )?;
            warning = Some(
                "Driver / Vehicle changes are queued. Sign in online to renew Cloud access."
                    .to_string(),
            );
            break;
        }

        if status.as_u16() == 429 || status.is_server_error() {
            let detail = format!("RETRYABLE:HTTP {status}");
            mark_queue(
                &connection,
                &mutation_id,
                "PENDING",
                Some(&detail),
                false,
            )?;
            warning = Some(
                "Waste X Cloud is temporarily unavailable. Driver / Vehicle changes remain queued."
                    .to_string(),
            );
            break;
        }

        if !status.is_success() {
            let message = body
                .get("error")
                .and_then(|value| value.get("message"))
                .and_then(Value::as_str)
                .unwrap_or("Waste X Cloud rejected this Driver / Vehicle change.");
            let detail = format!("PERMANENT:HTTP {status}:{message}");
            mark_queue(
                &connection,
                &mutation_id,
                "FAILED",
                Some(&detail),
                false,
            )?;
            warning = Some(
                "One Driver / Vehicle change needs review. Its encrypted local copy was preserved."
                    .to_string(),
            );
            break;
        }

        let snapshot = canonical_snapshot_from_cloud(&body)?;
        mark_queue(&connection, &mutation_id, "SYNCED", None, false)?;
        last_canonical_snapshot = Some(snapshot);
        synced_now += 1;
    }

    let (pending, failed) = queue_counts(&connection)?;
    if pending == 0 && failed == 0 {
        if let Some(snapshot) = last_canonical_snapshot.as_ref() {
            apply_transport_snapshot(&connection, &organisation_id, snapshot)?;
        }
    }

    Ok(TransportMutationSyncResult {
        ok: true,
        synced_now,
        pending,
        failed,
        warning,
    })
}
