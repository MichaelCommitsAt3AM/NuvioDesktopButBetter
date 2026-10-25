# React/Tauri desktop migration

As of 2026-10-18, the React/Tauri rewrite is permanently the primary desktop application. Kotlin remains the authoritative backend and native player implementation. The desktop release workflow packages the rewrite; the Compose entry point remains available for upstream reference and development/migration comparisons. Outstanding parity and installed-app acceptance checks remain required where applicable; they do not change the chosen frontend.

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

The earlier migration backlog included localization, motion/transitions, trailer previews, continue-watching flows, list management, conditional screen states, player lifecycle, deep links, window bounds and strict snapshot schemas. Consult [DESKTOP_UI_PARITY.md](DESKTOP_UI_PARITY.md) and subsequent entries in [FORK_CHANGES.md](FORK_CHANGES.md) for current implementation and acceptance evidence rather than treating that historical backlog as current status. Release builds have a signed native updater, bundled Java and rewrite CI packaging; a source build without a signing key reports updates unavailable. Installed-app migration and update acceptance remain required where applicable.

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

## Upstream sync workflow

This workflow was agreed on 2026-10-18 and is recorded in `AGENTS.md`. The operational runbook, including commands and lessons from the first sync, is [UPSTREAM_SYNC.md](UPSTREAM_SYNC.md). Documenting it does not create branches or change the GitHub default branch.

- Use one primary development/release branch containing the rewrite. The current rewrite branch is `feature/react-tauri-desktop-rewrite`; `origin/HEAD` currently points to `Dev`. A separate deliberate promotion can make the rewrite the default without maintaining two active products.
- For each sync, create a short-lived `codex/sync-upstream-<release-or-date>` branch from the latest rewrite development tip. Fetch upstream, select an exact upstream commit/release and record its full SHA. Merge that target into the sync branch with normal merge ancestry; preserve that ancestry when integrating the completed branch back (no squash/rebase of the upstream merge).
- Keep the imported upstream merge and subsequent bridge/React adaptations as separate commits on the same sync branch. Merge the completed batch back only after the rewrite works. A dedicated worktree can keep normal feature development independent. Do not require a separately maintained legacy Compose app to pass feature acceptance first.
- Prefer small batches around upstream releases, with urgent fixes integrated sooner. Avoid wholesale directory replacement or blanket ours/theirs conflict resolution. Preserve fork-specific profiles, kids policies, database contracts, versioning, updater identity and release configuration during conflict review.

For each batch, record the previous integrated upstream SHA, target SHA, affected behavior, frontend/bridge mappings, validation and any deliberately deferred changes in `FORK_CHANGES.md`. Classify each meaningful change as backend/native runtime, frontend adaptation, build/release, or irrelevant to this desktop fork. Backend and UI changes can occur in the same Kotlin file; paths alone are not enough. Reference-only Compose presentation changes may be retained in source without copying their design into React. Every relevant behavior needs an explicit implemented, already covered, or deferred decision; add understood outstanding bugs to `KNOWN_ISSUES.md`.

Keep business rules in Kotlin and make bridge changes in `desktop-bridge/`. Translate upstream screen behavior into React deliberately, including loading/error/empty states, settings defaults and navigation. The canonical schema and generated TypeScript/Rust allowlists form the integration boundary. Native player changes still require rewrite playback validation even when they live in Compose files.

Windows player presentation regression: run `./gradlew :composeApp:desktopTest --tests '*WindowsPlayerPresentationTest'`. This uses the real JNI/mpv/WebView2 controls with a temporary silent WAV and an offscreen native host, keeps warm-up alive under a different DPI mode, and checks initial state application, presentation acknowledgement and native surface visibility. It also requires the container to track host resizes and to heal after an out-of-band shrink without any host resize. It requires the Windows native build dependencies and installed WebView2 Runtime. The test skips other operating systems and is included in the release workflow's existing `com.nuvio.desktop.bridge.*` test filter. Windows desktop tests rebuild the DLL when necessary and track its contents as a test input.

