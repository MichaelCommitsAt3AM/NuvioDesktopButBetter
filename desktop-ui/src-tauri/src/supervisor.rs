use futures_util::{SinkExt, StreamExt};
use rand::{rngs::OsRng, RngCore};
use reqwest::header::{HeaderValue, AUTHORIZATION};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    env,
    ffi::OsStr,
    io::Write,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, Command},
    sync::{oneshot, Mutex},
    task::JoinHandle,
    time::timeout,
};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tokio_util::sync::CancellationToken;

const READY_PREFIX: &str = "NUVIO_BRIDGE_READY ";
const START_TIMEOUT: Duration = Duration::from_secs(30);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);
const MAX_SAFE_JS_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BridgeStatus {
    Starting,
    Ready,
    Disconnected,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct BridgeEvent {
    topic: BridgeTopic,
    epoch: u64,
    revision: u64,
    data: Value,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum BridgeTopic {
    Session,
    Home,
    Library,
    Addons,
    Settings,
    Search,
    Details,
    Streams,
    Playback,
    Catalog,
    Discover,
    #[serde(rename = "searchHistory")]
    SearchHistory,
    Profiles,
    Appearance,
    Posters,
    #[serde(rename = "homePreferences")]
    HomePreferences,
    #[serde(rename = "continueWatching")]
    ContinueWatching,
    Downloads,
    Plugins,
    #[serde(rename = "libraryExtras")]
    LibraryExtras,
    Cloud,
    #[serde(rename = "playbackSettings")]
    PlaybackSettings,
    #[serde(rename = "metadataSettings")]
    MetadataSettings,
    #[serde(rename = "homeExtras")]
    HomeExtras,
    P2p,
    #[serde(rename = "authOptions")]
    AuthOptions,
    Integrations,
    Tmdb,
    Mdblist,
    Debrid,
    Simkl,
    #[serde(rename = "trackingSettings")]
    TrackingSettings,
    Collections,
    #[serde(rename = "collectionEditor")]
    CollectionEditor,
    #[serde(rename = "folderDetail")]
    FolderDetail,
    About,
    Advanced,
    #[serde(rename = "streamSelection")]
    StreamSelection,
}

#[derive(Clone, Debug)]
struct Api {
    port: u16,
    token: String,
    generation: u64,
}

struct Worker {
    cancellation: CancellationToken,
    task: JoinHandle<()>,
}

struct State {
    status: BridgeStatus,
    message: Option<String>,
    api: Option<Api>,
}

pub struct BridgeManager {
    app: AppHandle,
    runtime_dir: PathBuf,
    work_dir: PathBuf,
    diagnostic_log: PathBuf,
    state: Mutex<State>,
    worker: Mutex<Option<Worker>>,
    operation: Mutex<()>,
    #[cfg(windows)]
    fullscreen_sync: Mutex<()>,
    generation: AtomicU64,
    shutting_down: AtomicBool,
    client: reqwest::Client,
}

#[derive(Debug)]
pub struct BridgeCallError {
    pub code: String,
    pub message: String,
    pub epoch: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
struct ReadyMessage {
    protocol: u32,
    port: u16,
    token: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
struct BackendResponse {
    id: String,
    epoch: u64,
    result: Option<Value>,
    error: Option<BackendError>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct BackendError {
    code: String,
    #[serde(rename = "message")]
    _message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendRequest<'a> {
    id: &'a str,
    method: &'a str,
    params: &'a Map<String, Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    epoch: Option<u64>,
}

impl BridgeManager {
    pub fn new(app: AppHandle) -> Result<Self, String> {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let resource_default = if cfg!(debug_assertions) {
            manifest_dir.join("resources").join("backend")
        } else {
            app.path()
                .resource_dir()
                .map_err(|error| format!("could not locate application resources: {error}"))?
                .join("resources")
                .join("backend")
        };
        let runtime_dir = env::var_os("NUVIO_BRIDGE_RUNTIME_DIR")
            .map(PathBuf::from)
            .unwrap_or(resource_default);
        // A release must never depend on the checkout used to compile it.
        // All backend assets are resolved from the packaged runtime directory.
        let work_dir = if cfg!(debug_assertions) {
            manifest_dir
                .parent()
                .and_then(Path::parent)
                .unwrap_or(&manifest_dir)
                .canonicalize()
                .unwrap_or_else(|_| manifest_dir.clone())
        } else {
            runtime_dir.clone()
        };
        let diagnostic_dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| env::temp_dir().join("Nuvio"))
            .join("logs");
        let _ = std::fs::create_dir_all(&diagnostic_dir);
        let diagnostic_log = diagnostic_dir.join("bridge-diagnostics.log");
        append_diagnostic(&diagnostic_log, "shell", "bridge manager created");
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(REQUEST_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|error| format!("could not initialize bridge HTTP client: {error}"))?;

        Ok(Self {
            app,
            runtime_dir,
            work_dir,
            diagnostic_log,
            state: Mutex::new(State {
                status: BridgeStatus::Disconnected,
                message: None,
                api: None,
            }),
            worker: Mutex::new(None),
            operation: Mutex::new(()),
            #[cfg(windows)]
            fullscreen_sync: Mutex::new(()),
            generation: AtomicU64::new(0),
            shutting_down: AtomicBool::new(false),
            client,
        })
    }

    pub async fn start(self: &Arc<Self>) -> Result<(), String> {
        let _operation = self.operation.lock().await;
        self.start_locked().await
    }

    pub async fn restart(self: &Arc<Self>) -> Result<(), String> {
        if self.shutting_down.load(Ordering::Acquire) {
            return Err("The application is shutting down.".into());
        }
        let _operation = self.operation.lock().await;
        self.stop_worker_locked().await;
        self.start_locked().await
    }

    // Only the updater calls this after its installer returned an error.
    // Normal shutdown remains terminal; an aborted update must restore browsing.
    pub async fn recover_failed_update(self: &Arc<Self>) -> Result<(), String> {
        self.shutting_down.store(false, Ordering::Release);
        self.restart().await
    }

    async fn start_locked(self: &Arc<Self>) -> Result<(), String> {
        if self.shutting_down.load(Ordering::Acquire) {
            return Err("The application is shutting down.".into());
        }
        {
            let mut state = self.state.lock().await;
            if state.api.is_some() {
                return Ok(());
            }
            state.status = BridgeStatus::Starting;
            state.message = None;
            state.api = None;
        }
        self.emit_status(BridgeStatus::Starting, None);
        self.log_diagnostic("startup", "bridge startup requested");

        let (java, classpath) = match self.resolve_runtime() {
            Ok(runtime) => runtime,
            Err(error) => {
                self.log_diagnostic("startup", &format!("runtime resolution failed: {error}"));
                return Err(error);
            }
        };
        self.log_diagnostic(
            "startup",
            &format!("launching Kotlin bridge using {}", java.display()),
        );
        let token = new_token();
        let compose_resources = dunce::canonicalize(&self.runtime_dir)
            .unwrap_or_else(|_| self.runtime_dir.clone())
            .join("native");
        let mut command = Command::new(&java);
        // Preserve piped handshake/logging without opening a Windows console.
        #[cfg(windows)]
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let mut child = match command
            // Keep the backend's AWT access consistent with the upstream Compose
            // Desktop launcher. Native playback resolves the AWT peer/HWND through
            // reflection (java.awt.Component.peer and sun.awt.windows.WComponentPeer).
            // Without these module opens, the native player attach fails before JNI.
            .arg("--add-opens=java.desktop/java.awt=ALL-UNNAMED")
            .arg("--add-opens=java.desktop/sun.lwawt=ALL-UNNAMED")
            .arg("--add-opens=java.desktop/sun.lwawt.macosx=ALL-UNNAMED")
            .arg("--add-opens=java.desktop/sun.awt.windows=ALL-UNNAMED")
            .arg("--add-opens=java.desktop/sun.awt.X11=ALL-UNNAMED")
            .arg(format!(
                "-Dcompose.application.resources.dir={}",
                compose_resources.to_string_lossy()
            ))
            .arg("-Dswing.defaultlaf=javax.swing.plaf.metal.MetalLookAndFeel")
            .arg("-Dfile.encoding=UTF-8")
            .arg("-Dstdout.encoding=UTF-8")
            .arg("-Dstderr.encoding=UTF-8")
            .arg("-cp")
            .arg(classpath)
            .arg("com.nuvio.desktop.bridge.MainKt")
            .current_dir(&self.work_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
        {
            Ok(child) => child,
            Err(error) => {
                let message = format!("could not start the desktop bridge: {error}");
                self.log_diagnostic("startup", &message);
                return Err(message);
            }
        };
        self.log_diagnostic(
            "startup",
            &format!("Kotlin bridge process started (pid={:?})", child.id()),
        );

        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "bridge process has no input channel".to_string())?;
        stdin.write_all(token.as_bytes()).await.map_err(|error| {
            let message = format!("could not initialize the bridge process stdin: {error}");
            self.log_diagnostic("startup", &message);
            message
        })?;
        stdin.write_all(b"\n").await.map_err(|error| {
            let message = format!("could not initialize the bridge process stdin: {error}");
            self.log_diagnostic("startup", &message);
            message
        })?;
        stdin.flush().await.map_err(|error| {
            let message = format!("could not initialize the bridge process stdin: {error}");
            self.log_diagnostic("startup", &message);
            message
        })?;
        drop(stdin);

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "bridge process has no output channel".to_string())?;
        if let Some(mut stderr) = child.stderr.take() {
            let stderr_log = self.diagnostic_log.clone();
            let stderr_token = token.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(&mut stderr).lines();
                loop {
                    match lines.next_line().await {
                        Ok(Some(line)) => append_diagnostic(
                            &stderr_log,
                            "kotlin stderr",
                            &redact_diagnostic_text(&line, &stderr_token),
                        ),
                        Ok(None) => break,
                        Err(error) => {
                            append_diagnostic(
                                &stderr_log,
                                "diagnostics",
                                &format!("could not read Kotlin stderr: {error}"),
                            );
                            break;
                        }
                    }
                }
            });
        }

        let generation = self.generation.fetch_add(1, Ordering::AcqRel) + 1;
        self.log_diagnostic(
            "startup",
            &format!(
                "waiting for bridge ready handshake (generation={generation}, timeout={}s)",
                START_TIMEOUT.as_secs()
            ),
        );
        let cancellation = CancellationToken::new();
        let worker_cancel = cancellation.clone();
        let manager = Arc::downgrade(self);
        let app = self.app.clone();
        let expected_token = token.clone();
        let diagnostic_log = self.diagnostic_log.clone();
        let (ready_tx, ready_rx) = oneshot::channel();
        let task = tokio::spawn(async move {
            run_worker(
                child,
                stdout,
                expected_token,
                generation,
                diagnostic_log,
                app,
                manager,
                worker_cancel,
                ready_tx,
            )
            .await;
        });
        *self.worker.lock().await = Some(Worker { cancellation, task });

        let api = match timeout(START_TIMEOUT, ready_rx).await {
            Ok(Ok(Ok(api))) => api,
            Ok(Ok(Err(message))) => {
                self.log_diagnostic("startup", &format!("bridge handshake failed: {message}"));
                self.stop_worker_locked().await;
                return Err(message);
            }
            Ok(Err(_)) => {
                self.log_diagnostic(
                    "startup",
                    "bridge supervisor stopped before startup completed",
                );
                self.stop_worker_locked().await;
                return Err("bridge supervisor stopped before startup completed".into());
            }
            Err(_) => {
                self.stop_worker_locked().await;
                let message = "desktop bridge did not become ready within 30 seconds";
                self.log_diagnostic("startup", message);
                self.set_status_for(generation, BridgeStatus::Disconnected, Some(message.into()))
                    .await;
                return Err(message.into());
            }
        };
        let mut state = self.state.lock().await;
        if generation == api.generation
            && !self.shutting_down.load(Ordering::Acquire)
            && state.status == BridgeStatus::Ready
        {
            self.log_diagnostic(
                "startup",
                &format!("bridge ready (generation={generation}, port={})", api.port),
            );
            state.api = Some(api);
            Ok(())
        } else {
            Err("desktop bridge exited during startup".into())
        }
    }

    fn resolve_runtime(&self) -> Result<(PathBuf, PathBuf), String> {
        let classpath_file = self.runtime_dir.join("classpath.txt");
        let classpath = std::fs::read_to_string(&classpath_file).map_err(|_| {
            format!(
                "bridge runtime is missing {}; run the stageBridgeRuntime Gradle task",
                classpath_file.display()
            )
        })?;
        let classpath = validated_classpath(&self.runtime_dir, &classpath)?;
        let bundled_java = self
            .runtime_dir
            .join("runtime")
            .join("bin")
            .join(if cfg!(windows) { "java.exe" } else { "java" });
        let java = if !cfg!(debug_assertions) {
            if !bundled_java.is_file() {
                return Err(
                    "bundled Java runtime is missing from the staged bridge resources".into(),
                );
            }
            bundled_java
        } else if let Some(explicit) = env::var_os("NUVIO_BRIDGE_JAVA") {
            PathBuf::from(explicit)
        } else if bundled_java.is_file() {
            bundled_java
        } else if let Some(java_home) = env::var_os("JAVA_HOME") {
            PathBuf::from(java_home).join("bin").join(if cfg!(windows) {
                "java.exe"
            } else {
                "java"
            })
        } else {
            PathBuf::from(if cfg!(windows) { "java.exe" } else { "java" })
        };
        Ok((java, classpath))
    }

    pub async fn request(
        &self,
        request: &crate::BridgeRequest,
    ) -> Result<(u64, Value), BridgeCallError> {
        if self.shutting_down.load(Ordering::Acquire) && request.method != "app.shutdown" {
            return Err(BridgeCallError {
                code: "BRIDGE_UNAVAILABLE".into(),
                message: "The desktop bridge is shutting down.".into(),
                epoch: request.epoch,
            });
        }
        let api = self
            .state
            .lock()
            .await
            .api
            .clone()
            .ok_or_else(|| BridgeCallError {
                code: "BRIDGE_UNAVAILABLE".into(),
                message: "The desktop bridge is not connected.".into(),
                epoch: request.epoch,
            })?;
        let body = BackendRequest {
            id: &request.id,
            method: &request.method,
            params: &request.params,
            epoch: request.epoch,
        };
        let response = self
            .authorized(
                self.client
                    .post(format!("http://127.0.0.1:{}/rpc", api.port)),
                &api,
            )
            .json(&body)
            .send()
            .await
            .map_err(|_| BridgeCallError {
                code: "BRIDGE_UNAVAILABLE".into(),
                message: "The desktop bridge could not be reached.".into(),
                epoch: request.epoch,
            })?;
        let envelope: BackendResponse = response.json().await.map_err(|_| BridgeCallError {
            code: "INVALID_BRIDGE_RESPONSE".into(),
            message: "The desktop bridge returned an invalid response.".into(),
            epoch: None,
        })?;
        validate_response(&envelope, request)?;
        if let Some(error) = envelope.error {
            return Err(BridgeCallError {
                code: safe_error_code(&error.code),
                message: safe_error_message(&error.code),
                epoch: Some(envelope.epoch),
            });
        }
        Ok((envelope.epoch, envelope.result.unwrap_or(Value::Null)))
    }

    fn authorized(&self, request: reqwest::RequestBuilder, api: &Api) -> reqwest::RequestBuilder {
        match HeaderValue::from_str(&format!("Bearer {}", api.token)) {
            Ok(header) => request.header(AUTHORIZATION, header),
            Err(_) => request,
        }
    }

    pub async fn status(&self) -> (BridgeStatus, Option<String>) {
        let state = self.state.lock().await;
        append_diagnostic(
            &self.diagnostic_log,
            "status-query",
            &format!(
                "bridge_status returned {:?} ({})",
                state.status,
                state.message.as_deref().unwrap_or("no message")
            ),
        );
        (state.status.clone(), state.message.clone())
    }

    pub fn report_ui_diagnostic(&self, message: &str) {
        append_diagnostic(
            &self.diagnostic_log,
            "react-startup",
            &redact_diagnostic_text(message, ""),
        );
    }

    pub async fn set_visibility(&self, visible: bool) -> Result<(), BridgeCallError> {
        let request = crate::BridgeRequest {
            id: format!("visibility-{}", self.generation.load(Ordering::Acquire)),
            method: "app.visibility".into(),
            params: Map::from_iter([("visible".into(), Value::Bool(visible))]),
            epoch: None,
        };
        self.request(&request).await.map(|_| ())
    }

    #[cfg(windows)]
    pub async fn sync_host_fullscreen(&self) -> Result<(), BridgeCallError> {
        // Read at send time and serialize acknowledgements so a resize cannot
        // overwrite a newer toggle with a stale mode.
        let _sync = self.fullscreen_sync.lock().await;
        let Some(window) = self.app.get_webview_window("main") else {
            return Ok(());
        };
        let Ok(fullscreen) = window.is_fullscreen() else {
            return Ok(());
        };
        let request = crate::BridgeRequest {
            id: format!("fullscreen-{}", self.generation.load(Ordering::Acquire)),
            method: "playback.hostFullscreenChanged".into(),
            params: Map::from_iter([("fullscreen".into(), Value::Bool(fullscreen))]),
            epoch: None,
        };
        self.request(&request).await.map(|_| ())
    }

    pub async fn shutdown(self: &Arc<Self>) {
        self.shutting_down.store(true, Ordering::Release);
        let _operation = self.operation.lock().await;
        let shutdown = crate::BridgeRequest {
            id: "app-shutdown".into(),
            method: "app.shutdown".into(),
            params: Map::new(),
            epoch: None,
        };
        let _ = timeout(SHUTDOWN_TIMEOUT, self.request(&shutdown)).await;
        self.stop_worker_locked().await;
    }

    pub fn mark_shutting_down(&self) -> bool {
        self.shutting_down
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
    }

    pub async fn mark_start_failure(&self, message: &str) {
        let generation = self.generation.load(Ordering::Acquire);
        self.log_diagnostic("startup", &format!("startup task failed: {message}"));
        self.set_status_for(
            generation,
            BridgeStatus::Disconnected,
            Some(sanitize_message(message)),
        )
        .await;
    }

    async fn stop_worker_locked(&self) {
        if let Some(worker) = self.worker.lock().await.take() {
            self.log_diagnostic("shutdown", "stopping Kotlin bridge worker");
            worker.cancellation.cancel();
            let _ = timeout(SHUTDOWN_TIMEOUT, worker.task).await;
        }
        let mut state = self.state.lock().await;
        state.api = None;
    }

    async fn set_status_for(&self, generation: u64, status: BridgeStatus, message: Option<String>) {
        if self.generation.load(Ordering::Acquire) != generation {
            return;
        }
        {
            let mut state = self.state.lock().await;
            if self.generation.load(Ordering::Acquire) != generation {
                return;
            }
            state.status = status.clone();
            state.message = message.clone();
            if !matches!(status, BridgeStatus::Ready) {
                state.api = None;
            }
        }
        self.log_diagnostic(
            "status",
            &format!(
                "generation={generation}, status={status:?}, message={}",
                message.as_deref().unwrap_or("-")
            ),
        );
        self.emit_status(status, message);
    }

    async fn set_event_stream_status(
        &self,
        generation: u64,
        status: BridgeStatus,
        message: Option<String>,
    ) {
        if self.generation.load(Ordering::Acquire) != generation {
            return;
        }
        {
            let mut state = self.state.lock().await;
            if self.generation.load(Ordering::Acquire) != generation || state.api.is_none() {
                return;
            }
            if state.status == status && state.message == message {
                return;
            }
            state.status = status.clone();
            state.message = message.clone();
        }
        self.emit_status(status, message);
    }

    fn emit_status(&self, status: BridgeStatus, message: Option<String>) {
        let _ = self
            .app
            .emit("bridge:status", StatusEvent { status, message });
    }

    fn log_diagnostic(&self, phase: &str, message: &str) {
        append_diagnostic(&self.diagnostic_log, phase, message);
    }
}

#[derive(Clone, Serialize)]
struct StatusEvent {
    status: BridgeStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

async fn run_worker(
    mut child: Child,
    stdout: tokio::process::ChildStdout,
    expected_token: String,
    generation: u64,
    diagnostic_log: PathBuf,
    app: AppHandle,
    manager: std::sync::Weak<BridgeManager>,
    cancellation: CancellationToken,
    ready_tx: oneshot::Sender<Result<Api, String>>,
) {
    append_diagnostic(
        &diagnostic_log,
        "startup",
        &format!(
            "bridge worker started (generation={generation}, pid={:?})",
            child.id()
        ),
    );
    let mut output = BufReader::new(stdout);
    let mut line = Vec::new();
    let handshake = timeout(START_TIMEOUT, async {
        loop {
            line.clear();
            tokio::select! {
                _ = cancellation.cancelled() => return Err("bridge startup was cancelled".to_string()),
                status = child.wait() => {
                    return Err(match status {
                        Ok(status) => format!("desktop bridge exited during startup ({status})"),
                        Err(_) => "desktop bridge exited during startup".into(),
                    });
                }
                count = output.read_until(b'\n', &mut line) => {
                    let count = count.map_err(|_| "could not read desktop bridge startup output".to_string())?;
                    if count == 0 { return Err("desktop bridge closed startup output".into()); }
                    // Repository logs can contain legacy Windows-encoded characters.
                    // Only the handshake is protocol data and must be valid UTF-8.
                    if line.starts_with(READY_PREFIX.as_bytes()) {
                        let line = std::str::from_utf8(&line).map_err(|_| "invalid bridge handshake encoding".to_string())?;
                        return parse_ready(line.trim_end().strip_prefix(READY_PREFIX).unwrap(), &expected_token, generation);
                    }
                }
            }
        }
    })
    .await;

    let api = match handshake {
        Ok(Ok(api)) => api,
        Ok(Err(message)) => {
            append_diagnostic(
                &diagnostic_log,
                "startup",
                &format!("bridge handshake rejected (generation={generation}): {message}"),
            );
            let _ = ready_tx.send(Err(message.clone()));
            terminate_child(&mut child).await;
            if let Some(manager) = manager.upgrade() {
                manager
                    .set_status_for(generation, BridgeStatus::Disconnected, Some(message))
                    .await;
            }
            return;
        }
        Err(_) => {
            let message = "desktop bridge did not become ready within 30 seconds".to_string();
            append_diagnostic(
                &diagnostic_log,
                "startup",
                &format!("{message} (generation={generation})"),
            );
            let _ = ready_tx.send(Err(message.clone()));
            terminate_child(&mut child).await;
            if let Some(manager) = manager.upgrade() {
                manager
                    .set_status_for(generation, BridgeStatus::Disconnected, Some(message))
                    .await;
            }
            return;
        }
    };

    append_diagnostic(
        &diagnostic_log,
        "startup",
        &format!(
            "ready handshake accepted (generation={generation}, port={})",
            api.port
        ),
    );

    let events_cancel = cancellation.child_token();
    let event_app = app.clone();
    let event_api = api.clone();
    let event_manager = manager.clone();
    tokio::spawn(async move {
        event_loop(
            event_api,
            event_app,
            events_cancel,
            generation,
            event_manager,
        )
        .await
    });
    if let Some(manager) = manager.upgrade() {
        manager
            .set_status_for(generation, BridgeStatus::Ready, None)
            .await;
    }
    let _ = ready_tx.send(Ok(api));

    // Keep draining repository logs so a full pipe cannot freeze the Kotlin runtime.
    let drain_cancel = cancellation.clone();
    let stdout_log = diagnostic_log.clone();
    let stdout_token = expected_token.clone();
    tokio::spawn(async move {
        let mut lines = output.lines();
        loop {
            tokio::select! {
                _ = drain_cancel.cancelled() => break,
                result = lines.next_line() => {
                    match result {
                        Ok(Some(line)) if is_diagnostic_line(&line) => append_diagnostic(&stdout_log, "kotlin stdout error", &redact_diagnostic_text(&line, &stdout_token)),
                        Ok(Some(_)) => {}
                        Ok(None) => break,
                        Err(error) => { append_diagnostic(&stdout_log, "diagnostics", &format!("could not read Kotlin stdout: {error}")); break; }
                    }
                }
            }
        }
    });

    tokio::select! {
        _ = cancellation.cancelled() => {
            terminate_child(&mut child).await;
        }
        status = child.wait() => {
            append_diagnostic(&diagnostic_log, "shutdown", &format!("Kotlin bridge exited (generation={generation}, status={status:?})"));
        }
    }
    cancellation.cancel();
    if let Some(manager) = manager.upgrade() {
        manager
            .set_status_for(
                generation,
                BridgeStatus::Disconnected,
                Some("desktop bridge process stopped".into()),
            )
            .await;
    } else {
        let _ = app.emit(
            "bridge:status",
            StatusEvent {
                status: BridgeStatus::Disconnected,
                message: Some("desktop bridge process stopped".into()),
            },
        );
    }
}

async fn terminate_child(child: &mut Child) {
    let _ = child.start_kill();
    let _ = timeout(SHUTDOWN_TIMEOUT, child.wait()).await;
}

async fn event_loop(
    api: Api,
    app: AppHandle,
    cancellation: CancellationToken,
    generation: u64,
    manager: std::sync::Weak<BridgeManager>,
) {
    let mut backoff = Duration::from_millis(250);
    let diagnostic_log = manager
        .upgrade()
        .map(|manager| manager.diagnostic_log.clone());
    loop {
        if cancellation.is_cancelled() {
            return;
        }
        let url = format!("ws://127.0.0.1:{}/events", api.port);
        let mut request = match url.into_client_request() {
            Ok(request) => request,
            Err(_) => return,
        };
        let bearer = match HeaderValue::from_str(&format!("Bearer {}", api.token)) {
            Ok(value) => value,
            Err(_) => return,
        };
        request.headers_mut().insert(AUTHORIZATION, bearer);
        let connected = tokio::select! {
            _ = cancellation.cancelled() => return,
            result = timeout(Duration::from_secs(5), connect_async(request)) => {
                match result {
                    Ok(Ok(socket)) => Some(socket),
                    _ => None,
                }
            },
        };
        if let Some((mut socket, _)) = connected {
            backoff = Duration::from_millis(250);
            update_event_stream_status(&manager, generation, BridgeStatus::Ready, None).await;
            loop {
                tokio::select! {
                    _ = cancellation.cancelled() => {
                        let _ = socket.close(None).await;
                        return;
                    }
                    item = socket.next() => match item {
                        Some(Ok(Message::Text(text))) => {
                            if let Ok(event) = serde_json::from_str::<BridgeEvent>(&text) {
                                if event.epoch <= MAX_SAFE_JS_INTEGER && event.revision <= MAX_SAFE_JS_INTEGER {
                                    #[cfg(windows)]
                                    if event.topic == BridgeTopic::Playback
                                        && event.data.get("toggleHostFullscreen").and_then(Value::as_bool) == Some(true)
                                    {
                                        if let Some(window) = app.get_webview_window("main") {
                                            // Tauri owns fullscreen and its windowed restore bounds.
                                            // JNI must not independently change this HWND's styles.
                                            if let Ok(fullscreen) = window.is_fullscreen() {
                                                let _ = window.set_fullscreen(!fullscreen);
                                                if let Some(manager) = manager.upgrade() {
                                                    let _ = manager.sync_host_fullscreen().await;
                                                }
                                            }
                                        }
                                    }
                                    if matches!(&event.topic, BridgeTopic::Details) {
                                        let request_id = event.data.get("requestId").and_then(Value::as_str).unwrap_or("missing");
                                        let loading = event.data.get("loading").and_then(Value::as_bool).unwrap_or(false);
                                        let has_media = event.data.get("media").is_some_and(|value| !value.is_null());
                                        let has_error = event.data.get("error").is_some_and(|value| !value.is_null());
                                        if let Some(path) = &diagnostic_log {
                                            append_diagnostic(
                                                path,
                                                "details-event",
                                                &format!("received details request={request_id} revision={} (loading={loading}, media={has_media}, error={has_error})", event.revision),
                                            );
                                        }
                                    }
                                    let _ = app.emit("bridge:event", event);
                                }
                            }
                        }
                        Some(Ok(Message::Ping(bytes))) => { let _ = socket.send(Message::Pong(bytes)).await; }
                        Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                        _ => {}
                    }
                }
            }
        }
        update_event_stream_status(
            &manager,
            generation,
            BridgeStatus::Disconnected,
            Some("Event stream reconnecting.".into()),
        )
        .await;
        tokio::select! {
            _ = cancellation.cancelled() => return,
            _ = tokio::time::sleep(backoff) => {}
        }
        backoff = (backoff * 2).min(Duration::from_secs(10));
    }
}

fn validated_classpath(runtime_dir: &Path, contents: &str) -> Result<PathBuf, String> {
    // Java's Windows class loader cannot open Rust's verbatim (\\?\) paths.
    // Resolve symlinks for containment, then retain ordinary Win32 paths for Java.
    let root = dunce::canonicalize(runtime_dir)
        .map_err(|_| "staged bridge runtime directory is missing".to_string())?;
    let contents = contents.trim();
    if contents.is_empty() {
        return Err("bridge runtime classpath is empty".into());
    }
    let entries: Vec<PathBuf> = env::split_paths(OsStr::new(contents)).collect();
    if entries.is_empty() || entries.iter().any(|entry| entry.as_os_str().is_empty()) {
        return Err("bridge runtime classpath is invalid".into());
    }
    let mut canonical_entries = Vec::with_capacity(entries.len());
    for entry in entries {
        let candidate = if entry.is_absolute() {
            entry
        } else {
            root.join(entry)
        };
        let resolved = dunce::canonicalize(&candidate)
            .map_err(|_| "bridge runtime classpath entry is missing".to_string())?;
        if !resolved.starts_with(&root) || !resolved.is_file() {
            return Err("bridge runtime classpath entry is outside staged resources".into());
        }
        canonical_entries.push(resolved);
    }
    env::join_paths(canonical_entries)
        .map(PathBuf::from)
        .map_err(|_| "bridge runtime classpath is invalid".into())
}

fn safe_error_code(code: &str) -> String {
    if code == "DEVICE_AUTH_NOT_CONFIGURED" { return code.into(); }
    const CODES: &[&str] = &[
        "PROFILE_PIN_REQUIRED",
        "PROFILE_PIN_REJECTED",
        "PROFILE_CREATE_FAILED",
        "PROFILE_UPDATE_FAILED",
        "PROFILE_DELETE_FAILED",
        "PROFILE_PIN_PASSWORD_UNAVAILABLE",
        "PROFILE_PIN_CLEAR_FAILED",
        "PROFILE_NOT_FOUND",
        "CAPABILITY_UNAVAILABLE",
        "INVALID_AVATAR_URL",
        "AVATAR_NOT_AVAILABLE",
        "BACKGROUND_NOT_AVAILABLE",
        "INVALID_BACKGROUND_URL",
        "INVALID_PROFILE_NAME",
        "INVALID_ARGUMENT",
        "DOWNLOAD_NOT_FOUND",
        "INVALID_DOWNLOAD_STATE",
        "UNKNOWN_OPERATION",
        "DOWNLOAD_OPERATION_FAILED",
        "P2P_CONSENT_REQUIRED",
        "AUTH_REQUIRED",
        "AUTH_INVALID_CREDENTIALS",
        "AUTH_EMAIL_IN_USE",
        "INVALID_ARGUMENT",
        "NOT_FOUND",
        "CONFLICT",
        "UNAVAILABLE",
        "TIMEOUT",
        "FORBIDDEN",
        "UNAUTHORIZED",
        "INTERNAL_ERROR",
    ];
    if CODES.contains(&code) {
        code.to_string()
    } else {
        "BRIDGE_ERROR".into()
    }
}

fn validate_response(
    response: &BackendResponse,
    request: &crate::BridgeRequest,
) -> Result<(), BridgeCallError> {
    if response.id != request.id {
        return Err(BridgeCallError {
            code: "INVALID_BRIDGE_RESPONSE".into(),
            message: "The desktop bridge response did not match the request.".into(),
            epoch: None,
        });
    }
    if response.epoch > MAX_SAFE_JS_INTEGER
        || request
            .epoch
            .is_some_and(|requested| response.epoch < requested)
    {
        return Err(BridgeCallError {
            code: "INVALID_BRIDGE_RESPONSE".into(),
            message: "The desktop bridge returned an invalid response.".into(),
            epoch: None,
        });
    }
    Ok(())
}

fn safe_error_message(code: &str) -> String {
    match safe_error_code(code).as_str() {
        "AUTH_REQUIRED" => "Please sign in to continue.",
        "PROFILE_PIN_REQUIRED" => "Enter this profile’s PIN to continue.",
        "PROFILE_PIN_REJECTED" => "The PIN is incorrect or temporarily locked. Try again later.",
        "P2P_CONSENT_REQUIRED" => {
            "Peer-to-peer playback must be enabled before playing this torrent."
        }
        "AUTH_INVALID_CREDENTIALS" => "The sign-in details could not be verified.",
        "AUTH_EMAIL_IN_USE" => "That email address is already in use.",
        "INVALID_ARGUMENT" => "Some of the supplied information is invalid.",
        "NOT_FOUND" => "The requested item could not be found.",
        "CONFLICT" => "The operation conflicts with the current state.",
        "UNAVAILABLE" => "The service is temporarily unavailable.",
        "CAPABILITY_UNAVAILABLE" => "This feature is not available in this app build.",
        "DEVICE_AUTH_NOT_CONFIGURED" => "This sign-in method is not configured in this build.",
        "TIMEOUT" => "The operation took too long to complete.",
        "FORBIDDEN" | "UNAUTHORIZED" => "This operation is not allowed.",
        _ => "The operation could not be completed.",
    }
    .into()
}

async fn update_event_stream_status(
    manager: &std::sync::Weak<BridgeManager>,
    generation: u64,
    status: BridgeStatus,
    message: Option<String>,
) {
    if let Some(manager) = manager.upgrade() {
        manager
            .set_event_stream_status(generation, status, message)
            .await;
    }
}

fn new_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn constant_time_eq(left: &str, right: &str) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.bytes()
        .zip(right.bytes())
        .fold(0u8, |difference, (a, b)| difference | (a ^ b))
        == 0
}

fn parse_ready(payload: &str, expected_token: &str, generation: u64) -> Result<Api, String> {
    let ready: ReadyMessage = serde_json::from_str(payload)
        .map_err(|_| "desktop bridge sent an invalid ready message".to_string())?;
    if ready.protocol != 1 || ready.port == 0 || !constant_time_eq(&ready.token, expected_token) {
        return Err("desktop bridge startup authentication failed".into());
    }
    Ok(Api {
        port: ready.port,
        token: expected_token.into(),
        generation,
    })
}

fn sanitize_message(message: &str) -> String {
    message
        .chars()
        .filter(|character| !character.is_control())
        .take(240)
        .collect()
}

fn append_diagnostic(path: &Path, phase: &str, message: &str) {
    let Some(parent) = path.parent() else { return };
    if std::fs::create_dir_all(parent).is_err() {
        return;
    }
    if std::fs::metadata(path)
        .map(|metadata| metadata.len() > 2 * 1024 * 1024)
        .unwrap_or(false)
    {
        let backup = path.with_extension("log.1");
        let _ = std::fs::remove_file(&backup);
        let _ = std::fs::rename(path, backup);
    }
    let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    else {
        return;
    };
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let message = sanitize_message(message);
    let _ = writeln!(file, "{timestamp} [{phase}] {message}");
}

fn redact_diagnostic_text(message: &str, token: &str) -> String {
    let mut redacted = if token.is_empty() {
        message.to_string()
    } else {
        message.replace(token, "[redacted]")
    };
    for marker in ["Bearer ", "bearer "] {
        if let Some(start) = redacted.find(marker) {
            let value_start = start + marker.len();
            let value_end = redacted[value_start..]
                .find(char::is_whitespace)
                .map(|offset| value_start + offset)
                .unwrap_or(redacted.len());
            redacted.replace_range(value_start..value_end, "[redacted]");
        }
    }
    while let Some(scheme_end) = redacted.find("://") {
        let url_start = redacted[..scheme_end]
            .rfind(char::is_whitespace)
            .map(|index| index + 1)
            .unwrap_or(0);
        let url_end = redacted[scheme_end + 3..]
            .find(char::is_whitespace)
            .map(|index| scheme_end + 3 + index)
            .unwrap_or(redacted.len());
        redacted.replace_range(url_start..url_end, "[redacted-url]");
    }
    redacted.chars().take(2_000).collect()
}

fn is_diagnostic_line(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    [
        "error:",
        "exception",
        "fatal",
        "failed to",
        "startup failed",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
}

#[cfg(test)]
mod tests {
    use super::{
        constant_time_eq, is_diagnostic_line, parse_ready, redact_diagnostic_text, safe_error_code,
        safe_error_message, validate_response, validated_classpath, BackendResponse, BridgeEvent,
        MAX_SAFE_JS_INTEGER,
    };
    use serde_json::{Map, Value};
    use std::{fs, time::SystemTime};

    #[test]
    fn ready_handshake_requires_v1_nonzero_port_and_matching_token() {
        let token = "f".repeat(64);
        let valid = format!(r#"{{"protocol":1,"port":4312,"token":"{token}"}}"#);
        let api = parse_ready(&valid, &token, 9).expect("valid handshake");
        assert_eq!(api.port, 4312);
        assert_eq!(api.generation, 9);
        assert!(parse_ready(
            &format!(r#"{{"protocol":2,"port":4312,"token":"{token}"}}"#),
            &token,
            9
        )
        .is_err());
        assert!(parse_ready(
            &format!(r#"{{"protocol":1,"port":0,"token":"{token}"}}"#),
            &token,
            9
        )
        .is_err());
        assert!(parse_ready(r#"{"protocol":1,"port":4312,"token":"wrong"}"#, &token, 9).is_err());
        assert!(parse_ready(r#"{"protocol":1,"token":"wrong"}"#, &token, 9).is_err());
    }

    #[test]
    fn token_comparison_rejects_length_and_content_mismatches() {
        assert!(constant_time_eq("same", "same"));
        assert!(!constant_time_eq("same", "sam"));
        assert!(!constant_time_eq("same", "some"));
    }

    #[test]
    fn startup_diagnostics_filter_routine_lines_and_redact_credentials_and_urls() {
        assert!(is_diagnostic_line("ERROR: bridge startup failed"));
        assert!(!is_diagnostic_line("Debug: addon refresh completed"));
        let safe = redact_diagnostic_text(
            "Request failed https://example.invalid/path?token=secret Bearer bearer-secret",
            "secret",
        );
        assert!(safe.contains("[redacted-url]"));
        assert!(safe.contains("Bearer [redacted]"));
        assert!(!safe.contains("example.invalid"));
        assert!(!safe.contains("bearer-secret"));
    }

    #[test]
    fn event_parser_accepts_only_contract_topics_and_fields() {
        let valid = r#"{"topic":"session","epoch":1,"revision":2,"data":{}}"#;
        let event = serde_json::from_str::<BridgeEvent>(valid).expect("known event");
        assert_eq!(event.epoch, 1);
        assert!(serde_json::from_str::<BridgeEvent>(
            r#"{"topic":"private-token","epoch":1,"revision":2,"data":{}}"#
        )
        .is_err());
        assert!(serde_json::from_str::<BridgeEvent>(
            r#"{"topic":"session","epoch":1,"revision":2,"data":{},"secret":"x"}"#
        )
        .is_err());
    }

    #[test]
    fn responses_must_correlate_and_keep_epochs_safe_for_javascript() {
        let request = crate::BridgeRequest {
            id: "request-1".into(),
            method: "session.snapshot".into(),
            params: Map::new(),
            epoch: Some(5),
        };
        let make_response = |id: &str, epoch| BackendResponse {
            id: id.into(),
            epoch,
            result: Some(Value::Null),
            error: None,
        };
        assert!(validate_response(&make_response("request-1", 5), &request).is_ok());
        assert!(validate_response(&make_response("request-2", 5), &request).is_err());
        assert!(validate_response(&make_response("request-1", 4), &request).is_err());
        assert!(validate_response(
            &make_response("request-1", MAX_SAFE_JS_INTEGER + 1),
            &request
        )
        .is_err());
    }

    #[test]
    fn staged_classpath_rejects_files_outside_the_runtime_directory() {
        let unique = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("nuvio-runtime-{unique}"));
        let runtime = root.join("backend");
        fs::create_dir_all(&runtime).unwrap();
        let inside = runtime.join("bridge.jar");
        let outside = root.join("other.jar");
        fs::write(&inside, b"runtime").unwrap();
        fs::write(&outside, b"outside").unwrap();
        let inside_classpath = std::env::join_paths([inside.as_os_str()]).unwrap();
        let validated = validated_classpath(&runtime, inside_classpath.to_str().unwrap()).unwrap();
        #[cfg(windows)]
        for entry in std::env::split_paths(&validated) {
            assert!(!entry.to_string_lossy().starts_with(r"\\?\"));
        }
        #[cfg(not(windows))]
        assert!(!validated.as_os_str().is_empty());
        let outside_classpath = std::env::join_paths([outside.as_os_str()]).unwrap();
        assert!(validated_classpath(&runtime, outside_classpath.to_str().unwrap()).is_err());
        assert!(validated_classpath(&runtime, "").is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn backend_messages_and_unknown_error_codes_do_not_cross_the_shell_boundary() {
        assert_eq!(safe_error_message("CAPABILITY_UNAVAILABLE"), "This feature is not available in this app build.");
        assert_eq!(safe_error_code("AUTH_REQUIRED"), "AUTH_REQUIRED");
        assert_eq!(safe_error_code("TOKEN_abcd"), "BRIDGE_ERROR");
        assert_eq!(
            safe_error_message("TOKEN_abcd"),
            "The operation could not be completed."
        );
    }
}

use tokio_tungstenite::tungstenite::client::IntoClientRequest;
