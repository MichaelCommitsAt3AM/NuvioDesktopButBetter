#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod supervisor;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::sync::Arc;
use std::time::Instant;
use supervisor::{BridgeManager, BridgeStatus};
use tauri::{Manager, WindowEvent};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
struct BridgeRequest {
    id: String,
    method: String,
    params: Map<String, Value>,
    epoch: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeResponse {
    id: String,
    epoch: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<BridgeError>,
}

#[derive(Debug, Serialize)]
struct BridgeError {
    code: String,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusPayload {
    status: BridgeStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

const ALLOWED_METHODS: &[&str] = &[
    "session.snapshot",
    "session.signIn",
    "session.signUp",
    "session.guest",
    "session.signOut",
    "profiles.select",
    "home.snapshot",
    "home.refresh",
    "addons.snapshot",
    "addons.install",
    "addons.toggle",
    "addons.remove",
    "library.snapshot",
    "library.add",
    "library.remove",
    "settings.snapshot",
    "settings.setTheme",
    "search.start",
    "details.load",
    "streams.load",
    "playback.start",
    "playback.stop",
    "app.visibility",
    "app.shutdown",
    "catalog.open",
    "catalog.snapshot",
    "catalog.loadMore",
    "catalog.refresh",
    "catalog.saveScrollPosition",
    "discover.snapshot",
    "discover.refresh",
    "discover.selectType",
    "discover.selectCatalog",
    "discover.selectGenre",
    "discover.loadMore",
    "search.historySnapshot",
    "search.historyRemove",
    "search.historyUse",
    "search.historyEnabled",
    "search.historyRecord",
    "profiles.snapshot",
    "profiles.create",
    "profiles.update",
    "profiles.delete",
    "profiles.pin.verify",
    "profiles.pin.set",
    "profiles.pin.clear",
    "profiles.pin.clearWithPassword",
    "profiles.rememberLast.set",
    "profiles.avatars.refresh",
    "appearance.snapshot",
    "appearance.setTheme",
    "appearance.setCustomTheme",
    "appearance.setAmoled",
    "appearance.setNavigationLayout",
    "appearance.setNavBarStyle",
    "appearance.setNavBarGlow",
    "posters.snapshot",
    "posters.setPattern",
    "posters.clearPattern",
    "posters.setScreenEnabled",
    "posters.setCardStyle",
    "posters.setCardDepth",
    "homePreferences.snapshot",
    "homePreferences.setHeroEnabled",
    "homePreferences.setShowCatalogType",
    "homePreferences.setHideUnreleasedContent",
    "homePreferences.setHeroSourceEnabled",
    "homePreferences.setEnabled",
    "homePreferences.setCustomTitle",
    "homePreferences.reset",
    "homePreferences.move",
    "continueWatching.snapshot",
    "continueWatching.setVisible",
    "continueWatching.setStyle",
    "continueWatching.setUpNextFromFurthestEpisode",
    "continueWatching.setUseEpisodeThumbnails",
    "continueWatching.setShowUnairedNextUp",
    "continueWatching.setBlurNextUp",
    "continueWatching.setShowResumePromptOnLaunch",
    "continueWatching.setSortMode",
    "continueWatching.dismissNextUp",
    "continueWatching.removeDismissedForContent",
    "search.clear",
    "streams.resolve",
    "app.openExternal",
    "downloads.enqueue",
    "downloads.play",
    "details.extras",
    "details.person",
    "details.entity",
    "details.entity.page",
    "details.watched.snapshot",
    "details.watched.toggle",
    "details.watched.toggleEpisode",
    "details.watched.togglePreviousEpisodes",
    "details.watched.toggleSeason",
    "downloads.snapshot",
    "downloads.pause",
    "downloads.resume",
    "downloads.retry",
    "downloads.cancel",
    "downloads.remove",
    "downloads.markSeen",
    "downloads.filter.snapshot",
    "downloads.filter.setMaxResolution",
    "downloads.filter.setSourceAllowed",
    "downloads.filter.setMaxSizeBytes",
    "downloads.filter.setShowUnknownSize",
    "downloads.filter.reset",
    "cloud.play",
    "home.extras.snapshot",
    "home.extras.refresh",
    "home.continueWatching.remove",
    "home.continueWatching.reset",
    "home.continueWatching.dismissUpNext",
    "home.preferences.setVisible",
    "home.preferences.setStyle",
    "home.preferences.setUpNextFromFurthestEpisode",
    "home.preferences.setUseEpisodeThumbnails",
    "home.preferences.setShowUnairedNextUp",
    "home.preferences.setBlurNextUp",
    "home.preferences.setSortMode",
    "library.extras",
    "library.setLayout",
    "library.setSort",
    "library.membership",
    "library.setMembership",
    "cloud.snapshot",
    "cloud.refresh",
    "metadataSettings.snapshot",
    "metadataSettings.set",
    "metadataSettings.setSectionEnabled",
    "metadataSettings.setTabGroup",
    "metadataSettings.move",
    "metadataSettings.reset",
    "playbackSettings.snapshot",
    "playbackSettings.set",
    "plugins.snapshot",
    "plugins.addRepository",
    "plugins.removeRepository",
    "plugins.refresh",
    "plugins.refreshRepository",
    "plugins.setEnabled",
    "plugins.setGrouped",
    "plugins.toggleScraper",
    "plugins.testScraper",
    "posters.resolve",
    "authOptions.snapshot",
    "authOptions.discoverServer",
    "authOptions.connectServer",
    "authOptions.useOfficialServer",
    "authOptions.resetDiscovery",
    "authOptions.deviceStart",
    "authOptions.deviceCancel",
    "integrations.snapshot",
    "tmdb.snapshot",
    "tmdb.set",
    "mdblist.snapshot",
    "mdblist.set",
    "mdblist.setProviderEnabled",
    "mdblist.connect",
    "mdblist.cancel",
    "mdblist.disconnect",
    "mdblist.poll",
    "debrid.snapshot",
    "debrid.set",
    "debrid.device.start",
    "debrid.device.poll",
    "debrid.device.cancel",
    "debrid.validateKey",
    "simkl.snapshot",
    "simkl.connect",
    "simkl.disconnect",
    "trackingSettings.snapshot",
    "trackingSettings.set",
    "details.comments.page",
    "collections.snapshot",
    "collections.remove",
    "collections.move",
    "collections.editor.snapshot",
    "collections.editor.open",
    "collections.editor.setTitle",
    "collections.editor.setBackdrop",
    "collections.editor.setPinToTop",
    "collections.editor.setViewMode",
    "collections.editor.setShowAllTab",
    "collections.editor.addFolder",
    "collections.editor.editFolder",
    "collections.editor.removeFolder",
    "collections.editor.moveFolder",
    "collections.editor.cancelFolder",
    "collections.editor.saveFolder",
    "collections.editor.save",
    "collections.editor.cancel",
    "collections.editor.updateFolder",
    "collections.editor.showCatalogPicker",
    "collections.editor.hideCatalogPicker",
    "collections.editor.toggleCatalog",
    "collections.editor.setCatalogGenre",
    "collections.editor.showGenrePicker",
    "collections.editor.hideGenrePicker",
    "collections.editor.showTmdbPicker",
    "collections.editor.hideTmdbPicker",
    "collections.editor.tmdb.setMode",
    "collections.editor.tmdb.setInput",
    "collections.editor.tmdb.setTitle",
    "collections.editor.tmdb.setMediaType",
    "collections.editor.tmdb.setMediaBoth",
    "collections.editor.tmdb.setSort",
    "collections.editor.tmdb.setFilters",
    "collections.editor.tmdb.searchCompanies",
    "collections.editor.tmdb.searchCollections",
    "collections.editor.tmdb.addInput",
    "collections.editor.tmdb.addSource",
    "collections.editor.tmdb.addSources",
    "collections.editor.showTraktPicker",
    "collections.editor.hideTraktPicker",
    "collections.editor.editTraktSource",
    "collections.editor.trakt.setInput",
    "collections.editor.trakt.setTitle",
    "collections.editor.trakt.setMediaType",
    "collections.editor.trakt.setMediaBoth",
    "collections.editor.trakt.setSort",
    "collections.editor.trakt.setDirection",
    "collections.editor.trakt.search",
    "collections.editor.trakt.addInput",
    "collections.editor.trakt.addResult",
    "collections.editor.trakt.addSources",
    "collections.folder.snapshot",
    "collections.folder.open",
    "collections.folder.selectTab",
    "collections.folder.loadMore",
    "collections.folder.refresh",
    "about.snapshot",
    "about.refreshCommunity",
    "about.refreshMembership",
    "about.setLanguage",
    "about.checkUpdates",
    "advanced.snapshot",
    "advanced.clearContinueWatchingCache",
    "advanced.setSentry",
    "advanced.setDiscordPresence",
    "streams.snapshot",
    "streams.filter.set",
    "streams.downloadFilter.set",
    "streams.cancel",
    "streams.autoplay.consume",
    "streams.autoplay.skip",
    "collections.export",
    "collections.validateImport",
    "collections.import",
    "collections.editor.removeSource",
    "collections.editor.tmdb.addPreset",
    "details.shuffle.snapshot",
    "details.shuffle.pick",
    "details.shuffle.save",
    "addons.refresh",
    "addons.refreshAll",
    "addons.move",
    "advanced.setOpenGlRenderer",
    "appearance.setAppIcon",
    "plugins.scraperSettings",
    "plugins.saveScraperSettings",
    "streams.badges.setFileSizeEnabled",
    "streams.badges.setAddonLogoEnabled",
    "streams.badges.setPlacement",
    "streams.badges.setBackgroundMode",
    "streams.badges.rules.importFromUrl",
    "streams.badges.rules.setActive",
    "streams.badges.rules.remove",
    "simkl.sync",
    "playback.hostFullscreenChanged",
];

fn request_is_allowed(request: &BridgeRequest) -> bool {
    !request.id.is_empty()
        && request.id.len() <= 128
        && request
            .epoch
            .map_or(true, |epoch| epoch <= 9_007_199_254_740_991)
        && ALLOWED_METHODS.contains(&request.method.as_str())
}

fn request_epoch(request: &BridgeRequest) -> u64 {
    request
        .epoch
        .filter(|epoch| *epoch <= 9_007_199_254_740_991)
        .unwrap_or_default()
}

#[tauri::command]
async fn bridge_request(
    window: tauri::WebviewWindow,
    mut request: BridgeRequest,
    state: tauri::State<'_, Arc<BridgeManager>>,
) -> Result<BridgeResponse, String> {
    if !request_is_allowed(&request) {
        let valid_id = !request.id.is_empty() && request.id.len() <= 128;
        let valid_epoch = request
            .epoch
            .map_or(true, |epoch| epoch <= 9_007_199_254_740_991);
        let response_epoch = request_epoch(&request);
        return Ok(BridgeResponse {
            id: request.id,
            epoch: response_epoch,
            result: None,
            error: Some(BridgeError {
                code: if valid_id && valid_epoch {
                    "METHOD_NOT_ALLOWED"
                } else {
                    "INVALID_REQUEST"
                }
                .into(),
                message: if valid_id && valid_epoch {
                    "The requested bridge method is not available."
                } else {
                    "The bridge request is invalid."
                }
                .into(),
            }),
        });
    }

    let trace_details_load = request.method == "details.load";
    let details_request_started = Instant::now();
    if trace_details_load {
        state.report_ui_diagnostic("details.load reached the Tauri command");
    }

    // The native player creates its video and controls surfaces as child HWNDs.
    // Give the Kotlin playback bridge the owning Tauri window so it can embed
    // those surfaces in the app instead of opening a second player window.
    #[cfg(windows)]
    if matches!(
        request.method.as_str(),
        "playback.start" | "cloud.play" | "downloads.play"
    ) {
        let hwnd = window.hwnd().map_err(|error| error.to_string())?;
        request.params.insert(
            "tauriHostWindow".into(),
            serde_json::json!(hwnd.0 as usize as u64),
        );
        request.params.insert(
            "tauriHostFullscreen".into(),
            Value::Bool(window.is_fullscreen().map_err(|error| error.to_string())?),
        );
    }

    match state.request(&request).await {
        Ok((epoch, result)) => {
            if trace_details_load {
                let loading = result
                    .get("loading")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let has_media = result.get("media").is_some_and(|value| !value.is_null());
                let has_error = result.get("error").is_some_and(|value| !value.is_null());
                state.report_ui_diagnostic(&format!(
                    "details.load returned after {}ms (loading={loading}, media={has_media}, error={has_error})",
                    details_request_started.elapsed().as_millis()
                ));
            }
            Ok(BridgeResponse {
                id: request.id,
                epoch,
                result: Some(result),
                error: None,
            })
        }
        Err(error) => {
            if trace_details_load {
                state.report_ui_diagnostic(&format!(
                    "details.load failed after {}ms (code={})",
                    details_request_started.elapsed().as_millis(),
                    error.code
                ));
            }
            Ok(BridgeResponse {
                id: request.id,
                epoch: error.epoch.unwrap_or(request.epoch.unwrap_or_default()),
                result: None,
                error: Some(BridgeError {
                    code: error.code,
                    message: error.message,
                }),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{request_is_allowed, BridgeRequest, ALLOWED_METHODS};
    use serde_json::json;

    #[test]
    fn bridge_method_allowlist_matches_the_v1_contract() {
        for method in [
            "session.snapshot",
            "playback.start",
            "app.visibility",
            "app.shutdown",
        ] {
            assert!(ALLOWED_METHODS.contains(&method));
        }
        for method in ["system.exec", "bridge.token", "session.deleteEverything"] {
            assert!(!ALLOWED_METHODS.contains(&method));
        }
    }

    #[test]
    fn request_schema_rejects_invalid_identifier_types_and_unknown_methods() {
        let valid = json!({"id":"request-1","method":"session.snapshot","params":{}});
        assert!(request_is_allowed(
            &serde_json::from_value::<BridgeRequest>(valid).unwrap()
        ));
        let non_string_id = json!({"id":7,"method":"session.snapshot","params":{}});
        assert!(serde_json::from_value::<BridgeRequest>(non_string_id).is_err());
        let unknown_method = json!({"id":"request-1","method":"system.exec","params":{}});
        let parsed = serde_json::from_value::<BridgeRequest>(unknown_method).unwrap();
        assert!(!request_is_allowed(&parsed));
        let unknown_field =
            json!({"id":"request-1","method":"session.snapshot","params":{},"token":"secret"});
        assert!(serde_json::from_value::<BridgeRequest>(unknown_field).is_err());
    }
}

#[tauri::command]
async fn bridge_status(
    state: tauri::State<'_, Arc<BridgeManager>>,
) -> Result<StatusPayload, String> {
    let (status, message) = state.status().await;
    Ok(StatusPayload { status, message })
}

#[tauri::command]
fn bridge_report_diagnostic(state: tauri::State<'_, Arc<BridgeManager>>, message: String) {
    let bounded: String = message.chars().take(2_000).collect();
    state.report_ui_diagnostic(&bounded);
}

#[tauri::command]
async fn bridge_restart(state: tauri::State<'_, Arc<BridgeManager>>) -> Result<(), String> {
    match state.restart().await {
        Ok(()) => Ok(()),
        Err(error) => {
            state.mark_start_failure(&error).await;
            Err(error)
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let bridge = Arc::new(BridgeManager::new(app.handle().clone())?);
            app.manage(bridge.clone());
            let startup = bridge.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = startup.start().await {
                    startup.mark_start_failure(&error.to_string()).await;
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(windows)]
            if matches!(event, WindowEvent::Resized(_)) {
                if let Some(bridge) = window.app_handle().try_state::<Arc<BridgeManager>>() {
                    let bridge = bridge.inner().clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = bridge.sync_host_fullscreen().await;
                    });
                }
            }
            if let WindowEvent::Focused(visible) = event {
                let visible = *visible;
                if let Some(bridge) = window.app_handle().try_state::<Arc<BridgeManager>>() {
                    let bridge = bridge.inner().clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = bridge.set_visibility(visible).await;
                    });
                }
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                if let Some(bridge) = window.app_handle().try_state::<Arc<BridgeManager>>() {
                    let bridge = bridge.inner().clone();
                    if bridge.mark_shutting_down() {
                        api.prevent_close();
                        let window = window.clone();
                        tauri::async_runtime::spawn(async move {
                            bridge.shutdown().await;
                            let _ = window.close();
                        });
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            bridge_request,
            bridge_status,
            bridge_restart,
            bridge_report_diagnostic
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Nuvio desktop shell")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(bridge) = app.try_state::<Arc<BridgeManager>>() {
                    let bridge = bridge.inner().clone();
                    tauri::async_runtime::spawn(async move { bridge.shutdown().await });
                }
            }
        });
}

// Kept private to Rust; the webview only receives typed request/response values.
