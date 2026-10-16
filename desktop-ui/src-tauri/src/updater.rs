use crate::supervisor::BridgeManager;
use serde::Serialize;
use std::{sync::Arc, time::Duration};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::Mutex;

#[derive(Default)]
pub struct UpdateState(Mutex<Pending>);
#[derive(Default)]
struct Pending {
    update: Option<Update>,
    bytes: Option<Arc<[u8]>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    supported: bool,
    version: Option<String>,
    notes: Option<String>,
    message: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    downloaded: usize,
    total: Option<u64>,
}

fn unsupported_reason(app: &AppHandle) -> Option<&'static str> {
    if cfg!(target_os = "linux") && std::env::var_os("FLATPAK_ID").is_some() {
        return Some("Update Nuvio through your Flatpak installation.");
    }
    if app
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|value| value.get("pubkey"))
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .is_empty()
    {
        return Some(
            "This build has no updater signing key. Install a release build to enable updates.",
        );
    }
    None
}

#[tauri::command]
pub async fn update_check(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> Result<UpdateInfo, String> {
    if let Some(message) = unsupported_reason(&app) {
        return Ok(UpdateInfo {
            supported: false,
            version: None,
            notes: None,
            message: Some(message.into()),
        });
    }
    let mut pending = state
        .0
        .try_lock()
        .map_err(|_| "An update operation is already running")?;
    // Keep a verified download intact when About is opened again.
    if pending.bytes.is_some() {
        return info(&pending);
    }
    let builder = app.updater_builder().timeout(Duration::from_secs(60));
    #[cfg(target_os = "linux")]
    let builder = if matches!(env!("NUVIO_PACKAGE_FORMAT"), "deb" | "rpm") {
        builder.target(format!(
            "linux-{}-{}",
            std::env::consts::ARCH,
            env!("NUVIO_PACKAGE_FORMAT")
        ))
    } else {
        builder
    };
    pending.update = builder
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    if let Some(update) = pending.update.as_mut() {
        update.timeout = Some(Duration::from_secs(600));
    }
    info(&pending)
}
fn info(pending: &Pending) -> Result<UpdateInfo, String> {
    Ok(UpdateInfo {
        supported: true,
        version: pending.update.as_ref().map(|u| {
            u.raw_json
                .get("marketingVersion")
                .and_then(|value| value.as_str())
                .unwrap_or(&u.version)
                .to_string()
        }),
        notes: pending.update.as_ref().and_then(|u| u.body.clone()),
        message: None,
    })
}

#[tauri::command]
pub async fn update_download(app: AppHandle, state: State<'_, UpdateState>) -> Result<(), String> {
    let mut pending = state
        .0
        .try_lock()
        .map_err(|_| "An update operation is already running")?;
    if pending.bytes.is_some() {
        return Ok(());
    }
    let update = pending
        .update
        .as_ref()
        .ok_or("Check for an update before downloading")?;
    let mut downloaded = 0;
    let bytes = update
        .download(
            |chunk, total| {
                downloaded += chunk;
                let _ = app.emit("nuvio-update-progress", Progress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    // The plugin verifies the signature before returning these bytes.
    pending.bytes = Some(bytes.into());
    Ok(())
}

#[tauri::command]
pub async fn update_install(
    app: AppHandle,
    state: State<'_, UpdateState>,
    bridge: State<'_, Arc<BridgeManager>>,
) -> Result<(), String> {
    let pending = state
        .0
        .try_lock()
        .map_err(|_| "An update operation is already running")?;
    let update = pending.update.as_ref().ok_or("No update is available")?;
    let bytes = pending
        .bytes
        .as_ref()
        .ok_or("Download and verify the update before installing")?;
    bridge.shutdown().await;
    let update = update.clone();
    let bytes = bytes.clone();
    let result = tauri::async_runtime::spawn_blocking(move || update.install(bytes))
        .await
        .map_err(|e| e.to_string());
    let result = result.and_then(|value| value.map_err(|e| e.to_string()));
    if let Err(error) = result {
        if let Err(recovery) = bridge.recover_failed_update().await {
            return Err(format!("{error}. The backend could not restart: {recovery}. Restart Nuvio before retrying."));
        }
        return Err(error);
    }
    app.restart();
}
