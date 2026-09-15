use std::path::Path;

use keyring::Entry;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

use crate::offline_auth::{self, DesktopAuthState};

const DB_FILE_NAME: &str = "waste-x-local.db";
const DATABASE_KEYRING_SERVICE: &str = "com.wastex.desktop.local-database";
const DATABASE_KEYRING_ACCOUNT: &str = "database-key-v1";

/* WASTE_X_DESKTOP_LOCAL_RECORDS_V1 */

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalRecordsInput {
    query: Option<String>,
    offset: Option<usize>,
    limit: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalJobHistoryInput {
    job_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalRecordJob {
    id: String,
    job_number: Option<String>,
    job_date: Option<String>,
    direction: Option<String>,
    status: Option<String>,
    entity_version: i64,
    pending_create: bool,
    updated_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalRecordLoad {
    id: String,
    job_id: String,
    load_number: Option<i64>,
    direction: Option<String>,
    status: Option<String>,
    entity_version: i64,
    ewc_code: Option<String>,
    waste_description: Option<String>,
    gross_weight: Option<String>,
    tare_weight: Option<String>,
    net_weight: Option<String>,
    weight_metric: Option<String>,
    ticket_number: Option<String>,
    pending_changes: i64,
    updated_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalRecordTicket {
    id: String,
    job_load_id: String,
    ticket_number: Option<String>,
    status: String,
    issued_at: Option<String>,
    has_pdf: bool,
    byte_length: Option<i64>,
    updated_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalRecordEvidence {
    id: String,
    job_load_id: Option<String>,
    file_name: String,
    local_path: Option<String>,
    upload_status: String,
    created_at: String,
    updated_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalRecordEvent {
    id: String,
    occurred_at: String,
    source: String,
    event_type: String,
    label: String,
    entity_type: String,
    entity_id: String,
    load_number: Option<i64>,
    status: Option<String>,
    detail: Option<String>,
    payload: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalRecordTotals {
    jobs: i64,
    loads: i64,
    tickets: i64,
    evidence: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalRecordsCatalogue {
    ok: bool,
    query: String,
    offset: usize,
    limit: usize,
    totals: LocalRecordTotals,
    jobs: Vec<LocalRecordJob>,
    loads: Vec<LocalRecordLoad>,
    tickets: Vec<LocalRecordTicket>,
    evidence: Vec<LocalRecordEvidence>,
    has_more_jobs: bool,
    next_offset: Option<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalJobHistory {
    ok: bool,
    job: LocalRecordJob,
    loads: Vec<LocalRecordLoad>,
    tickets: Vec<LocalRecordTicket>,
    evidence: Vec<LocalRecordEvidence>,
    events: Vec<LocalRecordEvent>,
    note: String,
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

fn payload(encoded: &str) -> Value {
    serde_json::from_str(encoded).unwrap_or(Value::Null)
}

fn payload_text(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|value| match value {
            Value::String(value) if !value.trim().is_empty() => Some(value.clone()),
            Value::Number(value) => Some(value.to_string()),
            _ => None,
        })
}

fn local_file_name(local_path: Option<&str>, record: &Value) -> String {
    if let Some(file_name) = payload_text(record, "fileName") {
        return file_name;
    }

    local_path
        .and_then(|value| Path::new(value).file_name())
        .and_then(|value| value.to_str())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "Local evidence file".to_string())
}

fn pending_job_create(
    connection: &Connection,
    organisation_id: &str,
    job_id: &str,
) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT 1
             FROM local_cloud_mutation_queue
             WHERE organisation_id = ?1
               AND mutation_kind = 'job'
               AND entity_type = 'job'
               AND entity_id = ?2
               AND status IN ('PENDING','SENDING','FAILED')
             LIMIT 1",
            params![organisation_id, job_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map(|value| value.is_some())
        .map_err(|e| e.to_string())
}

fn record_job(
    connection: &Connection,
    organisation_id: &str,
    row: (String, Option<String>, Option<String>, Option<String>, Option<String>, i64, String),
) -> Result<LocalRecordJob, String> {
    Ok(LocalRecordJob {
        pending_create: pending_job_create(connection, organisation_id, &row.0)?,
        id: row.0,
        job_number: row.1,
        job_date: row.2,
        direction: row.3,
        status: row.4,
        entity_version: row.5,
        updated_at: row.6,
    })
}

fn query_jobs(
    connection: &Connection,
    organisation_id: &str,
    query: &str,
    offset: usize,
    limit: usize,
) -> Result<(i64, Vec<LocalRecordJob>, bool), String> {
    let pattern = format!("%{}%", query.to_lowercase());

    let total = connection
        .query_row(
            "SELECT COUNT(*)
             FROM local_job
             WHERE organisation_id = ?1
               AND (
                 ?2 = '' OR
                 lower(COALESCE(job_number, '')) LIKE ?3 OR
                 lower(COALESCE(status, '')) LIKE ?3 OR
                 lower(COALESCE(direction, '')) LIKE ?3 OR
                 lower(COALESCE(payload_json, '')) LIKE ?3
               )",
            params![organisation_id, query, pattern],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?;

    let mut statement = connection
        .prepare(
            "SELECT id, job_number, job_date, direction, status, entity_version, updated_at
             FROM local_job
             WHERE organisation_id = ?1
               AND (
                 ?2 = '' OR
                 lower(COALESCE(job_number, '')) LIKE ?3 OR
                 lower(COALESCE(status, '')) LIKE ?3 OR
                 lower(COALESCE(direction, '')) LIKE ?3 OR
                 lower(COALESCE(payload_json, '')) LIKE ?3
               )
             ORDER BY COALESCE(job_date, '') DESC, COALESCE(job_number, id) DESC
             LIMIT ?4 OFFSET ?5",
        )
        .map_err(|e| e.to_string())?;

    let rows = statement
        .query_map(
            params![organisation_id, query, pattern, (limit + 1) as i64, offset as i64],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    let raw = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let has_more = raw.len() > limit;
    let mut jobs = Vec::new();
    for row in raw.into_iter().take(limit) {
        jobs.push(record_job(connection, organisation_id, row)?);
    }

    Ok((total, jobs, has_more))
}

fn query_loads_for_job(
    connection: &Connection,
    organisation_id: &str,
    job_id: &str,
) -> Result<Vec<LocalRecordLoad>, String> {
    let mut statement = connection
        .prepare(
            "SELECT
               l.id,
               l.job_id,
               l.load_number,
               l.direction,
               l.status,
               l.entity_version,
               l.gross_weight,
               l.tare_weight,
               l.net_weight,
               l.payload_json,
               l.updated_at,
               (
                 SELECT COUNT(*)
                 FROM local_sync_queue q
                 WHERE q.organisation_id = l.organisation_id
                   AND q.entity_type = 'job_load'
                   AND q.entity_id = l.id
                   AND q.status IN ('PENDING','SENDING','CONFLICT','FAILED')
               ) pending_changes,
               (
                 SELECT t.local_ticket_number
                 FROM local_ticket t
                 WHERE t.organisation_id = l.organisation_id
                   AND t.job_load_id = l.id
                 ORDER BY t.updated_at DESC
                 LIMIT 1
               ) ticket_number
             FROM local_job_load l
             WHERE l.organisation_id = ?1
               AND l.job_id = ?2
             ORDER BY COALESCE(l.load_number, 0), l.id",
        )
        .map_err(|e| e.to_string())?;

    let rows = statement
        .query_map(params![organisation_id, job_id], |row| {
            let encoded = row.get::<_, String>(9)?;
            let record = payload(&encoded);

            Ok(LocalRecordLoad {
                id: row.get(0)?,
                job_id: row.get(1)?,
                load_number: row.get(2)?,
                direction: row.get(3)?,
                status: row.get(4)?,
                entity_version: row.get(5)?,
                gross_weight: row.get(6)?,
                tare_weight: row.get(7)?,
                net_weight: row.get(8)?,
                ewc_code: payload_text(&record, "ewcCodeSnapshot")
                    .or_else(|| payload_text(&record, "ewcCode")),
                waste_description: payload_text(&record, "wasteDescriptionSnapshot")
                    .or_else(|| payload_text(&record, "wasteDescription")),
                weight_metric: payload_text(&record, "weightMetric"),
                updated_at: row.get(10)?,
                pending_changes: row.get(11)?,
                ticket_number: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn query_tickets_for_load(
    connection: &Connection,
    organisation_id: &str,
    load_id: &str,
) -> Result<Vec<LocalRecordTicket>, String> {
    let mut statement = connection
        .prepare(
            "SELECT
               t.id,
               t.job_load_id,
               t.local_ticket_number,
               COALESCE(t.status, 'ISSUED'),
               t.issued_at,
               t.updated_at,
               d.byte_length
             FROM local_ticket t
             LEFT JOIN local_ticket_document d ON d.ticket_id = t.id
             WHERE t.organisation_id = ?1
               AND t.job_load_id = ?2
             ORDER BY t.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = statement
        .query_map(params![organisation_id, load_id], |row| {
            let byte_length = row.get::<_, Option<i64>>(6)?;
            Ok(LocalRecordTicket {
                id: row.get(0)?,
                job_load_id: row
                    .get::<_, Option<String>>(1)?
                    .unwrap_or_else(|| load_id.to_string()),
                ticket_number: row.get(2)?,
                status: row.get(3)?,
                issued_at: row.get(4)?,
                updated_at: row.get(5)?,
                has_pdf: byte_length.is_some(),
                byte_length,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn query_evidence_for_load(
    connection: &Connection,
    organisation_id: &str,
    load_id: &str,
) -> Result<Vec<LocalRecordEvidence>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, job_load_id, local_path, upload_status, payload_json, created_at, updated_at
             FROM local_evidence_metadata
             WHERE organisation_id = ?1
               AND job_load_id = ?2
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = statement
        .query_map(params![organisation_id, load_id], |row| {
            let local_path = row.get::<_, Option<String>>(2)?;
            let encoded = row.get::<_, Option<String>>(4)?.unwrap_or_default();
            let record = payload(&encoded);

            Ok(LocalRecordEvidence {
                id: row.get(0)?,
                job_load_id: row.get(1)?,
                file_name: local_file_name(local_path.as_deref(), &record),
                local_path,
                upload_status: row.get(3)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn event_label(event_type: &str) -> String {
    match event_type {
        "JOB_CREATE_QUEUED_OFFLINE" => "Job created locally".to_string(),
        "JOB_CREATED" => "Job created".to_string(),
        "LOAD_CREATED" => "Load created".to_string(),
        "LOAD_DETAILS_UPDATED" => "Load details / assignment updated".to_string(),
        "LOAD_ARRIVED" => "Carrier arrived".to_string(),
        "LOAD_ACCEPTED" => "Receiving site accepted".to_string(),
        "LOAD_REJECTED" | "SITE_LOAD_REJECTED" => "Load rejected".to_string(),
        "FIELD_COLLECTION_REJECTED" => "Driver refused collection".to_string(),
        "FIELD_COLLECTED" => "Driver collected".to_string(),
        "FIELD_IN_TRANSIT" => "Driver in transit".to_string(),
        "FIELD_ARRIVED_DESTINATION" => "Arrived at destination".to_string(),
        "LOAD_COMPLETED" => "Load completed".to_string(),
        "SITE_TICKET_ISSUED" => "Site ticket issued".to_string(),
        other => other
            .to_lowercase()
            .split('_')
            .map(|part| {
                let mut chars = part.chars();
                match chars.next() {
                    Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                    None => String::new(),
                }
            })
            .collect::<Vec<_>>()
            .join(" "),
    }
}

fn sync_events_for_entity(
    connection: &Connection,
    organisation_id: &str,
    entity_type: &str,
    entity_id: &str,
    load_number: Option<i64>,
) -> Result<Vec<LocalRecordEvent>, String> {
    let mut statement = connection
        .prepare(
            "SELECT event_id, occurred_at, event_type, status, last_error, payload_json
             FROM local_sync_queue
             WHERE organisation_id = ?1
               AND entity_type = ?2
               AND entity_id = ?3
             ORDER BY occurred_at DESC, device_sequence DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = statement
        .query_map(params![organisation_id, entity_type, entity_id], |row| {
            let event_type = row.get::<_, String>(2)?;
            let encoded = row.get::<_, String>(5)?;
            Ok(LocalRecordEvent {
                id: row.get(0)?,
                occurred_at: row.get(1)?,
                source: "Desktop".to_string(),
                label: event_label(&event_type),
                event_type,
                entity_type: entity_type.to_string(),
                entity_id: entity_id.to_string(),
                load_number,
                status: row.get(3)?,
                detail: row.get(4)?,
                payload: payload(&encoded),
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn audit_events_for_entity(
    connection: &Connection,
    entity_type: &str,
    entity_id: &str,
    load_number: Option<i64>,
) -> Result<Vec<LocalRecordEvent>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, COALESCE(event_id, ''), created_at, action, payload_json
             FROM local_audit_event
             WHERE entity_type = ?1
               AND entity_id = ?2
             ORDER BY created_at DESC, id DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = statement
        .query_map(params![entity_type, entity_id], |row| {
            let numeric_id = row.get::<_, i64>(0)?;
            let event_id = row.get::<_, String>(1)?;
            let event_type = row.get::<_, String>(3)?;
            let encoded = row.get::<_, Option<String>>(4)?.unwrap_or_default();

            Ok(LocalRecordEvent {
                id: if event_id.is_empty() {
                    format!("audit-{numeric_id}")
                } else {
                    format!("audit-{numeric_id}-{event_id}")
                },
                occurred_at: row.get(2)?,
                source: "Local audit".to_string(),
                label: event_label(&event_type),
                event_type,
                entity_type: entity_type.to_string(),
                entity_id: entity_id.to_string(),
                load_number,
                status: None,
                detail: None,
                payload: payload(&encoded),
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn job_mutation_events(
    connection: &Connection,
    organisation_id: &str,
    job_id: &str,
) -> Result<Vec<LocalRecordEvent>, String> {
    let mut statement = connection
        .prepare(
            "SELECT mutation_id, operation, status, last_error, created_at, payload_json
             FROM local_cloud_mutation_queue
             WHERE organisation_id = ?1
               AND mutation_kind = 'job'
               AND entity_type = 'job'
               AND entity_id = ?2
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = statement
        .query_map(params![organisation_id, job_id], |row| {
            let operation = row.get::<_, String>(1)?;
            let status = row.get::<_, String>(2)?;
            let encoded = row.get::<_, String>(5)?;
            let event_type = if operation == "job.create" {
                "JOB_CREATE_QUEUED_OFFLINE".to_string()
            } else {
                operation
            };

            Ok(LocalRecordEvent {
                id: row.get(0)?,
                occurred_at: row.get(4)?,
                source: "Desktop".to_string(),
                label: event_label(&event_type),
                event_type,
                entity_type: "job".to_string(),
                entity_id: job_id.to_string(),
                load_number: None,
                status: Some(status),
                detail: row.get(3)?,
                payload: payload(&encoded),
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn desktop_local_records(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
    input: LocalRecordsInput,
) -> Result<LocalRecordsCatalogue, String> {
    offline_auth::require_unlocked(&auth_state)?;

    let connection = open_local_connection(&app)?;
    let organisation_id = organisation_id(&connection)?;
    let query = input.query.unwrap_or_default().trim().to_string();
    let offset = input.offset.unwrap_or(0);
    let limit = input.limit.unwrap_or(50).clamp(1, 100);

    let (job_total, jobs, has_more_jobs) =
        query_jobs(&connection, &organisation_id, &query, offset, limit)?;

    let mut loads = Vec::new();
    let mut tickets = Vec::new();
    let mut evidence = Vec::new();

    for job in &jobs {
        for load in query_loads_for_job(&connection, &organisation_id, &job.id)? {
            tickets.extend(query_tickets_for_load(
                &connection,
                &organisation_id,
                &load.id,
            )?);
            evidence.extend(query_evidence_for_load(
                &connection,
                &organisation_id,
                &load.id,
            )?);
            loads.push(load);
        }
    }

    let total_loads = connection
        .query_row(
            "SELECT COUNT(*) FROM local_job_load WHERE organisation_id = ?1",
            params![&organisation_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?;
    let total_tickets = connection
        .query_row(
            "SELECT COUNT(*) FROM local_ticket WHERE organisation_id = ?1",
            params![&organisation_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?;
    let total_evidence = connection
        .query_row(
            "SELECT COUNT(*) FROM local_evidence_metadata WHERE organisation_id = ?1",
            params![&organisation_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(LocalRecordsCatalogue {
        ok: true,
        query,
        offset,
        limit,
        totals: LocalRecordTotals {
            jobs: job_total,
            loads: total_loads,
            tickets: total_tickets,
            evidence: total_evidence,
        },
        jobs,
        loads,
        tickets,
        evidence,
        has_more_jobs,
        next_offset: if has_more_jobs {
            Some(offset + limit)
        } else {
            None
        },
    })
}

#[tauri::command]
pub fn desktop_local_job_history(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
    input: LocalJobHistoryInput,
) -> Result<LocalJobHistory, String> {
    offline_auth::require_unlocked(&auth_state)?;

    let connection = open_local_connection(&app)?;
    let organisation_id = organisation_id(&connection)?;
    let job_id = input.job_id.trim();

    if job_id.is_empty() {
        return Err("Choose a Waste X Job to inspect its local history.".to_string());
    }

    let row = connection
        .query_row(
            "SELECT id, job_number, job_date, direction, status, entity_version, updated_at
             FROM local_job
             WHERE organisation_id = ?1 AND id = ?2",
            params![organisation_id, job_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "That Job is not present in this Desktop's encrypted records.".to_string())?;

    let job = record_job(&connection, &organisation_id, row)?;
    let loads = query_loads_for_job(&connection, &organisation_id, &job.id)?;

    let mut tickets = Vec::new();
    let mut evidence = Vec::new();
    let mut events = Vec::new();

    events.extend(sync_events_for_entity(
        &connection,
        &organisation_id,
        "job",
        &job.id,
        None,
    )?);
    events.extend(audit_events_for_entity(
        &connection,
        "job",
        &job.id,
        None,
    )?);
    events.extend(job_mutation_events(
        &connection,
        &organisation_id,
        &job.id,
    )?);

    for load in &loads {
        tickets.extend(query_tickets_for_load(
            &connection,
            &organisation_id,
            &load.id,
        )?);
        evidence.extend(query_evidence_for_load(
            &connection,
            &organisation_id,
            &load.id,
        )?);
        events.extend(sync_events_for_entity(
            &connection,
            &organisation_id,
            "job_load",
            &load.id,
            load.load_number,
        )?);
        events.extend(audit_events_for_entity(
            &connection,
            "job_load",
            &load.id,
            load.load_number,
        )?);
    }

    events.sort_by(|left, right| {
        right
            .occurred_at
            .cmp(&left.occurred_at)
            .then_with(|| right.id.cmp(&left.id))
    });

    Ok(LocalJobHistory {
        ok: true,
        job,
        loads,
        tickets,
        evidence,
        events,
        note: "Encrypted local history for this workstation. When Cloud is connected, the whole-account Cloud record below may contain additional history from Web, Mobile or other Desktop devices.".to_string(),
    })
}
