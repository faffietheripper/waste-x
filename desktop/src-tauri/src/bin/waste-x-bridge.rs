use std::{
    env,
    path::PathBuf,
    process,
    time::{Duration, Instant},
};

use keyring::Entry;
use rand::{rngs::OsRng, RngCore};
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use subtle::ConstantTimeEq;
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

const BRIDGE_ADDRESS: &str = "127.0.0.1:43127";
const BRIDGE_KEYRING_SERVICE: &str = "com.wastex.desktop.bridge";
const BRIDGE_KEYRING_ACCOUNT: &str = "bridge-token-v1";
const DATABASE_KEYRING_SERVICE: &str = "com.wastex.desktop.local-database";
const DATABASE_KEYRING_ACCOUNT: &str = "database-key-v1";
const APP_IDENTIFIER: &str = "com.wastex.desktop";
const DB_FILE_NAME: &str = "waste-x-local.db";

struct BridgeState {
    started_at: Instant,
    token: String,
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
            "PRAGMA key = \"x'{key}'\";\n             PRAGMA foreign_keys = ON;\n             PRAGMA busy_timeout = 1000;\n             PRAGMA query_only = ON;"
        ))
        .map_err(|e| format!("Could not unlock the Waste X local database: {e}"))?;

    let cipher_version: String = connection
        .query_row("PRAGMA cipher_version", [], |row| row.get(0))
        .map_err(|e| format!("SQLCipher is unavailable to Waste X Bridge: {e}"))?;
    if cipher_version.trim().is_empty() {
        return Err("Waste X Bridge opened SQLite without SQLCipher.".to_string());
    }

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

fn handle_request(request: Request, state: &BridgeState) {
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
                respond_json(
                    request,
                    401,
                    &serde_json::json!({
                        "ok": false,
                        "error": "BRIDGE_AUTH_REQUIRED"
                    }),
                );
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
        _ => respond_json(
            request,
            404,
            &serde_json::json!({ "ok": false, "error": "NOT_FOUND" }),
        ),
    }
}

fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let token = bridge_token().map_err(std::io::Error::other)?;
    let server = Server::http(BRIDGE_ADDRESS)?;
    let state = BridgeState {
        started_at: Instant::now(),
        token,
    };

    println!(
        "Waste X Bridge v{} listening on http://{} (pid {})",
        env!("CARGO_PKG_VERSION"),
        BRIDGE_ADDRESS,
        process::id()
    );
    println!("Loopback only. Bridge credentials remain in the OS credential store.");

    loop {
        match server.recv_timeout(Duration::from_secs(1)) {
            Ok(Some(request)) => handle_request(request, &state),
            Ok(None) => {}
            Err(error) => eprintln!("Waste X Bridge request loop error: {error}"),
        }
    }
}
