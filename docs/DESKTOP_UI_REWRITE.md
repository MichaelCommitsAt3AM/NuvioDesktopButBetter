# React/Tauri desktop migration

The new desktop UI remains a development preview while installed-app migration and feature acceptance are completed. The desktop release workflow now packages the React/Tauri rewrite; the Compose entry point remains available for development and migration comparisons.

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

This is still a parity migration, not a finished replacement. Remaining work includes full React localization; original motion/shared transitions and supported-platform embedded trailer previews; complete continue-watching launch prompts, last-link reuse and home shuffle behavior; remote list management; every conditional layout/state in original screens; native player ownership/event lifecycle; deep links and persistent multi-monitor window bounds. Some feature snapshot shapes still need strict canonical schemas. Release builds now have a signed native updater, bundled Java and rewrite CI packaging; the source preview without a signing key reports updates unavailable. Installed-app migration and update acceptance remain required. The source coverage and outstanding acceptance gates are tracked in [DESKTOP_UI_PARITY.md](DESKTOP_UI_PARITY.md).

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

Close the original Compose app before using the source preview: the two implementations share Kotlin storage and background services. Development keeps the separate preview Tauri identifier. Generated release configuration uses the original production identifier and Windows MSI upgrade identity. Generated JARs, native files, frontend output and Cargo output are ignored by Git. Release packages and updater signatures are produced in CI; local installer packaging is for testing only.

## Upstream sync procedure

1. Merge upstream normally and resolve the small build hook if necessary.
2. Compile `:composeApp:stageBridgeRuntime`. Repository API changes should be repaired in `desktop-bridge/`, preserving Kotlin ownership of business logic.
3. Run `node scripts/desktop-ui/inventory-parity.mjs --check`. Review original UI changes against the parity checklist before regenerating the inventory. It normalizes only the documented community repository visibility hook. Update the canonical schema when bridge behavior changes; run `sync-methods.mjs` to synchronize RPC allowlists, regenerate types, and adjust the affected React features.
4. Build the frontend and Rust shell. Validate the affected user journeys before promoting the preview to the default entry point.
5. Keep `docs/FORK_CHANGES.md` and the README preview status current. Run rewrite CI in build-only mode and verify installed-app migration before publishing a replacement release.

## Rewrite release and update delivery

`Build Desktop Release` keeps the existing build-only/dry-run/draft/publish modes. It now builds Windows x64 MSI, macOS arm64 and Intel DMGs plus signed app archives, and Linux x86_64 AppImage, DEB, RPM and Flatpak. Every package includes the staged Kotlin backend and a private Java runtime. The Linux AppImage bundles the native player dependencies; DEB/RPM declare system dependencies. Flatpak uses the existing sandbox identity and external update ownership.

Build-only supports `all`, `windows`, `macos`, `linux` and `flatpak` targets. Draft/publish require `all`. The Flatpak manifest includes a checksum-preserving Debian mirror for uchardet when its primary download host fails.

`composeApp/Configuration/DesktopVersion.properties` remains the version source. `release-config.mjs` maps `VERSION_CODE` to `1.0.<code>` for MSI and Tauri SemVer, preserving the original monotonic MSI convention. The marketing version remains the GitHub tag and displayed version. Use `scripts/set-version.sh` for a release bump, commit it after application changes, then push and run required backend CI before releasing.

The release environment needs the existing `NUVIO_DESKTOP_LOCAL_PROPERTIES_BASE64` secret, `NUVIO_UPDATER_PRIVATE_KEY` and `NUVIO_UPDATER_PRIVATE_KEY_PASSWORD` secrets, and the matching `NUVIO_UPDATER_PUBLIC_KEY` variable. Signing was configured for this repository using `configure-updater-signing.ps1`; the protected local backup is under `%USERPROFILE%/.codex/keys/nuvio-desktop-updater`. Retain that key for all subsequent releases. Updater signing is independent of OS code signing/notarization, which remains disabled in this pipeline as in the previous fork workflow.

