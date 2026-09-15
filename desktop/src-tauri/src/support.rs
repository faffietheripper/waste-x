use chrono::{SecondsFormat, Utc};
use keyring::Entry;
use reqwest::Client;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use crate::offline_auth::{self, DesktopAuthState};

/* WASTE_X_DESKTOP_OFFLINE_SUPPORT_RELIABILITY_V3 */

const DB_FILE_NAME: &str = "waste-x-local.db";
const DATABASE_KEYRING_SERVICE: &str = "com.wastex.desktop.local-database";
const DATABASE_KEYRING_ACCOUNT: &str = "database-key-v1";
const CLOUD_KEYRING_SERVICE: &str = "com.wastex.desktop.cloud-credentials";
const CLOUD_KEYRING_ACCOUNT: &str = "credentials-v1";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloudCredentials {
    device_secret: String,
    session_token: String,
}

fn cloud_base_url() -> String {
    option_env!("WASTE_X_DESKTOP_API_BASE_URL")
        .unwrap_or("http://localhost:3000")
        .trim_end_matches('/')
        .to_string()
}

fn open_local_connection(app: &AppHandle) -> Result<Connection, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Could not resolve Waste X application data directory: {e}"))?;
    let path = app_data_dir.join(DB_FILE_NAME);
    let entry = Entry::new(DATABASE_KEYRING_SERVICE, DATABASE_KEYRING_ACCOUNT)
        .map_err(|e| format!("Could not access the OS credential store: {e}"))?;
    let key = entry.get_password()
        .map_err(|e| format!("Could not read the Waste X database key: {e}"))?;
    let connection = Connection::open(path)
        .map_err(|e| format!("Could not open the Waste X local database: {e}"))?;
    connection.execute_batch(&format!(
        "PRAGMA key = \"x'{key}'\";\n         PRAGMA foreign_keys = ON;\n         PRAGMA journal_mode = WAL;\n         PRAGMA synchronous = FULL;\n         PRAGMA busy_timeout = 5000;"
    )).map_err(|e| format!("Could not unlock the Waste X local database: {e}"))?;
    Ok(connection)
}

fn load_cloud_credentials() -> Result<CloudCredentials, String> {
    let entry = Entry::new(CLOUD_KEYRING_SERVICE, CLOUD_KEYRING_ACCOUNT)
        .map_err(|e| format!("Could not access the OS credential store for Waste X Cloud: {e}"))?;
    let encoded = entry.get_password()
        .map_err(|e| format!("Waste X Cloud credentials are unavailable: {e}"))?;
    serde_json::from_str(&encoded)
        .map_err(|e| format!("Stored Waste X Cloud credentials are invalid: {e}"))
}

fn metadata(connection: &Connection, key: &str) -> Result<Option<String>, String> {
    connection.query_row(
        "SELECT value FROM local_sync_metadata WHERE key = ?1",
        params![key],
        |row| row.get(0),
    ).optional().map_err(|e| e.to_string())
}

fn actor_context(connection: &Connection) -> Result<(String, String), String> {
    let organisation_id: String = connection.query_row(
        "SELECT organisation_id FROM local_device_configuration
         WHERE singleton_id = 1 AND organisation_id IS NOT NULL",
        [],
        |row| row.get(0),
    ).map_err(|_| "This Waste X Desktop installation is not provisioned.".to_string())?;

    let user_id = metadata(connection, "offline_auth_user_id")?
        .or_else(|| metadata(connection, "provisioned_user_id").ok().flatten())
        .ok_or_else(|| "Waste X Desktop does not know the current user.".to_string())?;

    Ok((organisation_id, user_id))
}

fn required_text<'a>(value: &'a Value, key: &str) -> Result<&'a str, String> {
    value.get(key).and_then(Value::as_str).map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("Support request is missing {key}."))
}

