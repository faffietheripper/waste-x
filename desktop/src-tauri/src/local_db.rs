use std::{fs, path::PathBuf, sync::Mutex};

use keyring::{Entry, Error as KeyringError};
use rand::{rngs::OsRng, RngCore};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

const DB_FILE_NAME: &str = "waste-x-local.db";
const KEYRING_SERVICE: &str = "com.wastex.desktop.local-database";
const KEYRING_ACCOUNT: &str = "database-key-v1";
const CURRENT_SCHEMA_VERSION: i64 = 1;

pub struct LocalDb {
    connection: Mutex<Connection>,
    path: PathBuf,
    cipher_version: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDbStatus {
    ready: bool,
    encrypted: bool,
    schema_version: i64,
    cipher_version: String,
    table_count: i64,
    storage: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDbSelfTestResult {
    ok: bool,
    schema_version: i64,
}

fn error(message: impl Into<String>) -> Box<dyn std::error::Error> {
    Box::new(std::io::Error::new(std::io::ErrorKind::Other, message.into()))
}

fn load_or_create_database_key() -> Result<String, Box<dyn std::error::Error>> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| error(format!("Could not access the OS credential store: {e}")))?;

    match entry.get_password() {
        Ok(existing) => {
            if existing.len() != 64 || !existing.chars().all(|character| character.is_ascii_hexdigit()) {
                return Err(error("Stored Waste X database key is invalid."));
            }
            Ok(existing)
        }
        Err(KeyringError::NoEntry) => {
            let mut key_bytes = [0_u8; 32];
            OsRng.fill_bytes(&mut key_bytes);
            let key = hex::encode(key_bytes);
            entry
                .set_password(&key)
                .map_err(|e| error(format!("Could not save the Waste X database key: {e}")))?;
            Ok(key)
        }
        Err(e) => Err(error(format!(
            "Could not read the Waste X database key from the OS credential store: {e}"
        ))),
    }
}

fn apply_schema_migrations(connection: &mut Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS local_schema_migration (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL
        );",
    )?;

    let current_version: i64 = connection.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM local_schema_migration",
        [],
        |row| row.get(0),
    )?;

    if current_version < 1 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(MIGRATION_V1)?;
        transaction.execute(
            "INSERT INTO local_schema_migration (version, applied_at) VALUES (?1, datetime('now'))",
            params![1_i64],
        )?;
        transaction.commit()?;
    }

    Ok(())
}

pub fn initialise(app: &AppHandle) -> Result<LocalDb, Box<dyn std::error::Error>> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| error(format!("Could not resolve Waste X application data directory: {e}")))?;
    fs::create_dir_all(&app_data_dir)?;

    let path = app_data_dir.join(DB_FILE_NAME);
    let key = load_or_create_database_key()?;
    let mut connection = Connection::open(&path)?;

    // SQLCipher requires the key before any schema read. The key contains only
    // generated hexadecimal characters and is never written to application logs.
    connection.execute_batch(&format!("PRAGMA key = \"x'{key}'\";"))?;

    let cipher_version: String = connection
        .query_row("PRAGMA cipher_version;", [], |row| row.get(0))
        .optional()?
        .ok_or_else(|| rusqlite::Error::InvalidQuery)?;

    if cipher_version.trim().is_empty() {
        return Err(error("SQLCipher is unavailable; refusing to open an unencrypted Waste X local database."));
    }

    connection.execute_batch(
        "PRAGMA cipher_memory_security = ON;
         PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = FULL;
         PRAGMA busy_timeout = 5000;",
    )?;

    apply_schema_migrations(&mut connection)?;

    Ok(LocalDb {
        connection: Mutex::new(connection),
        path,
        cipher_version,
    })
}

#[tauri::command]
pub fn local_db_status(state: State<'_, LocalDb>) -> Result<LocalDbStatus, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "Waste X local database lock is unavailable.".to_string())?;

    let schema_version: i64 = connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM local_schema_migration",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let table_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name LIKE 'local_%'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(LocalDbStatus {
        ready: schema_version == CURRENT_SCHEMA_VERSION && state.path.exists(),
        encrypted: !state.cipher_version.is_empty(),
        schema_version,
        cipher_version: state.cipher_version.clone(),
        table_count,
        storage: "OS credential store + encrypted application data",
    })
}

