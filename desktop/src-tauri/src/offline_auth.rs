use std::{sync::Mutex, time::Duration as StdDuration};

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, SaltString},
    Argon2, PasswordHasher, PasswordVerifier,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, Duration, Utc};
use hmac::{Hmac, Mac};
use keyring::Entry;
use reqwest::Client;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};

type HmacSha256 = Hmac<Sha256>;

const DB_FILE_NAME: &str = "waste-x-local.db";
const DATABASE_KEYRING_SERVICE: &str = "com.wastex.desktop.local-database";
const DATABASE_KEYRING_ACCOUNT: &str = "database-key-v1";
const CLOUD_KEYRING_SERVICE: &str = "com.wastex.desktop.cloud-credentials";
const CLOUD_KEYRING_ACCOUNT: &str = "credentials-v1";
const CLOCK_ROLLBACK_TOLERANCE_MINUTES: i64 = 5;

#[derive(Clone)]
struct UnlockedIdentity {
    user_id: String,
    email: String,
    role: String,
    mode: String,
}

#[derive(Default)]
pub struct DesktopAuthState {
    identity: Mutex<Option<UnlockedIdentity>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlockInput {
    email: String,
    password: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CloudCredentials {
    device_secret: String,
    session_token: String,
    session_expires_at: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OfflineEntitlement {
    version: i64,
    device_id: String,
    organisation_id: String,
    user_id: String,
    role: String,
    default_site_id: Option<String>,
    issued_at: String,
    expires_at: String,
    max_offline_days: i64,
    signature: String,
}

#[derive(Clone)]
struct DeviceConfiguration {
    device_id: String,
    organisation_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopAuthStatus {
    requires_unlock: bool,
    unlocked: bool,
    can_offline: bool,
    email: Option<String>,
    mode: Option<String>,
    offline_expires_at: Option<String>,
    offline_days_remaining: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlockResult {
    ok: bool,
    mode: String,
    user_id: String,
    role: String,
    offline_expires_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationalSummary {
    organisation_id: Option<String>,
    sync_cursor: Option<String>,
    last_bootstrap_at: Option<String>,
    jobs: i64,
    job_loads: i64,
    pending_sync_events: i64,
    conflicts: i64,
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

fn set_metadata(
    transaction: &rusqlite::Transaction<'_>,
    key: &str,
    value: &str,
) -> Result<(), String> {
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

fn device_configuration(connection: &Connection) -> Result<Option<DeviceConfiguration>, String> {
    connection
        .query_row(
            "SELECT device_id, organisation_id
             FROM local_device_configuration
             WHERE singleton_id = 1 AND device_id IS NOT NULL AND organisation_id IS NOT NULL",
            [],
            |row| {
                Ok(DeviceConfiguration {
                    device_id: row.get(0)?,
                    organisation_id: row.get(1)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())
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

fn save_cloud_credentials(credentials: &CloudCredentials) -> Result<(), String> {
    let entry = Entry::new(CLOUD_KEYRING_SERVICE, CLOUD_KEYRING_ACCOUNT)
        .map_err(|e| format!("Could not access the OS credential store for Waste X Cloud: {e}"))?;
    let encoded = serde_json::to_string(credentials)
        .map_err(|e| format!("Could not encode Waste X Cloud credentials: {e}"))?;
    entry
        .set_password(&encoded)
        .map_err(|e| format!("Could not securely store Waste X Cloud credentials: {e}"))
}

fn canonical_entitlement(entitlement: &OfflineEntitlement) -> String {
    [
        entitlement.version.to_string(),
        entitlement.device_id.clone(),
        entitlement.organisation_id.clone(),
        entitlement.user_id.clone(),
        entitlement.role.clone(),
        entitlement.default_site_id.clone().unwrap_or_default(),
        entitlement.issued_at.clone(),
        entitlement.expires_at.clone(),
        entitlement.max_offline_days.to_string(),
    ]
    .join("|")
}

fn validate_entitlement(
    entitlement: &OfflineEntitlement,
    device: &DeviceConfiguration,
    device_secret: &str,
    expected_user_id: &str,
    expected_role: &str,
) -> Result<DateTime<Utc>, String> {
    if entitlement.version != 1 || entitlement.max_offline_days != 14 {
        return Err("Waste X offline entitlement version is unsupported.".to_string());
    }
    if entitlement.device_id != device.device_id
        || entitlement.organisation_id != device.organisation_id
        || entitlement.user_id != expected_user_id
        || entitlement.role != expected_role
    {
        return Err("Waste X offline entitlement does not match this device/user.".to_string());
    }

    let key = Sha256::digest(device_secret.as_bytes());
    let mut mac = HmacSha256::new_from_slice(&key)
        .map_err(|_| "Could not initialise Waste X entitlement verification.".to_string())?;
    mac.update(canonical_entitlement(entitlement).as_bytes());
    let signature = URL_SAFE_NO_PAD
        .decode(entitlement.signature.as_bytes())
        .map_err(|_| "Waste X offline entitlement signature is invalid.".to_string())?;
    mac.verify_slice(&signature)
        .map_err(|_| "Waste X offline entitlement signature could not be verified.".to_string())?;

    let expires_at = DateTime::parse_from_rfc3339(&entitlement.expires_at)
        .map_err(|_| "Waste X offline entitlement expiry is invalid.".to_string())?
        .with_timezone(&Utc);
    if expires_at <= Utc::now() {
        return Err("Waste X offline access has expired. Reconnect to Cloud to renew it.".to_string());
    }

    Ok(expires_at)
}

fn set_unlocked(
    state: &DesktopAuthState,
    user_id: String,
    email: String,
    role: String,
    mode: &str,
) -> Result<(), String> {
    let mut identity = state
        .identity
        .lock()
        .map_err(|_| "Waste X authentication state is unavailable.".to_string())?;
    *identity = Some(UnlockedIdentity {
        user_id,
        email,
        role,
        mode: mode.to_string(),
    });
    Ok(())
}

fn offline_unlock(
    app: &AppHandle,
    state: &DesktopAuthState,
    input: &UnlockInput,
) -> Result<UnlockResult, String> {
    let mut connection = open_local_connection(app)?;
    let device = device_configuration(&connection)?
        .ok_or_else(|| "This Waste X Desktop installation is not provisioned.".to_string())?;
    let credentials = load_cloud_credentials()?;

    let stored_email = metadata(&connection, "offline_auth_email")?
        .ok_or_else(|| "Offline sign-in has not been enabled yet. Connect to Waste X Cloud once to enable it.".to_string())?;
    let stored_hash = metadata(&connection, "offline_auth_password_hash")?
        .ok_or_else(|| "Offline sign-in has not been enabled yet.".to_string())?;
    let user_id = metadata(&connection, "offline_auth_user_id")?
        .ok_or_else(|| "Offline user identity is unavailable.".to_string())?;
    let role = metadata(&connection, "offline_auth_role")?
        .ok_or_else(|| "Offline user role is unavailable.".to_string())?;
    let entitlement_json = metadata(&connection, "offline_entitlement")?
        .ok_or_else(|| "Offline entitlement is unavailable. Reconnect to Waste X Cloud.".to_string())?;

    if stored_email != input.email.trim().to_lowercase() {
        return Err("Invalid Waste X email or password.".to_string());
    }

    let parsed_hash = PasswordHash::new(&stored_hash)
        .map_err(|_| "Stored offline password verifier is invalid.".to_string())?;
    Argon2::default()
        .verify_password(input.password.as_bytes(), &parsed_hash)
        .map_err(|_| "Invalid Waste X email or password.".to_string())?;

    let entitlement: OfflineEntitlement = serde_json::from_str(&entitlement_json)
        .map_err(|_| "Stored Waste X offline entitlement is invalid.".to_string())?;
    let expires_at = validate_entitlement(
        &entitlement,
        &device,
        &credentials.device_secret,
        &user_id,
        &role,
    )?;

    let now = Utc::now();
    if let Some(last_seen) = metadata(&connection, "offline_last_seen_at")? {
        if let Ok(last_seen) = DateTime::parse_from_rfc3339(&last_seen) {
            let last_seen = last_seen.with_timezone(&Utc);
            if now < last_seen - Duration::minutes(CLOCK_ROLLBACK_TOLERANCE_MINUTES) {
                return Err("The system clock moved backwards. Reconnect to Waste X Cloud before using offline mode.".to_string());
            }
        }
    }

    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    set_metadata(&transaction, "offline_last_seen_at", &now.to_rfc3339())?;
    transaction.commit().map_err(|e| e.to_string())?;

    set_unlocked(
        state,
        user_id.clone(),
        stored_email.clone(),
        role.clone(),
        "OFFLINE",
    )?;

    Ok(UnlockResult {
        ok: true,
        mode: "OFFLINE".to_string(),
        user_id,
        role,
        offline_expires_at: expires_at.to_rfc3339(),
    })
}

async fn online_unlock(
    app: &AppHandle,
    state: &DesktopAuthState,
    input: &UnlockInput,
) -> Result<Option<UnlockResult>, String> {
    let mut connection = open_local_connection(app)?;
    let device = device_configuration(&connection)?
        .ok_or_else(|| "This Waste X Desktop installation is not provisioned.".to_string())?;
    let mut credentials = load_cloud_credentials()?;
    let client = Client::builder()
        .timeout(StdDuration::from_secs(5))
        .build()
        .map_err(|e| format!("Could not initialise Waste X Cloud client: {e}"))?;

    let login_response = match client
        .post(format!("{}/api/desktop/v1/auth/login", cloud_base_url()))
        .json(&json!({
            "email": input.email.trim(),
            "password": input.password,
            "deviceId": device.device_id,
            "deviceSecret": credentials.device_secret,
        }))
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => return Ok(None),
    };

    let status = login_response.status();
    let body = login_response
        .json::<Value>()
        .await
        .map_err(|e| format!("Waste X Cloud login returned an unreadable response: {e}"))?;

    if !status.is_success() {
        if status.is_server_error() {
            return Ok(None);
        }
        let code = body
            .get("error")
            .and_then(|value| value.get("code"))
            .and_then(Value::as_str)
            .unwrap_or("AUTH_FAILED");
        let message = body
            .get("error")
            .and_then(|value| value.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("Waste X Cloud rejected the sign-in.");
        return Err(format!("{message} [{code}]"));
    }

    let user = body
        .get("user")
        .ok_or_else(|| "Waste X Cloud login response is missing the user.".to_string())?;
    let user_id = user
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Waste X Cloud login response is missing user id.".to_string())?
        .to_string();
    let role = user
        .get("role")
        .and_then(Value::as_str)
        .ok_or_else(|| "Waste X Cloud login response is missing user role.".to_string())?
        .to_string();
    let organisation_id = user
        .get("organisationId")
        .and_then(Value::as_str)
        .ok_or_else(|| "Waste X Cloud login response is missing organisation id.".to_string())?;
    if organisation_id != device.organisation_id {
        return Err("Waste X Cloud login returned the wrong organisation.".to_string());
    }

    credentials.session_token = body
        .get("session")
        .and_then(|value| value.get("token"))
        .and_then(Value::as_str)
        .ok_or_else(|| "Waste X Cloud login response is missing a session token.".to_string())?
        .to_string();
    credentials.session_expires_at = body
        .get("session")
        .and_then(|value| value.get("expiresAt"))
        .and_then(Value::as_str)
        .ok_or_else(|| "Waste X Cloud login response is missing session expiry.".to_string())?
        .to_string();
    save_cloud_credentials(&credentials)?;

    let entitlement_response = match client
        .get(format!(
            "{}/api/desktop/v1/auth/offline-entitlement",
            cloud_base_url()
        ))
        .bearer_auth(&credentials.session_token)
        .header("X-Waste-X-Device-Secret", &credentials.device_secret)
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => return Ok(None),
    };

    if !entitlement_response.status().is_success() {
        if entitlement_response.status().is_server_error() {
            return Ok(None);
        }
        return Err("Waste X Cloud could not issue offline access for this device.".to_string());
    }

    let entitlement_body = entitlement_response
        .json::<Value>()
        .await
        .map_err(|e| format!("Offline entitlement response is unreadable: {e}"))?;
    let entitlement: OfflineEntitlement = serde_json::from_value(
        entitlement_body
            .get("offlineEntitlement")
            .cloned()
            .ok_or_else(|| "Waste X Cloud did not return an offline entitlement.".to_string())?,
    )
    .map_err(|e| format!("Waste X offline entitlement is invalid: {e}"))?;
    let expires_at = validate_entitlement(
        &entitlement,
        &device,
        &credentials.device_secret,
        &user_id,
        &role,
    )?;

    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(input.password.as_bytes(), &salt)
        .map_err(|e| format!("Could not create offline password verifier: {e}"))?
        .to_string();
    let normalised_email = input.email.trim().to_lowercase();
    let entitlement_json = serde_json::to_string(&entitlement)
        .map_err(|e| format!("Could not store offline entitlement: {e}"))?;
    let now = Utc::now().to_rfc3339();

    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    for (key, value) in [
        ("offline_auth_user_id", user_id.as_str()),
        ("offline_auth_email", normalised_email.as_str()),
        ("offline_auth_role", role.as_str()),
        ("offline_auth_password_hash", password_hash.as_str()),
        ("offline_entitlement", entitlement_json.as_str()),
        ("offline_last_online_at", entitlement.issued_at.as_str()),
        ("offline_last_seen_at", now.as_str()),
        ("session_expires_at", credentials.session_expires_at.as_str()),
    ] {
        set_metadata(&transaction, key, value)?;
    }
    transaction.commit().map_err(|e| e.to_string())?;

    set_unlocked(
        state,
        user_id.clone(),
        normalised_email,
        role.clone(),
        "ONLINE",
    )?;

    Ok(Some(UnlockResult {
        ok: true,
        mode: "ONLINE".to_string(),
        user_id,
        role,
        offline_expires_at: expires_at.to_rfc3339(),
    }))
}

pub fn require_unlocked(state: &DesktopAuthState) -> Result<(), String> {
    let identity = state
        .identity
        .lock()
        .map_err(|_| "Waste X authentication state is unavailable.".to_string())?;
    if identity.is_none() {
        return Err("Waste X Desktop is locked. Sign in to continue.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn desktop_auth_status(
    app: AppHandle,
    state: State<'_, DesktopAuthState>,
) -> Result<DesktopAuthStatus, String> {
    let connection = open_local_connection(&app)?;
    let device = device_configuration(&connection)?;
    let identity = state
        .identity
        .lock()
        .map_err(|_| "Waste X authentication state is unavailable.".to_string())?
        .clone();

    let email = metadata(&connection, "offline_auth_email")?
        .or(metadata(&connection, "provisioned_user_email")?);
    let mut can_offline = false;
    let mut offline_expires_at = None;
    let mut offline_days_remaining = 0_i64;

    if let Some(device) = device.as_ref() {
        if let (
            Some(entitlement_json),
            Some(user_id),
            Some(role),
            Some(_password_hash),
            Ok(credentials),
        ) = (
            metadata(&connection, "offline_entitlement")?,
            metadata(&connection, "offline_auth_user_id")?,
            metadata(&connection, "offline_auth_role")?,
            metadata(&connection, "offline_auth_password_hash")?,
            load_cloud_credentials(),
        ) {
            if let Ok(entitlement) = serde_json::from_str::<OfflineEntitlement>(&entitlement_json) {
                offline_expires_at = Some(entitlement.expires_at.clone());
                if let Ok(expires_at) = validate_entitlement(
                    &entitlement,
                    device,
                    &credentials.device_secret,
                    &user_id,
                    &role,
                ) {
                    can_offline = true;
                    let seconds = (expires_at - Utc::now()).num_seconds().max(0);
                    offline_days_remaining = (seconds + 86_399) / 86_400;
                }
            }
        }
    }

    Ok(DesktopAuthStatus {
        requires_unlock: device.is_some(),
        unlocked: identity.is_some(),
        can_offline,
        email,
        mode: identity.as_ref().map(|value| value.mode.clone()),
        offline_expires_at,
        offline_days_remaining,
    })
}

#[tauri::command]
pub async fn desktop_unlock(
    app: AppHandle,
    state: State<'_, DesktopAuthState>,
    input: UnlockInput,
) -> Result<UnlockResult, String> {
    if input.email.trim().is_empty() || input.password.is_empty() {
        return Err("Waste X email and password are required.".to_string());
    }

    if let Some(result) = online_unlock(&app, &state, &input).await? {
        return Ok(result);
    }

    offline_unlock(&app, &state, &input)
}

#[tauri::command]
pub fn desktop_lock(state: State<'_, DesktopAuthState>) -> Result<(), String> {
    let mut identity = state
        .identity
        .lock()
        .map_err(|_| "Waste X authentication state is unavailable.".to_string())?;
    *identity = None;
    Ok(())
}

#[tauri::command]
pub fn desktop_operational_summary(
    app: AppHandle,
    state: State<'_, DesktopAuthState>,
) -> Result<OperationalSummary, String> {
    require_unlocked(&state)?;
    let connection = open_local_connection(&app)?;

    let count = |sql: &str| -> Result<i64, String> {
        connection
            .query_row(sql, [], |row| row.get(0))
            .map_err(|e| e.to_string())
    };

    Ok(OperationalSummary {
        organisation_id: metadata(&connection, "organisation_id")?,
        sync_cursor: metadata(&connection, "sync_cursor")?,
        last_bootstrap_at: metadata(&connection, "last_bootstrap_at")?,
        jobs: count("SELECT COUNT(*) FROM local_job")?,
        job_loads: count("SELECT COUNT(*) FROM local_job_load")?,
        pending_sync_events: count(
            "SELECT COUNT(*) FROM local_sync_queue WHERE status IN ('PENDING','SENDING','FAILED')",
        )?,
        conflicts: count("SELECT COUNT(*) FROM local_sync_queue WHERE status = 'CONFLICT'")?,
    })
}