fn support_data(connection: &Connection, organisation_id: &str, viewer_user_id: &str) -> Result<Value, String> {
    let pending_count: i64 = connection.query_row(
        "SELECT COUNT(*) FROM local_support_queue
         WHERE organisation_id = ?1 AND (
           status IN ('PENDING','SENDING')
           OR (
             status = 'FAILED' AND (
               COALESCE(last_error, '') LIKE 'NETWORK:%'
               OR COALESCE(last_error, '') LIKE 'RETRYABLE:%'
               OR COALESCE(last_error, '') LIKE 'INTERRUPTED:%'
             )
           )
         )",
        params![organisation_id], |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let failed_count: i64 = connection.query_row(
        "SELECT COUNT(*) FROM local_support_queue
         WHERE organisation_id = ?1
           AND status = 'FAILED'
           AND NOT (
             COALESCE(last_error, '') LIKE 'NETWORK:%'
             OR COALESCE(last_error, '') LIKE 'RETRYABLE:%'
             OR COALESCE(last_error, '') LIKE 'INTERRUPTED:%'
           )",
        params![organisation_id], |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let mut statement = connection.prepare(
        "SELECT id, created_by_user_id, category, priority, status,
                assigned_to_user_id, created_at, updated_at
         FROM local_support_ticket
         WHERE organisation_id = ?1
         ORDER BY updated_at DESC, created_at DESC"
    ).map_err(|e| e.to_string())?;

    let ticket_rows = statement.query_map(params![organisation_id], |row| {
        Ok((
            row.get::<_, String>(0)?, row.get::<_, String>(1)?,
            row.get::<_, String>(2)?, row.get::<_, String>(3)?,
            row.get::<_, String>(4)?, row.get::<_, Option<String>>(5)?,
            row.get::<_, String>(6)?, row.get::<_, String>(7)?,
        ))
    }).map_err(|e| e.to_string())?;

    let mut tickets = Vec::new();

    for row in ticket_rows {
        let (id, created_by_user_id, category, priority, status,
             assigned_to_user_id, created_at, updated_at) = row.map_err(|e| e.to_string())?;

        let mut message_statement = connection.prepare(
            "SELECT m.id, m.ticket_id, m.sender_user_id, m.sender_name,
                    m.sender_role, m.author_kind, m.message, m.created_at,
                    (SELECT CASE
                       WHEN q.status = 'FAILED' AND NOT (
                         COALESCE(q.last_error, '') LIKE 'NETWORK:%'
                         OR COALESCE(q.last_error, '') LIKE 'RETRYABLE:%'
                         OR COALESCE(q.last_error, '') LIKE 'INTERRUPTED:%'
                       ) THEN 'failed'
                       WHEN q.status IN ('PENDING','SENDING')
                         OR (
                           q.status = 'FAILED' AND (
                             COALESCE(q.last_error, '') LIKE 'NETWORK:%'
                             OR COALESCE(q.last_error, '') LIKE 'RETRYABLE:%'
                             OR COALESCE(q.last_error, '') LIKE 'INTERRUPTED:%'
                           )
                         ) THEN 'pending'
                       ELSE NULL END
                     FROM local_support_queue q
                     WHERE q.message_id = m.id
                     ORDER BY q.created_at DESC LIMIT 1)
             FROM local_support_message m
             WHERE m.organisation_id = ?1 AND m.ticket_id = ?2
             ORDER BY m.created_at ASC"
        ).map_err(|e| e.to_string())?;

        let message_rows = message_statement.query_map(params![organisation_id, id], |r| {
            let message_id: String = r.get(0)?;
            let ticket_id: String = r.get(1)?;
            let sender_user_id: String = r.get(2)?;
            let sender_name: Option<String> = r.get(3)?;
            let sender_role: Option<String> = r.get(4)?;
            let author_kind: String = r.get(5)?;
            let message: String = r.get(6)?;
            let created_at: String = r.get(7)?;
            let sync_state: Option<String> = r.get(8)?;
            Ok(json!({
                "id": message_id, "ticketId": ticket_id,
                "senderUserId": sender_user_id, "senderName": sender_name,
                "senderRole": sender_role, "authorKind": author_kind,
                "message": message, "createdAt": created_at,
                "syncState": sync_state,
            }))
        }).map_err(|e| e.to_string())?;

        let messages = message_rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        tickets.push(json!({
            "id": id, "createdByUserId": created_by_user_id,
            "category": category, "priority": priority, "status": status,
            "assignedToUserId": assigned_to_user_id,
            "createdAt": created_at, "updatedAt": updated_at,
            "messages": messages,
        }));
    }

    Ok(json!({
        "ok": true,
        "viewer": { "userId": viewer_user_id },
        "tickets": tickets,
        "pendingCount": pending_count,
        "failedCount": failed_count,
    }))
}

fn cache_cloud_data(connection: &mut Connection, organisation_id: &str, body: &Value) -> Result<(), String> {
    let Some(tickets) = body.get("tickets").and_then(Value::as_array) else {
        return Err("Waste X Support response is missing tickets.".to_string());
    };

    let transaction = connection.transaction().map_err(|e| e.to_string())?;

    for ticket in tickets {
        let id = required_text(ticket, "id")?;
        let created_by_user_id = required_text(ticket, "createdByUserId")?;
        let category = required_text(ticket, "category")?;
        let priority = required_text(ticket, "priority")?;
        let status = required_text(ticket, "status")?;
        let fallback = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
        let created_at = ticket.get("createdAt").and_then(Value::as_str).unwrap_or(&fallback);
        let updated_at = ticket.get("updatedAt").and_then(Value::as_str).unwrap_or(created_at);
        let assigned_to_user_id = ticket.get("assignedToUserId").and_then(Value::as_str);

        transaction.execute(
            "INSERT INTO local_support_ticket (
                id, organisation_id, created_by_user_id, category, priority,
                status, assigned_to_user_id, created_at, updated_at
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
             ON CONFLICT(id) DO UPDATE SET
                organisation_id=excluded.organisation_id,
                created_by_user_id=excluded.created_by_user_id,
                category=excluded.category, priority=excluded.priority,
                status=excluded.status, assigned_to_user_id=excluded.assigned_to_user_id,
                created_at=excluded.created_at, updated_at=excluded.updated_at",
            params![id, organisation_id, created_by_user_id, category, priority,
                    status, assigned_to_user_id, created_at, updated_at],
        ).map_err(|e| e.to_string())?;

        if let Some(messages) = ticket.get("messages").and_then(Value::as_array) {
            for message in messages {
                let message_id = required_text(message, "id")?;
                let ticket_id = required_text(message, "ticketId")?;
                let sender_user_id = required_text(message, "senderUserId")?;
                let author_kind = required_text(message, "authorKind")?;
                let text = required_text(message, "message")?;
                let fallback_message = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
                let message_created_at = message.get("createdAt").and_then(Value::as_str)
                    .unwrap_or(&fallback_message);

                transaction.execute(
                    "INSERT INTO local_support_message (
                        id, organisation_id, ticket_id, sender_user_id,
                        sender_name, sender_role, author_kind, message, created_at
                     ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
                     ON CONFLICT(id) DO UPDATE SET
                        organisation_id=excluded.organisation_id,
                        ticket_id=excluded.ticket_id, sender_user_id=excluded.sender_user_id,
                        sender_name=excluded.sender_name, sender_role=excluded.sender_role,
                        author_kind=excluded.author_kind, message=excluded.message,
                        created_at=excluded.created_at",
                    params![message_id, organisation_id, ticket_id, sender_user_id,
                            message.get("senderName").and_then(Value::as_str),
                            message.get("senderRole").and_then(Value::as_str),
                            author_kind, text, message_created_at],
                ).map_err(|e| e.to_string())?;
            }
        }
    }

    transaction.commit().map_err(|e| e.to_string())
}

pub fn recover_interrupted_support_sends(app: &AppHandle) -> Result<(), String> {
    let connection = open_local_connection(app)?;
    connection.execute(
        "UPDATE local_support_queue
         SET status = 'FAILED',
             last_error = 'INTERRUPTED:Previous support sync stopped before Cloud acknowledgement',
             updated_at = ?1
         WHERE status = 'SENDING'",
        params![Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

fn mark_queue(app: &AppHandle, mutation_id: &str, status: &str, last_error: Option<&str>) -> Result<(), String> {
    let connection = open_local_connection(app)?;
    connection.execute(
        "UPDATE local_support_queue
         SET status=?1,
             attempt_count=CASE WHEN ?1='SENDING' THEN attempt_count+1 ELSE attempt_count END,
             last_error=?2, updated_at=?3
         WHERE mutation_id=?4",
        params![status, last_error,
                Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true), mutation_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn desktop_support_tickets(app: AppHandle, auth_state: State<'_, DesktopAuthState>) -> Result<Value, String> {
    offline_auth::require_unlocked(&auth_state)?;
    let connection = open_local_connection(&app)?;
    let (organisation_id, viewer_user_id) = actor_context(&connection)?;
    support_data(&connection, &organisation_id, &viewer_user_id)
}

#[tauri::command]
pub fn desktop_mutate_support(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
    input: Value,
) -> Result<Value, String> {
    offline_auth::require_unlocked(&auth_state)?;
    let connection = open_local_connection(&app)?;
    let (organisation_id, actor_user_id) = actor_context(&connection)?;
    let operation = required_text(&input, "operation")?.to_string();
    let data = input.get("data").ok_or_else(|| "Support request is missing data.".to_string())?;

    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let mutation_id = Uuid::now_v7().to_string();
    let message_id = Uuid::now_v7().to_string();

    let ticket_id = if operation == "ticket.create" {
        let category = required_text(data, "category")?;
        let priority = required_text(data, "priority")?;
        let message = required_text(data, "message")?;
        let message_length = message.chars().count();
        if message_length < 10 {
            return Err("Please describe the issue in at least 10 characters.".to_string());
        }
        if message_length > 5000 {
            return Err("Support messages must be 5,000 characters or fewer.".to_string());
        }

        let ticket_id = Uuid::now_v7().to_string();
        let payload = json!({
            "operation":"ticket.create",
            "data":{
                "ticketId":ticket_id.clone(), "messageId":message_id.clone(),
                "actorUserId":actor_user_id.clone(), "category":category,
                "priority":priority, "message":message, "occurredAt":now.clone()
            }
        });

        let tx = connection.unchecked_transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO local_support_ticket (
               id,organisation_id,created_by_user_id,category,priority,status,
               assigned_to_user_id,created_at,updated_at
             ) VALUES (?1,?2,?3,?4,?5,'open',NULL,?6,?6)",
            params![ticket_id, organisation_id, actor_user_id, category, priority, now],
        ).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO local_support_message (
               id,organisation_id,ticket_id,sender_user_id,sender_name,sender_role,
               author_kind,message,created_at
             ) VALUES (?1,?2,?3,?4,NULL,NULL,'customer',?5,?6)",
            params![message_id, organisation_id, ticket_id, actor_user_id, message, now],
        ).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO local_support_queue (
               mutation_id,organisation_id,ticket_id,message_id,operation,payload_json,
               status,attempt_count,last_error,created_at,updated_at
             ) VALUES (?1,?2,?3,?4,'ticket.create',?5,'PENDING',0,NULL,?6,?6)",
            params![mutation_id, organisation_id, ticket_id, message_id, payload.to_string(), now],
        ).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO local_audit_event (
               event_id,actor_user_id,action,entity_type,entity_id,payload_json,created_at
             ) VALUES (?1,?2,'SUPPORT_TICKET_QUEUED','support_ticket',?3,?4,?5)",
            params![mutation_id, actor_user_id, ticket_id, payload.to_string(), now],
        ).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        ticket_id
    } else if operation == "ticket.reply" {
        let ticket_id = required_text(data, "ticketId")?.to_string();
        let message = required_text(data, "message")?;
        if message.chars().count() > 5000 {
            return Err("Support messages must be 5,000 characters or fewer.".to_string());
        }
        let current_status: String = connection.query_row(
            "SELECT status FROM local_support_ticket WHERE id=?1 AND organisation_id=?2",
            params![ticket_id, organisation_id], |row| row.get(0),
        ).map_err(|_| "This support ticket is not available on this Desktop.".to_string())?;

        if current_status == "resolved" || current_status == "closed" {
            return Err(format!("This support ticket is {current_status} and cannot receive another reply."));
        }

        let payload = json!({
            "operation":"ticket.reply",
            "data":{
                "ticketId":ticket_id.clone(), "messageId":message_id.clone(),
                "actorUserId":actor_user_id.clone(), "message":message,
                "occurredAt":now.clone()
            }
        });

        let tx = connection.unchecked_transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO local_support_message (
               id,organisation_id,ticket_id,sender_user_id,sender_name,sender_role,
               author_kind,message,created_at
             ) VALUES (?1,?2,?3,?4,NULL,NULL,'customer',?5,?6)",
            params![message_id, organisation_id, ticket_id, actor_user_id, message, now],
        ).map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE local_support_ticket SET
               status=CASE WHEN status='waiting_on_user' THEN 'open' ELSE status END,
               updated_at=?1 WHERE id=?2 AND organisation_id=?3",
            params![now, ticket_id, organisation_id],
        ).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO local_support_queue (
               mutation_id,organisation_id,ticket_id,message_id,operation,payload_json,
               status,attempt_count,last_error,created_at,updated_at
             ) VALUES (?1,?2,?3,?4,'ticket.reply',?5,'PENDING',0,NULL,?6,?6)",
            params![mutation_id, organisation_id, ticket_id, message_id, payload.to_string(), now],
        ).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO local_audit_event (
               event_id,actor_user_id,action,entity_type,entity_id,payload_json,created_at
             ) VALUES (?1,?2,'SUPPORT_REPLY_QUEUED','support_ticket',?3,?4,?5)",
            params![mutation_id, actor_user_id, ticket_id, payload.to_string(), now],
        ).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        ticket_id
    } else {
        return Err("Unsupported Waste X support operation.".to_string());
    };

    let refreshed = open_local_connection(&app)?;
    let data = support_data(&refreshed, &organisation_id, &actor_user_id)?;
    Ok(json!({"ok":true,"ticketId":ticket_id,"data":data}))
}

