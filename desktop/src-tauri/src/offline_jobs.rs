use keyring::Entry;
use reqwest::Client;
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
const JOB_OPTIONS_SNAPSHOT_KEY: &str = "desktop_job_options_snapshot_v1";

/* WASTE_X_DESKTOP_OFFLINE_JOB_CREATION_V1 */

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloudCredentials {
    device_secret: String,
    session_token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobMutationSyncResult {
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

fn default_site_id(connection: &Connection) -> Result<String, String> {
    connection
        .query_row(
            "SELECT default_site_id
             FROM local_device_configuration
             WHERE singleton_id = 1",
            [],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "This Waste X Desktop is not assigned to a site.".to_string())
}

fn metadata_json(connection: &Connection, key: &str) -> Result<Value, String> {
    let encoded = connection
        .query_row(
            "SELECT value FROM local_sync_metadata WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| {
            "Waste X Job reference data is not cached on this Desktop yet. Connect once before creating Jobs offline."
                .to_string()
        })?;

    serde_json::from_str(&encoded)
        .map_err(|e| format!("Cached Waste X Job reference data is unreadable: {e}"))
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
    text(value, key).ok_or_else(|| format!("Waste X Job is missing {key}."))
}

fn array<'a>(value: &'a Value, key: &str) -> Result<&'a Vec<Value>, String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("Cached Waste X Job data is missing {key}."))
}

fn find_by_id<'a>(rows: &'a [Value], id: &str) -> Option<&'a Value> {
    rows.iter()
        .find(|row| row.get("id").and_then(Value::as_str) == Some(id))
}

fn input_text(input: &Value, key: &str) -> Option<String> {
    text(input, key)
}