#[tauri::command]
pub fn local_db_self_test(state: State<'_, LocalDb>) -> Result<LocalDbSelfTestResult, String> {
    let mut connection = state
        .connection
        .lock()
        .map_err(|_| "Waste X local database lock is unavailable.".to_string())?;

    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    transaction
        .execute(
            "INSERT INTO local_sync_metadata (key, value, updated_at)
             VALUES ('database_self_test', datetime('now'), datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            [],
        )
        .map_err(|e| e.to_string())?;

    let stored: String = transaction
        .query_row(
            "SELECT value FROM local_sync_metadata WHERE key = 'database_self_test'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if stored.trim().is_empty() {
        return Err("Waste X local database self-test could not read its own write.".to_string());
    }

    transaction.commit().map_err(|e| e.to_string())?;

    Ok(LocalDbSelfTestResult {
        ok: true,
        schema_version: CURRENT_SCHEMA_VERSION,
    })
}

const MIGRATION_V1: &str = r#"
CREATE TABLE local_organisation (
    id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE local_site (
    id TEXT PRIMARY KEY,
    organisation_id TEXT NOT NULL,
    name TEXT,
    status TEXT,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX local_site_org_idx ON local_site(organisation_id);

CREATE TABLE local_user (
    id TEXT PRIMARY KEY,
    organisation_id TEXT NOT NULL,
    role TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX local_user_org_idx ON local_user(organisation_id);

CREATE TABLE local_job (
    id TEXT PRIMARY KEY,
    organisation_id TEXT NOT NULL,
    own_site_id TEXT,
    job_number TEXT,
    job_date TEXT,
    direction TEXT,
    status TEXT,
    entity_version INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX local_job_operations_idx ON local_job(organisation_id, own_site_id, job_date, status);

CREATE TABLE local_job_load (
    id TEXT PRIMARY KEY,
    organisation_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    own_site_id TEXT,
    load_number INTEGER,
    direction TEXT,
    status TEXT,
    gross_weight TEXT,
    tare_weight TEXT,
    net_weight TEXT,
    entity_version INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(job_id) REFERENCES local_job(id) ON DELETE CASCADE
);
CREATE INDEX local_job_load_job_idx ON local_job_load(job_id, load_number);
CREATE INDEX local_job_load_operations_idx ON local_job_load(organisation_id, own_site_id, status);

CREATE TABLE local_driver (
    id TEXT PRIMARY KEY,
    organisation_id TEXT NOT NULL,
    haulier_counterparty_id TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX local_driver_org_idx ON local_driver(organisation_id, active);

CREATE TABLE local_vehicle (
    id TEXT PRIMARY KEY,
    organisation_id TEXT NOT NULL,
    haulier_counterparty_id TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX local_vehicle_org_idx ON local_vehicle(organisation_id, active);

CREATE TABLE local_haulier (
    counterparty_id TEXT PRIMARY KEY,
    organisation_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX local_haulier_org_idx ON local_haulier(organisation_id);

CREATE TABLE local_counterparty (
    id TEXT PRIMARY KEY,
    organisation_id TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX local_counterparty_org_idx ON local_counterparty(organisation_id, active);

CREATE TABLE local_counterparty_role (
    entity_id TEXT PRIMARY KEY,
    organisation_id TEXT NOT NULL,
    counterparty_id TEXT NOT NULL,
    role TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX local_counterparty_role_idx ON local_counterparty_role(organisation_id, role);

CREATE TABLE local_counterparty_site (
    id TEXT PRIMARY KEY,
    organisation_id TEXT NOT NULL,
    counterparty_id TEXT NOT NULL,
    site_type TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX local_counterparty_site_org_idx ON local_counterparty_site(organisation_id, active);

CREATE TABLE local_counterparty_site_authorisation (
    id TEXT PRIMARY KEY,
    organisation_id TEXT NOT NULL,
    counterparty_site_id TEXT NOT NULL,
    status TEXT,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX local_counterparty_site_auth_idx ON local_counterparty_site_authorisation(organisation_id, counterparty_site_id, status);

CREATE TABLE local_counterparty_site_ewc (
    entity_id TEXT PRIMARY KEY,
    organisation_id TEXT NOT NULL,
    authorisation_id TEXT NOT NULL,
    ewc_code_id TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX local_counterparty_site_ewc_idx ON local_counterparty_site_ewc(organisation_id, authorisation_id, ewc_code_id);

CREATE TABLE local_ewc (
    id TEXT PRIMARY KEY,
    code TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX local_ewc_code_idx ON local_ewc(code, active);

CREATE TABLE local_permit (
    id TEXT PRIMARY KEY,
    organisation_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    status TEXT,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX local_permit_site_idx ON local_permit(organisation_id, site_id, status);

CREATE TABLE local_permit_ewc_snapshot (
    entity_id TEXT PRIMARY KEY,
    organisation_id TEXT NOT NULL,
    permit_id TEXT NOT NULL,
    ewc_code_id TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX local_permit_ewc_idx ON local_permit_ewc_snapshot(organisation_id, permit_id, ewc_code_id);

CREATE TABLE local_ticket (
    id TEXT PRIMARY KEY,
    organisation_id TEXT NOT NULL,
    job_load_id TEXT,
    local_ticket_number TEXT,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX local_ticket_load_idx ON local_ticket(organisation_id, job_load_id);

CREATE TABLE local_evidence_metadata (
    id TEXT PRIMARY KEY,
    organisation_id TEXT NOT NULL,
    job_load_id TEXT,
    local_path TEXT,
    sha256 TEXT,
    upload_status TEXT NOT NULL DEFAULT 'PENDING',
    payload_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX local_evidence_pending_idx ON local_evidence_metadata(organisation_id, upload_status);

CREATE TABLE local_sync_queue (
    event_id TEXT PRIMARY KEY,
    organisation_id TEXT NOT NULL,
    site_id TEXT,
    device_id TEXT NOT NULL,
    actor_user_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    base_version INTEGER,
    device_sequence INTEGER NOT NULL UNIQUE,
    payload_json TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENDING','SYNCED','CONFLICT','FAILED')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    server_entity_version INTEGER,
    updated_at TEXT NOT NULL
);
CREATE INDEX local_sync_queue_status_idx ON local_sync_queue(status, device_sequence);

CREATE TABLE local_device_configuration (
    singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1),
    device_id TEXT,
    organisation_id TEXT,
    default_site_id TEXT,
    display_name TEXT,
    platform TEXT,
    provisioned_at TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE local_audit_event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT,
    actor_user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    payload_json TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX local_audit_event_created_idx ON local_audit_event(created_at);

CREATE TABLE local_sync_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"#;
