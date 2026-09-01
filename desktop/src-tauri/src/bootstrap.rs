use std::collections::HashMap;

use keyring::Entry;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

const DB_FILE_NAME: &str = "waste-x-local.db";
const KEYRING_SERVICE: &str = "com.wastex.desktop.local-database";
const KEYRING_ACCOUNT: &str = "database-key-v1";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPersistResult {
    organisation_id: String,
    generated_at: String,
    sync_cursor: String,
    jobs_written: usize,
    jobs_protected: usize,
    job_loads_written: usize,
    job_loads_protected: usize,
    sites: usize,
    users: usize,
    drivers: usize,
    vehicles: usize,
    counterparties: usize,
    permits: usize,
    ewcs: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalOperationalSummary {
    organisation_id: Option<String>,
    sync_cursor: Option<String>,
    last_bootstrap_at: Option<String>,
    jobs: i64,
    job_loads: i64,
    pending_sync_events: i64,
    conflicts: i64,
}

fn open_local_connection(app: &AppHandle) -> Result<Connection, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve Waste X application data directory: {e}"))?;
    let path = app_data_dir.join(DB_FILE_NAME);

    let entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
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

fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

fn required_text(value: &Value, key: &str) -> Result<String, String> {
    text(value, key)
        .filter(|value| !value.trim().is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| format!("Bootstrap record is missing required field '{key}'."))
}

fn optional_scalar(value: &Value, key: &str) -> Option<String> {
    match value.get(key) {
        Some(Value::String(value)) => Some(value.clone()),
        Some(Value::Number(value)) => Some(value.to_string()),
        Some(Value::Bool(value)) => Some(value.to_string()),
        _ => None,
    }
}

fn bool_int(value: &Value, key: &str, default: bool) -> i64 {
    value.get(key).and_then(Value::as_bool).unwrap_or(default) as i64
}

fn payload_json(value: &Value) -> Result<String, String> {
    serde_json::to_string(value).map_err(|e| format!("Could not encode bootstrap record: {e}"))
}

fn array<'a>(bootstrap: &'a Value, key: &str) -> Result<&'a Vec<Value>, String> {
    bootstrap
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("Bootstrap payload is missing array '{key}'."))
}

fn version_map(bootstrap: &Value) -> HashMap<(String, String), i64> {
    let mut versions = HashMap::new();
    if let Some(rows) = bootstrap.get("entityVersions").and_then(Value::as_array) {
        for row in rows {
            let Some(entity_type) = text(row, "entityType") else { continue };
            let Some(entity_id) = text(row, "entityId") else { continue };
            let Some(version) = row.get("version").and_then(Value::as_i64) else { continue };
            versions.insert((entity_type.to_owned(), entity_id.to_owned()), version);
        }
    }
    versions
}

