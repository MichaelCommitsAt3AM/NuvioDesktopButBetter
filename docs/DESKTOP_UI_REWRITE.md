# React/Tauri desktop migration

The new desktop UI is an opt-in development preview. The existing Compose entry point and release workflow remain available while feature parity is completed.

## Architecture and ownership

`desktop-ui/` owns React, TypeScript, CSS, routing and presentation. Feature components use a typed bridge store rather than calling Kotlin repositories directly. `desktop-ui/src-tauri/` owns the native window, process supervision and authenticated transport. It starts a Kotlin JVM process, proxies requests, and delivers backend events through Tauri IPC. The webview never receives the bridge token or accesses its loopback port directly.

`desktop-bridge/src/main/kotlin/` adapts the existing Kotlin repositories into UI snapshots and commands. It is compiled into the existing desktop source set so the adapter can reuse internal repository and native player APIs without moving upstream files. Kotlin continues to own authentication, profiles, addons, catalog queries, library persistence, sync, stream resolution and playback progress.

The canonical protocol is `desktop-bridge/contract/schema.json`. Generate TypeScript types with `node scripts/desktop-ui/generate-contract.mjs`; check generated output with `--check`. `npm run build` also precompiles standalone schema validators so the webview can validate snapshots without dynamic evaluation or weakening its CSP. Epochs isolate profile/session transitions; request IDs isolate detail/search/stream work; revisions reject older events. A recovered bridge connection refreshes snapshots.

The application build hook is the `apply(from = ...)` at the end of `composeApp/build.gradle.kts`, backed by `gradle/fork-desktop-ui.gradle`. The only shared UI source hook changes `SupportersContributorsRepository` from private to internal so About can reuse its actual cached service. This keeps merges concentrated in an adapter layer rather than a second copy of upstream business logic.

## Preview coverage and remaining work

The preview now exposes these repository-backed flows:

- Sign-in/sign-up/guest, custom auth servers and capability-gated device login; profile chooser/editor, avatars/backgrounds, PINs and remember-profile settings.
- Configurable sidebar/top navigation; home hero controls, full-width shelves, Continue Watching and Up Next; catalog paging, discovery filters and recent searches.
- Rich details, watched title/season/episode actions, people/company/network browsing, trailers, gated comments, episode shuffle and provider-aware list membership.
- Saved and provider cloud libraries; collection editor, folder browsing, add-on/TMDB/Trakt source pickers, presets, genres, import/export validation and replacement confirmation.
- Stream providers, presentation badges, automatic selection with failure fallback, manual selection, data saver, P2P consent and download enqueue/replacement.
- Downloads grouped by title with movie/series/search/status filters, pause/resume/retry/play/removal and persisted data saver rules.
- Appearance, navigation, poster/depth/hover, home/CW, details, playback/audio/subtitles/autoplay, P2P, plugin, metadata/debrid/tracking integration and advanced settings; settings search, About and community pages.

The sign-in action has explicit white/black colors. Theme color serialization uses ARGB conversion, catalog rails extend to the content edges, and viewport/font scaling and adaptive grids increase readability. Touch users have explicit poster actions and shelf navigation controls.

Playback opens the existing native Compose player in a separate window. It preserves the current native decoder, subtitle, controls and progress implementation, with debrid/P2P context and local/cloud playback passed internally. External web streams are handed to the browser. Sensitive source URLs and request headers are excluded from ordinary UI snapshots.

This is still a parity migration, not a finished replacement. Remaining work includes full React localization; original motion/shared transitions and supported-platform embedded trailer previews; complete continue-watching launch prompts, last-link reuse and home shuffle behavior; remote list management; every conditional layout/state in original screens; native player ownership/event lifecycle; deep links and persistent multi-monitor window bounds; and updater installation/bundled Java/CI delivery. Some feature snapshot shapes still need strict canonical schemas. Current About update checks report release metadata and do not install a Compose updater into the Tauri preview. The source coverage and outstanding acceptance gates are tracked in [DESKTOP_UI_PARITY.md](DESKTOP_UI_PARITY.md).

## Build the Windows preview

Prerequisites: the repository's usual Kotlin/JDK and native dependencies, Node.js/npm, Rust/Cargo, Windows C++ build tools, and WebView2. Use the existing configured `local.properties`; do not copy backend credentials into frontend environment variables.

From the repository root in PowerShell:

```powershell
.\gradlew.bat :composeApp:stageBridgeRuntime
node scripts/desktop-ui/sync-methods.mjs
Push-Location desktop-ui
npm ci
npm run build
Push-Location src-tauri
cargo build --features custom-protocol
Pop-Location
Pop-Location
```

The debug executable is `desktop-ui/src-tauri/target/debug/nuvio-desktop-shell.exe`. It embeds the frontend assets and reads the staged Kotlin JARs and native resources from `desktop-ui/src-tauri/resources/backend/`. Development resolves Java from `NUVIO_BRIDGE_JAVA`, a staged runtime, `JAVA_HOME`, or PATH. A future release must bundle a private Java runtime; release builds do not depend on the user's Java installation.

Close the original Compose app before using the preview: the two implementations share Kotlin storage and background services. The preview uses its own Tauri identifier and does not install over the current application. Generated JARs, native files, frontend output and Cargo output are ignored by Git. There are no local release packages or signing changes in this migration.

## Upstream sync procedure

1. Merge upstream normally and resolve the small build hook if necessary.
2. Compile `:composeApp:stageBridgeRuntime`. Repository API changes should be repaired in `desktop-bridge/`, preserving Kotlin ownership of business logic.
3. Run `node scripts/desktop-ui/inventory-parity.mjs --check`. Review original UI changes against the parity checklist before regenerating the inventory. It normalizes only the documented community repository visibility hook. Update the canonical schema when bridge behavior changes; run `sync-methods.mjs` to synchronize RPC allowlists, regenerate types, and adjust the affected React features.
4. Build the frontend and Rust shell. Validate the affected user journeys before promoting the preview to the default entry point.
5. Keep `docs/FORK_CHANGES.md` and the README preview status current. Integrate CI packaging and updater delivery only after feature parity and native resource delivery are ready.

The current preview was built for a user-led desktop review. After a reported blank window, startup validation was moved to build time, legacy Windows log encoding was tolerated by the supervisor, and startup errors became visible with a retry action. The rebuilt preview was observed displaying its sign-in screen with the Kotlin connection ready. Feature and playback acceptance testing remains user-led.
