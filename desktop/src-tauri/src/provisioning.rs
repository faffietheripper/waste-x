use keyring::Entry;
use reqwest::{Client, Response};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::bootstrap;

const DB_FILE_NAME: &str = "waste-x-local.db";
const DATABASE_KEYRING_SERVICE: &str = "com.wastex.desktop.local-database";
const DATABASE_KEYRING_ACCOUNT: &str = "database-key-v1";
const CLOUD_KEYRING_SERVICE: &str = "com.wastex.desktop.cloud-credentials";
const CLOUD_KEYRING_ACCOUNT: &str = "credentials-v1";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvisionInput {
    email: String,
    password: String,
    display_name: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloudCredentials {
    device_secret: String,
    session_token: String,
    session_expires_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvisioningStatus {
    provisioned: bool,
    device_id: Option<String>,
    organisation_id: Option<String>,
    default_site_id: Option<String>,
    display_name: Option<String>,
    platform: Option<String>,
    credentials_available: bool,
}

fn cloud_base_url() -> String {
    option_env!("WASTE_X_DESKTOP_API_BASE_URL")
        .unwrap_or("http://localhost:3000")
        .trim_end_matches('/')
        .to_string()
}

fn platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "MACOS"
    } else if cfg!(target_os = "windows") {
        "WINDOWS"
    } else {
        "LINUX"
    }
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

fn save_cloud_credentials(credentials: &CloudCredentials) -> Result<(), String> {
    let entry = Entry::new(CLOUD_KEYRING_SERVICE, CLOUD_KEYRING_ACCOUNT)
        .map_err(|e| format!("Could not access the OS credential store for Waste X Cloud: {e}"))?;
    let encoded = serde_json::to_string(credentials)
        .map_err(|e| format!("Could not encode Waste X Cloud credentials: {e}"))?;
    entry
        .set_password(&encoded)
        .map_err(|e| format!("Could not securely store Waste X Cloud credentials: {e}"))
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

async fn response_json(label: &str, response: Response) -> Result<Value, String> {
    let status = response.status();
    let body = response
        .json::<Value>()
        .await
        .map_err(|e| format!("{label} returned an unreadable response: {e}"))?;

    if !status.is_success() {
        let code = body
            .get("error")
            .and_then(|error| error.get("code"))
            .and_then(Value::as_str)
            .unwrap_or("UNKNOWN");
        let message = body
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("Waste X Cloud rejected the request.");
        return Err(format!("{label} failed [{code}]: {message}"));
    }

    Ok(body)
}

async fn ensure_cloud_reachable(client: &Client) -> Result<(), String> {
    let response = client
        .get(format!("{}/api/desktop/v1/health", cloud_base_url()))
        .send()
        .await
        .map_err(|e| format!("Waste X Cloud is unreachable. Is the local web app running? {e}"))?;
    let body = response_json("Cloud health check", response).await?;
    if body.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err("Waste X Cloud health check did not report ready.".to_string());
    }
    Ok(())
}

fn persist_device_configuration(
    app: &AppHandle,
    device: &Value,
    user: &Value,
    credentials: &CloudCredentials,
) -> Result<(), String> {
    let mut connection = open_local_connection(app)?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;

    let device_id = device
        .get("deviceId")
        .and_then(Value::as_str)
        .ok_or_else(|| "Provision response is missing deviceId.".to_string())?;
    let organisation_id = device
        .get("organisationId")
        .and_then(Value::as_str)
        .ok_or_else(|| "Provision response is missing organisationId.".to_string())?;
    let display_name = device
        .get("displayName")
        .and_then(Value::as_str)
        .unwrap_or("Waste X Desktop");
    let registered_at = device
        .get("registeredAt")
        .and_then(Value::as_str)
        .unwrap_or(credentials.session_expires_at.as_str());
    let default_site_id = device.get("defaultSiteId").and_then(Value::as_str);
    let user_id = user.get("id").and_then(Value::as_str).unwrap_or("");
    let user_email = user.get("email").and_then(Value::as_str).unwrap_or("");

    transaction
        .execute(
            "INSERT INTO local_device_configuration (
                singleton_id, device_id, organisation_id, default_site_id,
                display_name, platform, provisioned_at, updated_at
             ) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
             ON CONFLICT(singleton_id) DO UPDATE SET
                device_id = excluded.device_id,
                organisation_id = excluded.organisation_id,
                default_site_id = excluded.default_site_id,
                display_name = excluded.display_name,
                platform = excluded.platform,
                provisioned_at = excluded.provisioned_at,
                updated_at = excluded.updated_at",
            params![
                device_id,
                organisation_id,
                default_site_id,
                display_name,
                platform(),
                registered_at
            ],
        )
        .map_err(|e| e.to_string())?;

    for (key, value) in [
        ("provisioned_user_id", user_id),
        ("provisioned_user_email", user_email),
        ("session_expires_at", credentials.session_expires_at.as_str()),
    ] {
        transaction
            .execute(
                "INSERT INTO local_sync_metadata (key, value, updated_at)
                 VALUES (?1, ?2, datetime('now'))
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                params![key, value],
            )
            .map_err(|e| e.to_string())?;
    }

    transaction.commit().map_err(|e| e.to_string())
}

