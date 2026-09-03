use std::time::Duration;

use keyring::Entry;
use reqwest::Client;
use serde::{Deserialize, Serialize};

const BRIDGE_BASE_URL: &str = "http://127.0.0.1:43127";
const BRIDGE_KEYRING_SERVICE: &str = "com.wastex.desktop.bridge";
const BRIDGE_KEYRING_ACCOUNT: &str = "bridge-token-v1";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    ok: bool,
    service: String,
    version: String,
    pid: u32,
    uptime_seconds: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeResponse {
    ok: bool,
    service: String,
    version: String,
    pid: u32,
    uptime_seconds: u64,
    database: DatabaseRuntime,
}

#[derive(Deserialize)]
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeStatus {
    reachable: bool,
    service: Option<String>,
    version: Option<String>,
    pid: Option<u32>,
    uptime_seconds: Option<u64>,
    database_ready: bool,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PairingRequest<'a> {
    paired_device_id: &'a str,
    base_url: Option<&'a str>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeMobilePairing {
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

impl BridgeStatus {
    fn unavailable(error: String) -> Self {
        Self {
            reachable: false,
            service: None,
            version: None,
            pid: None,
            uptime_seconds: None,
            database_ready: false,
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
        }
    }
}

fn bridge_token() -> Result<String, String> {
    let entry = Entry::new(BRIDGE_KEYRING_SERVICE, BRIDGE_KEYRING_ACCOUNT)
        .map_err(|e| format!("Could not access the Waste X Bridge credential: {e}"))?;
    entry
        .get_password()
        .map_err(|e| format!("Waste X Bridge has not created its local credential yet: {e}"))
}

fn bridge_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_millis(1500))
        .build()
        .map_err(|e| format!("Could not initialise the Waste X Bridge client: {e}"))
}

#[tauri::command]
pub async fn desktop_bridge_create_mobile_pairing(
    paired_device_id: String,
    base_url: Option<String>,
) -> Result<BridgeMobilePairing, String> {
    let paired_device_id = paired_device_id.trim().to_string();
    if paired_device_id.is_empty() {
        return Err("A Waste X Mobile device ID is required for pairing.".to_string());
    }

    let client = bridge_client()?;
    let token = bridge_token()?;
    let response = client
        .post(format!("{BRIDGE_BASE_URL}/v1/mobile/pairing"))
        .header("X-Waste-X-Bridge-Token", token)
        .json(&PairingRequest {
            paired_device_id: &paired_device_id,
            base_url: base_url.as_deref(),
        })
        .send()
        .await
        .map_err(|e| format!("Could not ask Waste X Bridge to create a Mobile pairing: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().await.unwrap_or_default();
        return Err(format!(
            "Waste X Bridge could not create the Mobile pairing (HTTP {status}): {detail}"
        ));
    }

    response
        .json::<BridgeMobilePairing>()
        .await
        .map_err(|e| format!("Waste X Bridge pairing response was unreadable: {e}"))
}

#[tauri::command]
pub async fn desktop_bridge_status() -> Result<BridgeStatus, String> {
    let client = Client::builder()
        .timeout(Duration::from_millis(900))
        .build()
        .map_err(|e| format!("Could not initialise the Waste X Bridge client: {e}"))?;

    let health = match client
        .get(format!("{BRIDGE_BASE_URL}/v1/health"))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => match response.json::<HealthResponse>().await {
            Ok(health) if health.ok => health,
            Ok(_) => return Ok(BridgeStatus::unavailable("Waste X Bridge health response was not ready.".to_string())),
            Err(error) => return Ok(BridgeStatus::unavailable(format!("Waste X Bridge health response was unreadable: {error}"))),
        },
        Ok(response) => return Ok(BridgeStatus::unavailable(format!("Waste X Bridge health returned HTTP {}.", response.status()))),
        Err(error) => return Ok(BridgeStatus::unavailable(format!("Waste X Bridge is not running: {error}"))),
    };

    let token = match bridge_token() {
        Ok(token) => token,
        Err(error) => {
            return Ok(BridgeStatus {
                reachable: true,
                service: Some(health.service),
                version: Some(health.version),
                pid: Some(health.pid),
                uptime_seconds: Some(health.uptime_seconds),
                database_ready: false,
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
            });
        }
    };

    let response = match client
        .get(format!("{BRIDGE_BASE_URL}/v1/runtime"))
        .header("X-Waste-X-Bridge-Token", token)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            return Ok(BridgeStatus {
                reachable: true,
                service: Some(health.service),
                version: Some(health.version),
                pid: Some(health.pid),
                uptime_seconds: Some(health.uptime_seconds),
                database_ready: false,
                cipher_version: None,
                schema_version: None,
                pending: 0,
                retrying: 0,
                conflicts: 0,
                device_id: None,
                organisation_id: None,
                last_bootstrap_at: None,
                sync_cursor: None,
                error: Some(format!("Waste X Bridge runtime request failed: {error}")),
            });
        }
    };

    if !response.status().is_success() {
        return Ok(BridgeStatus {
            reachable: true,
            service: Some(health.service),
            version: Some(health.version),
            pid: Some(health.pid),
            uptime_seconds: Some(health.uptime_seconds),
            database_ready: false,
            cipher_version: None,
            schema_version: None,
            pending: 0,
            retrying: 0,
            conflicts: 0,
            device_id: None,
            organisation_id: None,
            last_bootstrap_at: None,
            sync_cursor: None,
            error: Some(format!("Waste X Bridge runtime returned HTTP {}.", response.status())),
        });
    }

    let runtime = response
        .json::<RuntimeResponse>()
        .await
        .map_err(|e| format!("Waste X Bridge runtime response was unreadable: {e}"))?;

    Ok(BridgeStatus {
        reachable: runtime.ok,
        service: Some(runtime.service),
        version: Some(runtime.version),
        pid: Some(runtime.pid),
        uptime_seconds: Some(runtime.uptime_seconds),
        database_ready: runtime.database.ready,
        cipher_version: runtime.database.cipher_version,
        schema_version: runtime.database.schema_version,
        pending: runtime.database.pending,
        retrying: runtime.database.retrying,
        conflicts: runtime.database.conflicts,
        device_id: runtime.database.device_id,
        organisation_id: runtime.database.organisation_id,
        last_bootstrap_at: runtime.database.last_bootstrap_at,
        sync_cursor: runtime.database.sync_cursor,
        error: runtime.database.error,
    })
}
