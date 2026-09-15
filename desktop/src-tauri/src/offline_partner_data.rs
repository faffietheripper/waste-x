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
const PARTNER_MASTER_SNAPSHOT_KEY: &str = "desktop_partner_master_snapshot_v1";
const TRANSPORT_MASTER_SNAPSHOT_KEY: &str = "desktop_transport_master_snapshot_v1";
const JOB_OPTIONS_SNAPSHOT_KEY: &str = "desktop_job_options_snapshot_v1";
const FACILITY_ARCHIVE_CACHE_KEY: &str = "desktop_offline_facility_archive_cache_v1";

/* WASTE_X_DESKTOP_OFFLINE_PARTNER_MUTATIONS_V1 */

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloudCredentials {
    device_secret: String,
    session_token: String,
    session_expires_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartnerMutationSyncResult {
    ok: bool,
    synced_now: usize,
    pending: i64,
    failed: i64,
    warning: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum DependencyState {
    Ready,
    Pending,
    Failed,
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

fn now_iso(connection: &Connection) -> Result<String, String> {
    connection
        .query_row(
            "SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
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
    text(value, key).ok_or_else(|| format!("Waste X partner change is missing {key}."))
}

fn array<'a>(value: &'a Value, key: &str) -> Result<&'a Vec<Value>, String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("Cached partner master data is missing {key}."))
}

fn array_mut<'a>(value: &'a mut Value, key: &str) -> Result<&'a mut Vec<Value>, String> {
    value
        .get_mut(key)
        .and_then(Value::as_array_mut)
        .ok_or_else(|| format!("Cached partner master data is missing {key}."))
}

fn record_id(value: &Value) -> Option<&str> {
    value.get("id").and_then(Value::as_str)
}

fn set_field(record: &mut Value, key: &str, value: Value) -> Result<(), String> {
    record
        .as_object_mut()
        .ok_or_else(|| "Cached Waste X partner record is invalid.".to_string())?
        .insert(key.to_string(), value);
    Ok(())
}

fn optional_json(value: Option<String>) -> Value {
    value.map(Value::String).unwrap_or(Value::Null)
}

fn bool_field(value: &Value, key: &str, fallback: bool) -> bool {
    value.get(key).and_then(Value::as_bool).unwrap_or(fallback)
}

fn normalise_postcode(value: Option<String>) -> Option<String> {
    value.map(|value| value.to_uppercase())
}

fn normalise_carrier_number(value: Option<String>) -> Option<String> {
    value.map(|value| {
        value
            .chars()
            .filter(|character| !character.is_whitespace())
            .flat_map(char::to_uppercase)
            .collect()
    })
}

