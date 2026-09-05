use keyring::Entry;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::offline_auth::{self, DesktopAuthState};

const DB_FILE_NAME: &str = "waste-x-local.db";
const DATABASE_KEYRING_SERVICE: &str = "com.wastex.desktop.local-database";
const DATABASE_KEYRING_ACCOUNT: &str = "database-key-v1";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VehicleTareInput {
    vehicle_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VehicleTareResult {
    vehicle_id: String,
    tare_weight_kg: Option<f64>,
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
pub fn desktop_vehicle_tare(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
    input: VehicleTareInput,
) -> Result<VehicleTareResult, String> {
    offline_auth::require_unlocked(&auth_state)?;
    let connection = open_local_connection(&app)?;
    let vehicle_id = input.vehicle_id.trim();
    if vehicle_id.is_empty() {
        return Err("Choose a vehicle before loading its stored tare.".to_string());
    }

    /*
     * Vehicle master-data tare is stored in kilograms in Cloud and the full
     * vehicle row is cached inside local_vehicle.payload_json during bootstrap.
     * Reading it from the encrypted local copy keeps weighbridge operation
     * available when Cloud is unavailable.
     */
    let tare_text: Option<Option<String>> = connection
        .query_row(
            "SELECT CAST(json_extract(v.payload_json, '$.tareWeightKg') AS TEXT)
             FROM local_vehicle v
             INNER JOIN local_device_configuration d
               ON d.singleton_id = 1
              AND d.organisation_id = v.organisation_id
             WHERE v.id = ?1
               AND v.active = 1
             LIMIT 1",
            params![vehicle_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let tare_text = tare_text.ok_or_else(|| {
        "The selected vehicle is not available in this Desktop's encrypted working set.".to_string()
    })?;

    let tare_weight_kg = match tare_text {
        Some(value) if !value.trim().is_empty() => {
            let parsed = value
                .parse::<f64>()
                .map_err(|_| "The selected vehicle has an invalid stored tare weight.".to_string())?;
            if !parsed.is_finite() || parsed < 0.0 {
                return Err("The selected vehicle has an invalid stored tare weight.".to_string());
            }
            Some(parsed)
        }
        _ => None,
    };

    Ok(VehicleTareResult {
        vehicle_id: vehicle_id.to_string(),
        tare_weight_kg,
    })
}
