use std::{fs, path::PathBuf, process::Command};

use chrono::{SecondsFormat, Utc};
use keyring::Entry;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use crate::offline_auth::{self, DesktopAuthState};

const DB_FILE_NAME: &str = "waste-x-local.db";
const DATABASE_KEYRING_SERVICE: &str = "com.wastex.desktop.local-database";
const DATABASE_KEYRING_ACCOUNT: &str = "database-key-v1";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketFileInput {
    load_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketFileResult {
    ok: bool,
    action: String,
    ticket_number: String,
    path: Option<String>,
    printer_name: Option<String>,
    job_reference: Option<String>,
    message: String,
}

struct TicketDocument {
    ticket_id: String,
    ticket_number: String,
    pdf_bytes: Vec<u8>,
    pdf_sha256: String,
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

fn actor_context(connection: &Connection) -> Result<(String, String, String), String> {
    let (device_id, organisation_id): (String, String) = connection
        .query_row(
            "SELECT device_id, organisation_id
             FROM local_device_configuration
             WHERE singleton_id = 1 AND device_id IS NOT NULL AND organisation_id IS NOT NULL",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "This Waste X Desktop installation is not provisioned.".to_string())?;
    let user_id = connection
        .query_row(
            "SELECT value FROM local_sync_metadata WHERE key = 'offline_auth_user_id'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Waste X user identity is unavailable. Sign in online once.".to_string())?;
    Ok((organisation_id, device_id, user_id))
}

fn ticket_document(
    connection: &Connection,
    organisation_id: &str,
    load_id: &str,
) -> Result<TicketDocument, String> {
    connection
        .query_row(
            "SELECT t.id, t.local_ticket_number, d.pdf_bytes, d.sha256
             FROM local_ticket t
             INNER JOIN local_ticket_document d ON d.ticket_id = t.id
             WHERE t.organisation_id = ?1
               AND t.job_load_id = ?2
               AND t.status = 'ISSUED'
             LIMIT 1",
            params![organisation_id, load_id],
            |row| {
                Ok(TicketDocument {
                    ticket_id: row.get(0)?,
                    ticket_number: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    pdf_bytes: row.get(2)?,
                    pdf_sha256: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .filter(|ticket| !ticket.ticket_number.trim().is_empty())
        .ok_or_else(|| "This load does not have an issued local Waste X ticket PDF yet.".to_string())
}

fn safe_filename(value: &str) -> String {
    let cleaned: String = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('-');
    if trimmed.is_empty() { "waste-x-ticket".to_string() } else { trimmed.to_string() }
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn default_printer_name() -> String {
    let output = Command::new("lpstat").arg("-d").output();
    if let Ok(output) = output {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some((_, name)) = stdout.trim().split_once(':') {
                let name = name.trim();
                if !name.is_empty() {
                    return name.to_string();
                }
            }
        }
    }
    "System default printer".to_string()
}

#[cfg(target_os = "windows")]
fn default_printer_name() -> String {
    "Windows default printer".to_string()
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn default_printer_name() -> String {
    "System default printer".to_string()
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn submit_print(path: &PathBuf) -> Result<String, String> {
    let output = Command::new("lp")
        .arg(path)
        .output()
        .map_err(|e| format!("Waste X could not start the system print command: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        return Err(if stderr.is_empty() {
            "The operating system rejected the print request. Check that a default printer is configured.".to_string()
        } else {
            format!("The operating system rejected the print request: {stderr}")
        });
    }
    Ok(if stdout.is_empty() { "Submitted to system print queue".to_string() } else { stdout })
}

#[cfg(target_os = "windows")]
fn submit_print(path: &PathBuf) -> Result<String, String> {
    let escaped = path.to_string_lossy().replace('\'', "''");
    let command = format!("Start-Process -FilePath '{escaped}' -Verb Print");
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &command])
        .output()
        .map_err(|e| format!("Waste X could not start the Windows print command: {e}"))?;
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        return Err(if stderr.is_empty() {
            "Windows rejected the print request. Check that a PDF viewer and default printer are configured.".to_string()
        } else {
            format!("Windows rejected the print request: {stderr}")
        });
    }
    Ok("Submitted to Windows default printer".to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn submit_print(_path: &PathBuf) -> Result<String, String> {
    Err("Printing is not yet supported on this operating system. Download the PDF instead.".to_string())
}

#[tauri::command]
pub fn desktop_download_ticket_pdf(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
    input: TicketFileInput,
) -> Result<TicketFileResult, String> {
    offline_auth::require_unlocked(&auth_state)?;
    let connection = open_local_connection(&app)?;
    let (organisation_id, _device_id, user_id) = actor_context(&connection)?;
    let ticket = ticket_document(&connection, &organisation_id, input.load_id.trim())?;
    let downloads = app
        .path()
        .download_dir()
        .map_err(|e| format!("Could not resolve your Downloads folder: {e}"))?;
    fs::create_dir_all(&downloads)
        .map_err(|e| format!("Could not prepare your Downloads folder: {e}"))?;
    let path = downloads.join(format!("{}.pdf", safe_filename(&ticket.ticket_number)));
    fs::write(&path, &ticket.pdf_bytes)
        .map_err(|e| format!("Could not save the Waste X ticket PDF: {e}"))?;

    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    connection
        .execute(
            "INSERT INTO local_audit_event (
                event_id, actor_user_id, action, entity_type, entity_id, payload_json, created_at
             ) VALUES (?1, ?2, 'SITE_TICKET_PDF_DOWNLOADED', 'job_load', ?3, ?4, ?5)",
            params![
                Uuid::now_v7().to_string(),
                user_id,
                input.load_id.trim(),
                json!({
                    "ticketId": ticket.ticket_id,
                    "ticketNumber": ticket.ticket_number,
                    "pdfSha256": ticket.pdf_sha256,
                    "path": path.to_string_lossy(),
                })
                .to_string(),
                now,
            ],
        )
        .map_err(|e| e.to_string())?;

    Ok(TicketFileResult {
        ok: true,
        action: "DOWNLOAD".to_string(),
        ticket_number: ticket.ticket_number,
        path: Some(path.to_string_lossy().to_string()),
        printer_name: None,
        job_reference: None,
        message: "Ticket PDF saved to Downloads.".to_string(),
    })
}

#[tauri::command]
pub fn desktop_print_ticket(
    app: AppHandle,
    auth_state: State<'_, DesktopAuthState>,
    input: TicketFileInput,
) -> Result<TicketFileResult, String> {
    offline_auth::require_unlocked(&auth_state)?;
    let connection = open_local_connection(&app)?;
    let (organisation_id, device_id, user_id) = actor_context(&connection)?;
    let ticket = ticket_document(&connection, &organisation_id, input.load_id.trim())?;
    let previous_successful_prints: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM local_print_event WHERE ticket_id = ?1 AND result = 'SUCCESS'",
            params![ticket.ticket_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let action = if previous_successful_prints == 0 { "PRINT" } else { "REPRINT" };
    let printer_name = default_printer_name();
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let print_event_id = Uuid::now_v7().to_string();

    let temp_dir = std::env::temp_dir().join("waste-x-ticket-print");
    fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Could not prepare the Waste X print spool folder: {e}"))?;
    let temp_path = temp_dir.join(format!("{}-{}.pdf", safe_filename(&ticket.ticket_number), print_event_id));
    fs::write(&temp_path, &ticket.pdf_bytes)
        .map_err(|e| format!("Could not prepare the Waste X ticket for printing: {e}"))?;

    let print_result = submit_print(&temp_path);
    let _ = fs::remove_file(&temp_path);

    match print_result {
        Ok(job_reference) => {
            connection
                .execute(
                    "INSERT INTO local_print_event (
                        id, ticket_id, action, printer_id, printer_name, pdf_sha256,
                        result, submitted_by_user_id, desktop_device_id, os_job_reference,
                        output_path, error_text, created_at
                     ) VALUES (?1, ?2, ?3, NULL, ?4, ?5, 'SUCCESS', ?6, ?7, ?8, NULL, NULL, ?9)",
                    params![
                        print_event_id,
                        ticket.ticket_id,
                        action,
                        printer_name,
                        ticket.pdf_sha256,
                        user_id,
                        device_id,
                        job_reference,
                        now,
                    ],
                )
                .map_err(|e| e.to_string())?;

            Ok(TicketFileResult {
                ok: true,
                action: action.to_string(),
                ticket_number: ticket.ticket_number,
                path: None,
                printer_name: Some(printer_name),
                job_reference: Some(job_reference),
                message: if action == "PRINT" {
                    "Ticket sent to the system default printer.".to_string()
                } else {
                    "Ticket reprint sent using the exact original PDF bytes.".to_string()
                },
            })
        }
        Err(error_text) => {
            connection
                .execute(
                    "INSERT INTO local_print_event (
                        id, ticket_id, action, printer_id, printer_name, pdf_sha256,
                        result, submitted_by_user_id, desktop_device_id, os_job_reference,
                        output_path, error_text, created_at
                     ) VALUES (?1, ?2, ?3, NULL, ?4, ?5, 'FAILED', ?6, ?7, NULL, NULL, ?8, ?9)",
                    params![
                        print_event_id,
                        ticket.ticket_id,
                        action,
                        printer_name,
                        ticket.pdf_sha256,
                        user_id,
                        device_id,
                        error_text,
                        now,
                    ],
                )
                .map_err(|e| e.to_string())?;
            Err(error_text)
        }
    }
}
