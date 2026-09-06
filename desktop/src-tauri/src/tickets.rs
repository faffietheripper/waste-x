use chrono::{SecondsFormat, Utc};
use keyring::Entry;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use crate::offline_auth::{self, DesktopAuthState};

const DB_FILE_NAME: &str = "waste-x-local.db";
const DATABASE_KEYRING_SERVICE: &str = "com.wastex.desktop.local-database";
const DATABASE_KEYRING_ACCOUNT: &str = "database-key-v1";
const TICKET_AUTHORITY: &str = "RECEIVING_SITE";
const PDF_TEMPLATE_VERSION: i64 = 2;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketLoadInput {
    load_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopTicketState {
    load_id: String,
    job_id: String,
    ticket_id: Option<String>,
    ticket_number: Option<String>,
    authority: &'static str,
    field_workflow_step: Option<String>,
    can_issue: bool,
    block_reason: Option<String>,
    issued_at: Option<String>,
    source_entity_version: Option<i64>,
    pdf_generated: bool,
    pdf_sha256: Option<String>,
    pdf_byte_length: Option<i64>,
    sync_state: Option<String>,
}

struct ActorContext {
    organisation_id: String,
    device_id: String,
    user_id: String,
}

struct TicketLoad {
    id: String,
    organisation_id: String,
    job_id: String,
    job_number: String,
    load_number: i64,
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
    Ok(ActorContext { organisation_id, device_id, user_id })
}

fn value_string(payload: &Value, key: &str) -> Option<String> {
    payload
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn field_workflow_step(payload: &Value) -> Option<String> {
    payload
        .get("fieldWorkflow")
        .and_then(|workflow| workflow.get("step"))
        .and_then(Value::as_str)
        .map(|step| match step {
            "DELIVERED" => "ARRIVED_DESTINATION".to_string(),
            "STARTED" | "EN_ROUTE" | "ARRIVED_COLLECTION" => "ASSIGNED".to_string(),
            other => other.to_string(),
        })
}

fn load_context(connection: &Connection, load_id: &str, organisation_id: &str) -> Result<TicketLoad, String> {
    let row = connection
        .query_row(
            "SELECT l.id, l.organisation_id, l.job_id, COALESCE(j.job_number, ''),
                    COALESCE(l.load_number, 0), l.direction, l.status,
                    l.gross_weight, l.tare_weight, l.net_weight, l.entity_version,
                    l.payload_json
             FROM local_job_load l
             INNER JOIN local_job j ON j.id = l.job_id
             WHERE l.id = ?1 AND l.organisation_id = ?2",
            params![load_id, organisation_id],
            |row| Ok((
                row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?,
                row.get::<_, String>(3)?, row.get::<_, i64>(4)?, row.get::<_, String>(5)?,
                row.get::<_, String>(6)?, row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?, row.get::<_, Option<String>>(9)?,
                row.get::<_, i64>(10)?, row.get::<_, String>(11)?,
            )),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Waste X load was not found in the encrypted Desktop working set.".to_string())?;

    if row.3.trim().is_empty() || row.4 <= 0 {
        return Err("Waste X cannot issue a ticket because the cached job/load identity is incomplete.".to_string());
    }
    let payload = serde_json::from_str::<Value>(&row.11)
        .map_err(|e| format!("Stored Waste X load data is invalid: {e}"))?;
    Ok(TicketLoad {
        id: row.0,
        organisation_id: row.1,
        job_id: row.2,
        job_number: row.3,
        load_number: row.4,
        direction: row.5,
        status: row.6,
        gross_weight: row.7,
        tare_weight: row.8,
        net_weight: row.9,
        entity_version: row.10,
        payload,
    })
}

fn ticket_block_reason(load: &TicketLoad) -> Option<String> {
    if load.status == "rejected" {
        return Some("Rejected loads keep a rejection record; they do not receive a normal accepted-load site ticket.".to_string());
    }
    if load.status == "cancelled" {
        return Some("Cancelled loads do not receive a receiving-site ticket.".to_string());
    }
    if load.status != "completed" {
        return Some("Complete the receiving-site transaction first. The site ticket is generated only after acceptance and final weight/quantity are complete.".to_string());
    }

    let net = load.net_weight.as_deref().and_then(|value| value.parse::<f64>().ok()).unwrap_or(0.0);
    if !net.is_finite() || net <= 0.0 {
        return Some("A positive final net quantity is required before the completed load can be ticketed.".to_string());
    }
    if value_string(&load.payload, "wasteDescriptionSnapshot").unwrap_or_default().is_empty() {
        return Some("The completed load has no final waste description.".to_string());
    }
    if value_string(&load.payload, "driverId").is_none() {
        return Some("The completed load has no Driver identity.".to_string());
    }
    if value_string(&load.payload, "vehicleId").is_none() {
        return Some("The completed load has no vehicle identity.".to_string());
    }
    None
}

fn normalise_job_number(value: &str) -> String {
    let mut output = String::new();
    let mut last_dash = false;
    for ch in value.trim().to_uppercase().chars() {
        if ch.is_ascii_alphanumeric() {
            output.push(ch);
            last_dash = false;
        } else if !last_dash && !output.is_empty() {
            output.push('-');
            last_dash = true;
        }
    }
    while output.ends_with('-') { output.pop(); }
    if output.is_empty() { "WX-JOB".to_string() } else { output }
}

fn load_code(load_id: &str) -> String {
    let code: String = load_id
        .chars()
        .filter(|character| character.is_ascii_hexdigit())
        .take(8)
        .map(|character| character.to_ascii_uppercase())
        .collect();
    if code.is_empty() {
        hex::encode(Sha256::digest(load_id.as_bytes()))[..8].to_uppercase()
    } else {
        code
    }
}

fn derive_ticket_number(load: &TicketLoad) -> String {
    if let Some(existing) = value_string(&load.payload, "ticketNumber") {
        return existing;
    }
    format!("{}-L{:02}-{}", normalise_job_number(&load.job_number), load.load_number, load_code(&load.id))
}

fn pdf_safe(value: &str) -> String {
    value.chars().map(|character| if character.is_ascii_graphic() || character == ' ' { character } else { '?' }).collect()
}

fn pdf_escape(value: &str) -> String {
    pdf_safe(value).replace('\\', "\\\\").replace('(', "\\(").replace(')', "\\)")
}

fn pdf_text_line(x: i32, y: i32, size: i32, bold: bool, value: &str) -> String {
    format!("BT /{} {} Tf {} {} Td ({}) Tj ET\n", if bold { "F2" } else { "F1" }, size, x, y, pdf_escape(value))
}

fn build_ticket_pdf(load: &TicketLoad, ticket_number: &str, issued_at: &str) -> Vec<u8> {
    let waste = value_string(&load.payload, "wasteDescriptionSnapshot").unwrap_or_else(|| "Not recorded".to_string());
    let ewc = value_string(&load.payload, "ewcCodeSnapshot").unwrap_or_else(|| "Not recorded".to_string());
    let driver = value_string(&load.payload, "driverId").unwrap_or_else(|| "Not recorded".to_string());
    let vehicle = value_string(&load.payload, "vehicleId").unwrap_or_else(|| "Not recorded".to_string());
    let metric = value_string(&load.payload, "weightMetric").unwrap_or_else(|| "Tonnes".to_string());
    let gross = load.gross_weight.clone().unwrap_or_else(|| "Not recorded".to_string());
    let tare = load.tare_weight.clone().unwrap_or_else(|| "Not recorded".to_string());
    let net = load.net_weight.clone().unwrap_or_else(|| "Not recorded".to_string());

    let mut content = String::new();
    content.push_str(&pdf_text_line(48, 790, 23, true, "Waste X"));
    content.push_str(&pdf_text_line(48, 765, 10, true, "RECEIVING-SITE / WEIGHBRIDGE TICKET"));
    content.push_str(&pdf_text_line(48, 735, 15, true, ticket_number));
    content.push_str(&pdf_text_line(48, 710, 10, false, &format!("Job {} | Load {:02} | {}", load.job_number, load.load_number, load.direction.to_uppercase())));
    content.push_str(&pdf_text_line(48, 680, 9, true, "SITE TRANSACTION"));
    content.push_str(&pdf_text_line(48, 663, 10, false, &format!("Load status at issue: {}", load.status.to_uppercase())));
    content.push_str(&pdf_text_line(48, 647, 10, false, &format!("Driver arrival state: {}", field_workflow_step(&load.payload).unwrap_or_else(|| "Not recorded".to_string()))));
    content.push_str(&pdf_text_line(48, 631, 10, false, &format!("Ticket issued: {issued_at}")));
    content.push_str(&pdf_text_line(48, 601, 9, true, "WASTE"));
    content.push_str(&pdf_text_line(48, 584, 10, false, &format!("EWC: {ewc}")));
    content.push_str(&pdf_text_line(48, 568, 10, false, &format!("Description: {waste}")));
    content.push_str(&pdf_text_line(48, 538, 9, true, "WEIGHTS / QUANTITY"));
    content.push_str(&pdf_text_line(48, 521, 10, false, &format!("Gross: {gross} {metric}")));
    content.push_str(&pdf_text_line(48, 505, 10, false, &format!("Tare: {tare} {metric}")));
    content.push_str(&pdf_text_line(48, 489, 11, true, &format!("Net: {net} {metric}")));
    content.push_str(&pdf_text_line(48, 459, 9, true, "TRANSPORT"));
    content.push_str(&pdf_text_line(48, 442, 10, false, &format!("Driver ID: {driver}")));
    content.push_str(&pdf_text_line(48, 426, 10, false, &format!("Vehicle ID: {vehicle}")));
    content.push_str(&pdf_text_line(48, 110, 8, false, &format!("Canonical load identity: {}", load.id)));
    content.push_str(&pdf_text_line(48, 94, 8, false, &format!("Ticket authority: {TICKET_AUTHORITY} | Template v{PDF_TEMPLATE_VERSION}")));
    content.push_str(&pdf_text_line(48, 78, 8, false, "Reprints use these exact original PDF bytes."));

    let objects = vec![
        "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>".to_string(),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>".to_string(),
        format!("<< /Length {} >>\nstream\n{}endstream", content.len(), content),
    ];
    let mut pdf = Vec::<u8>::new();
    pdf.extend_from_slice(b"%PDF-1.4\n%WasteX\n");
    let mut offsets = Vec::<usize>::new();
    for (index, object) in objects.iter().enumerate() {
        offsets.push(pdf.len());
        pdf.extend_from_slice(format!("{} 0 obj\n{}\nendobj\n", index + 1, object).as_bytes());
    }
    let xref_offset = pdf.len();
    pdf.extend_from_slice(format!("xref\n0 {}\n", objects.len() + 1).as_bytes());
    pdf.extend_from_slice(b"0000000000 65535 f \n");
    for offset in offsets { pdf.extend_from_slice(format!("{:010} 00000 n \n", offset).as_bytes()); }
    pdf.extend_from_slice(format!("trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n", objects.len() + 1, xref_offset).as_bytes());
    pdf
}

fn existing_ticket_state(connection: &Connection, load: &TicketLoad) -> Result<Option<DesktopTicketState>, String> {
    let row = connection
        .query_row(
            "SELECT t.id, t.local_ticket_number, t.issued_at, t.source_entity_version,
                    d.sha256, d.byte_length, q.status
             FROM local_ticket t
             LEFT JOIN local_ticket_document d ON d.ticket_id = t.id
             LEFT JOIN local_sync_queue q ON q.event_id = t.sync_event_id
             WHERE t.organisation_id = ?1 AND t.job_load_id = ?2
             LIMIT 1",
            params![load.organisation_id, load.id],
            |row| Ok((
                row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?, row.get::<_, Option<i64>>(3)?,
                row.get::<_, Option<String>>(4)?, row.get::<_, Option<i64>>(5)?,
                row.get::<_, Option<String>>(6)?,
            )),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(row.map(|row| DesktopTicketState {
        load_id: load.id.clone(),
        job_id: load.job_id.clone(),
        ticket_id: Some(row.0),
        ticket_number: row.1,
        authority: TICKET_AUTHORITY,
        field_workflow_step: field_workflow_step(&load.payload),
        can_issue: false,
        block_reason: None,
        issued_at: row.2,
        source_entity_version: row.3,
        pdf_generated: row.4.is_some(),
        pdf_sha256: row.4,
        pdf_byte_length: row.5,
        sync_state: row.6.or_else(|| Some("LOCAL_ONLY".to_string())),
    }))
}

fn ticket_state(connection: &Connection, load: &TicketLoad) -> Result<DesktopTicketState, String> {
    if let Some(existing) = existing_ticket_state(connection, load)? { return Ok(existing); }
    let block_reason = ticket_block_reason(load);
    Ok(DesktopTicketState {
        load_id: load.id.clone(),
        job_id: load.job_id.clone(),
        ticket_id: None,
        ticket_number: value_string(&load.payload, "ticketNumber"),
        authority: TICKET_AUTHORITY,
        field_workflow_step: field_workflow_step(&load.payload),
        can_issue: block_reason.is_none(),
        block_reason,
        issued_at: None,
        source_entity_version: None,
        pdf_generated: false,
        pdf_sha256: None,
        pdf_byte_length: None,
        sync_state: None,
    })
}

#[tauri::command]
pub fn desktop_ticket_status(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
    input: TicketLoadInput,
) -> Result<DesktopTicketState, String> {
    offline_auth::require_unlocked(&auth_state)?;
    let connection = open_local_connection(&app)?;
    let actor = actor_context(&connection)?;
    let load = load_context(&connection, input.load_id.trim(), &actor.organisation_id)?;
    ticket_state(&connection, &load)
}

#[tauri::command]
pub fn desktop_issue_ticket(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
    input: TicketLoadInput,
) -> Result<DesktopTicketState, String> {
    offline_auth::require_unlocked(&auth_state)?;
    let mut connection = open_local_connection(&app)?;
    let actor = actor_context(&connection)?;
    let load = load_context(&connection, input.load_id.trim(), &actor.organisation_id)?;

    if let Some(existing) = existing_ticket_state(&connection, &load)? { return Ok(existing); }
    if let Some(reason) = ticket_block_reason(&load) { return Err(reason); }

    let ticket_number = derive_ticket_number(&load);
    let ticket_id = load.id.clone();
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let event_id = Uuid::now_v7().to_string();
    let mut projected_payload = load.payload.clone();
    projected_payload
        .as_object_mut()
        .ok_or_else(|| "Stored Waste X load data is not an object.".to_string())?
        .insert("ticketNumber".to_string(), Value::String(ticket_number.clone()));

    let event_payload = json!({ "ticketNumber": ticket_number });
    let payload_json = serde_json::to_string(&event_payload)
        .map_err(|e| format!("Could not encode Waste X site-ticket sync event: {e}"))?;
    let payload_hash = hex::encode(Sha256::digest(payload_json.as_bytes()));
    let projected_version = load.entity_version + 1;
    let pdf_bytes = build_ticket_pdf(&load, event_payload["ticketNumber"].as_str().unwrap_or_default(), &now);
    let pdf_sha256 = hex::encode(Sha256::digest(&pdf_bytes));
    let pdf_byte_length = pdf_bytes.len() as i64;

    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    let sequence = next_device_sequence(&transaction)?;

    transaction
        .execute(
            "UPDATE local_job_load
             SET entity_version = ?1, payload_json = ?2, updated_at = ?3
             WHERE id = ?4 AND organisation_id = ?5",
            params![
                projected_version,
                serde_json::to_string(&projected_payload).map_err(|e| e.to_string())?,
                now,
                load.id,
                actor.organisation_id,
            ],
        )
        .map_err(|e| e.to_string())?;

    let site_id = value_string(&projected_payload, "ownSiteId");
    transaction
        .execute(
            "INSERT INTO local_sync_queue (
                event_id, organisation_id, site_id, device_id, actor_user_id,
                entity_type, entity_id, event_type, base_version, device_sequence,
                payload_json, payload_hash, occurred_at, recorded_at, status,
                attempt_count, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, 'job_load', ?6, 'SITE_TICKET_ISSUED', ?7, ?8, ?9, ?10, ?11, ?11, 'PENDING', 0, ?11)",
            params![
                event_id,
                actor.organisation_id,
                site_id,
                actor.device_id,
                actor.user_id,
                load.id,
                load.entity_version,
                sequence,
                payload_json,
                payload_hash,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;

    let snapshot = json!({
        "ticketId": ticket_id,
        "ticketNumber": event_payload["ticketNumber"],
        "authority": TICKET_AUTHORITY,
        "organisationId": actor.organisation_id,
        "jobId": load.job_id,
        "loadId": load.id,
        "jobNumber": load.job_number,
        "loadNumber": load.load_number,
        "direction": load.direction,
        "fieldWorkflowStep": field_workflow_step(&load.payload),
        "issuedAt": now,
        "issuedByUserId": actor.user_id,
        "issuedByDeviceId": actor.device_id,
        "sourceEntityVersion": load.entity_version,
        "loadSnapshot": load.payload,
    });

    transaction
        .execute(
            "INSERT INTO local_ticket (
                id, organisation_id, job_load_id, local_ticket_number, payload_json,
                status, issued_by_user_id, issued_by_device_id, issued_at,
                source_entity_version, sync_event_id, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, 'ISSUED', ?6, ?7, ?8, ?9, ?10, ?8, ?8)",
            params![
                ticket_id,
                actor.organisation_id,
                load.id,
                event_payload["ticketNumber"].as_str().unwrap_or_default(),
                serde_json::to_string(&snapshot).map_err(|e| e.to_string())?,
                actor.user_id,
                actor.device_id,
                now,
                load.entity_version,
                event_id,
            ],
        )
        .map_err(|e| e.to_string())?;

    transaction
        .execute(
            "INSERT INTO local_ticket_document (
                ticket_id, template_version, mime_type, pdf_bytes, sha256,
                byte_length, generated_at, created_at, updated_at
             ) VALUES (?1, ?2, 'application/pdf', ?3, ?4, ?5, ?6, ?6, ?6)",
            params![ticket_id, PDF_TEMPLATE_VERSION, pdf_bytes, pdf_sha256, pdf_byte_length, now],
        )
        .map_err(|e| e.to_string())?;

    transaction
        .execute(
            "INSERT INTO local_audit_event (
                event_id, actor_user_id, action, entity_type, entity_id, payload_json, created_at
             ) VALUES (?1, ?2, 'SITE_TICKET_ISSUED', 'job_load', ?3, ?4, ?5)",
            params![
                event_id,
                actor.user_id,
                load.id,
                serde_json::to_string(&snapshot).map_err(|e| e.to_string())?,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;

    transaction.commit().map_err(|e| e.to_string())?;
    let refreshed_load = load_context(&connection, input.load_id.trim(), &actor.organisation_id)?;
    ticket_state(&connection, &refreshed_load)
}
