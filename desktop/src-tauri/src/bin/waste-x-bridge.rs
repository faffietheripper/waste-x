use std::{
    env,
    io::Read,
    path::PathBuf,
    process,
    time::{Duration, Instant},
};

use chrono::Utc;
use keyring::Entry;
use rand::{rngs::OsRng, RngCore};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};
use uuid::Uuid;

const BRIDGE_ADDRESS: &str = "127.0.0.1:43127";
const BRIDGE_KEYRING_SERVICE: &str = "com.wastex.desktop.bridge";
const BRIDGE_KEYRING_ACCOUNT: &str = "bridge-token-v1";
const BRIDGE_ID_KEYRING_ACCOUNT: &str = "bridge-id-v1";
const DATABASE_KEYRING_SERVICE: &str = "com.wastex.desktop.local-database";
const DATABASE_KEYRING_ACCOUNT: &str = "database-key-v1";
const APP_IDENTIFIER: &str = "com.wastex.desktop";
const DB_FILE_NAME: &str = "waste-x-local.db";
const MAX_RELAY_BODY_BYTES: u64 = 1_048_576;

struct BridgeState {
    started_at: Instant,
    token: String,
    bridge_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    ok: bool,
    service: &'static str,
    version: &'static str,
    pid: u32,
    uptime_seconds: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeResponse {
    ok: bool,
    service: &'static str,
    version: &'static str,
    pid: u32,
    uptime_seconds: u64,
    database: DatabaseRuntime,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DatabaseRuntime {
    ready: bool,
    cipher_version: Option<String>,
    schema_version: Option<i64>,
    pending: i64,
    retrying: i64,
    conflicts: i64,
    device_id: Option<String>,
    organisation_id: Option<String>,
    last_bootstrap_at: Option<String>,
    sync_cursor: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairingRequest {
    paired_device_id: String,
    base_url: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairingResponse {
    protocol_version: u8,
    bridge_id: String,
    organisation_id: String,
    site_id: Option<String>,
    display_name: String,
    base_url: String,
    relay_secret: String,
    paired_device_id: String,
    paired_at: String,
}

#[derive(Clone)]
struct RelayPairing {
    device_id: String,
    organisation_id: String,
    site_id: Option<String>,
    display_name: String,
    secret_hash: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RelayHealthResponse {
    ok: bool,
    protocol_version: u8,
    service: &'static str,
    bridge_id: String,
    organisation_id: String,
    site_id: Option<String>,
    display_name: String,
    accepts_mobile_sync: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RelayPushRequest {
    protocol_version: u8,
    device_id: String,
    batch_id: String,
    events: Vec<RelayEvent>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RelayEvent {
    schema_version: u8,
    event_id: String,
    organisation_id: String,
    site_id: Option<String>,
    device_id: String,
    actor_user_id: String,
    entity_type: String,
    entity_id: String,
    event_type: String,
    base_version: Option<i64>,
    device_sequence: i64,
    occurred_at: String,
    recorded_at: String,
    payload: Value,
    payload_hash: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RelayPushResult {
    event_id: String,
    status: &'static str,
    entity_version: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason_code: Option<&'static str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RelayPushResponse {
    protocol_version: u8,
    transport: &'static str,
    bridge_id: String,
    results: Vec<RelayPushResult>,
}

fn json_header() -> Header {
    Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..])
        .expect("static JSON header must be valid")
}

fn respond_json<T: Serialize>(request: Request, status: u16, value: &T) {
    let body = serde_json::to_string(value)
        .unwrap_or_else(|_| "{\"ok\":false,\"error\":\"SERIALIZATION_FAILED\"}".to_string());
    let response = Response::from_string(body)
        .with_status_code(StatusCode(status))
        .with_header(json_header());
    let _ = request.respond(response);
}

fn read_json<T: for<'de> Deserialize<'de>>(request: &mut Request) -> Result<T, String> {
    let mut body = String::new();
    request
        .as_reader()
        .take(MAX_RELAY_BODY_BYTES)
        .read_to_string(&mut body)
        .map_err(|e| format!("Could not read request body: {e}"))?;
    serde_json::from_str(&body).map_err(|e| format!("Invalid JSON body: {e}"))
}

fn bridge_token() -> Result<String, String> {
    let entry = Entry::new(BRIDGE_KEYRING_SERVICE, BRIDGE_KEYRING_ACCOUNT)
        .map_err(|e| format!("Could not access the OS credential store for Waste X Bridge: {e}"))?;

    if let Ok(existing) = entry.get_password() {
        if existing.len() == 64 && existing.bytes().all(|value| value.is_ascii_hexdigit()) {
            return Ok(existing);
        }
    }

    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let token = hex::encode(bytes);
    entry
        .set_password(&token)
        .map_err(|e| format!("Could not store the Waste X Bridge token: {e}"))?;
    Ok(token)
}

fn bridge_id() -> Result<String, String> {
    let entry = Entry::new(BRIDGE_KEYRING_SERVICE, BRIDGE_ID_KEYRING_ACCOUNT)
        .map_err(|e| format!("Could not access the Waste X Bridge identity: {e}"))?;
    if let Ok(existing) = entry.get_password() {
        if Uuid::parse_str(&existing).is_ok() {
            return Ok(existing);
        }
    }
    let id = Uuid::now_v7().to_string();
    entry
        .set_password(&id)
        .map_err(|e| format!("Could not store the Waste X Bridge identity: {e}"))?;
    Ok(id)
}

fn authorised(request: &Request, expected: &str) -> bool {
    let supplied = request
        .headers()
        .iter()
        .find(|header| header.field.equiv("X-Waste-X-Bridge-Token"))
        .map(|header| header.value.as_str())
        .unwrap_or("");

    supplied.len() == expected.len()
        && bool::from(supplied.as_bytes().ct_eq(expected.as_bytes()))
}

fn header_value<'a>(request: &'a Request, name: &str) -> &'a str {
    request
        .headers()
        .iter()
        .find(|header| header.field.equiv(name))
        .map(|header| header.value.as_str())
        .unwrap_or("")
}

fn sha256_hex(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

#[cfg(target_os = "macos")]
fn app_data_dir() -> Result<PathBuf, String> {
    let home = env::var_os("HOME").ok_or_else(|| "HOME is unavailable.".to_string())?;
    Ok(PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join(APP_IDENTIFIER))
}

#[cfg(target_os = "windows")]
fn app_data_dir() -> Result<PathBuf, String> {
    let app_data = env::var_os("APPDATA").ok_or_else(|| "APPDATA is unavailable.".to_string())?;
    Ok(PathBuf::from(app_data).join(APP_IDENTIFIER))
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn app_data_dir() -> Result<PathBuf, String> {
    if let Some(xdg) = env::var_os("XDG_DATA_HOME") {
        return Ok(PathBuf::from(xdg).join(APP_IDENTIFIER));
    }
    let home = env::var_os("HOME").ok_or_else(|| "HOME is unavailable.".to_string())?;
    Ok(PathBuf::from(home)
        .join(".local")
        .join("share")
        .join(APP_IDENTIFIER))
}

fn open_database(query_only: bool) -> Result<Connection, String> {
    let path = app_data_dir()?.join(DB_FILE_NAME);
    if !path.exists() {
        return Err("Waste X local database does not exist yet.".to_string());
    }

    let entry = Entry::new(DATABASE_KEYRING_SERVICE, DATABASE_KEYRING_ACCOUNT)
        .map_err(|e| format!("Could not access the Waste X database key: {e}"))?;
    let key = entry
        .get_password()
        .map_err(|e| format!("Could not read the Waste X database key: {e}"))?;

    let connection = Connection::open(path)
        .map_err(|e| format!("Could not open the Waste X local database: {e}"))?;
    connection
        .execute_batch(&format!(
            "PRAGMA key = \"x'{key}'\";\n             PRAGMA foreign_keys = ON;\n             PRAGMA busy_timeout = 2000;{}",
            if query_only { "\nPRAGMA query_only = ON;" } else { "" }
        ))
        .map_err(|e| format!("Could not unlock the Waste X local database: {e}"))?;

    let cipher_version: String = connection
        .query_row("PRAGMA cipher_version", [], |row| row.get(0))
        .map_err(|e| format!("SQLCipher is unavailable to Waste X Bridge: {e}"))?;
    if cipher_version.trim().is_empty() {
        return Err("Waste X Bridge opened SQLite without SQLCipher.".to_string());
    }
    Ok(connection)
}

fn ensure_relay_schema(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS local_bridge_mobile_pairing (
                device_id TEXT PRIMARY KEY,
                organisation_id TEXT NOT NULL,
                site_id TEXT,
                display_name TEXT NOT NULL,
                secret_hash TEXT NOT NULL,
                paired_at TEXT NOT NULL,
                revoked_at TEXT
            );
            CREATE TABLE IF NOT EXISTS local_bridge_mobile_relay_event (
                event_id TEXT PRIMARY KEY,
                device_id TEXT NOT NULL,
                organisation_id TEXT NOT NULL,
                actor_user_id TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                base_version INTEGER,
                device_sequence INTEGER NOT NULL,
                event_json TEXT NOT NULL,
                payload_hash TEXT NOT NULL,
                occurred_at TEXT NOT NULL,
                recorded_at TEXT NOT NULL,
                received_at TEXT NOT NULL,
                cloud_forwarded_at TEXT,
                UNIQUE(device_id, device_sequence)
            );
            CREATE INDEX IF NOT EXISTS local_bridge_mobile_relay_pending_idx
              ON local_bridge_mobile_relay_event(cloud_forwarded_at, received_at);",
        )
        .map_err(|e| format!("Could not initialise Mobile relay storage: {e}"))
}

fn metadata(connection: &Connection, key: &str) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT value FROM local_sync_metadata WHERE key = ?1",
            [key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())
}

fn database_runtime_inner() -> Result<DatabaseRuntime, String> {
    let connection = open_database(true)?;
    let cipher_version: String = connection
        .query_row("PRAGMA cipher_version", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    let schema_version: i64 = connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM local_schema_migration",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let pending: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM local_sync_queue WHERE status = 'PENDING'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let retrying: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM local_sync_queue
             WHERE status = 'FAILED'
               AND (COALESCE(last_error, '') LIKE 'NETWORK:%'
                 OR COALESCE(last_error, '') LIKE 'RETRYABLE:%'
                 OR COALESCE(last_error, '') LIKE 'INTERRUPTED:%')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let conflicts: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM local_sync_queue WHERE status = 'CONFLICT'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let device = connection
        .query_row(
            "SELECT device_id, organisation_id
             FROM local_device_configuration
             WHERE singleton_id = 1",
            [],
            |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or((None, None));

    Ok(DatabaseRuntime {
        ready: true,
        cipher_version: Some(cipher_version),
        schema_version: Some(schema_version),
        pending,
        retrying,
        conflicts,
        device_id: device.0,
        organisation_id: device.1,
        last_bootstrap_at: metadata(&connection, "last_bootstrap_at")?,
        sync_cursor: metadata(&connection, "sync_cursor")?,
        error: None,
    })
}

fn database_runtime() -> DatabaseRuntime {
    match database_runtime_inner() {
        Ok(runtime) => runtime,
        Err(error) => DatabaseRuntime {
            ready: false,
            cipher_version: None,
            schema_version: None,
            pending: 0,
            retrying: 0,
            conflicts: 0,
            device_id: None,
            organisation_id: None,
            last_bootstrap_at: None,
            sync_cursor: None,
            error: Some(error),
        },
    }
}

fn pairing_for_request(request: &Request, connection: &Connection) -> Result<RelayPairing, String> {
    let device_id = header_value(request, "X-Waste-X-Mobile-Device-Id");
    let secret = header_value(request, "X-Waste-X-Mobile-Relay-Secret");
    if device_id.is_empty() || secret.is_empty() {
        return Err("MOBILE_RELAY_AUTH_REQUIRED".to_string());
    }

    let pairing = connection
        .query_row(
            "SELECT device_id, organisation_id, site_id, display_name, secret_hash
             FROM local_bridge_mobile_pairing
             WHERE device_id = ?1 AND revoked_at IS NULL",
            [device_id],
            |row| {
                Ok(RelayPairing {
                    device_id: row.get(0)?,
                    organisation_id: row.get(1)?,
                    site_id: row.get(2)?,
                    display_name: row.get(3)?,
                    secret_hash: row.get(4)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "MOBILE_RELAY_DEVICE_UNKNOWN".to_string())?;

    let supplied_hash = sha256_hex(secret);
    if supplied_hash.len() != pairing.secret_hash.len()
        || !bool::from(supplied_hash.as_bytes().ct_eq(pairing.secret_hash.as_bytes()))
    {
        return Err("MOBILE_RELAY_AUTH_FAILED".to_string());
    }
    Ok(pairing)
}

fn validate_pairing_base_url(value: Option<String>) -> Result<String, String> {
    let value = value.unwrap_or_else(|| format!("http://{BRIDGE_ADDRESS}"));
    let trimmed = value.trim().trim_end_matches('/').to_string();
    if trimmed.starts_with("https://")
        || trimmed == format!("http://{BRIDGE_ADDRESS}")
        || trimmed == "http://localhost:43127"
    {
        return Ok(trimmed);
    }
    Err("Bridge pairing baseUrl must use HTTPS, except for localhost development.".to_string())
}

fn create_mobile_pairing(mut request: Request, state: &BridgeState) {
    if !authorised(&request, &state.token) {
        respond_json(request, 401, &serde_json::json!({"ok": false, "error": "BRIDGE_AUTH_REQUIRED"}));
        return;
    }

    let body = match read_json::<PairingRequest>(&mut request) {
        Ok(body) => body,
        Err(error) => {
            respond_json(request, 400, &serde_json::json!({"ok": false, "error": "INVALID_REQUEST", "message": error}));
            return;
        }
    };
    if Uuid::parse_str(body.paired_device_id.trim()).is_err() {
        respond_json(request, 400, &serde_json::json!({"ok": false, "error": "INVALID_DEVICE_ID"}));
        return;
    }
    let base_url = match validate_pairing_base_url(body.base_url) {
        Ok(value) => value,
        Err(error) => {
            respond_json(request, 400, &serde_json::json!({"ok": false, "error": "INVALID_RELAY_URL", "message": error}));
            return;
        }
    };

    let connection = match open_database(false).and_then(|db| {
        ensure_relay_schema(&db)?;
        Ok(db)
    }) {
        Ok(db) => db,
        Err(error) => {
            respond_json(request, 503, &serde_json::json!({"ok": false, "error": "LOCAL_DATABASE_UNAVAILABLE", "message": error}));
            return;
        }
    };

    let config = connection
        .query_row(
            "SELECT organisation_id, default_site_id, COALESCE(display_name, 'Waste X Site Bridge')
             FROM local_device_configuration WHERE singleton_id = 1",
            [],
            |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, String>(2)?)),
        )
        .optional();
    let (organisation_id, site_id, display_name) = match config {
        Ok(Some((Some(org), site, name))) => (org, site, name),
        _ => {
            respond_json(request, 409, &serde_json::json!({"ok": false, "error": "DESKTOP_NOT_PROVISIONED"}));
            return;
        }
    };

    let mut secret_bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut secret_bytes);
    let relay_secret = hex::encode(secret_bytes);
    let secret_hash = sha256_hex(&relay_secret);
    let paired_at = Utc::now().to_rfc3339();

    if let Err(error) = connection.execute(
        "INSERT INTO local_bridge_mobile_pairing (
           device_id, organisation_id, site_id, display_name, secret_hash, paired_at, revoked_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)
         ON CONFLICT(device_id) DO UPDATE SET
           organisation_id = excluded.organisation_id,
           site_id = excluded.site_id,
           display_name = excluded.display_name,
           secret_hash = excluded.secret_hash,
           paired_at = excluded.paired_at,
           revoked_at = NULL",
        params![body.paired_device_id.trim(), organisation_id, site_id, display_name, secret_hash, paired_at],
    ) {
        respond_json(request, 500, &serde_json::json!({"ok": false, "error": "PAIRING_STORE_FAILED", "message": error.to_string()}));
        return;
    }

    respond_json(
        request,
        201,
        &PairingResponse {
            protocol_version: 1,
            bridge_id: state.bridge_id.clone(),
            organisation_id,
            site_id,
            display_name,
            base_url,
            relay_secret,
            paired_device_id: body.paired_device_id.trim().to_string(),
            paired_at,
        },
    );
}

fn mobile_health(request: Request, state: &BridgeState) {
    let connection = match open_database(false).and_then(|db| {
        ensure_relay_schema(&db)?;
        Ok(db)
    }) {
        Ok(db) => db,
        Err(error) => {
            respond_json(request, 503, &serde_json::json!({"ok": false, "error": "LOCAL_DATABASE_UNAVAILABLE", "message": error}));
            return;
        }
    };
    let pairing = match pairing_for_request(&request, &connection) {
        Ok(value) => value,
        Err(error) => {
            respond_json(request, 401, &serde_json::json!({"ok": false, "error": error}));
            return;
        }
    };

    respond_json(
        request,
        200,
        &RelayHealthResponse {
            ok: true,
            protocol_version: 1,
            service: "waste-x-bridge-relay",
            bridge_id: state.bridge_id.clone(),
            organisation_id: pairing.organisation_id,
            site_id: pairing.site_id,
            display_name: pairing.display_name,
            accepts_mobile_sync: true,
        },
    );
}

fn mobile_sync_push(mut request: Request, state: &BridgeState) {
    let mut connection = match open_database(false).and_then(|db| {
        ensure_relay_schema(&db)?;
        Ok(db)
    }) {
        Ok(db) => db,
        Err(error) => {
            respond_json(request, 503, &serde_json::json!({"ok": false, "error": "LOCAL_DATABASE_UNAVAILABLE", "message": error}));
            return;
        }
    };
    let pairing = match pairing_for_request(&request, &connection) {
        Ok(value) => value,
        Err(error) => {
            respond_json(request, 401, &serde_json::json!({"ok": false, "error": error}));
            return;
        }
    };
    let body = match read_json::<RelayPushRequest>(&mut request) {
        Ok(body) => body,
        Err(error) => {
            respond_json(request, 400, &serde_json::json!({"ok": false, "error": "INVALID_REQUEST", "message": error}));
            return;
        }
    };

    if body.protocol_version != 1 || body.device_id != pairing.device_id || body.batch_id.trim().is_empty() {
        respond_json(request, 400, &serde_json::json!({"ok": false, "error": "INVALID_RELAY_BATCH"}));
        return;
    }
    if body.events.len() > 100 {
        respond_json(request, 413, &serde_json::json!({"ok": false, "error": "RELAY_BATCH_TOO_LARGE"}));
        return;
    }

    let transaction = match connection.transaction() {
        Ok(tx) => tx,
        Err(error) => {
            respond_json(request, 500, &serde_json::json!({"ok": false, "error": "RELAY_TRANSACTION_FAILED", "message": error.to_string()}));
            return;
        }
    };
    let mut results = Vec::with_capacity(body.events.len());
    let received_at = Utc::now().to_rfc3339();

    for event in body.events {
        if event.schema_version != 1
            || event.device_id != pairing.device_id
            || event.organisation_id != pairing.organisation_id
            || event.device_sequence <= 0
            || event.event_id.trim().is_empty()
            || event.payload_hash.trim().is_empty()
        {
            results.push(RelayPushResult {
                event_id: event.event_id,
                status: "REJECTED",
                entity_version: None,
                reason_code: Some("RELAY_EVENT_SCOPE_REJECTED"),
            });
            continue;
        }

        let existing_event = transaction
            .query_row(
                "SELECT event_id FROM local_bridge_mobile_relay_event WHERE event_id = ?1",
                [&event.event_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .unwrap_or(None);
        if existing_event.is_some() {
            results.push(RelayPushResult {
                event_id: event.event_id,
                status: "DUPLICATE",
                entity_version: None,
                reason_code: Some("RELAY_ALREADY_STORED"),
            });
            continue;
        }

        let event_json = match serde_json::to_string(&event) {
            Ok(value) => value,
            Err(_) => {
                results.push(RelayPushResult {
                    event_id: event.event_id,
                    status: "REJECTED",
                    entity_version: None,
                    reason_code: Some("RELAY_EVENT_SERIALIZATION_FAILED"),
                });
                continue;
            }
        };

        let inserted = transaction.execute(
            "INSERT OR IGNORE INTO local_bridge_mobile_relay_event (
               event_id, device_id, organisation_id, actor_user_id, entity_type, entity_id,
               event_type, base_version, device_sequence, event_json, payload_hash,
               occurred_at, recorded_at, received_at, cloud_forwarded_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, NULL)",
            params![
                event.event_id,
                event.device_id,
                event.organisation_id,
                event.actor_user_id,
                event.entity_type,
                event.entity_id,
                event.event_type,
                event.base_version,
                event.device_sequence,
                event_json,
                event.payload_hash,
                event.occurred_at,
                event.recorded_at,
                received_at,
            ],
        );

        match inserted {
            Ok(1) => results.push(RelayPushResult {
                event_id: event.event_id,
                status: "APPLIED",
                entity_version: None,
                reason_code: Some("RELAY_STORED"),
            }),
            Ok(_) => results.push(RelayPushResult {
                event_id: event.event_id,
                status: "REJECTED",
                entity_version: None,
                reason_code: Some("DEVICE_SEQUENCE_REUSED"),
            }),
            Err(_) => results.push(RelayPushResult {
                event_id: event.event_id,
                status: "RETRYABLE_ERROR",
                entity_version: None,
                reason_code: Some("RELAY_STORE_FAILED"),
            }),
        }
    }

    if let Err(error) = transaction.commit() {
        respond_json(request, 500, &serde_json::json!({"ok": false, "error": "RELAY_COMMIT_FAILED", "message": error.to_string()}));
        return;
    }

    respond_json(
        request,
        200,
        &RelayPushResponse {
            protocol_version: 1,
            transport: "LOCAL_BRIDGE",
            bridge_id: state.bridge_id.clone(),
            results,
        },
    );
}

fn handle_request(mut request: Request, state: &BridgeState) {
    let method = request.method().clone();
    let path = request.url().split('?').next().unwrap_or(request.url()).to_string();
    let uptime_seconds = state.started_at.elapsed().as_secs();

    match (method, path.as_str()) {
        (Method::Get, "/v1/health") => respond_json(
            request,
            200,
            &HealthResponse {
                ok: true,
                service: "waste-x-bridge",
                version: env!("CARGO_PKG_VERSION"),
                pid: process::id(),
                uptime_seconds,
            },
        ),
        (Method::Get, "/v1/runtime") => {
            if !authorised(&request, &state.token) {
                respond_json(request, 401, &serde_json::json!({"ok": false, "error": "BRIDGE_AUTH_REQUIRED"}));
                return;
            }
            respond_json(
                request,
                200,
                &RuntimeResponse {
                    ok: true,
                    service: "waste-x-bridge",
                    version: env!("CARGO_PKG_VERSION"),
                    pid: process::id(),
                    uptime_seconds,
                    database: database_runtime(),
                },
            );
        }
        (Method::Post, "/v1/mobile/pairing") => create_mobile_pairing(request, state),
        (Method::Get, "/v1/mobile/health") => mobile_health(request, state),
        (Method::Post, "/v1/mobile/sync/push") => mobile_sync_push(request, state),
        _ => respond_json(request, 404, &serde_json::json!({"ok": false, "error": "NOT_FOUND"})),
    }
}

fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let token = bridge_token().map_err(std::io::Error::other)?;
    let bridge_id = bridge_id().map_err(std::io::Error::other)?;
    let server = Server::http(BRIDGE_ADDRESS)?;
    let state = BridgeState {
        started_at: Instant::now(),
        token,
        bridge_id,
    };

    println!(
        "Waste X Bridge v{} listening on http://{} (pid {})",
        env!("CARGO_PKG_VERSION"),
        BRIDGE_ADDRESS,
        process::id()
    );
    println!("Admin/runtime API remains loopback only. Mobile relay uses per-device pairing credentials.");
    println!("Production site-LAN relay must terminate TLS before exposing these relay routes beyond localhost.");

    loop {
        match server.recv_timeout(Duration::from_secs(1)) {
            Ok(Some(request)) => handle_request(request, &state),
            Ok(None) => {}
            Err(error) => eprintln!("Waste X Bridge request loop error: {error}"),
        }
    }
}