fn roles(record: &Value) -> Vec<String> {
    record
        .get("roles")
        .and_then(Value::as_array)
        .map(|rows| {
            rows.iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn roles_value(values: &[String]) -> Value {
    Value::Array(values.iter().cloned().map(Value::String).collect())
}

fn company_records(snapshot: &Value) -> Result<Vec<Value>, String> {
    let mut output: Vec<Value> = Vec::new();
    for key in ["hauliers", "sourceCompanies", "destinationCompanies"] {
        for row in array(snapshot, key)? {
            if let Some(id) = record_id(row) {
                if let Some(existing) = output
                    .iter_mut()
                    .find(|candidate| record_id(candidate) == Some(id))
                {
                    let mut merged_roles = roles(existing);
                    for role in roles(row) {
                        if !merged_roles.contains(&role) {
                            merged_roles.push(role);
                        }
                    }
                    set_field(existing, "roles", roles_value(&merged_roles))?;
                    continue;
                }
                output.push(row.clone());
            }
        }
    }
    Ok(output)
}

fn company_by_id(snapshot: &Value, id: &str) -> Result<Option<Value>, String> {
    Ok(company_records(snapshot)?
        .into_iter()
        .find(|row| record_id(row) == Some(id)))
}

fn company_by_name(snapshot: &Value, name: &str) -> Result<Option<Value>, String> {
    let needle = name.trim().to_lowercase();
    Ok(company_records(snapshot)?
        .into_iter()
        .find(|row| {
            text(row, "name")
                .map(|value| value.to_lowercase())
                .as_deref()
                == Some(needle.as_str())
        }))
}

fn duplicate_company_name(snapshot: &Value, id: &str, name: &str) -> Result<bool, String> {
    let needle = name.trim().to_lowercase();
    Ok(company_records(snapshot)?.iter().any(|row| {
        record_id(row) != Some(id)
            && text(row, "name")
                .map(|value| value.to_lowercase())
                .as_deref()
                == Some(needle.as_str())
    }))
}

fn replace_or_insert_by_id(
    rows: &mut Vec<Value>,
    record: &Value,
    include: bool,
) -> Result<(), String> {
    let id = required_text(record, "id")?;
    if let Some(index) = rows
        .iter()
        .position(|row| record_id(row) == Some(id.as_str()))
    {
        if include {
            rows[index] = record.clone();
        } else {
            rows.remove(index);
        }
    } else if include {
        rows.push(record.clone());
    }
    Ok(())
}

fn sort_companies(rows: &mut [Value]) {
    rows.sort_by_key(|row| text(row, "name").unwrap_or_default().to_lowercase());
}

fn sync_company_arrays(snapshot: &mut Value, record: &Value) -> Result<(), String> {
    let record_roles = roles(record);
    let is_haulier = record_roles.iter().any(|role| role == "haulier");
    let is_source = record_roles.iter().any(|role| role == "client");
    let is_destination = record_roles
        .iter()
        .any(|role| role == "receiver" || role == "third_party_tip");

    {
        let rows = array_mut(snapshot, "hauliers")?;
        replace_or_insert_by_id(rows, record, is_haulier)?;
        sort_companies(rows);
    }
    {
        let rows = array_mut(snapshot, "sourceCompanies")?;
        replace_or_insert_by_id(rows, record, is_source)?;
        sort_companies(rows);
    }
    {
        let rows = array_mut(snapshot, "destinationCompanies")?;
        replace_or_insert_by_id(rows, record, is_destination)?;
        sort_companies(rows);
    }
    Ok(())
}

fn upsert_counterparty_local(
    connection: &Connection,
    organisation_id: &str,
    record: &Value,
) -> Result<(), String> {
    let id = required_text(record, "id")?;
    let active = bool_field(record, "isActive", true) as i64;

    connection
        .execute(
            "INSERT INTO local_counterparty (
               id, organisation_id, active, payload_json, updated_at
             ) VALUES (?1, ?2, ?3, ?4, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               organisation_id = excluded.organisation_id,
               active = excluded.active,
               payload_json = excluded.payload_json,
               updated_at = excluded.updated_at",
            params![id, organisation_id, active, record.to_string()],
        )
        .map_err(|e| e.to_string())?;

    connection
        .execute(
            "DELETE FROM local_counterparty_role
             WHERE organisation_id = ?1 AND counterparty_id = ?2",
            params![organisation_id, id],
        )
        .map_err(|e| e.to_string())?;

    let record_roles = roles(record);
    for role in &record_roles {
        let entity_id = format!("{id}:{role}");
        connection
            .execute(
                "INSERT INTO local_counterparty_role (
                   entity_id, organisation_id, counterparty_id, role, payload_json, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
                 ON CONFLICT(entity_id) DO UPDATE SET
                   organisation_id = excluded.organisation_id,
                   counterparty_id = excluded.counterparty_id,
                   role = excluded.role,
                   payload_json = excluded.payload_json,
                   updated_at = excluded.updated_at",
                params![
                    entity_id,
                    organisation_id,
                    id,
                    role,
                    json!({"counterpartyId": id, "role": role}).to_string()
                ],
            )
            .map_err(|e| e.to_string())?;
    }

    if record_roles.iter().any(|role| role == "haulier") {
        connection
            .execute(
                "INSERT INTO local_haulier (
                   counterparty_id, organisation_id, payload_json, updated_at
                 ) VALUES (?1, ?2, ?3, datetime('now'))
                 ON CONFLICT(counterparty_id) DO UPDATE SET
                   organisation_id = excluded.organisation_id,
                   payload_json = excluded.payload_json,
                   updated_at = excluded.updated_at",
                params![id, organisation_id, record.to_string()],
            )
            .map_err(|e| e.to_string())?;
    } else {
        connection
            .execute(
                "DELETE FROM local_haulier
                 WHERE organisation_id = ?1 AND counterparty_id = ?2",
                params![organisation_id, id],
            )
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn upsert_site_local(
    connection: &Connection,
    organisation_id: &str,
    record: &Value,
) -> Result<(), String> {
    let id = required_text(record, "id")?;
    let counterparty_id = required_text(record, "counterpartyId")?;
    let site_type = text(record, "siteType");
    let active = bool_field(record, "isActive", true) as i64;

    connection
        .execute(
            "INSERT INTO local_counterparty_site (
               id, organisation_id, counterparty_id, site_type, active, payload_json, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
               organisation_id = excluded.organisation_id,
               counterparty_id = excluded.counterparty_id,
               site_type = excluded.site_type,
               active = excluded.active,
               payload_json = excluded.payload_json,
               updated_at = excluded.updated_at",
            params![
                id,
                organisation_id,
                counterparty_id,
                site_type,
                active,
                record.to_string()
            ],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn upsert_driver_local(
    connection: &Connection,
    organisation_id: &str,
    record: &Value,
) -> Result<(), String> {
    let id = required_text(record, "id")?;
    let haulier = text(record, "haulierCounterpartyId");
    let active = bool_field(record, "isActive", true) as i64;
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
    let active = bool_field(record, "isActive", true) as i64;
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

fn pending_reference(
    connection: &Connection,
    mutation_kind: &str,
    entity_id: &str,
) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT status
             FROM local_cloud_mutation_queue
             WHERE mutation_kind = ?1
               AND entity_id = ?2
             ORDER BY created_at DESC, mutation_id DESC
             LIMIT 1",
            params![mutation_kind, entity_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())
}

fn dependent_job_exists(
    connection: &Connection,
    json_key: &str,
    entity_id: &str,
) -> Result<bool, String> {
    let path = format!("$.{json_key}");
    connection
        .query_row(
            "SELECT 1
             FROM local_cloud_mutation_queue
             WHERE mutation_kind = 'job'
               AND status IN ('PENDING','SENDING','FAILED')
               AND json_extract(payload_json, ?1) = ?2
             LIMIT 1",
            params![path, entity_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map(|value| value.is_some())
        .map_err(|e| e.to_string())
}

fn dependent_transport_exists(connection: &Connection, haulier_id: &str) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT 1
             FROM local_cloud_mutation_queue
             WHERE mutation_kind = 'transport'
               AND status IN ('PENDING','SENDING','FAILED')
               AND json_extract(payload_json, '$.data.haulierCounterpartyId') = ?1
             LIMIT 1",
            params![haulier_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map(|value| value.is_some())
        .map_err(|e| e.to_string())
}

fn assert_haulier_archive_safe(connection: &Connection, haulier_id: &str) -> Result<(), String> {
    if dependent_transport_exists(connection, haulier_id)?
        || dependent_job_exists(connection, "haulierId", haulier_id)?
    {
        return Err(
            "This haulier is referenced by unsynced local work. Sync or review that work before archiving the haulier."
                .to_string(),
        );
    }
    Ok(())
}

fn assert_site_archive_safe(connection: &Connection, site_id: &str) -> Result<(), String> {
    if dependent_job_exists(connection, "clientSiteId", site_id)?
        || dependent_job_exists(connection, "destinationSiteId", site_id)?
    {
        return Err(
            "This site is referenced by an unsynced local Job. Sync or review that Job before archiving the site."
                .to_string(),
        );
    }
    Ok(())
}

fn deactivate_transport_for_haulier(
    connection: &Connection,
    organisation_id: &str,
    haulier_id: &str,
) -> Result<(), String> {
    let Some(mut snapshot) = metadata_json(connection, TRANSPORT_MASTER_SNAPSHOT_KEY)? else {
        return Ok(());
    };

    for key in ["drivers", "vehicles"] {
        let rows = array_mut(&mut snapshot, key)?;
        for row in rows.iter_mut() {
            if text(row, "haulierCounterpartyId").as_deref() == Some(haulier_id) {
                set_field(row, "isActive", Value::Bool(false))?;
                if key == "drivers" {
                    upsert_driver_local(connection, organisation_id, row)?;
                } else {
                    upsert_vehicle_local(connection, organisation_id, row)?;
                }
            }
        }
    }

    write_metadata_json(connection, TRANSPORT_MASTER_SNAPSHOT_KEY, &snapshot)
}

fn sync_transport_hauliers(
    connection: &Connection,
    partner_snapshot: &Value,
) -> Result<(), String> {
    let Some(mut transport) = metadata_json(connection, TRANSPORT_MASTER_SNAPSHOT_KEY)? else {
        return Ok(());
    };

    let hauliers = array(partner_snapshot, "hauliers")?
        .iter()
        .map(|row| {
            json!({
                "id": row.get("id").cloned().unwrap_or(Value::Null),
                "name": row.get("name").cloned().unwrap_or(Value::Null),
                "carrierRegistrationNumber": row.get("carrierRegistrationNumber").cloned().unwrap_or(Value::Null),
                "isActive": row.get("isActive").cloned().unwrap_or(Value::Bool(true))
            })
        })
        .collect::<Vec<_>>();

    transport
        .as_object_mut()
        .ok_or_else(|| "Cached Driver / Vehicle master data is invalid.".to_string())?
        .insert("hauliers".to_string(), Value::Array(hauliers));

    write_metadata_json(connection, TRANSPORT_MASTER_SNAPSHOT_KEY, &transport)
}

fn facility_cache(connection: &Connection) -> Result<Value, String> {
    Ok(metadata_json(connection, FACILITY_ARCHIVE_CACHE_KEY)?
        .unwrap_or_else(|| json!({})))
}

fn sync_job_options_partners(
    connection: &Connection,
    partner_snapshot: &Value,
) -> Result<(), String> {
    let Some(mut options) = metadata_json(connection, JOB_OPTIONS_SNAPSHOT_KEY)? else {
        return Ok(());
    };

    let active_sources = array(partner_snapshot, "sourceCompanies")?
        .iter()
        .filter(|row| bool_field(row, "isActive", true))
        .cloned()
        .collect::<Vec<_>>();
    let active_source_ids = active_sources
        .iter()
        .filter_map(|row| text(row, "id"))
        .collect::<Vec<_>>();

    let clients = active_sources
        .iter()
        .map(|row| {
            json!({
                "id": row.get("id").cloned().unwrap_or(Value::Null),
                "name": row.get("name").cloned().unwrap_or(Value::Null),
                "accountReference": row.get("accountReference").cloned().unwrap_or(Value::Null)
            })
        })
        .collect::<Vec<_>>();

    let client_sites = array(partner_snapshot, "sites")?
        .iter()
        .filter(|row| {
            bool_field(row, "isActive", true)
                && text(row, "kind").as_deref() == Some("source")
                && text(row, "counterpartyId")
                    .map(|id| active_source_ids.contains(&id))
                    .unwrap_or(false)
        })
        .map(|row| {
            json!({
                "id": row.get("id").cloned().unwrap_or(Value::Null),
                "counterpartyId": row.get("counterpartyId").cloned().unwrap_or(Value::Null),
                "name": row.get("name").cloned().unwrap_or(Value::Null),
                "fullAddress": row.get("fullAddress").cloned().unwrap_or(Value::Null),
                "postcode": row.get("postcode").cloned().unwrap_or(Value::Null),
                "isDefault": row.get("isDefault").cloned().unwrap_or(Value::Bool(false))
            })
        })
        .collect::<Vec<_>>();

    let hauliers = array(partner_snapshot, "hauliers")?
        .iter()
        .filter(|row| bool_field(row, "isActive", true))
        .map(|row| {
            json!({
                "id": row.get("id").cloned().unwrap_or(Value::Null),
                "name": row.get("name").cloned().unwrap_or(Value::Null),
                "carrierRegistrationNumber": row.get("carrierRegistrationNumber").cloned().unwrap_or(Value::Null)
            })
        })
        .collect::<Vec<_>>();

    let companies = company_records(partner_snapshot)?;
    let sites = array(partner_snapshot, "sites")?;
    let mut archived_facilities = facility_cache(connection)?;
    let archived_object = archived_facilities
        .as_object_mut()
        .ok_or_else(|| "Cached Waste X destination archive is invalid.".to_string())?;

    let existing_facilities = options
        .get("facilities")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut facilities = Vec::new();

    for mut facility in existing_facilities {
        let Some(id) = text(&facility, "id") else {
            continue;
        };

        let partner_site = sites.iter().find(|row| record_id(row) == Some(id.as_str()));
        let Some(site) = partner_site else {
            facilities.push(facility);
            continue;
        };

        let active_destination =
            bool_field(site, "isActive", true) && text(site, "kind").as_deref() == Some("destination");

        if !active_destination {
            archived_object.insert(id, facility);
            continue;
        }

        if let Some(object) = facility.as_object_mut() {
            object.insert(
                "name".to_string(),
                site.get("name").cloned().unwrap_or(Value::Null),
            );
            object.insert(
                "postcode".to_string(),
                site.get("postcode").cloned().unwrap_or(Value::Null),
            );
            object.insert(
                "fullAddress".to_string(),
                site.get("fullAddress").cloned().unwrap_or(Value::Null),
            );
            if let Some(counterparty_id) = text(site, "counterpartyId") {
                let operator_name = companies
                    .iter()
                    .find(|company| record_id(company) == Some(counterparty_id.as_str()))
                    .and_then(|company| text(company, "name"));
                object.insert(
                    "operatorName".to_string(),
                    optional_json(operator_name),
                );
            }
        }
        facilities.push(facility);
    }

    for site in sites {
        if !bool_field(site, "isActive", true)
            || text(site, "kind").as_deref() != Some("destination")
        {
            continue;
        }
        let Some(site_id) = text(site, "id") else {
            continue;
        };
        if facilities
            .iter()
            .any(|facility| record_id(facility) == Some(site_id.as_str()))
        {
            continue;
        }

        if let Some(mut cached) = archived_object.remove(&site_id) {
            if let Some(object) = cached.as_object_mut() {
                object.insert(
                    "name".to_string(),
                    site.get("name").cloned().unwrap_or(Value::Null),
                );
                object.insert(
                    "postcode".to_string(),
                    site.get("postcode").cloned().unwrap_or(Value::Null),
                );
                object.insert(
                    "fullAddress".to_string(),
                    site.get("fullAddress").cloned().unwrap_or(Value::Null),
                );
            }
            facilities.push(cached);
        }
        // A brand-new destination created offline intentionally does not become
        // bookable until Web/Cloud supplies its authorisation + permitted EWC set.
    }

    let object = options
        .as_object_mut()
        .ok_or_else(|| "Cached Waste X Job options are invalid.".to_string())?;
    object.insert("clients".to_string(), Value::Array(clients));
    object.insert("clientSites".to_string(), Value::Array(client_sites));
    object.insert("hauliers".to_string(), Value::Array(hauliers));
    object.insert("facilities".to_string(), Value::Array(facilities));

    write_metadata_json(connection, FACILITY_ARCHIVE_CACHE_KEY, &archived_facilities)?;
    write_metadata_json(connection, JOB_OPTIONS_SNAPSHOT_KEY, &options)
}

fn sync_reference_snapshots(
    connection: &Connection,
    partner_snapshot: &Value,
) -> Result<(), String> {
    sync_transport_hauliers(connection, partner_snapshot)?;
    sync_job_options_partners(connection, partner_snapshot)
}

fn partner_data(snapshot: &Value) -> Result<Value, String> {
    Ok(json!({
        "hauliers": array(snapshot, "hauliers")?.clone(),
        "sourceCompanies": array(snapshot, "sourceCompanies")?.clone(),
        "destinationCompanies": array(snapshot, "destinationCompanies")?.clone(),
        "sites": array(snapshot, "sites")?.clone()
    }))
}

fn make_company_record(
    id: String,
    data: &Value,
    record_roles: Vec<String>,
    now: &str,
) -> Result<Value, String> {
    Ok(json!({
        "id": id,
        "name": required_text(data, "name")?,
        "accountReference": optional_json(text(data, "accountReference")),
        "carrierRegistrationNumber": optional_json(normalise_carrier_number(text(data, "carrierRegistrationNumber"))),
        "email": optional_json(text(data, "email")),
        "telephone": optional_json(text(data, "telephone")),
        "fullAddress": optional_json(text(data, "fullAddress")),
        "postcode": optional_json(normalise_postcode(text(data, "postcode"))),
        "notes": optional_json(text(data, "notes")),
        "isActive": true,
        "roles": record_roles,
        "createdAt": now,
        "updatedAt": now
    }))
}

fn mutate_company_fields(record: &mut Value, data: &Value, now: &str) -> Result<(), String> {
    set_field(record, "name", Value::String(required_text(data, "name")?))?;
    if data.get("accountReference").is_some() {
        set_field(record, "accountReference", optional_json(text(data, "accountReference")))?;
    }
    if data.get("carrierRegistrationNumber").is_some() {
        set_field(
            record,
            "carrierRegistrationNumber",
            optional_json(normalise_carrier_number(text(data, "carrierRegistrationNumber"))),
        )?;
    }
    set_field(record, "email", optional_json(text(data, "email")))?;
    set_field(record, "telephone", optional_json(text(data, "telephone")))?;
    set_field(record, "fullAddress", optional_json(text(data, "fullAddress")))?;
    set_field(
        record,
        "postcode",
        optional_json(normalise_postcode(text(data, "postcode"))),
    )?;
    set_field(record, "notes", optional_json(text(data, "notes")))?;
    set_field(record, "updatedAt", Value::String(now.to_string()))?;
    Ok(())
}

fn merge_create_fields(record: &mut Value, data: &Value, now: &str) -> Result<(), String> {
    if let Some(value) = text(data, "accountReference") {
        set_field(record, "accountReference", Value::String(value))?;
    }
    if data.get("carrierRegistrationNumber").is_some() {
        set_field(
            record,
            "carrierRegistrationNumber",
            optional_json(normalise_carrier_number(text(data, "carrierRegistrationNumber"))),
        )?;
    }
    if let Some(value) = text(data, "email") {
        set_field(record, "email", Value::String(value))?;
    }
    if let Some(value) = text(data, "telephone") {
        set_field(record, "telephone", Value::String(value))?;
    }
    if let Some(value) = text(data, "fullAddress") {
        set_field(record, "fullAddress", Value::String(value))?;
    }
    if let Some(value) = normalise_postcode(text(data, "postcode")) {
        set_field(record, "postcode", Value::String(value))?;
    }
    if let Some(value) = text(data, "notes") {
        set_field(record, "notes", Value::String(value))?;
    }
    set_field(record, "isActive", Value::Bool(true))?;
    set_field(record, "updatedAt", Value::String(now.to_string()))?;
    Ok(())
}

fn apply_haulier_mutation(
    connection: &Connection,
    organisation_id: &str,
    snapshot: &mut Value,
    operation: &str,
    input: &Value,
) -> Result<(String, String), String> {
    if operation == "haulier.archive" || operation == "haulier.restore" {
        let id = required_text(input, "id")?;
        let mut record = company_by_id(snapshot, &id)?
            .ok_or_else(|| "That Haulier is not available in this Desktop working set.".to_string())?;

        if !roles(&record).iter().any(|role| role == "haulier") {
            return Err("That company is not a Haulier.".to_string());
        }

        let restoring = operation == "haulier.restore";
        if !restoring {
            let other_roles = roles(&record)
                .into_iter()
                .filter(|role| role != "haulier")
                .collect::<Vec<_>>();
            if !other_roles.is_empty() {
                return Err(
                    "This company has other Waste X roles and cannot be archived from Hauliers. Manage the shared business record on Web."
                        .to_string(),
                );
            }
            assert_haulier_archive_safe(connection, &id)?;
        }

        set_field(&mut record, "isActive", Value::Bool(restoring))?;
        set_field(&mut record, "updatedAt", Value::String(now_iso(connection)?))?;
        sync_company_arrays(snapshot, &record)?;
        upsert_counterparty_local(connection, organisation_id, &record)?;

        if !restoring {
            deactivate_transport_for_haulier(connection, organisation_id, &id)?;
        }

        return Ok((
            id,
            if restoring { "restored" } else { "archived" }.to_string(),
        ));
    }

    let data = input
        .get("data")
        .ok_or_else(|| "Haulier change is missing data.".to_string())?;
    let id = required_text(data, "id")?;
    let name = required_text(data, "name")?;

    if operation != "haulier.create" && duplicate_company_name(snapshot, &id, &name)? {
        return Err("Another company already uses that name.".to_string());
    }

    let now = now_iso(connection)?;
    let (entity_id, mut record) = if operation == "haulier.create" {
        if company_by_id(snapshot, &id)?.is_some() {
            return Err("That locally generated Haulier id is already in use.".to_string());
        }

        if let Some(mut same_name) = company_by_name(snapshot, &name)? {
            if roles(&same_name).iter().any(|role| role == "haulier") {
                return Err("That Haulier already exists.".to_string());
            }

            let existing_id = required_text(&same_name, "id")?;
            let mut merged_roles = roles(&same_name);
            merged_roles.push("haulier".to_string());
            set_field(&mut same_name, "roles", roles_value(&merged_roles))?;
            merge_create_fields(&mut same_name, data, &now)?;
            (existing_id, same_name)
        } else {
            (
                id.clone(),
                make_company_record(id.clone(), data, vec!["haulier".to_string()], &now)?,
            )
        }
    } else {
        let mut existing = company_by_id(snapshot, &id)?
            .ok_or_else(|| "That Haulier is not available in this Desktop working set.".to_string())?;
        if !roles(&existing).iter().any(|role| role == "haulier") {
            return Err("That company is not a Haulier.".to_string());
        }
        mutate_company_fields(&mut existing, data, &now)?;
        (id.clone(), existing)
    };

    set_field(&mut record, "isActive", Value::Bool(true))?;
    sync_company_arrays(snapshot, &record)?;
    upsert_counterparty_local(connection, organisation_id, &record)?;

    Ok((
        entity_id,
        if operation == "haulier.create" {
            "created"
        } else {
            "updated"
        }
        .to_string(),
    ))
}

fn apply_company_create(
    connection: &Connection,
    organisation_id: &str,
    snapshot: &mut Value,
    input: &Value,
) -> Result<(String, String), String> {
    let data = input
        .get("data")
        .ok_or_else(|| "Company change is missing data.".to_string())?;
    let requested_id = required_text(data, "id")?;
    let name = required_text(data, "name")?;
    let kind = required_text(data, "kind")?;

    if company_by_id(snapshot, &requested_id)?.is_some() {
        return Err("That locally generated company id is already in use.".to_string());
    }

    let required_roles = if kind == "source" {
        vec!["client".to_string()]
    } else if kind == "destination" {
        vec!["receiver".to_string(), "third_party_tip".to_string()]
    } else {
        return Err("Company kind must be source or destination.".to_string());
    };

    let now = now_iso(connection)?;
    let (entity_id, mut record) = if let Some(mut same_name) = company_by_name(snapshot, &name)? {
        let existing_id = required_text(&same_name, "id")?;
        let mut merged_roles = roles(&same_name);
        for role in &required_roles {
            if !merged_roles.contains(role) {
                merged_roles.push(role.clone());
            }
        }
        set_field(&mut same_name, "roles", roles_value(&merged_roles))?;
        merge_create_fields(&mut same_name, data, &now)?;
        (existing_id, same_name)
    } else {
        (
            requested_id.clone(),
            make_company_record(requested_id, data, required_roles, &now)?,
        )
    };

    set_field(&mut record, "isActive", Value::Bool(true))?;
    sync_company_arrays(snapshot, &record)?;
    upsert_counterparty_local(connection, organisation_id, &record)?;
    Ok((entity_id, "created".to_string()))
}

fn company_available_for_site(snapshot: &Value, company_id: &str, kind: &str) -> Result<bool, String> {
    let company = company_by_id(snapshot, company_id)?;
    let Some(company) = company else {
        return Ok(false);
    };
    if !bool_field(&company, "isActive", true) {
        return Ok(false);
    }
    let company_roles = roles(&company);
    Ok(if kind == "source" {
        company_roles.iter().any(|role| role == "client")
    } else {
        company_roles.iter().any(|role| role == "third_party_tip")
    })
}

fn apply_site_mutation(
    connection: &Connection,
    organisation_id: &str,
    snapshot: &mut Value,
    operation: &str,
    input: &Value,
) -> Result<(String, String), String> {
    if operation == "site.archive" || operation == "site.restore" {
        let id = required_text(input, "id")?;
        if operation == "site.archive" {
            assert_site_archive_safe(connection, &id)?;
        }

        let sites = array_mut(snapshot, "sites")?;
        let record = sites
            .iter_mut()
            .find(|row| record_id(row) == Some(id.as_str()))
            .ok_or_else(|| "That Site is not available in this Desktop working set.".to_string())?;
        let active = operation == "site.restore";
        set_field(record, "isActive", Value::Bool(active))?;
        set_field(record, "updatedAt", Value::String(now_iso(connection)?))?;
        upsert_site_local(connection, organisation_id, record)?;

        return Ok((
            id,
            if active { "restored" } else { "archived" }.to_string(),
        ));
    }

    let data = input
        .get("data")
        .ok_or_else(|| "Site change is missing data.".to_string())?;
    let id = required_text(data, "id")?;
    let kind = required_text(data, "kind")?;
    let counterparty_id = required_text(data, "counterpartyId")?;
    let name = required_text(data, "name")?;

    if kind != "source" && kind != "destination" {
        return Err("Site kind must be source or destination.".to_string());
    }
    if !company_available_for_site(snapshot, &counterparty_id, &kind)? {
        return Err(
            if kind == "source" {
                "Choose an active source/client company for this site."
            } else {
                "Choose an active destination operator for this site."
            }
            .to_string(),
        );
    }

    let sites_read = array(snapshot, "sites")?;
    let existing_index = sites_read
        .iter()
        .position(|row| record_id(row) == Some(id.as_str()));

    if operation == "site.create" && existing_index.is_some() {
        return Err("That locally generated Site id is already in use.".to_string());
    }
    if operation == "site.update" && existing_index.is_none() {
        return Err("That Site is not available in this Desktop working set.".to_string());
    }

    let name_key = name.to_lowercase();
    if sites_read.iter().any(|row| {
        record_id(row) != Some(id.as_str())
            && text(row, "counterpartyId").as_deref() == Some(counterparty_id.as_str())
            && text(row, "name")
                .map(|value| value.to_lowercase())
                .as_deref()
                == Some(name_key.as_str())
    }) {
        return Err("That company already has a site with this name.".to_string());
    }

    let site_type = if kind == "destination" {
        "third_party_tip"
    } else {
        "producer_site"
    };
    let now = now_iso(connection)?;

    let mut record = if let Some(index) = existing_index {
        let existing = sites_read[index].clone();
        if text(&existing, "siteType").as_deref() != Some(site_type) {
            return Err(
                "Desktop does not convert source sites into destination facilities. Create a new operational site with the correct type."
                    .to_string(),
            );
        }
        existing
    } else {
        let any_active_for_company = sites_read.iter().any(|row| {
            text(row, "counterpartyId").as_deref() == Some(counterparty_id.as_str())
                && bool_field(row, "isActive", true)
        });
        json!({
            "id": id.clone(),
            "authorisationNumber": null,
            "isDefault": !any_active_for_company,
            "isActive": true,
            "hasActiveAuthorisation": false,
            "authorisationNumbers": [],
            "createdAt": now.clone()
        })
    };

    let company_name = company_by_id(snapshot, &counterparty_id)?
        .and_then(|company| text(&company, "name"))
        .unwrap_or_else(|| "Unknown company".to_string());

    set_field(&mut record, "id", Value::String(id.clone()))?;
    set_field(
        &mut record,
        "counterpartyId",
        Value::String(counterparty_id),
    )?;
    set_field(&mut record, "companyName", Value::String(company_name))?;
    set_field(&mut record, "name", Value::String(name))?;
    set_field(&mut record, "siteType", Value::String(site_type.to_string()))?;
    set_field(&mut record, "kind", Value::String(kind))?;
    set_field(&mut record, "fullAddress", optional_json(text(data, "fullAddress")))?;
    set_field(
        &mut record,
        "postcode",
        optional_json(normalise_postcode(text(data, "postcode"))),
    )?;
    set_field(&mut record, "contactName", optional_json(text(data, "contactName")))?;
    set_field(&mut record, "contactEmail", optional_json(text(data, "contactEmail")))?;
    set_field(
        &mut record,
        "contactTelephone",
        optional_json(text(data, "contactTelephone")),
    )?;
    set_field(&mut record, "notes", optional_json(text(data, "notes")))?;
    set_field(&mut record, "isActive", Value::Bool(true))?;
    set_field(&mut record, "updatedAt", Value::String(now))?;

    {
        let sites = array_mut(snapshot, "sites")?;
        if let Some(index) = existing_index {
            sites[index] = record.clone();
        } else {
            sites.push(record.clone());
        }
        sites.sort_by_key(|row| text(row, "name").unwrap_or_default().to_lowercase());
    }

    upsert_site_local(connection, organisation_id, &record)?;

    Ok((
        id,
        if operation == "site.create" {
            "created"
        } else {
            "updated"
        }
        .to_string(),
    ))
}

fn apply_partner_snapshot(
    connection: &Connection,
    organisation_id: &str,
    snapshot: &Value,
) -> Result<(), String> {
    for company in company_records(snapshot)? {
        upsert_counterparty_local(connection, organisation_id, &company)?;
    }
    for site in array(snapshot, "sites")? {
        upsert_site_local(connection, organisation_id, site)?;
    }

    write_metadata_json(connection, PARTNER_MASTER_SNAPSHOT_KEY, snapshot)?;
    sync_reference_snapshots(connection, snapshot)
}

fn canonical_snapshot_from_cloud(body: &Value) -> Result<Value, String> {
    let data = body
        .get("data")
        .and_then(Value::as_object)
        .ok_or_else(|| "Waste X Cloud partner response is missing master data.".to_string())?;

    Ok(json!({
        "ok": true,
        "hauliers": data.get("hauliers").cloned().unwrap_or_else(|| Value::Array(vec![])),
        "sourceCompanies": data.get("sourceCompanies").cloned().unwrap_or_else(|| Value::Array(vec![])),
        "destinationCompanies": data.get("destinationCompanies").cloned().unwrap_or_else(|| Value::Array(vec![])),
        "sites": data.get("sites").cloned().unwrap_or_else(|| Value::Array(vec![])),
        "boundary": {
            "destinationAuthorisations": "WEB_ONLY",
            "permittedEwcConfiguration": "WEB_ONLY",
            "advancedCounterpartyCompliance": "WEB_ONLY"
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

fn queue_counts(connection: &Connection) -> Result<(i64, i64), String> {
    let pending = connection
        .query_row(
            "SELECT COUNT(*) FROM local_cloud_mutation_queue
             WHERE mutation_kind = 'partner'
               AND status IN ('PENDING','SENDING')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let failed = connection
        .query_row(
            "SELECT COUNT(*) FROM local_cloud_mutation_queue
             WHERE mutation_kind = 'partner' AND status = 'FAILED'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok((pending, failed))
}

fn site_dependency_state(connection: &Connection, payload: &Value) -> Result<DependencyState, String> {
    let operation = text(payload, "operation").unwrap_or_default();
    if operation != "site.create" && operation != "site.update" {
        return Ok(DependencyState::Ready);
    }

    let company_id = payload
        .get("data")
        .and_then(|data| text(data, "counterpartyId"));
    let Some(company_id) = company_id else {
        return Ok(DependencyState::Ready);
    };

    match pending_reference(connection, "partner", &company_id)?.as_deref() {
        Some("FAILED") => Ok(DependencyState::Failed),
        Some("PENDING") | Some("SENDING") => Ok(DependencyState::Pending),
        _ => Ok(DependencyState::Ready),
    }
}

#[tauri::command]
pub fn desktop_mutate_partner_local(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
    input: Value,
) -> Result<Value, String> {
    offline_auth::require_unlocked(&auth_state)?;

    let mut connection = open_local_connection(&app)?;
    let organisation_id = organisation_id(&connection)?;
    let operation = required_text(&input, "operation")?;

    let mutation_kind = if operation.starts_with("haulier.") {
        "haulier"
    } else if operation == "company.create" {
        "company"
    } else if operation.starts_with("site.") {
        "site"
    } else {
        return Err("Unsupported Waste X partner / site operation.".to_string());
    };

    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    let mut snapshot = metadata_json(&transaction, PARTNER_MASTER_SNAPSHOT_KEY)?
        .ok_or_else(|| {
            "Partner / site master data has not been cached on this Desktop yet. Connect to Waste X Cloud once before editing it offline."
                .to_string()
        })?;

    let (entity_id, action) = if mutation_kind == "haulier" {
        apply_haulier_mutation(
            &transaction,
            &organisation_id,
            &mut snapshot,
            &operation,
            &input,
        )?
    } else if mutation_kind == "company" {
        apply_company_create(
            &transaction,
            &organisation_id,
            &mut snapshot,
            &input,
        )?
    } else {
        apply_site_mutation(
            &transaction,
            &organisation_id,
            &mut snapshot,
            &operation,
            &input,
        )?
    };

    write_metadata_json(&transaction, PARTNER_MASTER_SNAPSHOT_KEY, &snapshot)?;
    sync_reference_snapshots(&transaction, &snapshot)?;

    let mut queued_input = input.clone();
    if operation == "haulier.create"
        || operation == "company.create"
        || operation == "site.create"
    {
        let data = queued_input
            .get_mut("data")
            .and_then(Value::as_object_mut)
            .ok_or_else(|| "Waste X partner create payload is invalid.".to_string())?;
        data.insert("id".to_string(), Value::String(entity_id.clone()));
    }

    let mutation_id = Uuid::now_v7().to_string();
    transaction
        .execute(
            "INSERT INTO local_cloud_mutation_queue (
               mutation_id, organisation_id, mutation_kind, entity_type, entity_id,
               operation, payload_json, status, attempt_count, last_error,
               created_at, updated_at
             ) VALUES (?1, ?2, 'partner', ?3, ?4, ?5, ?6, 'PENDING', 0, NULL, datetime('now'), datetime('now'))",
            params![
                mutation_id,
                organisation_id,
                mutation_kind,
                entity_id,
                operation,
                queued_input.to_string()
            ],
        )
        .map_err(|e| e.to_string())?;

    let data = partner_data(&snapshot)?;
    transaction.commit().map_err(|e| e.to_string())?;

    Ok(json!({
        "ok": true,
        "action": action,
        "entityType": mutation_kind,
        "entityId": entity_id,
        "syncFeedWarning": false,
        "queued": true,
        "data": data
    }))
}

#[tauri::command]
pub async fn desktop_sync_partner_mutations(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
) -> Result<PartnerMutationSyncResult, String> {
    offline_auth::require_unlocked(&auth_state)?;

    let connection = open_local_connection(&app)?;
    let organisation_id = organisation_id(&connection)?;

    connection
        .execute(
            "UPDATE local_cloud_mutation_queue
             SET status = 'PENDING',
                 last_error = 'INTERRUPTED:Previous partner sync stopped before Cloud acknowledgement',
                 updated_at = datetime('now')
             WHERE mutation_kind = 'partner' AND status = 'SENDING'",
            [],
        )
        .map_err(|e| e.to_string())?;

    let credentials = match load_cloud_credentials() {
        Ok(credentials) => credentials,
        Err(error) => {
            let (pending, failed) = queue_counts(&connection)?;
            return Ok(PartnerMutationSyncResult {
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
                   AND mutation_kind = 'partner'
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

    let client = Client::new();
    let mut synced_now = 0_usize;
    let mut warning = None;
    let mut last_canonical_snapshot: Option<Value> = None;

    for (mutation_id, payload_json) in queue {
        let payload: Value = serde_json::from_str(&payload_json)
            .map_err(|e| format!("Stored partner / site change is unreadable: {e}"))?;

        match site_dependency_state(&connection, &payload)? {
            DependencyState::Pending => {
                warning = Some(
                    "A Site change is waiting for its locally-created company to reach Cloud first."
                        .to_string(),
                );
                continue;
            }
            DependencyState::Failed => {
                mark_queue(
                    &connection,
                    &mutation_id,
                    "FAILED",
                    Some("LOCAL_DEPENDENCY:COMPANY_SYNC_FAILED"),
                    false,
                )?;
                warning = Some(
                    "A Site change needs review because its company could not sync."
                        .to_string(),
                );
                continue;
            }
            DependencyState::Ready => {}
        }

        mark_queue(&connection, &mutation_id, "SENDING", None, true)?;

        let response = match client
            .post(format!(
                "{}/api/desktop/v1/operations/partners",
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
                mark_queue(
                    &connection,
                    &mutation_id,
                    "PENDING",
                    Some(&format!("NETWORK:{error}")),
                    false,
                )?;
                warning = Some(
                    "Partner / Site changes remain encrypted on this Desktop until Waste X Cloud is reachable."
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
                "Partner / Site changes are queued. Sign in online to renew Cloud access."
                    .to_string(),
            );
            break;
        }

        if status.as_u16() == 429 || status.is_server_error() {
            mark_queue(
                &connection,
                &mutation_id,
                "PENDING",
                Some(&format!("RETRYABLE:HTTP {status}")),
                false,
            )?;
            warning = Some(
                "Waste X Cloud is temporarily unavailable. Partner / Site changes remain queued."
                    .to_string(),
            );
            break;
        }

        if !status.is_success() {
            let message = body
                .get("error")
                .and_then(|value| value.get("message"))
                .and_then(Value::as_str)
                .or_else(|| body.get("message").and_then(Value::as_str))
                .unwrap_or("Waste X Cloud rejected this partner / site change.");
            mark_queue(
                &connection,
                &mutation_id,
                "FAILED",
                Some(&format!("PERMANENT:HTTP {status}:{message}")),
                false,
            )?;
            warning = Some(
                "One Partner / Site change needs review. Its encrypted local copy was preserved."
                    .to_string(),
            );
            continue;
        }

        let snapshot = canonical_snapshot_from_cloud(&body)?;
        mark_queue(&connection, &mutation_id, "SYNCED", None, false)?;
        last_canonical_snapshot = Some(snapshot);
        synced_now += 1;
    }

    let (pending, failed) = queue_counts(&connection)?;
    if pending == 0 && failed == 0 {
        if let Some(snapshot) = last_canonical_snapshot.as_ref() {
            apply_partner_snapshot(&connection, &organisation_id, snapshot)?;
        }
    }

    Ok(PartnerMutationSyncResult {
        ok: true,
        synced_now,
        pending,
        failed,
        warning,
    })
}