fn has_unsynced_local_change(
    transaction: &Transaction<'_>,
    entity_type: &str,
    entity_id: &str,
) -> Result<bool, String> {
    let found: Option<i64> = transaction
        .query_row(
            "SELECT 1
             FROM local_sync_queue
             WHERE entity_type = ?1
               AND entity_id = ?2
               AND status IN ('PENDING','SENDING','CONFLICT','FAILED')
             LIMIT 1",
            params![entity_type, entity_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(found.is_some())
}

fn upsert_metadata(transaction: &Transaction<'_>, key: &str, value: &str) -> Result<(), String> {
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

#[tauri::command]
pub fn local_db_apply_bootstrap(app: AppHandle, bootstrap: Value) -> Result<BootstrapPersistResult, String> {
    if bootstrap.get("schemaVersion").and_then(Value::as_i64) != Some(1) {
        return Err("Unsupported Waste X bootstrap schema version.".to_string());
    }

    let generated_at = required_text(&bootstrap, "generatedAt")?;
    let organisation = bootstrap
        .get("organisation")
        .filter(|value| value.is_object())
        .ok_or_else(|| "Bootstrap payload does not contain an organisation.".to_string())?;
    let organisation_id = required_text(organisation, "id")?;
    let sync_cursor = text(&bootstrap, "syncCursor").unwrap_or("0").to_string();
    let versions = version_map(&bootstrap);

    let sites = array(&bootstrap, "sites")?;
    let users = array(&bootstrap, "users")?;
    let jobs = array(&bootstrap, "jobs")?;
    let job_loads = array(&bootstrap, "jobLoads")?;
    let drivers = array(&bootstrap, "drivers")?;
    let vehicles = array(&bootstrap, "vehicles")?;
    let counterparties = array(&bootstrap, "counterparties")?;
    let counterparty_roles = array(&bootstrap, "counterpartyRoles")?;
    let counterparty_sites = array(&bootstrap, "counterpartySites")?;
    let authorisations = array(&bootstrap, "counterpartySiteAuthorisations")?;
    let counterparty_site_ewcs = array(&bootstrap, "counterpartySiteEwcCodes")?;
    let ewcs = array(&bootstrap, "ewcCodes")?;
    let permits = array(&bootstrap, "permits")?;
    let permit_ewcs = array(&bootstrap, "permitEwcCodes")?;

    let mut connection = open_local_connection(&app)?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;

    transaction
        .execute(
            "INSERT INTO local_organisation (id, payload_json, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at",
            params![organisation_id, payload_json(organisation)?, generated_at],
        )
        .map_err(|e| e.to_string())?;

    // Cloud owns the current reference-data view. Replacing these caches is safe;
    // operational jobs/loads are handled separately so pending local work survives.
    for table in [
        "local_site",
        "local_user",
        "local_driver",
        "local_vehicle",
        "local_haulier",
        "local_counterparty_role",
        "local_counterparty_site_ewc",
        "local_counterparty_site_authorisation",
        "local_counterparty_site",
        "local_counterparty",
        "local_permit_ewc_snapshot",
        "local_permit",
    ] {
        transaction
            .execute(&format!("DELETE FROM {table} WHERE organisation_id = ?1"), params![organisation_id])
            .map_err(|e| e.to_string())?;
    }
    transaction.execute("DELETE FROM local_ewc", []).map_err(|e| e.to_string())?;

    for row in sites {
        transaction.execute(
            "INSERT INTO local_site (id, organisation_id, name, status, payload_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![required_text(row, "id")?, organisation_id, text(row, "name"), text(row, "status"), payload_json(row)?, generated_at],
        ).map_err(|e| e.to_string())?;
    }

    for row in users {
        transaction.execute(
            "INSERT INTO local_user (id, organisation_id, role, active, payload_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![required_text(row, "id")?, organisation_id, text(row, "role"), bool_int(row, "isActive", true), payload_json(row)?, generated_at],
        ).map_err(|e| e.to_string())?;
    }

    for row in drivers {
        transaction.execute(
            "INSERT INTO local_driver (id, organisation_id, haulier_counterparty_id, active, payload_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![required_text(row, "id")?, organisation_id, text(row, "haulierCounterpartyId"), bool_int(row, "isActive", true), payload_json(row)?, generated_at],
        ).map_err(|e| e.to_string())?;
    }

    for row in vehicles {
        transaction.execute(
            "INSERT INTO local_vehicle (id, organisation_id, haulier_counterparty_id, active, payload_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![required_text(row, "id")?, organisation_id, text(row, "haulierCounterpartyId"), bool_int(row, "isActive", true), payload_json(row)?, generated_at],
        ).map_err(|e| e.to_string())?;
    }

    let mut counterparty_by_id: HashMap<String, &Value> = HashMap::new();
    for row in counterparties {
        let id = required_text(row, "id")?;
        counterparty_by_id.insert(id.clone(), row);
        transaction.execute(
            "INSERT INTO local_counterparty (id, organisation_id, active, payload_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, organisation_id, bool_int(row, "isActive", true), payload_json(row)?, generated_at],
        ).map_err(|e| e.to_string())?;
    }

    for row in counterparty_roles {
        let counterparty_id = required_text(row, "counterpartyId")?;
        let role = required_text(row, "role")?;
        let entity_id = format!("{counterparty_id}:{role}");
        transaction.execute(
            "INSERT INTO local_counterparty_role (entity_id, organisation_id, counterparty_id, role, payload_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![entity_id, organisation_id, counterparty_id, role, payload_json(row)?, generated_at],
        ).map_err(|e| e.to_string())?;

        if role == "haulier" {
            if let Some(counterparty) = counterparty_by_id.get(&counterparty_id) {
                transaction.execute(
                    "INSERT INTO local_haulier (counterparty_id, organisation_id, payload_json, updated_at)
                     VALUES (?1, ?2, ?3, ?4)",
                    params![counterparty_id, organisation_id, payload_json(counterparty)?, generated_at],
                ).map_err(|e| e.to_string())?;
            }
        }
    }

    for row in counterparty_sites {
        transaction.execute(
            "INSERT INTO local_counterparty_site (id, organisation_id, counterparty_id, site_type, active, payload_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![required_text(row, "id")?, organisation_id, required_text(row, "counterpartyId")?, text(row, "siteType"), bool_int(row, "isActive", true), payload_json(row)?, generated_at],
        ).map_err(|e| e.to_string())?;
    }

    for row in authorisations {
        transaction.execute(
            "INSERT INTO local_counterparty_site_authorisation (id, organisation_id, counterparty_site_id, status, payload_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![required_text(row, "id")?, organisation_id, required_text(row, "counterpartySiteId")?, text(row, "status"), payload_json(row)?, generated_at],
        ).map_err(|e| e.to_string())?;
    }

    for row in counterparty_site_ewcs {
        let authorisation_id = required_text(row, "authorisationId")?;
        let ewc_code_id = required_text(row, "ewcCodeId")?;
        transaction.execute(
            "INSERT INTO local_counterparty_site_ewc (entity_id, organisation_id, authorisation_id, ewc_code_id, active, payload_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![format!("{authorisation_id}:{ewc_code_id}"), organisation_id, authorisation_id, ewc_code_id, bool_int(row, "isActive", true), payload_json(row)?, generated_at],
        ).map_err(|e| e.to_string())?;
    }

    for row in ewcs {
        transaction.execute(
            "INSERT INTO local_ewc (id, code, active, payload_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![required_text(row, "id")?, text(row, "code"), bool_int(row, "isActive", true), payload_json(row)?, generated_at],
        ).map_err(|e| e.to_string())?;
    }

    for row in permits {
        transaction.execute(
            "INSERT INTO local_permit (id, organisation_id, site_id, status, payload_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![required_text(row, "id")?, organisation_id, required_text(row, "siteId")?, text(row, "status"), payload_json(row)?, generated_at],
        ).map_err(|e| e.to_string())?;
    }

    for row in permit_ewcs {
        let permit_id = required_text(row, "permitId")?;
        let ewc_code_id = required_text(row, "ewcCodeId")?;
        transaction.execute(
            "INSERT INTO local_permit_ewc_snapshot (entity_id, organisation_id, permit_id, ewc_code_id, active, payload_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![format!("{permit_id}:{ewc_code_id}"), organisation_id, permit_id, ewc_code_id, bool_int(row, "isActive", true), payload_json(row)?, generated_at],
        ).map_err(|e| e.to_string())?;
    }

    let mut jobs_written = 0_usize;
    let mut jobs_protected = 0_usize;
    for row in jobs {
        let id = required_text(row, "id")?;
        if has_unsynced_local_change(&transaction, "job", &id)? {
            jobs_protected += 1;
            continue;
        }
        let version = versions.get(&("job".to_string(), id.clone())).copied().unwrap_or(0);
        transaction.execute(
            "INSERT INTO local_job (id, organisation_id, own_site_id, job_number, job_date, direction, status, entity_version, payload_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
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
            params![id, organisation_id, text(row, "ownSiteId"), text(row, "jobNumber"), optional_scalar(row, "jobDate"), text(row, "direction"), text(row, "status"), version, payload_json(row)?, generated_at],
        ).map_err(|e| e.to_string())?;
        jobs_written += 1;
    }

    let mut job_loads_written = 0_usize;
    let mut job_loads_protected = 0_usize;
    for row in job_loads {
        let id = required_text(row, "id")?;
        if has_unsynced_local_change(&transaction, "job_load", &id)? {
            job_loads_protected += 1;
            continue;
        }
        let version = versions.get(&("job_load".to_string(), id.clone())).copied().unwrap_or(0);
        transaction.execute(
            "INSERT INTO local_job_load (id, organisation_id, job_id, own_site_id, load_number, direction, status, gross_weight, tare_weight, net_weight, entity_version, payload_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
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
            params![id, organisation_id, required_text(row, "jobId")?, text(row, "ownSiteId"), row.get("loadNumber").and_then(Value::as_i64), text(row, "direction"), text(row, "status"), optional_scalar(row, "grossWeight"), optional_scalar(row, "tareWeight"), optional_scalar(row, "netWeight"), version, payload_json(row)?, generated_at],
        ).map_err(|e| e.to_string())?;
        job_loads_written += 1;
    }

    upsert_metadata(&transaction, "organisation_id", &organisation_id)?;
    upsert_metadata(&transaction, "sync_cursor", &sync_cursor)?;
    upsert_metadata(&transaction, "last_bootstrap_at", &generated_at)?;
    if let Some(working_set) = bootstrap.get("workingSet") {
        if let Some(value) = text(working_set, "horizonStart") {
            upsert_metadata(&transaction, "bootstrap_horizon_start", value)?;
        }
        if let Some(value) = text(working_set, "horizonEnd") {
            upsert_metadata(&transaction, "bootstrap_horizon_end", value)?;
        }
        if let Some(value) = working_set.get("forwardDays").and_then(Value::as_i64) {
            upsert_metadata(&transaction, "bootstrap_forward_days", &value.to_string())?;
        }
    }

    transaction.execute(
        "INSERT INTO local_audit_event (action, entity_type, entity_id, payload_json, created_at)
         VALUES ('BOOTSTRAP_APPLIED', 'organisation', ?1, ?2, ?3)",
        params![organisation_id, serde_json::json!({
            "syncCursor": sync_cursor,
            "jobsWritten": jobs_written,
            "jobsProtected": jobs_protected,
            "jobLoadsWritten": job_loads_written,
            "jobLoadsProtected": job_loads_protected
        }).to_string(), generated_at],
    ).map_err(|e| e.to_string())?;

    transaction.commit().map_err(|e| e.to_string())?;

    Ok(BootstrapPersistResult {
        organisation_id,
        generated_at,
        sync_cursor,
        jobs_written,
        jobs_protected,
        job_loads_written,
        job_loads_protected,
        sites: sites.len(),
        users: users.len(),
        drivers: drivers.len(),
        vehicles: vehicles.len(),
        counterparties: counterparties.len(),
        permits: permits.len(),
        ewcs: ewcs.len(),
    })
}

#[tauri::command]
pub fn local_db_operational_summary(app: AppHandle) -> Result<LocalOperationalSummary, String> {
    let connection = open_local_connection(&app)?;

    let metadata = |key: &str| -> Result<Option<String>, String> {
        connection
            .query_row(
                "SELECT value FROM local_sync_metadata WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())
    };

    let count = |sql: &str| -> Result<i64, String> {
        connection.query_row(sql, [], |row| row.get(0)).map_err(|e| e.to_string())
    };

    Ok(LocalOperationalSummary {
        organisation_id: metadata("organisation_id")?,
        sync_cursor: metadata("sync_cursor")?,
        last_bootstrap_at: metadata("last_bootstrap_at")?,
        jobs: count("SELECT COUNT(*) FROM local_job")?,
        job_loads: count("SELECT COUNT(*) FROM local_job_load")?,
        pending_sync_events: count("SELECT COUNT(*) FROM local_sync_queue WHERE status IN ('PENDING','SENDING','FAILED')")?,
        conflicts: count("SELECT COUNT(*) FROM local_sync_queue WHERE status = 'CONFLICT'")?,
    })
}