fn local_device_id(app: &AppHandle) -> Result<Option<String>, String> {
    let connection = open_local_connection(app)?;
    connection
        .query_row(
            "SELECT device_id FROM local_device_configuration WHERE singleton_id = 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())
}

async fn fetch_bootstrap(client: &Client, credentials: &CloudCredentials) -> Result<Value, String> {
    let response = client
        .get(format!("{}/api/desktop/v1/bootstrap", cloud_base_url()))
        .bearer_auth(&credentials.session_token)
        .header("X-Waste-X-Device-Secret", &credentials.device_secret)
        .send()
        .await
        .map_err(|e| format!("Could not fetch Waste X bootstrap: {e}"))?;
    response_json("Desktop bootstrap", response).await
}

#[tauri::command]
pub fn desktop_provisioning_status(app: AppHandle) -> Result<ProvisioningStatus, String> {
    let connection = open_local_connection(&app)?;
    let row = connection
        .query_row(
            "SELECT device_id, organisation_id, default_site_id, display_name, platform
             FROM local_device_configuration WHERE singleton_id = 1",
            [],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let (device_id, organisation_id, default_site_id, display_name, stored_platform) =
        row.unwrap_or((None, None, None, None, None));
    let credentials_available = load_cloud_credentials().is_ok();

    Ok(ProvisioningStatus {
        provisioned: device_id.is_some(),
        device_id,
        organisation_id,
        default_site_id,
        display_name,
        platform: stored_platform,
        credentials_available,
    })
}

#[tauri::command]
pub async fn desktop_provision_and_bootstrap(
    app: AppHandle,
    input: ProvisionInput,
) -> Result<Value, String> {
    if local_device_id(&app)?.is_some() {
        return Err("This Waste X Desktop installation is already provisioned.".to_string());
    }

    if input.email.trim().is_empty() || input.password.is_empty() || input.display_name.trim().is_empty() {
        return Err("Email, password, and Desktop name are required.".to_string());
    }

    let client = Client::new();
    ensure_cloud_reachable(&client).await?;

    let response = client
        .post(format!("{}/api/desktop/v1/auth/provision", cloud_base_url()))
        .json(&json!({
            "email": input.email.trim(),
            "password": input.password,
            "displayName": input.display_name.trim(),
            "platform": platform(),
            "defaultSiteId": null
        }))
        .send()
        .await
        .map_err(|e| format!("Could not provision Waste X Desktop: {e}"))?;
    let body = response_json("Desktop provisioning", response).await?;

    let device = body
        .get("device")
        .filter(|value| value.is_object())
        .ok_or_else(|| "Provision response is missing device details.".to_string())?;
    let user = body
        .get("user")
        .filter(|value| value.is_object())
        .ok_or_else(|| "Provision response is missing user details.".to_string())?;
    let credentials_value = body
        .get("credentials")
        .filter(|value| value.is_object())
        .ok_or_else(|| "Provision response is missing secure credentials.".to_string())?;

    let credentials = CloudCredentials {
        device_secret: credentials_value
            .get("deviceSecret")
            .and_then(Value::as_str)
            .ok_or_else(|| "Provision response is missing device secret.".to_string())?
            .to_string(),
        session_token: credentials_value
            .get("sessionToken")
            .and_then(Value::as_str)
            .ok_or_else(|| "Provision response is missing session token.".to_string())?
            .to_string(),
        session_expires_at: credentials_value
            .get("sessionExpiresAt")
            .and_then(Value::as_str)
            .ok_or_else(|| "Provision response is missing session expiry.".to_string())?
            .to_string(),
    };

    save_cloud_credentials(&credentials)?;
    persist_device_configuration(&app, device, user, &credentials)?;

    let bootstrap_value = fetch_bootstrap(&client, &credentials).await?;
    let persisted = bootstrap::local_db_apply_bootstrap(app.clone(), bootstrap_value)?;

    Ok(json!({
        "ok": true,
        "deviceId": device.get("deviceId"),
        "organisationId": device.get("organisationId"),
        "bootstrap": persisted
    }))
}

#[tauri::command]
pub async fn desktop_refresh_bootstrap(app: AppHandle) -> Result<Value, String> {
    if local_device_id(&app)?.is_none() {
        return Err("Waste X Desktop has not been provisioned yet.".to_string());
    }

    let credentials = load_cloud_credentials()?;
    let client = Client::new();
    ensure_cloud_reachable(&client).await?;
    let bootstrap_value = fetch_bootstrap(&client, &credentials).await?;
    let persisted = bootstrap::local_db_apply_bootstrap(app, bootstrap_value)?;
    Ok(json!({ "ok": true, "bootstrap": persisted }))
}