#[tauri::command]
pub async fn desktop_sync_support(app: AppHandle, auth_state: State<'_, DesktopAuthState>) -> Result<Value, String> {
    offline_auth::require_unlocked(&auth_state)?;

    let (organisation_id, viewer_user_id, queue) = {
        let connection = open_local_connection(&app)?;
        let (organisation_id, viewer_user_id) = actor_context(&connection)?;
        let mut statement = connection.prepare(
            "SELECT mutation_id,payload_json FROM local_support_queue
             WHERE organisation_id=?1 AND (
               status='PENDING'
               OR (
                 status='FAILED' AND (
                   COALESCE(last_error, '') LIKE 'NETWORK:%'
                   OR COALESCE(last_error, '') LIKE 'RETRYABLE:%'
                   OR COALESCE(last_error, '') LIKE 'INTERRUPTED:%'
                 )
               )
             ) ORDER BY created_at ASC, mutation_id ASC"
        ).map_err(|e| e.to_string())?;
        let rows = statement.query_map(params![organisation_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }).map_err(|e| e.to_string())?
          .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
        (organisation_id, viewer_user_id, rows)
    };

    let credentials = load_cloud_credentials()?;
    let client = Client::new();
    let mut sync_warning: Option<String> = None;
    let mut can_refresh_cloud = true;

    for (mutation_id, payload_json) in queue {
        mark_queue(&app, &mutation_id, "SENDING", None)?;
        let payload: Value = serde_json::from_str(&payload_json)
            .map_err(|e| format!("Stored support request is unreadable: {e}"))?;

        let response = match client.post(format!("{}/api/desktop/v1/support", cloud_base_url()))
            .bearer_auth(&credentials.session_token)
            .header("X-Waste-X-Device-Secret", &credentials.device_secret)
            .json(&payload).send().await {
            Ok(response) => response,
            Err(error) => {
                let detail = format!("NETWORK:{error}");
                mark_queue(&app, &mutation_id, "FAILED", Some(&detail))?;
                sync_warning = Some("Support changes remain safely queued on this Desktop until Waste X Cloud is reachable.".to_string());
                can_refresh_cloud = false;
                break;
            }
        };

        let status = response.status();
        if status.as_u16() == 401 || status.as_u16() == 403 {
            mark_queue(&app, &mutation_id, "PENDING", Some("AUTH_REQUIRED:Renew the Waste X Desktop Cloud session"))?;
            sync_warning = Some("Support changes are queued. Sign in online to renew Cloud access.".to_string());
            can_refresh_cloud = false;
            break;
        }

        let body = response.json::<Value>().await.unwrap_or_else(|_| json!({}));

        if status.as_u16() == 429 || status.is_server_error() {
            let message = body.get("message").and_then(Value::as_str)
                .unwrap_or("Waste X Cloud is temporarily unavailable.");
            let detail = format!("RETRYABLE:HTTP {}:{message}", status.as_u16());
            mark_queue(&app, &mutation_id, "FAILED", Some(&detail))?;
            sync_warning = Some(
                "Support changes remain safely queued and will retry when Waste X Cloud is available."
                    .to_string(),
            );
            can_refresh_cloud = false;
            break;
        }

        if !status.is_success() {
            let message = body.get("message").and_then(Value::as_str)
                .unwrap_or("Waste X Cloud rejected this support change.");
            let detail = format!("REJECTED:{message}");
            mark_queue(&app, &mutation_id, "FAILED", Some(&detail))?;
            sync_warning = Some("One support change needs attention. The local copy has been preserved.".to_string());
            continue;
        }
        mark_queue(&app, &mutation_id, "SYNCED", None)?;
    }

    if can_refresh_cloud {
        match client.get(format!("{}/api/desktop/v1/support", cloud_base_url()))
            .bearer_auth(&credentials.session_token)
            .header("X-Waste-X-Device-Secret", &credentials.device_secret)
            .send().await {
            Ok(response) if response.status().is_success() => {
                let body = response.json::<Value>().await
                    .map_err(|e| format!("Waste X Support returned unreadable data: {e}"))?;
                let mut connection = open_local_connection(&app)?;
                cache_cloud_data(&mut connection, &organisation_id, &body)?;
            }
            Ok(response) => {
                sync_warning = Some(format!(
                    "Waste X Support refresh returned HTTP {}. Your local support data is unchanged.",
                    response.status()
                ));
            }
            Err(_) => {
                sync_warning = Some("Waste X Support could not refresh from Cloud. Your local support data is unchanged.".to_string());
            }
        }
    }

    let connection = open_local_connection(&app)?;
    let mut data = support_data(&connection, &organisation_id, &viewer_user_id)?;
    if let Some(warning) = sync_warning {
        if let Some(object) = data.as_object_mut() {
            object.insert("syncWarning".to_string(), Value::String(warning));
        }
    }
    Ok(data)
}