fn input_strings(input: &Value, key: &str) -> Vec<String> {
    input
        .get(key)
        .and_then(Value::as_array)
        .map(|rows| {
            rows.iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn numeric_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn pricing_value(pricing: &Value, key: &str) -> Value {
    numeric_string(pricing, key)
        .map(Value::String)
        .unwrap_or(Value::Null)
}

fn acceptance_for_ewc<'a>(options: &'a Value, ewc_code_id: &str) -> Option<&'a Value> {
    options
        .get("regulatoryAcceptanceAuthorities")
        .and_then(Value::as_array)
        .and_then(|rows| {
            rows.iter().find(|row| {
                row.get("acceptedEwcCodeId").and_then(Value::as_str) == Some(ewc_code_id)
            })
        })
}

fn acceptance_snapshot(
    transaction: &Transaction<'_>,
    options: &Value,
    material: &Value,
    organisation_id: &str,
    site_id: &str,
    permit_id: &str,
) -> Result<Value, String> {
    let ewc_code_id = text(material, "ewcCodeId").unwrap_or_default();
    let exact_match = options
        .get("exactPermittedEwcCodeIds")
        .and_then(Value::as_array)
        .map(|rows| rows.iter().any(|row| row.as_str() == Some(ewc_code_id.as_str())))
        .unwrap_or(false);

    if exact_match {
        return Ok(json!({
            "matchType": "exact",
            "activationId": null,
            "ruleId": null,
            "ruleKey": null,
            "ruleScope": null,
            "qualifyingAuthorisationRef": null,
            "basis": null,
            "reference": null,
            "permittedEwcCode": material.get("ewcCode").cloned().unwrap_or(Value::Null)
        }));
    }

    if let Some(authority) = acceptance_for_ewc(options, &ewc_code_id) {
        let local_rule = transaction
            .query_row(
                "SELECT activation_id, rule_id, rule_key,
                        qualifying_authorisation_ref, rule_type, payload_json
                 FROM local_regulatory_acceptance_rule_snapshot
                 WHERE organisation_id = ?1
                   AND site_id = ?2
                   AND permit_id = ?3
                   AND actual_ewc_code_id = ?4
                   AND active = 1
                 ORDER BY updated_at DESC
                 LIMIT 1",
                params![organisation_id, site_id, permit_id, ewc_code_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| format!("Could not read cached regulatory acceptance details: {e}"))?;

        let (activation_id, rule_id, rule_key, qualifying_ref, fallback_scope, rule_payload) =
            local_rule.ok_or_else(|| {
                "This regulatory acceptance rule is not fully cached on this Desktop. Reconnect and reconcile the working set before creating this Job offline."
                    .to_string()
            })?;
        let rule_payload: Value = serde_json::from_str(&rule_payload).unwrap_or_else(|_| json!({}));
        let rule_scope = text(&rule_payload, "ruleScope")
            .or_else(|| (!fallback_scope.is_empty()).then_some(fallback_scope));

        Ok(json!({
            "matchType": "regulatory_authority",
            "activationId": activation_id,
            "ruleId": rule_id,
            "ruleKey": rule_key,
            "ruleScope": rule_scope,
            "qualifyingAuthorisationRef": qualifying_ref,
            "basis": authority.get("basis").cloned().unwrap_or(Value::Null),
            "reference": authority.get("reference").cloned().unwrap_or(Value::Null),
            "permittedEwcCode": authority
                .get("permittedEwcCode")
                .cloned()
                .unwrap_or_else(|| material.get("ewcCode").cloned().unwrap_or(Value::Null))
        }))
    } else {
        Ok(json!({
            "matchType": "exact",
            "activationId": null,
            "ruleId": null,
            "ruleKey": null,
            "ruleScope": null,
            "qualifyingAuthorisationRef": null,
            "basis": null,
            "reference": null,
            "permittedEwcCode": material.get("ewcCode").cloned().unwrap_or(Value::Null)
        }))
    }
}

fn material_snapshot(
    material: &Value,
    acceptance: &Value,
    waste_item_id: &str,
    item_number: usize,
) -> Value {
    json!({
        "id": waste_item_id,
        "itemNumber": item_number,
        "materialProfileId": material.get("id").cloned().unwrap_or(Value::Null),
        "ewcCodeId": material.get("ewcCodeId").cloned().unwrap_or(Value::Null),
        "ewcCodeSnapshot": material.get("ewcCode").cloned().unwrap_or(Value::Null),
        "wasteDescriptionSnapshot": material.get("wasteDescription").cloned().unwrap_or(Value::Null),
        "physicalFormSnapshot": material.get("physicalForm").cloned().unwrap_or(Value::Null),
        "numberOfContainers": material.get("defaultNumberOfContainers").cloned().unwrap_or(Value::Null),
        "containerTypeSnapshot": material.get("defaultContainerType").cloned().unwrap_or(Value::Null),
        "containsPops": material.get("containsPops").cloned().unwrap_or(Value::Bool(false)),
        "popsSourceOfComponents": material.get("popsSourceOfComponents").cloned().unwrap_or(Value::Null),
        "popsComponents": material.get("popsComponents").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        "containsHazardous": material.get("containsHazardous").cloned().unwrap_or(Value::Bool(false)),
        "hazardousSourceOfComponents": material.get("hazardousSourceOfComponents").cloned().unwrap_or(Value::Null),
        "hazardousHazCodes": material.get("hazardousHazCodes").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        "hazardousComponents": material.get("hazardousComponents").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        "disposalRecoveryCodeId": material.get("defaultDisposalRecoveryCodeId").cloned().unwrap_or(Value::Null),
        "disposalRecoveryCodeSnapshot": material.get("disposalRecoveryCode").cloned().unwrap_or(Value::Null),
        "weightMetric": material.get("defaultWeightMetric").cloned().unwrap_or_else(|| Value::String("Tonnes".to_string())),
        "weightAmount": null,
        "weightIsEstimate": false,
        "weightSource": "allocation",
        "permitEwcMatchType": acceptance.get("matchType").cloned().unwrap_or(Value::Null),
        "regulatoryAuthorityActivationId": acceptance.get("activationId").cloned().unwrap_or(Value::Null),
        "regulatoryAcceptanceRuleId": acceptance.get("ruleId").cloned().unwrap_or(Value::Null),
        "regulatoryRuleKeySnapshot": acceptance.get("ruleKey").cloned().unwrap_or(Value::Null),
        "regulatoryRuleScopeSnapshot": acceptance.get("ruleScope").cloned().unwrap_or(Value::Null),
        "qualifyingAuthorisationRefSnapshot": acceptance.get("qualifyingAuthorisationRef").cloned().unwrap_or(Value::Null),
        "permitEwcBasis": acceptance.get("basis").cloned().unwrap_or(Value::Null),
        "permitEwcReference": acceptance.get("reference").cloned().unwrap_or(Value::Null),
        "permitEwcCodeSnapshot": acceptance.get("permittedEwcCode").cloned().unwrap_or(Value::Null)
    })
}

/* WASTE_X_DESKTOP_JOB_REFERENCE_RANDOM_SUFFIX_V1
 *
 * UUIDv7 starts with a time-ordered timestamp. Taking the first six hex
 * characters therefore makes multiple Jobs created close together share the
 * same reference suffix. Use ten hex characters from the random tail instead.
 * The existing local uniqueness guard remains as a final safety check.
 */
fn generated_job_number(direction: &str, job_date: &str, job_id: &str) -> String {
    let date_part = job_date.replace('-', "");
    let compact_id = job_id
        .chars()
        .filter(|character| character.is_ascii_hexdigit())
        .collect::<String>();

    let suffix = compact_id
        .chars()
        .rev()
        .take(10)
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>()
        .to_uppercase();

    if direction == "outgoing" {
        format!("WX-OUT-{date_part}-{suffix}")
    } else {
        format!("WX-{date_part}-{suffix}")
    }
}

fn queued_counts(connection: &Connection) -> Result<(i64, i64), String> {
    let pending = connection
        .query_row(
            "SELECT COUNT(*) FROM local_cloud_mutation_queue
             WHERE mutation_kind = 'job' AND status IN ('PENDING','SENDING')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let failed = connection
        .query_row(
            "SELECT COUNT(*) FROM local_cloud_mutation_queue
             WHERE mutation_kind = 'job' AND status = 'FAILED'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok((pending, failed))
}

fn active_driver<'a>(options: &'a Value, id: &str) -> Option<&'a Value> {
    array(options, "drivers")
        .ok()?
        .iter()
        .find(|row| row.get("id").and_then(Value::as_str) == Some(id))
}

fn active_vehicle<'a>(options: &'a Value, id: &str) -> Option<&'a Value> {
    array(options, "vehicles")
        .ok()?
        .iter()
        .find(|row| row.get("id").and_then(Value::as_str) == Some(id))
}