The app checks `releases/latest/download/latest.json`. CI produces this feed only with complete signed packages for all updater targets. Rust verifies signatures and their bound installer version before offering installation. Download and installation are separate actions, and installation stops the Kotlin worker first; failed installation restores the worker and preserves the verified download for retry. Flatpak reports that updates belong to its installation. The About banner test never invokes real installation.

Before publishing, use build-only artifacts to test upgrading the actual current Kotlin MSI. Confirm that it replaces the old app, preserves account/profile/settings/addon/download/progress state and launches the rewrite. Check both default and custom installation directories. Then test a second signed rewrite update, cancelled/failed installation recovery, uninstall and rollback. Equivalent installed-runtime checks are required on macOS and Linux. CI package checks and unit tests do not replace these acceptance tests.

### Windows signed updater acceptance (2026-10-16)

A debug shell with a test-only `1.0.34` package version and loopback feed exercised the real native updater against the CI-signed `0.1.27.3` / `1.0.35` MSI from run `38634207891`. The first intentionally invalid download was rejected by signature verification, with no install action offered. Retrying the genuine artifact displayed download progress and reached the verified, ready-to-install state. The shipping passive installer settings then completed successfully (Windows Installer events 11707 and 1033, status 0), and automatically launched `C:\Program Files\Nuvio\Nuvio.exe` with the three existing profiles. All 38 pre-existing account-data files remained present after launch; six settings/progress files were rewritten by the running backend. Backups and test records are under `%LOCALAPPDATA%\NuvioMigrationTests\20261016-updater`.

The first instrumented attempt failed with Windows Installer error 1622 for the added test log path; repeating without that extra argument succeeded. No production updater configuration was changed. This tests the signed download/install/relaunch path, using a debug source and a same-version replacement of the locally installed build 35. It does not claim a hosted public-feed upgrade, cancellation recovery, or macOS/Linux installed migration. The earlier Kotlin build 33 → rewrite build 35 test covers the increasing-version MSI migration separately. The one-time rewrite welcome was also visually checked and stayed dismissed on debug restart.

### Windows installed migration test (2026-10-14)

The CI-built `0.1.27.3` MSI (`1.0.35`) successfully upgraded the installed Kotlin `0.1.27.1` MSI (`1.0.33`) in `C:\Program Files\Nuvio`. Only one Nuvio product remained registered, using the original UpgradeCode. All 30 pre-existing `%APPDATA%\Nuvio` files retained identical SHA-256 hashes before the first rewrite launch. The installed rewrite connected to its bundled Kotlin backend, retained the signed-in account and three profiles, and displayed the existing Continue Watching and saved library. Home, Library, Search and Settings navigation highlights followed the active screen; Settings displayed `0.1.27.3 (35)`.

The first test (build 34) preserved data and upgraded the MSI, but failed startup because Java could not load JARs through Windows verbatim paths. That failure was fixed, covered by a Windows Rust regression check, and followed by a successful uninstall/restore to Kotlin build 33 before testing build 35. Protected backups, the original installer and installation logs remain in `%LOCALAPPDATA%\NuvioMigrationTests\20261014-build34`.

This tested the installer handoff with `/passive /norestart`, not a public GitHub download through either app's updater. The current public release has no `latest.json`, so the rewrite's native check reports that updates cannot be checked until the first signed feed is published. Remaining acceptance includes a second signed rewrite update and its cancellation/failure recovery, custom install directories, playback, and installed macOS/Linux migration. No public release was created for this test.

The current preview was built for a user-led desktop review. After a reported blank window, startup validation was moved to build time, legacy Windows log encoding was tolerated by the supervisor, and startup errors became visible with a retry action. The rebuilt preview was observed displaying its sign-in screen with the Kotlin connection ready. Feature and playback acceptance testing remains user-led.
