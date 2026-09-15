use chrono::{DateTime, SecondsFormat, Utc};
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
/* WASTE_X_DESKTOP_REGULATORY_RULE_SCOPE_OFFLINE_V1 */

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationsReference {
    id: String,
    label: String,
    haulier_counterparty_id: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DailyWasteItem {
    id: String,
    item_number: i64,
    ewc_code_id: Option<String>,
    ewc_code: String,
    waste_description: String,
    weight_amount: Option<String>,
    weight_metric: String,
    weight_is_estimate: bool,
    permit_ewc_match_type: Option<String>,
    permit_ewc_code: Option<String>,
    permit_ewc_basis: Option<String>,
    permit_ewc_reference: Option<String>,
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
    waste_items: Vec<DailyWasteItem>,
    gross_weight: Option<String>,
    tare_weight: Option<String>,
    net_weight: Option<String>,
    weight_metric: String,
    ticket_number: Option<String>,
    notes: Option<String>,
    entity_version: i64,
    pending_events: i64,
    /* WASTE_X_DESKTOP_CANONICAL_SYNC_STATE_UI_V1 */
    completion_sync_state: String,
    ticket_sync_state: String,
    search_text: String,
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

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LoadWasteItemInput {
    id: String,
    weight_amount: Option<f64>,
    weight_is_estimate: bool,
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
    waste_items: Option<Vec<LoadWasteItemInput>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadActionInput {
    load_id: String,
    arrival_mode: Option<String>,
    manual_arrival_reason: Option<String>,
    manual_arrival_note: Option<String>,
    physical_arrival_confirmed: Option<bool>,
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


fn payload_waste_items(payload: &Value) -> Vec<DailyWasteItem> {
    payload
        .get("wasteItems")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let id = item.get("id")?.as_str()?.to_string();
                    Some(DailyWasteItem {
                        id,
                        item_number: item
                            .get("itemNumber")
                            .and_then(Value::as_i64)
                            .unwrap_or(0),
                        ewc_code_id: item
                            .get("ewcCodeId")
                            .and_then(Value::as_str)
                            .map(ToOwned::to_owned),
                        ewc_code: item
                            .get("ewcCodeSnapshot")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                        waste_description: item
                            .get("wasteDescriptionSnapshot")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                        weight_amount: item.get("weightAmount").and_then(|value| {
                            if let Some(value) = value.as_str() {
                                Some(value.to_string())
                            } else {
                                value.as_f64().map(|value| format!("{value:.3}"))
                            }
                        }),
                        weight_metric: item
                            .get("weightMetric")
                            .and_then(Value::as_str)
                            .unwrap_or("Tonnes")
                            .to_string(),
                        weight_is_estimate: item
                            .get("weightIsEstimate")
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                        permit_ewc_match_type: item
                            .get("permitEwcMatchType")
                            .and_then(Value::as_str)
                            .map(ToOwned::to_owned),
                        permit_ewc_code: item
                            .get("permitEwcCodeSnapshot")
                            .and_then(Value::as_str)
                            .map(ToOwned::to_owned),
                        permit_ewc_basis: item
                            .get("permitEwcBasis")
                            .and_then(Value::as_str)
                            .map(ToOwned::to_owned),
                        permit_ewc_reference: item
                            .get("permitEwcReference")
                            .and_then(Value::as_str)
                            .map(ToOwned::to_owned),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn weight_allocation_tolerance(metric: &str) -> f64 {
    match metric {
        "Grams" => 1.0,
        "Kilograms" => 0.01,
        _ => 0.001,
    }
}

fn merge_waste_item_allocations(
    payload: &mut Value,
    inputs: Option<&[LoadWasteItemInput]>,
    net_weight: Option<f64>,
    metric: &str,
    require_reconciled: bool,
) -> Result<Vec<Value>, String> {
    let existing = payload
        .get("wasteItems")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    if existing.is_empty() {
        return Ok(Vec::new());
    }

    let mut updated = Vec::with_capacity(existing.len());

    for item in existing {
        let mut item_object = item
            .as_object()
            .cloned()
            .ok_or_else(|| "Cached Waste Item is invalid.".to_string())?;

        let id = item_object
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();

        let supplied = inputs
            .and_then(|rows| rows.iter().find(|row| row.id == id));

        if let Some(supplied) = supplied {
            let amount = decimal(supplied.weight_amount)?;
            set_optional_string(&mut item_object, "weightAmount", amount);
            item_object.insert(
                "weightIsEstimate".to_string(),
                Value::Bool(supplied.weight_is_estimate),
            );
            item_object.insert(
                "weightSource".to_string(),
                Value::String("allocation".to_string()),
            );
        }

        item_object.insert(
            "weightMetric".to_string(),
            Value::String(metric.to_string()),
        );

        updated.push(Value::Object(item_object));
    }

    if updated.len() == 1 {
        let current_amount = updated[0]
            .get("weightAmount")
            .and_then(|value| {
                value
                    .as_str()
                    .and_then(|value| value.parse::<f64>().ok())
                    .or_else(|| value.as_f64())
            })
            .unwrap_or(0.0);

        if current_amount <= 0.0 {
            if let Some(net) = net_weight.filter(|value| value.is_finite() && *value > 0.0) {
                if let Some(item) = updated[0].as_object_mut() {
                    item.insert(
                        "weightAmount".to_string(),
                        Value::String(format!("{net:.3}")),
                    );
                    item.insert(
                        "weightIsEstimate".to_string(),
                        Value::Bool(false),
                    );
                    item.insert(
                        "weightSource".to_string(),
                        Value::String("allocation".to_string()),
                    );
                }
            }
        }
    }

    if require_reconciled {
        let net = net_weight
            .filter(|value| value.is_finite() && *value > 0.0)
            .ok_or_else(|| "A positive net weight is required before completion.".to_string())?;

        let mut total = 0.0;
        for item in &updated {
            let amount = item
                .get("weightAmount")
                .and_then(|value| {
                    value
                        .as_str()
                        .and_then(|value| value.parse::<f64>().ok())
                        .or_else(|| value.as_f64())
                })
                .unwrap_or(0.0);

            if !amount.is_finite() || amount <= 0.0 {
                return Err(
                    "Enter a positive weight allocation for every Waste Item before completion."
                        .to_string(),
                );
            }

            total += amount;
        }

        if (total - net).abs() > weight_allocation_tolerance(metric) {
            return Err(format!(
                "Waste Item allocations total {total:.3} {metric}, but the Load net is {net:.3} {metric}."
            ));
        }
    }

    payload_object(payload)?
        .insert("wasteItems".to_string(), Value::Array(updated.clone()));

    Ok(updated)
}

fn local_load(
    transaction: &Transaction<'_>,
    load_id: &str,
    organisation_id: &str,
) -> Result<LocalLoad, String> {
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

    if matches!(
        job_status.as_deref(),
        None | Some("draft") | Some("cancelled")
    ) {
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
    let Some(id) = id else {
        return Ok(());
    };
    let sql = format!(
        "SELECT haulier_counterparty_id FROM {table}
         WHERE id = ?1 AND organisation_id = ?2 AND active = 1"
    );
    let stored_haulier: Option<Option<String>> = transaction
        .query_row(&sql, params![id, organisation_id], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())?;

    let stored_haulier = stored_haulier.ok_or_else(|| {
        format!(
            "Selected {} is not available offline.",
            if table == "local_driver" {
                "driver"
            } else {
                "vehicle"
            }
        )
    })?;

    if stored_haulier.as_deref() != haulier_counterparty_id {
        return Err(format!(
            "Selected {} does not belong to this load's transport provider.",
            if table == "local_driver" {
                "driver"
            } else {
                "vehicle"
            }
        ));
    }
    Ok(())
}

fn cached_incoming_permit_allows_ewc(
    transaction: &Transaction<'_>,
    load: &LocalLoad,
    ewc_code_id: &str,
) -> Result<bool, String> {
    let permit_id = value_string(&load.payload, "sitePermitId");
    let site_id =
        value_string(&load.payload, "ownSiteId").or_else(|| load.own_site_id.clone());

    let (Some(permit_id), Some(site_id)) = (permit_id, site_id) else {
        return Ok(false);
    };

    let permit_payload_json: Option<String> = transaction
        .query_row(
            "SELECT payload_json
             FROM local_permit
             WHERE id = ?1
               AND organisation_id = ?2
               AND site_id = ?3
               AND status = 'active'
             LIMIT 1",
            params![permit_id, load.organisation_id, site_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let Some(permit_payload_json) = permit_payload_json else {
        return Ok(false);
    };

    let permit_payload = parse_payload(permit_payload_json)?;
    let regulator =
        value_string(&permit_payload, "regulator").unwrap_or_default();

    let exact: Option<i64> = transaction
        .query_row(
            "SELECT 1
             FROM local_permit_ewc_snapshot
             WHERE organisation_id = ?1
               AND permit_id = ?2
               AND ewc_code_id = ?3
               AND active = 1
             LIMIT 1",
            params![load.organisation_id, permit_id, ewc_code_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if exact.is_some() {
        return Ok(true);
    }

    let mut statement = transaction
        .prepare(
            "SELECT
                underlying_authorisation_ewc_code_id,
                requires_underlying_permit_code,
                requires_manual_confirmation,
                authority_conditions_confirmed,
                site_rule_confirmed,
                activation_valid_from,
                activation_valid_until,
                authority_valid_from,
                authority_valid_until
             FROM local_regulatory_acceptance_rule_snapshot
             WHERE organisation_id = ?1
               AND site_id = ?2
               AND permit_id = ?3
               AND actual_ewc_code_id = ?4
               AND regulator = ?5
               AND active = 1",
        )
        .map_err(|e| e.to_string())?;

    let candidates = statement
        .query_map(
            params![
                load.organisation_id,
                site_id,
                permit_id,
                ewc_code_id,
                regulator,
            ],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, Option<String>>(8)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    let now = Utc::now();

    let inside_window = |from: Option<String>, until: Option<String>| {
        let starts_ok = match from {
            Some(value) => DateTime::parse_from_rfc3339(&value)
                .map(|date| date.with_timezone(&Utc) <= now)
                .unwrap_or(false),
            None => true,
        };

        let ends_ok = match until {
            Some(value) => DateTime::parse_from_rfc3339(&value)
                .map(|date| date.with_timezone(&Utc) >= now)
                .unwrap_or(false),
            None => true,
        };

        starts_ok && ends_ok
    };

    for candidate in candidates {
        let (
            underlying_ewc_code_id,
            requires_underlying,
            requires_manual_confirmation,
            authority_confirmed,
            rule_confirmed,
            activation_valid_from,
            activation_valid_until,
            authority_valid_from,
            authority_valid_until,
        ) = candidate.map_err(|e| e.to_string())?;

        if requires_manual_confirmation == 1
            && (authority_confirmed != 1 || rule_confirmed != 1)
        {
            continue;
        }

        if !inside_window(activation_valid_from, activation_valid_until)
            || !inside_window(authority_valid_from, authority_valid_until)
        {
            continue;
        }

        if requires_underlying == 1 {
            let Some(underlying_ewc_code_id) = underlying_ewc_code_id else {
                continue;
            };

            let underlying: Option<i64> = transaction
                .query_row(
                    "SELECT 1
                     FROM local_permit_ewc_snapshot
                     WHERE organisation_id = ?1
                       AND permit_id = ?2
                       AND ewc_code_id = ?3
                       AND active = 1
                     LIMIT 1",
                    params![
                        load.organisation_id,
                        permit_id,
                        underlying_ewc_code_id,
                    ],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            if underlying.is_none() {
                continue;
            }
        }

        return Ok(true);
    }

    Ok(false)
}

fn cached_incoming_permit_allows(
    transaction: &Transaction<'_>,
    load: &LocalLoad,
) -> Result<bool, String> {
    if let Some(items) = load.payload.get("wasteItems").and_then(Value::as_array) {
        if !items.is_empty() {
            for item in items {
                let Some(ewc_code_id) = item.get("ewcCodeId").and_then(Value::as_str) else {
                    return Ok(false);
                };
                if !cached_incoming_permit_allows_ewc(
                    transaction,
                    load,
                    ewc_code_id,
                )? {
                    return Ok(false);
                }
            }
            return Ok(true);
        }
    }

    let Some(ewc_code_id) = value_string(&load.payload, "ewcCodeId") else {
        return Ok(false);
    };
    cached_incoming_permit_allows_ewc(transaction, load, &ewc_code_id)
}


fn cached_outgoing_facility_allows(
    transaction: &Transaction<'_>,
    load: &LocalLoad,
) -> Result<bool, String> {
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
            params![
                event_id,
                actor.user_id,
                event_type,
                load.id,
                payload_json,
                now
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
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn decimal(value: Option<f64>) -> Result<Option<String>, String> {
    match value {
        Some(value) if !value.is_finite() || value < 0.0 => {
            Err("Weights must be zero or greater.".to_string())
        }
        Some(value) => Ok(Some(format!("{value:.3}"))),
        None => Ok(None),
    }
}

/*
 * WASTE_X_DESKTOP_COMPLETION_PAYLOAD_RECOVERY_V1
 *
 * A previous multi-waste Desktop build serialised the full cached wasteItems[]
 * objects into LOAD_COMPLETED. The Cloud load-details contract expected the
 * compact operational allocation shape, so those events were deterministically
 * rejected as INVALID_LOAD_DETAILS after the Desktop had already projected the
 * completion locally.
 *
 * This normalises that legacy payload and supersedes ONLY that exact failed
 * event with a fresh event id/device sequence. The original completion time and
 * base entity version are preserved. No Cloud state is fabricated locally.
 */
fn normalise_completion_payload_for_cloud(payload: &Value) -> Result<Value, String> {
    let mut normalised = payload.clone();

    if let Some(items) = normalised
        .get_mut("wasteItems")
        .and_then(Value::as_array_mut)
    {
        for item in items.iter_mut() {
            let id = item
                .get("id")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| {
                    "A cached Waste Item is missing its id; completion recovery stopped."
                        .to_string()
                })?
                .to_string();

            let weight_amount = match item.get("weightAmount") {
                Some(Value::Number(value)) => value.as_f64(),
                Some(Value::String(value)) if !value.trim().is_empty() => {
                    Some(
                        value
                            .parse::<f64>()
                            .map_err(|_| {
                                format!(
                                    "Waste Item {id} has an invalid cached weight allocation."
                                )
                            })?,
                    )
                }
                Some(Value::Null) | None => None,
                _ => {
                    return Err(format!(
                        "Waste Item {id} has an invalid cached weight allocation."
                    ))
                }
            };

            if let Some(value) = weight_amount {
                if !value.is_finite() || value < 0.0 {
                    return Err(format!(
                        "Waste Item {id} has an invalid cached weight allocation."
                    ));
                }
            }

            let weight_is_estimate = item
                .get("weightIsEstimate")
                .and_then(Value::as_bool)
                .unwrap_or(false);

            *item = json!({
                "id": id,
                "weightAmount": weight_amount,
                "weightIsEstimate": weight_is_estimate,
            });
        }
    }

    Ok(normalised)
}

fn repair_failed_invalid_completion_events(
    transaction: &Transaction<'_>,
) -> Result<usize, String> {
    type FailedCompletionRow = (
        String,
        String,
        Option<String>,
        String,
        String,
        String,
        Option<i64>,
        String,
        String,
    );

    let failed_rows: Vec<FailedCompletionRow> = {
        let mut statement = transaction
            .prepare(
                "SELECT event_id, organisation_id, site_id, device_id,
                        actor_user_id, entity_id, base_version, occurred_at,
                        payload_json
                 FROM local_sync_queue
                 WHERE status = 'FAILED'
                   AND event_type = 'LOAD_COMPLETED'
                   AND last_error = 'REJECTED:INVALID_LOAD_DETAILS'
                 ORDER BY device_sequence",
            )
            .map_err(|e| e.to_string())?;

        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };

    let mut repaired = 0usize;

    for (
        old_event_id,
        organisation_id,
        site_id,
        device_id,
        actor_user_id,
        entity_id,
        base_version,
        occurred_at,
        payload_json,
    ) in failed_rows
    {
        let payload = serde_json::from_str::<Value>(&payload_json)
            .map_err(|e| format!("Failed completion payload is invalid JSON: {e}"))?;
        let normalised = normalise_completion_payload_for_cloud(&payload)?;
        let normalised_json =
            serde_json::to_string(&normalised).map_err(|e| e.to_string())?;
        let payload_hash = hex::encode(Sha256::digest(normalised_json.as_bytes()));
        let replacement_event_id = Uuid::now_v7().to_string();
        let replacement_sequence = next_device_sequence(transaction)?;
        let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

        transaction
            .execute(
                "UPDATE local_sync_queue
                 SET status = 'SYNCED',
                     last_error = 'LOCAL_SUPERSEDED:INVALID_LOAD_DETAILS_PAYLOAD_REPAIRED',
                     updated_at = ?1
                 WHERE event_id = ?2
                   AND status = 'FAILED'
                   AND last_error = 'REJECTED:INVALID_LOAD_DETAILS'",
                params![now, old_event_id],
            )
            .map_err(|e| e.to_string())?;

        transaction
            .execute(
                "INSERT INTO local_sync_queue (
                    event_id, organisation_id, site_id, device_id, actor_user_id,
                    entity_type, entity_id, event_type, base_version,
                    device_sequence, payload_json, payload_hash, occurred_at,
                    recorded_at, status, attempt_count, updated_at
                 ) VALUES (
                    ?1, ?2, ?3, ?4, ?5,
                    'job_load', ?6, 'LOAD_COMPLETED', ?7,
                    ?8, ?9, ?10, ?11,
                    ?12, 'PENDING', 0, ?12
                 )",
                params![
                    replacement_event_id,
                    organisation_id,
                    site_id,
                    device_id,
                    actor_user_id,
                    entity_id,
                    base_version,
                    replacement_sequence,
                    normalised_json,
                    payload_hash,
                    occurred_at,
                    now,
                ],
            )
            .map_err(|e| e.to_string())?;

        transaction
            .execute(
                "INSERT INTO local_audit_event (
                    event_id, actor_user_id, action, entity_type, entity_id,
                    payload_json, created_at
                 ) VALUES (
                    ?1, ?2, 'SYNC_REPAIR_LOAD_COMPLETED', 'job_load', ?3, ?4, ?5
                 )",
                params![
                    replacement_event_id,
                    actor_user_id,
                    entity_id,
                    serde_json::to_string(&json!({
                        "supersededEventId": old_event_id,
                        "reason": "INVALID_LOAD_DETAILS",
                        "replacementEventId": replacement_event_id,
                    }))
                    .map_err(|e| e.to_string())?,
                    now,
                ],
            )
            .map_err(|e| e.to_string())?;

        repaired += 1;
    }

    Ok(repaired)
}

/*
 * WASTE_X_DESKTOP_COMPLETION_TICKET_CONFLICT_RECOVERY_V1
 *
 * A repaired LOAD_COMPLETED event must be applied before the locally-issued
 * SITE_TICKET_ISSUED event that originally followed it. If the first completion
 * was rejected, Cloud stayed at version N while the ticket was correctly
 * created locally with base version N+1. Cloud therefore recorded the ticket as
 * ENTITY_VERSION_CONFLICT, and the Desktop queue's per-entity ordering then
 * blocked the repaired completion sitting behind that conflict.
 *
 * This targets only that exact dependency:
 *   - conflicted SITE_TICKET_ISSUED
 *   - Cloud/server version == N
 *   - ticket base version == N+1
 *   - a PENDING LOAD_COMPLETED for the same load with base version N
 *
 * The conflicted ticket event id has already been consumed by Cloud, so it is
 * superseded locally and re-issued with a fresh event id/device sequence AFTER
 * the pending repaired completion. The ticket keeps its original payload,
 * occurrence time and intended base version. No Cloud state is fabricated.
 */
fn repair_ticket_conflicts_behind_pending_completion(
    transaction: &Transaction<'_>,
) -> Result<usize, String> {
    type TicketConflictRow = (
        String,
        String,
        Option<String>,
        String,
        String,
        String,
        Option<i64>,
        Option<i64>,
        String,
        String,
    );

    let rows: Vec<TicketConflictRow> = {
        let mut statement = transaction
            .prepare(
                "SELECT q.event_id, q.organisation_id, q.site_id, q.device_id,
                        q.actor_user_id, q.entity_id, q.base_version,
                        q.server_entity_version, q.occurred_at, q.payload_json
                 FROM local_sync_queue q
                 WHERE q.status = 'CONFLICT'
                   AND q.entity_type = 'job_load'
                   AND q.event_type = 'SITE_TICKET_ISSUED'
                   AND q.last_error = 'CONFLICT:ENTITY_VERSION_CONFLICT'
                   AND q.server_entity_version IS NOT NULL
                   AND q.base_version = q.server_entity_version + 1
                   AND EXISTS (
                     SELECT 1
                     FROM local_sync_queue completion
                     WHERE completion.entity_type = 'job_load'
                       AND completion.entity_id = q.entity_id
                       AND completion.event_type = 'LOAD_COMPLETED'
                       AND completion.status = 'PENDING'
                       AND completion.base_version = q.server_entity_version
                   )
                 ORDER BY q.device_sequence",
            )
            .map_err(|e| e.to_string())?;

        let mapped = statement
            .query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                    row.get(9)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        mapped
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };

    let mut repaired = 0usize;

    for (
        old_event_id,
        organisation_id,
        site_id,
        device_id,
        actor_user_id,
        entity_id,
        base_version,
        server_entity_version,
        occurred_at,
        payload_json,
    ) in rows
    {
        let payload = serde_json::from_str::<Value>(&payload_json)
            .map_err(|e| format!("Conflicted ticket payload is invalid JSON: {e}"))?;
        let canonical_payload_json =
            serde_json::to_string(&payload).map_err(|e| e.to_string())?;
        let payload_hash =
            hex::encode(Sha256::digest(canonical_payload_json.as_bytes()));
        let replacement_event_id = Uuid::now_v7().to_string();
        let replacement_sequence = next_device_sequence(transaction)?;
        let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

        transaction
            .execute(
                "UPDATE local_sync_queue
                 SET status = 'SYNCED',
                     last_error = 'LOCAL_SUPERSEDED:REQUEUED_AFTER_REPAIRED_LOAD_COMPLETED',
                     updated_at = ?1
                 WHERE event_id = ?2
                   AND status = 'CONFLICT'
                   AND event_type = 'SITE_TICKET_ISSUED'
                   AND last_error = 'CONFLICT:ENTITY_VERSION_CONFLICT'",
                params![now, old_event_id],
            )
            .map_err(|e| e.to_string())?;

        transaction
            .execute(
                "INSERT INTO local_sync_queue (
                    event_id, organisation_id, site_id, device_id, actor_user_id,
                    entity_type, entity_id, event_type, base_version,
                    device_sequence, payload_json, payload_hash, occurred_at,
                    recorded_at, status, attempt_count, updated_at
                 ) VALUES (
                    ?1, ?2, ?3, ?4, ?5,
                    'job_load', ?6, 'SITE_TICKET_ISSUED', ?7,
                    ?8, ?9, ?10, ?11,
                    ?12, 'PENDING', 0, ?12
                 )",
                params![
                    replacement_event_id,
                    organisation_id,
                    site_id,
                    device_id,
                    actor_user_id,
                    entity_id,
                    base_version,
                    replacement_sequence,
                    canonical_payload_json,
                    payload_hash,
                    occurred_at,
                    now,
                ],
            )
            .map_err(|e| e.to_string())?;

        transaction
            .execute(
                "INSERT INTO local_audit_event (
                    event_id, actor_user_id, action, entity_type, entity_id,
                    payload_json, created_at
                 ) VALUES (
                    ?1, ?2, 'SYNC_REPAIR_SITE_TICKET_AFTER_COMPLETION',
                    'job_load', ?3, ?4, ?5
                 )",
                params![
                    replacement_event_id,
                    actor_user_id,
                    entity_id,
                    serde_json::to_string(&json!({
                        "supersededEventId": old_event_id,
                        "reason": "TICKET_BLOCKED_REPAIRED_COMPLETION",
                        "replacementEventId": replacement_event_id,
                        "completionBaseVersion": server_entity_version,
                        "ticketBaseVersion": base_version,
                    }))
                    .map_err(|e| e.to_string())?,
                    now,
                ],
            )
            .map_err(|e| e.to_string())?;

        repaired += 1;
    }

    Ok(repaired)
}

#[tauri::command]
pub fn desktop_daily_operations(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
) -> Result<DailyOperationsSnapshot, String> {
    offline_auth::require_unlocked(&auth_state)?;
    let mut connection = open_local_connection(&app)?;
    let actor = actor_context(&connection)?;

    {
        let transaction = connection.transaction().map_err(|e| e.to_string())?;
        repair_failed_invalid_completion_events(&transaction)?;
        repair_ticket_conflicts_behind_pending_completion(&transaction)?;
        transaction.commit().map_err(|e| e.to_string())?;
    }

    let mut statement = connection
        .prepare(
            "SELECT l.id, l.job_id, COALESCE(j.job_number, ''), j.job_date,
                    l.load_number, l.direction, l.status, l.gross_weight, l.tare_weight,
                    l.net_weight, l.entity_version, l.payload_json,
                    COALESCE(j.payload_json, ''),
                    (SELECT COUNT(*) FROM local_sync_queue q
                     WHERE q.entity_type = 'job_load' AND q.entity_id = l.id
                       AND q.status IN ('PENDING','SENDING','FAILED','CONFLICT')),
                    CASE
                      WHEN l.status != 'completed' THEN 'not_applicable'
                      WHEN EXISTS (
                        SELECT 1 FROM local_sync_queue q
                        WHERE q.entity_type = 'job_load'
                          AND q.entity_id = l.id
                          AND q.event_type = 'LOAD_COMPLETED'
                          AND q.status IN ('FAILED','CONFLICT')
                      ) THEN 'review_required'
                      WHEN EXISTS (
                        SELECT 1 FROM local_sync_queue q
                        WHERE q.entity_type = 'job_load'
                          AND q.entity_id = l.id
                          AND q.event_type = 'LOAD_COMPLETED'
                          AND q.status IN ('PENDING','SENDING')
                      ) THEN 'pending'
                      ELSE 'cloud_confirmed'
                    END,
                    CASE
                      WHEN NOT EXISTS (
                        SELECT 1 FROM local_ticket t
                        WHERE t.organisation_id = l.organisation_id
                          AND t.job_load_id = l.id
                      ) THEN 'not_issued'
                      WHEN EXISTS (
                        SELECT 1 FROM local_sync_queue q
                        WHERE q.entity_type = 'job_load'
                          AND q.entity_id = l.id
                          AND q.event_type = 'LOAD_COMPLETED'
                          AND q.status IN ('PENDING','SENDING','FAILED','CONFLICT')
                      ) THEN 'waiting_for_completion'
                      WHEN EXISTS (
                        SELECT 1 FROM local_sync_queue q
                        WHERE q.entity_type = 'job_load'
                          AND q.entity_id = l.id
                          AND q.event_type = 'SITE_TICKET_ISSUED'
                          AND q.status IN ('FAILED','CONFLICT')
                      ) THEN 'review_required'
                      WHEN EXISTS (
                        SELECT 1 FROM local_sync_queue q
                        WHERE q.entity_type = 'job_load'
                          AND q.entity_id = l.id
                          AND q.event_type = 'SITE_TICKET_ISSUED'
                          AND q.status IN ('PENDING','SENDING')
                      ) THEN 'pending'
                      ELSE 'cloud_confirmed'
                    END
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
                row.get::<_, String>(12)?,
                row.get::<_, i64>(13)?,
                row.get::<_, String>(14)?,
                row.get::<_, String>(15)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut loads = Vec::new();
    for row in rows {
        let row = row.map_err(|e| e.to_string())?;
        let payload = parse_payload(row.11.clone())?;
        let search_text = format!("{} {}", row.11, row.12);
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
            waste_description: value_string(&payload, "wasteDescriptionSnapshot")
                .unwrap_or_default(),
            ewc_code: value_string(&payload, "ewcCodeSnapshot"),
            waste_items: payload_waste_items(&payload),
            gross_weight: row.7,
            tare_weight: row.8,
            net_weight: row.9,
            weight_metric: value_string(&payload, "weightMetric")
                .unwrap_or_else(|| "Tonnes".to_string()),
            ticket_number: value_string(&payload, "ticketNumber"),
            notes: value_string(&payload, "notes"),
            entity_version: row.10,
            pending_events: row.13,
            completion_sync_state: row.14,
            ticket_sync_state: row.15,
            search_text,
});
    }

    fn references(
        connection: &Connection,
        table: &str,
        label_keys: &[&str],
    ) -> Result<Vec<OperationsReference>, String> {
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
            result.push(OperationsReference {
                id,
                label,
                haulier_counterparty_id,
            });
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
        drivers: references(
            &connection,
            "local_driver",
            &["name", "fullName", "driverName"],
        )?,
        vehicles: references(
            &connection,
            "local_vehicle",
            &["registrationNumber", "registration", "name"],
        )?,
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
    if !matches!(
        input.weight_metric.as_str(),
        "Grams" | "Kilograms" | "Tonnes"
    ) {
        return Err("Weight metric must be Grams, Kilograms, or Tonnes.".to_string());
    }

    let driver_id = normalise_optional(input.driver_id);
    let vehicle_id = normalise_optional(input.vehicle_id);
    let haulier_counterparty_id = value_string(&load.payload, "haulierCounterpartyId");
    validate_transport(
        &transaction,
        "local_driver",
        driver_id.as_deref(),
        &actor.organisation_id,
        haulier_counterparty_id.as_deref(),
    )?;
    validate_transport(
        &transaction,
        "local_vehicle",
        vehicle_id.as_deref(),
        &actor.organisation_id,
        haulier_counterparty_id.as_deref(),
    )?;

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
    object.insert(
        "wasteDescriptionSnapshot".to_string(),
        Value::String(waste_description.clone()),
    );
    set_optional_string(object, "grossWeight", gross.clone());
    set_optional_string(object, "tareWeight", tare.clone());
    set_optional_string(object, "netWeight", net.clone());
    object.insert(
        "weightMetric".to_string(),
        Value::String(input.weight_metric.clone()),
    );
    object.insert(
        "weightIsEstimate".to_string(),
        Value::Bool(input.weight_is_estimate),
    );
    object.insert(
        "weightSource".to_string(),
        Value::String("manual".to_string()),
    );
    set_optional_string(object, "ticketNumber", ticket_number.clone());
    set_optional_string(object, "notes", notes.clone());

    let net_numeric = net
        .as_ref()
        .and_then(|value| value.parse::<f64>().ok());
    let _ = merge_waste_item_allocations(
        &mut updated_payload,
        input.waste_items.as_deref(),
        net_numeric,
        &input.weight_metric,
        false,
    )?;

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
        "wasteItems": input.waste_items.clone(),
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

    if load.direction != "incoming" {
        return Err("Arrived is only valid for incoming loads.".to_string());
    }
    if load.status != "planned" {
        return Err("Only a planned load can be marked arrived.".to_string());
    }
    if value_string(&load.payload, "wasteDescriptionSnapshot")
        .unwrap_or_default()
        .trim()
        .is_empty()
    {
        return Err("Waste description is required before arrival.".to_string());
    }

    let driver_id = value_string(&load.payload, "driverId");
    let vehicle_id = value_string(&load.payload, "vehicleId");
    if driver_id.is_none() {
        return Err("Driver is required before arrival.".to_string());
    }
    if vehicle_id.is_none() {
        return Err("Vehicle is required before arrival.".to_string());
    }

    let haulier = value_string(&load.payload, "haulierCounterpartyId");
    let own_transport = haulier.is_none();
    let manual_site_fallback =
        own_transport && input.arrival_mode.as_deref() == Some("manual_site_fallback");

    let reason_code = input
        .manual_arrival_reason
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let note = input
        .manual_arrival_note
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    let reason_label = if manual_site_fallback {
        if input.physical_arrival_confirmed != Some(true) {
            return Err(
                "Confirm that the vehicle and waste are physically at the receiving site."
                    .to_string(),
            );
        }

        let Some(reason_code) = reason_code.as_deref() else {
            return Err("Choose a manual-arrival reason.".to_string());
        };

        let label = match reason_code {
            "DRIVER_NO_MOBILE_ACCESS" => "Driver has no Mobile access",
            "DRIVER_DEVICE_UNAVAILABLE" => "Driver phone / device unavailable",
            "CONNECTIVITY_ISSUE" => "Connectivity issue",
            "SITE_CONFIRMED_PHYSICAL_ARRIVAL" => "Site confirmed physical arrival",
            "OTHER" => "Other",
            _ => return Err("Choose a valid manual-arrival reason.".to_string()),
        };

        if reason_code == "OTHER"
            && note.as_deref().map(str::len).unwrap_or(0) < 3
        {
            return Err(
                "Add a short note when the manual-arrival reason is Other."
                    .to_string(),
            );
        }

        if note.as_deref().map(str::len).unwrap_or(0) > 2000 {
            return Err("Manual-arrival notes cannot exceed 2000 characters.".to_string());
        }

        Some(label.to_string())
    } else {
        if own_transport {
            return Err(
                "Own-transport arrivals normally come from Driver Mobile. Use the audited manual site-arrival fallback when Mobile cannot be used."
                    .to_string(),
            );
        }
        None
    };

    validate_transport(
        &transaction,
        "local_driver",
        driver_id.as_deref(),
        &actor.organisation_id,
        haulier.as_deref(),
    )?;
    validate_transport(
        &transaction,
        "local_vehicle",
        vehicle_id.as_deref(),
        &actor.organisation_id,
        haulier.as_deref(),
    )?;

    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let mut updated_payload = load.payload.clone();

    {
        let object = payload_object(&mut updated_payload)?;
        object.insert("status".to_string(), Value::String("arrived".to_string()));
        if !object.contains_key("receivedAt") || object.get("receivedAt") == Some(&Value::Null) {
            object.insert("receivedAt".to_string(), Value::String(now.clone()));
        }
        if !object.contains_key("movementAt") || object.get("movementAt") == Some(&Value::Null) {
            object.insert("movementAt".to_string(), Value::String(now.clone()));
        }

        if manual_site_fallback {
            object.insert(
                "manualSiteArrival".to_string(),
                json!({
                    "channel": "DESKTOP",
                    "recordedAt": now,
                    "physicalArrivalConfirmed": true,
                    "reasonCode": reason_code,
                    "reason": reason_label,
                    "note": note,
                }),
            );

            let existing_notes = object
                .get("notes")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("");
            let detail = format!(
                "[MANUAL SITE ARRIVAL · {}] Channel: Desktop · Reason: {}{}",
                now,
                reason_label.as_deref().unwrap_or("Not recorded"),
                note.as_deref()
                    .map(|value| format!(" · Note: {value}"))
                    .unwrap_or_default(),
            );
            object.insert(
                "notes".to_string(),
                Value::String(if existing_notes.is_empty() {
                    detail
                } else {
                    format!("{existing_notes}\n{detail}")
                }),
            );
        }
    }

    let event_payload = if manual_site_fallback {
        json!({
            "arrivalMode": "manual_site_fallback",
            "manualArrivalReason": reason_code,
            "manualArrivalNote": note,
            "physicalArrivalConfirmed": true,
        })
    } else {
        json!({
            "arrivalMode": "external_carrier",
        })
    };

    let result = enqueue_load_event(
        &transaction,
        &actor,
        &load,
        "LOAD_ARRIVED",
        &event_payload,
        &updated_payload,
        "arrived",
        load.gross_weight.as_deref(),
        load.tare_weight.as_deref(),
        load.net_weight.as_deref(),
    )?;
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

    if load.direction != "incoming" {
        return Err("Accept is only valid for incoming loads.".to_string());
    }
    if load.status != "arrived" {
        return Err("The load must be arrived before it can be accepted.".to_string());
    }
    if value_string(&load.payload, "wasteDescriptionSnapshot")
        .unwrap_or_default()
        .trim()
        .is_empty()
    {
        return Err("Waste description is required before acceptance.".to_string());
    }
    if !cached_incoming_permit_allows(&transaction, &load)? {
        return Err(
            "Cached permit/EWC rules do not allow this incoming load. Do not accept it offline."
                .to_string(),
        );
    }

    let mut updated_payload = load.payload.clone();
    payload_object(&mut updated_payload)?
        .insert("status".to_string(), Value::String("accepted".to_string()));
    let result = enqueue_load_event(
        &transaction,
        &actor,
        &load,
        "LOAD_ACCEPTED",
        &json!({}),
        &updated_payload,
        "accepted",
        load.gross_weight.as_deref(),
        load.tare_weight.as_deref(),
        load.net_weight.as_deref(),
    )?;
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
    if load.direction != "incoming" {
        return Err("Reject is only valid for incoming loads.".to_string());
    }
    if load.status != "arrived" {
        return Err("The load must be arrived before it can be rejected.".to_string());
    }

    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let existing_notes = value_string(&load.payload, "notes").unwrap_or_default();
    let note = format!("[REJECTED · {now}] {reason}");
    let notes = if existing_notes.trim().is_empty() {
        note
    } else {
        format!("{}\n{}", existing_notes.trim(), note)
    };
    let mut updated_payload = load.payload.clone();
    let object = payload_object(&mut updated_payload)?;
    object.insert("status".to_string(), Value::String("rejected".to_string()));
    object.insert("notes".to_string(), Value::String(notes));
    object.insert("completedAt".to_string(), Value::String(now));

    let result = enqueue_load_event(
        &transaction,
        &actor,
        &load,
        "LOAD_REJECTED",
        &json!({ "reason": reason }),
        &updated_payload,
        "rejected",
        load.gross_weight.as_deref(),
        load.tare_weight.as_deref(),
        load.net_weight.as_deref(),
    )?;
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
    let mut load = local_load(&transaction, input.load_id.trim(), &actor.organisation_id)?;

    if load.direction == "incoming" && load.status != "accepted" {
        return Err("Incoming loads must be accepted before completion.".to_string());
    }
    if load.direction == "outgoing"
        && matches!(load.status.as_str(), "completed" | "rejected" | "cancelled")
    {
        return Err("This outgoing load is already terminal.".to_string());
    }
    let net = load
        .net_weight
        .as_ref()
        .and_then(|value| value.parse::<f64>().ok())
        .unwrap_or(0.0);
    if !net.is_finite() || net <= 0.0 {
        return Err("A positive net weight is required before completion.".to_string());
    }
    if load.direction == "outgoing" {
        if value_string(&load.payload, "wasteDescriptionSnapshot")
            .unwrap_or_default()
            .trim()
            .is_empty()
        {
            return Err(
                "Waste description is required before completing an outgoing load.".to_string(),
            );
        }
        if !cached_outgoing_facility_allows(&transaction, &load)? {
            return Err("Cached destination authorisation/EWC rules do not allow this outgoing load. Do not complete it offline.".to_string());
        }
    }

    /* Finalise weights + Complete is one receiving-site transaction. The React
     * screen saves the visible values immediately before this command so they
     * are already present in the encrypted load record. If that save is still
     * only a local PENDING LOAD_DETAILS_UPDATED event, collapse it into the
     * completion event instead of creating two Cloud mutations that can race on
     * entity versions. A details event that has already started syncing is left
     * alone and normal ordered replay continues. */
    let latest_local_event: Option<(String, String, Option<i64>, String)> = transaction
        .query_row(
            "SELECT event_id, event_type, base_version, status
             FROM local_sync_queue
             WHERE entity_type = 'job_load'
               AND entity_id = ?1
               AND device_id = ?2
             ORDER BY device_sequence DESC
             LIMIT 1",
            params![load.id, actor.device_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some((event_id, event_type, base_version, status)) = latest_local_event {
        if event_type == "LOAD_DETAILS_UPDATED" && status == "PENDING" {
            if let Some(base_version) = base_version {
                transaction
                    .execute(
                        "UPDATE local_sync_queue
                         SET status = 'SYNCED',
                             last_error = 'LOCAL_COALESCED:LOAD_COMPLETED carries the final site details',
                             updated_at = datetime('now')
                         WHERE event_id = ?1 AND status = 'PENDING'",
                        params![event_id],
                    )
                    .map_err(|e| e.to_string())?;
                load.entity_version = base_version;
            }
        }
    }

    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let mut updated_payload = load.payload.clone();
    let metric = value_string(&load.payload, "weightMetric")
        .unwrap_or_else(|| "Tonnes".to_string());
    let _ = merge_waste_item_allocations(
        &mut updated_payload,
        None,
        Some(net),
        &metric,
        load.direction == "incoming",
    )?;
    let object = payload_object(&mut updated_payload)?;
    object.insert("status".to_string(), Value::String("completed".to_string()));
    object.insert("completedAt".to_string(), Value::String(now.clone()));
    object.insert(
        "weightSource".to_string(),
        Value::String("weighbridge".to_string()),
    );
    if load.direction == "outgoing"
        && (object.get("movementAt").is_none() || object.get("movementAt") == Some(&Value::Null))
    {
        object.insert("movementAt".to_string(), Value::String(now));
    }

    let gross = load
        .gross_weight
        .as_ref()
        .and_then(|value| value.parse::<f64>().ok());
    let tare = load
        .tare_weight
        .as_ref()
        .and_then(|value| value.parse::<f64>().ok());
    let completion_waste_items = updated_payload
        .get("wasteItems")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|item| {
                    let id = item
                        .get("id")
                        .and_then(Value::as_str)
                        .filter(|value| !value.trim().is_empty())
                        .ok_or_else(|| "A Waste Item is missing its id.".to_string())?;

                    let weight_amount = match item.get("weightAmount") {
                        Some(Value::Number(value)) => value.as_f64(),
                        Some(Value::String(value)) if !value.trim().is_empty() => {
                            Some(
                                value
                                    .parse::<f64>()
                                    .map_err(|_| {
                                        format!(
                                            "Waste Item {id} has an invalid weight allocation."
                                        )
                                    })?,
                            )
                        }
                        Some(Value::Null) | None => None,
                        _ => {
                            return Err(format!(
                                "Waste Item {id} has an invalid weight allocation."
                            ))
                        }
                    };

                    Ok(json!({
                        "id": id,
                        "weightAmount": weight_amount,
                        "weightIsEstimate": item
                            .get("weightIsEstimate")
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                    }))
                })
                .collect::<Result<Vec<Value>, String>>()
        })
        .transpose()?
        .unwrap_or_default();

    let completion_payload = json!({
        "driverId": value_string(&load.payload, "driverId"),
        "vehicleId": value_string(&load.payload, "vehicleId"),
        "wasteDescription": value_string(&load.payload, "wasteDescriptionSnapshot"),
        "grossWeight": gross,
        "tareWeight": tare,
        "netWeight": net,
        "weightMetric": metric,
        "weightIsEstimate": load.payload.get("weightIsEstimate").and_then(Value::as_bool).unwrap_or(false),
        "notes": value_string(&load.payload, "notes"),
        "wasteItems": completion_waste_items,
    });

    let result = enqueue_load_event(
        &transaction,
        &actor,
        &load,
        "LOAD_COMPLETED",
        &completion_payload,
        &updated_payload,
        "completed",
        load.gross_weight.as_deref(),
        load.tare_weight.as_deref(),
        load.net_weight.as_deref(),
    )?;
    transaction.commit().map_err(|e| e.to_string())?;
    Ok(result)
}