1. Review the delta between the previous upstream SHA and the pinned target, then merge on the sync branch and resolve conflicts with the ownership rules above. Preserve the fork Gradle hook and rewrite CI packaging.
2. Compile `:composeApp:stageBridgeRuntime` and run relevant `:composeApp:desktopTest` coverage (including bridge tests). Repair repository API changes in `desktop-bridge/`, preserving Kotlin ownership. For auth/sync/schema changes, also pass the Supabase RPC contract, fresh-database and upgrade-database checks; add forward migrations rather than rewriting applied migrations.
3. Run `node scripts/desktop-ui/inventory-parity.mjs --check`. Review changed original UI against the parity checklist before regenerating its inventory. The inventory is a review aid, not proof that behavior was ported; its baseline now comes from `desktop-bridge/contract/upstream-baseline.json`, which must be updated only alongside an explicitly reviewed sync report. Update the canonical schema when bridge behavior changes, synchronize RPC allowlists with `sync-methods.mjs`, regenerate types and adjust affected React features/locales. Check generated outputs after regeneration.
4. In `desktop-ui`, run `npm test`, `npm run contract:check` and `npm run build`. In `desktop-ui/src-tauri`, run `cargo fmt --check`, `cargo test --locked` and an embedded shell build. Validate affected user journeys through the actual rewrite, including backend events and native playback where touched. Record platform checks that still need another host.
5. Reconcile any newer primary-branch changes and repeat affected checks before merging the batch back with its upstream ancestry intact. Keep `FORK_CHANGES.md` and the README current. Use CI build-only artifacts for platform/package checks when relevant, then follow the normal separate version-bump/release process; a sync is not itself authorization to publish a release.

## Rewrite release and update delivery

Before a release bump, write concise hyphenated statements to `docs/releases/<VERSION_NAME>.md`. Desktop CI uses that file for both the GitHub release body and the updater feed; if absent, it generates subject-only bullets without commit hashes or authors. Keep statements short and rephrase long commit subjects for users. Editing the GitHub release body after publication does not update notes already embedded in `latest.json`.

`Build Desktop Release` keeps the existing build-only/dry-run/draft/publish modes. It now builds Windows x64 MSI, macOS arm64 and Intel DMGs plus signed app archives, and Linux x86_64 AppImage, DEB, RPM and Flatpak. Every package includes the staged Kotlin backend and a private Java runtime. The Linux AppImage bundles the native player dependencies; DEB/RPM declare system dependencies. Flatpak uses the existing sandbox identity and external update ownership.

Build-only supports `all`, `windows`, `macos`, `linux` and `flatpak` targets. Draft/publish require `all`. The Flatpak manifest includes a checksum-preserving Debian mirror for uchardet when its primary download host fails.

`composeApp/Configuration/DesktopVersion.properties` remains the version source. `release-config.mjs` maps `VERSION_CODE` to `1.0.<code>` for MSI and Tauri SemVer, preserving the original monotonic MSI convention. The marketing version remains the GitHub tag and displayed version. Use `scripts/set-version.sh` for a release bump, commit it after application changes, then push and run required backend CI before releasing.

The release environment needs the existing `NUVIO_DESKTOP_LOCAL_PROPERTIES_BASE64` secret, `NUVIO_UPDATER_PRIVATE_KEY` and `NUVIO_UPDATER_PRIVATE_KEY_PASSWORD` secrets, and the matching `NUVIO_UPDATER_PUBLIC_KEY` variable. Signing was configured for this repository using `configure-updater-signing.ps1`; the protected local backup is under `%USERPROFILE%/.codex/keys/nuvio-desktop-updater`. Retain that key for all subsequent releases. Updater signing is independent of OS code signing/notarization, which remains disabled in this pipeline as in the previous fork workflow.