fn ensure_job_number_unused(connection: &Connection, organisation_id: &str, job_number: &str) -> Result<(), String> {
    let exists = connection
        .query_row(
            "SELECT 1 FROM local_job WHERE organisation_id = ?1 AND job_number = ?2 LIMIT 1",
            params![organisation_id, job_number],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .is_some();

    if exists {
        return Err("Waste X generated a duplicate local Job reference. Try creating the Job again.".to_string());
    }
    Ok(())
}

fn validate_and_prepare(
    connection: &Connection,
    input: &Value,
) -> Result<(Value, Vec<Value>, Vec<Vec<String>>, String, String), String> {
    let options = metadata_json(connection, JOB_OPTIONS_SNAPSHOT_KEY)?;
    if options
        .get("offlineCreateSchemaVersion")
        .and_then(Value::as_i64)
        != Some(1)
    {
        return Err(
            "Waste X needs one online Job-options refresh after this Desktop update before Jobs can be created offline."
                .to_string(),
        );
    }

    let organisation_id = organisation_id(connection)?;
    let own_site_id = default_site_id(connection)?;

    let direction = required_text(input, "direction")?;
    if direction != "incoming" && direction != "outgoing" {
        return Err("Waste X Job direction must be incoming or outgoing.".to_string());
    }

    let job_date = required_text(input, "jobDate")?;
    if job_date.len() != 10 {
        return Err("Choose a valid Job date.".to_string());
    }

    let planned_loads = input
        .get("plannedLoads")
        .and_then(Value::as_u64)
        .ok_or_else(|| "Choose the number of planned Loads.".to_string())? as usize;
    if !(1..=100).contains(&planned_loads) {
        return Err("Planned Loads must be between 1 and 100.".to_string());
    }

    let own_site = options
        .get("ownSite")
        .ok_or_else(|| "Cached Job options are missing this workstation site.".to_string())?;
    if text(own_site, "id").as_deref() != Some(own_site_id.as_str()) {
        return Err("Cached Job options do not match this workstation site. Reconnect before creating a new Job.".to_string());
    }

    let primary_permit = options
        .get("primaryPermit")
        .ok_or_else(|| "Cached Job options are missing the site's primary permit.".to_string())?;
    let _permit_id = required_text(primary_permit, "id")?;

    let primary_material_id = required_text(input, "materialProfileId")?;
    let mut material_ids = input_strings(input, "materialProfileIds");
    if material_ids.is_empty() {
        material_ids.push(primary_material_id.clone());
    }
    if material_ids.first() != Some(&primary_material_id) {
        material_ids.retain(|id| id != &primary_material_id);
        material_ids.insert(0, primary_material_id.clone());
    }
    material_ids.dedup();

    if direction == "outgoing" && material_ids.len() > 1 {
        return Err("This pilot allows multiple Waste Items only on incoming receiving Jobs.".to_string());
    }
    if material_ids.len() > 8 {
        return Err("A Waste X Load can contain at most 8 Waste Items in this pilot.".to_string());
    }

    let materials = array(&options, "materials")?;
    let permitted_ewcs = options
        .get("permittedEwcCodeIds")
        .and_then(Value::as_array)
        .ok_or_else(|| "Cached Job options are missing permitted EWC codes.".to_string())?;

    let mut selected_materials = Vec::new();
    for material_id in &material_ids {
        let material = find_by_id(materials, material_id)
            .ok_or_else(|| "A selected Material Profile is no longer available in the cached working set.".to_string())?;
        let ewc_id = required_text(material, "ewcCodeId")?;
        let accepted = permitted_ewcs
            .iter()
            .any(|value| value.as_str() == Some(ewc_id.as_str()));
        if !accepted {
            return Err(format!(
                "Material {} is not accepted by this site's cached permit/authority configuration.",
                text(material, "name").unwrap_or_else(|| material_id.clone())
            ));
        }
        selected_materials.push(material.clone());
    }

    if direction == "incoming" {
        let client_id = required_text(input, "clientId")?;
        let client_site_id = required_text(input, "clientSiteId")?;
        if find_by_id(array(&options, "clients")?, &client_id).is_none() {
            return Err("Choose an available source company.".to_string());
        }
        let client_site = find_by_id(array(&options, "clientSites")?, &client_site_id)
            .ok_or_else(|| "Choose an available source site.".to_string())?;
        if text(client_site, "counterpartyId").as_deref() != Some(client_id.as_str()) {
            return Err("The selected source site belongs to a different company.".to_string());
        }
    } else {
        let destination_id = required_text(input, "destinationSiteId")?;
        let facility = find_by_id(array(&options, "facilities")?, &destination_id)
            .ok_or_else(|| "Choose an available destination facility.".to_string())?;
        let primary_ewc = required_text(&selected_materials[0], "ewcCodeId")?;
        let destination_permits = facility
            .get("permittedEwcCodeIds")
            .and_then(Value::as_array)
            .ok_or_else(|| "Cached destination EWC acceptance is unavailable.".to_string())?;
        if !destination_permits
            .iter()
            .any(|value| value.as_str() == Some(primary_ewc.as_str()))
        {
            return Err("The selected destination is not configured to accept this EWC code.".to_string());
        }
    }

    let transport_mode = required_text(input, "transportMode")?;
    let resolved_haulier = if transport_mode == "external" {
        let id = required_text(input, "haulierId")?;
        if find_by_id(array(&options, "hauliers")?, &id).is_none() {
            return Err("Choose an available haulier.".to_string());
        }
        Some(id)
    } else if transport_mode == "own" {
        None
    } else {
        return Err("Transport mode must be own fleet or external haulier.".to_string());
    };

    if let Some(driver_id) = input_text(input, "driverId") {
        let driver = active_driver(&options, &driver_id)
            .ok_or_else(|| "The selected Driver is not available in this working set.".to_string())?;
        if text(driver, "haulierCounterpartyId") != resolved_haulier {
            return Err("The selected Driver belongs to a different carrier.".to_string());
        }
    }

    if let Some(vehicle_id) = input_text(input, "vehicleId") {
        let vehicle = active_vehicle(&options, &vehicle_id)
            .ok_or_else(|| "The selected Vehicle is not available in this working set.".to_string())?;
        if text(vehicle, "haulierCounterpartyId") != resolved_haulier {
            return Err("The selected Vehicle belongs to a different carrier.".to_string());
        }
    }

    let waste_item_ids = (0..planned_loads)
        .map(|_| {
            (0..selected_materials.len())
                .map(|_| Uuid::now_v7().to_string())
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();

    Ok((
        options,
        selected_materials,
        waste_item_ids,
        organisation_id,
        own_site_id,
    ))
}

fn insert_local_job(
    transaction: &Transaction<'_>,
    input: &Value,
    options: &Value,
    materials: &[Value],
    waste_item_ids: &[Vec<String>],
    organisation_id: &str,
    own_site_id: &str,
    job_id: &str,
    job_number: &str,
    load_ids: &[String],
    now: &str,
) -> Result<Value, String> {
    let direction = required_text(input, "direction")?;
    let job_date = required_text(input, "jobDate")?;
    let primary_permit = options
        .get("primaryPermit")
        .ok_or_else(|| "Cached Job options are missing the site's primary permit.".to_string())?;
    let permit_id = required_text(primary_permit, "id")?;
    let planned_loads = load_ids.len();
    let pricing = input.get("pricing").cloned().unwrap_or_else(|| json!({}));

    let client_id = input_text(input, "clientId");
    let client_site_id = input_text(input, "clientSiteId");
    let destination_site_id = input_text(input, "destinationSiteId");
    let haulier_id = input_text(input, "haulierId");
    let driver_id = input_text(input, "driverId");
    let vehicle_id = input_text(input, "vehicleId");
    let purchase_order = input_text(input, "purchaseOrder");
    let customer_reference = input_text(input, "customerReference");
    let notes = input_text(input, "notes");

    let job_payload = json!({
        "id": job_id,
        "organisationId": organisation_id,
        "jobNumber": job_number,
        "source": "manual",
        "direction": direction,
        "status": "booked",
        "jobDate": job_date,
        "clientCounterpartyId": client_id,
        "clientSiteId": client_site_id,
        "ownSiteId": own_site_id,
        "sitePermitId": permit_id,
        "thirdPartyDestinationSiteId": destination_site_id,
        "haulierCounterpartyId": haulier_id,
        "driverId": driver_id,
        "vehicleId": vehicle_id,
        "materialProfileId": materials.first().and_then(|row| row.get("id")).cloned().unwrap_or(Value::Null),
        "plannedLoads": planned_loads,
        "purchaseOrder": purchase_order,
        "customerReference": customer_reference,
        "notes": notes,
        "offlineCreatePending": true,
        "createdAt": now,
        "updatedAt": now
    });

    transaction
        .execute(
            "INSERT INTO local_job (
               id, organisation_id, own_site_id, job_number, job_date,
               direction, status, entity_version, payload_json, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'booked', 0, ?7, ?8)",
            params![
                job_id,
                organisation_id,
                own_site_id,
                job_number,
                job_date,
                direction,
                job_payload.to_string(),
                now
            ],
        )
        .map_err(|e| format!("Could not save the Job to encrypted Desktop storage: {e}"))?;

    let primary_material = materials
        .first()
        .ok_or_else(|| "Waste X Job has no Material Profile.".to_string())?;
    let primary_acceptance = acceptance_snapshot(
        transaction,
        options,
        primary_material,
        organisation_id,
        own_site_id,
        &permit_id,
    )?;

    for (index, load_id) in load_ids.iter().enumerate() {
        let waste_items = materials
            .iter()
            .enumerate()
            .map(|(item_index, material)| {
                let acceptance = acceptance_snapshot(
                    transaction,
                    options,
                    material,
                    organisation_id,
                    own_site_id,
                    &permit_id,
                )?;
                Ok(material_snapshot(
                    material,
                    &acceptance,
                    &waste_item_ids[index][item_index],
                    item_index + 1,
                ))
            })
            .collect::<Result<Vec<_>, String>>()?;

        let load_number = index + 1;
        let load_payload = json!({
            "id": load_id,
            "organisationId": organisation_id,
            "jobId": job_id,
            "loadNumber": load_number,
            "status": "planned",
            "direction": direction,
            "clientCounterpartyId": client_id,
            "clientSiteId": client_site_id,
            "ownSiteId": own_site_id,
            "sitePermitId": permit_id,
            "permitEwcMatchType": primary_acceptance.get("matchType").cloned().unwrap_or(Value::Null),
            "regulatoryAuthorityActivationId": primary_acceptance.get("activationId").cloned().unwrap_or(Value::Null),
            "permitEwcBasis": primary_acceptance.get("basis").cloned().unwrap_or(Value::Null),
            "permitEwcReference": primary_acceptance.get("reference").cloned().unwrap_or(Value::Null),
            "permitEwcCodeSnapshot": primary_acceptance.get("permittedEwcCode").cloned().unwrap_or(Value::Null),
            "permitEwcCheckedAt": now,
            "thirdPartyDestinationSiteId": destination_site_id,
            "haulierCounterpartyId": haulier_id,
            "driverId": driver_id,
            "vehicleId": vehicle_id,
            "materialProfileId": primary_material.get("id").cloned().unwrap_or(Value::Null),
            "ewcCodeId": primary_material.get("ewcCodeId").cloned().unwrap_or(Value::Null),
            "ewcCodeSnapshot": primary_material.get("ewcCode").cloned().unwrap_or(Value::Null),
            "wasteDescriptionSnapshot": primary_material.get("wasteDescription").cloned().unwrap_or(Value::Null),
            "physicalFormSnapshot": primary_material.get("physicalForm").cloned().unwrap_or(Value::Null),
            "numberOfContainers": primary_material.get("defaultNumberOfContainers").cloned().unwrap_or(Value::Null),
            "containerTypeSnapshot": primary_material.get("defaultContainerType").cloned().unwrap_or(Value::Null),
            "containsPops": primary_material.get("containsPops").cloned().unwrap_or(Value::Bool(false)),
            "popsSourceOfComponents": primary_material.get("popsSourceOfComponents").cloned().unwrap_or(Value::Null),
            "popsComponents": primary_material.get("popsComponents").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
            "containsHazardous": primary_material.get("containsHazardous").cloned().unwrap_or(Value::Bool(false)),
            "hazardousSourceOfComponents": primary_material.get("hazardousSourceOfComponents").cloned().unwrap_or(Value::Null),
            "hazardousHazCodes": primary_material.get("hazardousHazCodes").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
            "hazardousComponents": primary_material.get("hazardousComponents").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
            "disposalRecoveryCodeId": primary_material.get("defaultDisposalRecoveryCodeId").cloned().unwrap_or(Value::Null),
            "disposalRecoveryCodeSnapshot": primary_material.get("disposalRecoveryCode").cloned().unwrap_or(Value::Null),
            "weightMetric": primary_material.get("defaultWeightMetric").cloned().unwrap_or_else(|| Value::String("Tonnes".to_string())),
            "weightIsEstimate": false,
            "weightSource": "manual",
            "grossWeight": null,
            "tareWeight": null,
            "netWeight": null,
            "ticketNumber": null,
            "purchaseOrder": purchase_order,
            "customerReference": customer_reference,
            "customerChargeAmount": pricing_value(&pricing, "customerChargeAmount"),
            "customerChargeUnit": pricing.get("customerChargeUnit").cloned().unwrap_or(Value::Null),
            "haulageCostAmount": pricing_value(&pricing, "haulageCostAmount"),
            "haulageCostUnit": pricing.get("haulageCostUnit").cloned().unwrap_or(Value::Null),
            "tippingCostAmount": pricing_value(&pricing, "tippingCostAmount"),
            "tippingCostUnit": pricing.get("tippingCostUnit").cloned().unwrap_or(Value::Null),
            "currency": "GBP",
            "notes": notes,
            "wasteItems": waste_items,
            "offlineCreatePending": true,
            "createdAt": now,
            "updatedAt": now
        });

        transaction
            .execute(
                "INSERT INTO local_job_load (
                   id, organisation_id, job_id, own_site_id, load_number,
                   direction, status, gross_weight, tare_weight, net_weight,
                   entity_version, payload_json, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'planned', NULL, NULL, NULL, 0, ?7, ?8)",
                params![
                    load_id,
                    organisation_id,
                    job_id,
                    own_site_id,
                    load_number as i64,
                    direction,
                    load_payload.to_string(),
                    now
                ],
            )
            .map_err(|e| format!("Could not save planned Load {load_number} locally: {e}"))?;
    }

    Ok(job_payload)
}

fn queue_job_create(
    transaction: &Transaction<'_>,
    input: &Value,
    organisation_id: &str,
    job_id: &str,
    job_number: &str,
    load_ids: &[String],
    waste_item_ids: &[Vec<String>],
    now: &str,
) -> Result<(), String> {
    let mutation_id = Uuid::now_v7().to_string();
    let mut payload = input
        .as_object()
        .cloned()
        .ok_or_else(|| "Waste X Job request must be an object.".to_string())?;

    payload.insert("clientJobId".to_string(), Value::String(job_id.to_string()));
    payload.insert(
        "clientJobNumber".to_string(),
        Value::String(job_number.to_string()),
    );
    payload.insert(
        "clientLoadIds".to_string(),
        Value::Array(load_ids.iter().cloned().map(Value::String).collect()),
    );
    payload.insert(
        "clientWasteItemIds".to_string(),
        Value::Array(
            waste_item_ids
                .iter()
                .map(|row| Value::Array(row.iter().cloned().map(Value::String).collect()))
                .collect(),
        ),
    );

    let payload_json = Value::Object(payload).to_string();

    transaction
        .execute(
            "INSERT INTO local_cloud_mutation_queue (
               mutation_id, organisation_id, mutation_kind, entity_type, entity_id,
               operation, payload_json, status, attempt_count, last_error,
               created_at, updated_at
             ) VALUES (?1, ?2, 'job', 'job', ?3, 'job.create', ?4, 'PENDING', 0, NULL, ?5, ?5)",
            params![mutation_id, organisation_id, job_id, payload_json, now],
        )
        .map_err(|e| format!("Could not queue the offline Job for Cloud sync: {e}"))?;

    transaction
        .execute(
            "INSERT INTO local_audit_event (
               event_id, action, entity_type, entity_id, payload_json, created_at
             ) VALUES (?1, 'JOB_CREATE_QUEUED_OFFLINE', 'job', ?2, ?3, ?4)",
            params![
                mutation_id,
                job_id,
                json!({"jobNumber":job_number,"loadCount":load_ids.len()}).to_string(),
                now
            ],
        )
        .map_err(|e| format!("Could not record the offline Job audit event: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn desktop_create_job_local(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
    input: Value,
) -> Result<Value, String> {
    offline_auth::require_unlocked(&auth_state)?;

    let mut connection = open_local_connection(&app)?;
    let (
        options,
        materials,
        waste_item_ids,
        organisation_id,
        own_site_id,
    ) = validate_and_prepare(&connection, &input)?;

    let planned_loads = input
        .get("plannedLoads")
        .and_then(Value::as_u64)
        .ok_or_else(|| "Choose the number of planned Loads.".to_string())? as usize;

    // Generate the stable Job identity and matching human reference once.
    let job_id = Uuid::now_v7().to_string();
    let direction = required_text(&input, "direction")?;
    let job_date = required_text(&input, "jobDate")?;
    let job_number = generated_job_number(&direction, &job_date, &job_id);
    ensure_job_number_unused(&connection, &organisation_id, &job_number)?;

    let load_ids = (0..planned_loads)
        .map(|_| Uuid::now_v7().to_string())
        .collect::<Vec<_>>();

    let now = now_iso(&connection)?;
    let transaction = connection
        .transaction()
        .map_err(|e| format!("Could not start local Job transaction: {e}"))?;

    let job_payload = insert_local_job(
        &transaction,
        &input,
        &options,
        &materials,
        &waste_item_ids,
        &organisation_id,
        &own_site_id,
        &job_id,
        &job_number,
        &load_ids,
        &now,
    )?;

    queue_job_create(
        &transaction,
        &input,
        &organisation_id,
        &job_id,
        &job_number,
        &load_ids,
        &waste_item_ids,
        &now,
    )?;

    transaction
        .commit()
        .map_err(|e| format!("Could not commit the local Job transaction: {e}"))?;

    Ok(json!({
        "ok": true,
        "job": {
            "id": job_id,
            "jobNumber": job_number,
            "direction": direction,
            "jobDate": job_date
        },
        "jobLoads": load_ids
            .iter()
            .enumerate()
            .map(|(index, id)| json!({"id":id,"loadNumber":index + 1}))
            .collect::<Vec<_>>(),
        "firstLoadId": load_ids.first(),
        "syncFeedWarning": false,
        "queued": true,
        "localPayload": job_payload
    }))
}

fn mark_queue(
    connection: &Connection,
    mutation_id: &str,
    status: &str,
    last_error: Option<&str>,
) -> Result<(), String> {
    connection
        .execute(
            "UPDATE local_cloud_mutation_queue
             SET status = ?1,
                 attempt_count = attempt_count + CASE WHEN ?1 = 'SENDING' THEN 1 ELSE 0 END,
                 last_error = ?2,
                 updated_at = datetime('now')
             WHERE mutation_id = ?3",
            params![status, last_error, mutation_id],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn entity_version(body: &Value, entity_type: &str, entity_id: &str) -> i64 {
    body.get("entityVersions")
        .and_then(Value::as_array)
        .and_then(|rows| {
            rows.iter().find(|row| {
                row.get("entityType").and_then(Value::as_str) == Some(entity_type)
                    && row.get("entityId").and_then(Value::as_str) == Some(entity_id)
            })
        })
        .and_then(|row| row.get("version"))
        .and_then(Value::as_i64)
        .unwrap_or(0)
}

fn queue_load_ids(payload: &Value) -> Vec<String> {
    input_strings(payload, "clientLoadIds")
}

/* WASTE_X_DESKTOP_JOB_PARTNER_DEPENDENCIES_V1 */
enum PartnerDependencyState {
    Ready,
    Pending,
    Failed,
}

fn partner_dependency_state(
    connection: &Connection,
    payload: &Value,
) -> Result<PartnerDependencyState, String> {
    let dependency_ids = [
        input_text(payload, "clientId"),
        input_text(payload, "clientSiteId"),
        input_text(payload, "destinationSiteId"),
        input_text(payload, "haulierId"),
    ];
    let mut pending = false;

    for entity_id in dependency_ids.into_iter().flatten() {
        let status = connection
            .query_row(
                "SELECT status
                 FROM local_cloud_mutation_queue
                 WHERE mutation_kind = 'partner'
                   AND entity_id = ?1
                 ORDER BY created_at DESC, mutation_id DESC
                 LIMIT 1",
                params![entity_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        match status.as_deref() {
            Some("FAILED") => return Ok(PartnerDependencyState::Failed),
            Some("PENDING") | Some("SENDING") => pending = true,
            _ => {}
        }
    }

    Ok(if pending {
        PartnerDependencyState::Pending
    } else {
        PartnerDependencyState::Ready
    })
}

enum TransportDependencyState {
    Ready,
    Pending,
    Failed,
}

fn transport_dependency_state(
    connection: &Connection,
    payload: &Value,
) -> Result<TransportDependencyState, String> {
    let dependency_ids = [input_text(payload, "driverId"), input_text(payload, "vehicleId")];
    let mut pending = false;

    for entity_id in dependency_ids.into_iter().flatten() {
        let status = connection
            .query_row(
                "SELECT status
                 FROM local_cloud_mutation_queue
                 WHERE mutation_kind = 'transport'
                   AND entity_id = ?1
                 ORDER BY created_at DESC, mutation_id DESC
                 LIMIT 1",
                params![entity_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        match status.as_deref() {
            Some("FAILED") => return Ok(TransportDependencyState::Failed),
            Some("PENDING") | Some("SENDING") => pending = true,
            _ => {}
        }
    }

    Ok(if pending {
        TransportDependencyState::Pending
    } else {
        TransportDependencyState::Ready
    })
}

fn mark_job_dependents_rejected(
    connection: &Connection,
    payload: &Value,
    detail: &str,
) -> Result<(), String> {
    for load_id in queue_load_ids(payload) {
        connection
            .execute(
                "UPDATE local_sync_queue
                 SET status = 'FAILED',
                     last_error = ?1,
                     updated_at = datetime('now')
                 WHERE entity_type = 'job_load'
                   AND entity_id = ?2
                   AND status IN ('PENDING','SENDING','FAILED')",
                params![
                    format!("LOCAL_DEPENDENCY:JOB_CREATE_REJECTED:{detail}"),
                    load_id
                ],
            )
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn apply_job_create_ack(
    connection: &mut Connection,
    queue_payload: &Value,
    body: &Value,
) -> Result<(), String> {
    let job_id = required_text(queue_payload, "clientJobId")?;
    let load_ids = queue_load_ids(queue_payload);
    let cloud_job_version = entity_version(body, "job", &job_id);

    let transaction = connection
        .transaction()
        .map_err(|e| format!("Could not apply Job Cloud acknowledgement: {e}"))?;

    transaction
        .execute(
            "UPDATE local_job
             SET entity_version = entity_version + ?1,
                 payload_json = json_remove(payload_json, '$.offlineCreatePending'),
                 updated_at = datetime('now')
             WHERE id = ?2",
            params![cloud_job_version, job_id],
        )
        .map_err(|e| e.to_string())?;

    for load_id in load_ids {
        let cloud_load_version = entity_version(body, "job_load", &load_id);

        transaction
            .execute(
                "UPDATE local_sync_queue
                 SET base_version = COALESCE(base_version, 0) + ?1,
                     status = CASE
                       WHEN last_error LIKE 'LOCAL_DEPENDENCY:JOB_CREATE_%' THEN 'PENDING'
                       ELSE status
                     END,
                     last_error = CASE
                       WHEN last_error LIKE 'LOCAL_DEPENDENCY:JOB_CREATE_%' THEN NULL
                       ELSE last_error
                     END,
                     updated_at = datetime('now')
                 WHERE entity_type = 'job_load'
                   AND entity_id = ?2
                   AND status IN ('PENDING','SENDING','FAILED')",
                params![cloud_load_version, load_id],
            )
            .map_err(|e| e.to_string())?;

        transaction
            .execute(
                "UPDATE local_ticket
                 SET source_entity_version =
                       CASE
                         WHEN source_entity_version IS NULL THEN NULL
                         ELSE source_entity_version + ?1
                       END
                 WHERE job_load_id = ?2",
                params![cloud_load_version, load_id],
            )
            .map_err(|e| e.to_string())?;

        transaction
            .execute(
                "UPDATE local_job_load
                 SET entity_version = entity_version + ?1,
                     payload_json = json_remove(payload_json, '$.offlineCreatePending'),
                     updated_at = datetime('now')
                 WHERE id = ?2",
                params![cloud_load_version, load_id],
            )
            .map_err(|e| e.to_string())?;
    }

    transaction
        .commit()
        .map_err(|e| format!("Could not commit Job Cloud acknowledgement: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn desktop_sync_job_mutations(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
) -> Result<JobMutationSyncResult, String> {
    offline_auth::require_unlocked(&auth_state)?;

    {
        let connection = open_local_connection(&app)?;
        connection
            .execute(
                "UPDATE local_cloud_mutation_queue
                 SET status = 'PENDING',
                     last_error = 'INTERRUPTED:Previous Job sync stopped before Cloud acknowledgement',
                     updated_at = datetime('now')
                 WHERE mutation_kind = 'job' AND status = 'SENDING'",
                [],
            )
            .map_err(|e| e.to_string())?;
    }

    let credentials = match load_cloud_credentials() {
        Ok(credentials) => credentials,
        Err(error) => {
            let connection = open_local_connection(&app)?;
            let (pending, failed) = queued_counts(&connection)?;
            return Ok(JobMutationSyncResult {
                ok: true,
                synced_now: 0,
                pending,
                failed,
                warning: Some(error),
            });
        }
    };

    let queue = {
        let connection = open_local_connection(&app)?;
        let mut statement = connection
            .prepare(
                "SELECT mutation_id, payload_json
                 FROM local_cloud_mutation_queue
                 WHERE mutation_kind = 'job' AND status = 'PENDING'
                 ORDER BY created_at, mutation_id",
            )
            .map_err(|e| e.to_string())?;

        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };

    let client = Client::new();
    let mut synced_now = 0_usize;
    let mut warning = None;

    for (mutation_id, payload_json) in queue {
        let payload: Value = serde_json::from_str(&payload_json)
            .map_err(|e| format!("Stored offline Job request is unreadable: {e}"))?;

        {
            let connection = open_local_connection(&app)?;

            match partner_dependency_state(&connection, &payload)? {
                PartnerDependencyState::Pending => {
                    warning = Some(
                        "This offline Job is waiting for its Company / Site / Haulier master-data change to reach Cloud first."
                            .to_string(),
                    );
                    continue;
                }
                PartnerDependencyState::Failed => {
                    let detail = "A Company / Site / Haulier required by this offline Job needs sync review.";
                    mark_queue(
                        &connection,
                        &mutation_id,
                        "FAILED",
                        Some("REJECTED:PARTNER_DEPENDENCY_FAILED"),
                    )?;
                    mark_job_dependents_rejected(&connection, &payload, detail)?;
                    warning = Some(detail.to_string());
                    continue;
                }
                PartnerDependencyState::Ready => {}
            }

            match transport_dependency_state(&connection, &payload)? {
                TransportDependencyState::Pending => {
                    warning = Some(
                        "This offline Job is waiting for its Driver / Vehicle master-data change to reach Cloud first."
                            .to_string(),
                    );
                    continue;
                }
                TransportDependencyState::Failed => {
                    let detail = "A Driver / Vehicle required by this offline Job needs sync review.";
                    mark_queue(
                        &connection,
                        &mutation_id,
                        "FAILED",
                        Some("REJECTED:TRANSPORT_DEPENDENCY_FAILED"),
                    )?;
                    mark_job_dependents_rejected(&connection, &payload, detail)?;
                    warning = Some(detail.to_string());
                    continue;
                }
                TransportDependencyState::Ready => {}
            }

            mark_queue(&connection, &mutation_id, "SENDING", None)?;
        }

        let response = match client
            .post(format!("{}/api/desktop/v1/operations/jobs", cloud_base_url()))
            .bearer_auth(&credentials.session_token)
            .header("X-Waste-X-Device-Secret", &credentials.device_secret)
            .json(&payload)
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                let connection = open_local_connection(&app)?;
                mark_queue(
                    &connection,
                    &mutation_id,
                    "PENDING",
                    Some(&format!("NETWORK:{error}")),
                )?;
                warning = Some(
                    "Offline Jobs remain safely queued until Waste X Cloud is reachable."
                        .to_string(),
                );
                break;
            }
        };

        let status = response.status();
        let body = response
            .json::<Value>()
            .await
            .unwrap_or_else(|_| json!({"error":"Waste X Cloud returned unreadable Job data."}));

        if status.as_u16() == 401 || status.as_u16() == 403 {
            let connection = open_local_connection(&app)?;
            mark_queue(
                &connection,
                &mutation_id,
                "PENDING",
                Some("AUTH_REQUIRED:Renew the Waste X Desktop Cloud session"),
            )?;
            warning = Some(
                "Offline Jobs are queued. Sign in online to renew Cloud access.".to_string(),
            );
            break;
        }

        if status.as_u16() == 429 || status.is_server_error() {
            let detail = body
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("Waste X Cloud asked this Job to retry later.");
            let connection = open_local_connection(&app)?;
            mark_queue(
                &connection,
                &mutation_id,
                "PENDING",
                Some(&format!("RETRYABLE:{detail}")),
            )?;
            warning = Some(
                "Offline Jobs remain queued and will retry automatically.".to_string(),
            );
            break;
        }

        if !status.is_success() {
            let detail = body
                .get("message")
                .and_then(Value::as_str)
                .or_else(|| body.get("error").and_then(Value::as_str))
                .unwrap_or("Waste X Cloud rejected this offline Job.");

            let connection = open_local_connection(&app)?;
            mark_queue(
                &connection,
                &mutation_id,
                "FAILED",
                Some(&format!("REJECTED:{detail}")),
            )?;
            mark_job_dependents_rejected(&connection, &payload, detail)?;
            warning = Some(
                "One offline Job needs review. Its encrypted local copy and later Load activity were preserved."
                    .to_string(),
            );
            continue;
        }

        let mut connection = open_local_connection(&app)?;
        apply_job_create_ack(&mut connection, &payload, &body)?;
        mark_queue(&connection, &mutation_id, "SYNCED", None)?;
        synced_now += 1;
    }

    let connection = open_local_connection(&app)?;
    let (pending, failed) = queued_counts(&connection)?;

    Ok(JobMutationSyncResult {
        ok: true,
        synced_now,
        pending,
        failed,
        warning,
    })
}