The app checks `releases/latest/download/latest.json`. CI produces this feed only with complete signed packages for all updater targets. Rust verifies signatures and their bound installer version before installation. Selecting Update downloads and verifies the package, then automatically installs and restarts without a second confirmation. Installation stops the Kotlin worker first; failed installation restores the worker and preserves the verified download for an explicit retry. Flatpak reports that updates belong to its installation. The About banner test never invokes real installation.

Before publishing, use build-only artifacts to test upgrading the actual current Kotlin MSI. Confirm that it replaces the old app, preserves account/profile/settings/addon/download/progress state and launches the rewrite. Check both default and custom installation directories. Then test a second signed rewrite update, cancelled/failed installation recovery, uninstall and rollback. Equivalent installed-runtime checks are required on macOS and Linux. CI package checks and unit tests do not replace these acceptance tests.

### Windows signed updater acceptance (2026-10-16)

A debug shell with a test-only `1.0.34` package version and loopback feed exercised the real native updater against the CI-signed `0.1.27.3` / `1.0.35` MSI from run `38634207891`. The first intentionally invalid download was rejected by signature verification, with no install action offered. Retrying the genuine artifact displayed download progress and reached the verified, ready-to-install state. The shipping passive installer settings then completed successfully (Windows Installer events 11707 and 1033, status 0), and automatically launched `C:\Program Files\Nuvio\Nuvio.exe` with the three existing profiles. All 38 pre-existing account-data files remained present after launch; six settings/progress files were rewritten by the running backend. Backups and test records are under `%LOCALAPPDATA%\NuvioMigrationTests\20261016-updater`.

The first instrumented attempt failed with Windows Installer error 1622 for the added test log path; repeating without that extra argument succeeded. No production updater configuration was changed. This tests the signed download/install/relaunch path, using a debug source and a same-version replacement of the locally installed build 35. It does not claim a hosted public-feed upgrade, cancellation recovery, or macOS/Linux installed migration. The earlier Kotlin build 33 → rewrite build 35 test covers the increasing-version MSI migration separately. The one-time rewrite welcome was also visually checked and stayed dismissed on debug restart.

### Windows installed migration test (2026-10-14)

The CI-built `0.1.27.3` MSI (`1.0.35`) successfully upgraded the installed Kotlin `0.1.27.1` MSI (`1.0.33`) in `C:\Program Files\Nuvio`. Only one Nuvio product remained registered, using the original UpgradeCode. All 30 pre-existing `%APPDATA%\Nuvio` files retained identical SHA-256 hashes before the first rewrite launch. The installed rewrite connected to its bundled Kotlin backend, retained the signed-in account and three profiles, and displayed the existing Continue Watching and saved library. Home, Library, Search and Settings navigation highlights followed the active screen; Settings displayed `0.1.27.3 (35)`.

The first test (build 34) preserved data and upgraded the MSI, but failed startup because Java could not load JARs through Windows verbatim paths. That failure was fixed, covered by a Windows Rust regression check, and followed by a successful uninstall/restore to Kotlin build 33 before testing build 35. Protected backups, the original installer and installation logs remain in `%LOCALAPPDATA%\NuvioMigrationTests\20261014-build34`.

This tested the installer handoff with `/passive /norestart`, not a public GitHub download through either app's updater. The current public release has no `latest.json`, so the rewrite's native check reports that updates cannot be checked until the first signed feed is published. Remaining acceptance includes a second signed rewrite update and its cancellation/failure recovery, custom install directories, playback, and installed macOS/Linux migration. No public release was created for this test.

The current preview was built for a user-led desktop review. After a reported blank window, startup validation was moved to build time, legacy Windows log encoding was tolerated by the supervisor, and startup errors became visible with a retry action. The rebuilt preview was observed displaying its sign-in screen with the Kotlin connection ready. Feature and playback acceptance testing remains user-led.
