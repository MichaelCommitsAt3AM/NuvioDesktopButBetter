# AGENTS.md

This file provides guidance to coding agents working in this repository.

## What this is

**Permanent desktop direction (2026-10-18): the React/TypeScript + Tauri rewrite is the primary application.** Implement and verify desktop features in `desktop-ui/` (React presentation and Rust/Tauri shell), with `desktop-bridge/` adapting the existing Kotlin backend. Kotlin repositories, storage, authentication, sync, stream resolution and native playback remain authoritative; do not duplicate business logic in React or Rust. The original Compose application remains an upstream reference and development comparison tool, not a second frontend that must receive every fork feature. Compose/native player code is still used by the rewrite: review those changes as runtime changes rather than dismissing all Compose changes as reference-only. The rewrite is incomplete: do not treat successful builds or existing coverage as proof of parity. When reviewing or syncing, implement and fix discovered behavior gaps/bugs, especially against upstream, and record remaining external dependencies and acceptance limits explicitly. This ongoing work does not change the permanent frontend direction.

For rewrite builds, architecture and release delivery, follow `docs/DESKTOP_UI_REWRITE.md`. `:composeApp:run` and the Compose packaging commands below target the legacy app; they do not validate or package the rewrite. Official releases use the existing React/Tauri desktop CI pipeline. Continue periodic upstream integration using the agreed workflow below. Do not merge upstream, rename branches or change the GitHub default branch merely to record this policy.

Nuvio Desktop is a Kotlin Multiplatform + Compose Multiplatform media hub for Windows, macOS, and Linux. It's built from the same monorepo lineage as the separate NuvioMobile project — Android and iOS targets exist here too (`androidApp/`, `iosApp/`), sharing the same `com.nuvio.app` package and feature set in `composeApp/src/commonMain/`, but the desktop target (`composeApp/src/desktopMain/`) is this repo's primary focus. It's a client for the Stremio addon ecosystem — it does not host or distribute content itself (see README "Legal & DMCA" section before making any change that touches source/addon handling).

> **This build is desktop-only.** All work here targets the desktop app (`composeApp/src/desktopMain/`, `desktop-bridge/`, `desktop-ui/`). The Android and iOS targets are shared monorepo lineage and are **not** built, tested, or supported from this working tree — don't spend time compiling, fixing, or verifying `androidApp`/`iosApp`, or the `androidMain`/`iosMain` source sets (they can fail to compile for reasons unrelated to desktop work).

## Commands

```bash
# Run desktop from source
./gradlew :composeApp:run                          # or gradlew.bat on Windows

# Run the debug rewrite (React/Tauri) app — this is the primary desktop app.
# Windows only. The script starts the Vite dev server, then `cargo run` for the
# Tauri shell, which starts and supervises the Kotlin bridge itself.
# Prerequisites (it tells you if any are missing): stage the bridge first, and
# `npm ci` in desktop-ui once:
#   ./gradlew :composeApp:stageBridgeRuntime   # or gradlew.bat on Windows
#   cd desktop-ui; npm ci
./scripts/desktop-ui/run-preview.ps1

# Local packaging — for testing an installer only; releases are built in CI (see Desktop release process)
./gradlew :composeApp:packageReleaseDistributionForCurrentOS
./gradlew :composeApp:packageReleaseMsi --rerun-tasks   # Windows
./scripts/build-macos-release-dmgs.sh --package-only    # macOS
./gradlew :composeApp:packageReleaseDeb                  # Linux

# Android / iOS — NOT used by this fork's desktop build (see "Desktop only" above)
./gradlew :androidApp:assembleFullDebug
./gradlew :androidApp:assembleFullRelease

# Tests — use desktopTest; it also runs commonTest on the JVM.
./gradlew :composeApp:desktopTest             # desktop tests + shared commonTest
# ./gradlew :composeApp:testAndroidHostTest   # Android host tests — not used here
# ./gradlew :composeApp:iosSimulatorArm64Test # iOS simulator target — not used here
```

Aggregate Android tasks (`build`, `assemble*`, `bundle*` without a flavor) fail fast unless a distribution is picked via `-Pnuvio.android.distribution=full|playstore` (or `NUVIO_ANDROID_DISTRIBUTION` in `local.properties`) — see Distribution flavors below.

## Architecture

### Source set layout (`composeApp/src/`)

Same `commonMain`/`features`/`core` layout as the mobile app (see below), plus:

- `desktopMain` / `desktopTest` — the JVM/desktop target: window/app entry point (`com.nuvio.app.MainKt`), native player integrations, desktop-specific UI chrome.
- `androidHostTest` — Android-specific host-side unit tests, alongside the shared `commonTest`.
- `commonMain/kotlin/com/nuvio/app/` — `core/` (auth, networking, storage, sync, theming, shared UI primitives) and `features/` (one directory per feature area: player, streams, debrid, catalog, downloads, trakt, plugins, p2p, etc.), identical in shape to the mobile app. Files within a feature directory are flat (`FooRepository.kt`, `FooStorage.kt`, `FooModels.kt`, `FooScreen.kt`) rather than nested into sub-packages.
- `androidMain` / `iosMain` — Android/iOS actuals, same as the mobile app.

### Distribution flavors and `AppFeaturePolicy`

Same pattern as the mobile app: `core/build/AppFeaturePolicy.kt` (`expect object`) centralizes which features are available where — `pluginsEnabled`, `p2pEnabled`, `inAppUpdaterEnabled`, etc. — with `actual` implementations per platform/flavor (`androidFull`/`androidPlaystore`, `iosFull`/`iosAppStore`, and a `desktopMain` actual). Gate new store-sensitive features through this object.

### Runtime config generation

Secrets/config (Supabase URL+key, Sentry DSN, Trakt client id/secret, TMDB/IMDB API bases, debrid client ids, app version, **plus `DESKTOP_VERSION_NAME`/`DESKTOP_VERSION_CODE`**) are generated at build time by the `generateRuntimeConfigs` task in `composeApp/build.gradle.kts`, from `local.properties` / env vars, into `build/generated/runtime-config/kotlin/...`. If a generated config object appears "missing", run any compile task first — don't hand-write it into `commonMain`.

### macOS packaging (notarization/signing)

`composeApp/build.gradle.kts` defines custom tasks beyond stock Compose Desktop packaging: `NotarizeMacosDmgWithKeychainTask` (codesigns + `notarytool submit --wait` + staples the DMG, driven by `NUVIO_MACOS_SIGNING_IDENTITY` and a notary keychain profile) and `PrepareMacosTorrServerResourcesTask` (bundles the TorrServer binary as a macOS app resource). `nativeDistributions` targets `Dmg`/`Msi`/`Deb` with bundle ID `com.nuvio.media.desktop` and registers `nuvio://`/`stremio://` URL schemes. `scripts/build-macos-release-dmgs.sh` wraps this for local builds. On this fork, signing/notarization only runs in `desktop-release.yml` (currently disabled there) — never sign or notarize release packages locally.

### Sync

Cross-device state sync (watch progress, library, settings) goes through `core/sync/SyncManager.kt` + `RealtimeSyncInvalidationService.kt` backed by Supabase Realtime/Postgrest. `RealtimeSyncConfig.ENABLED` (generated, driven by `NUVIO_REALTIME_SYNC_ENABLED`) can disable realtime push while keeping the rest of sync intact.

### Supabase backend is tracked in this repo

Unlike the mobile app (which only consumes a hosted Supabase project), this repo version-controls the backend itself under `supabase/` — `functions/` (edge functions, e.g. `delete-account`) and `migrations/` (schema history). Changes to sync/auth/account behavior may need a matching migration or function change here, not just client code.

### No dependency-injection framework

There's no Koin/Hilt/Dagger — repositories and services are plain objects/classes wired up directly. Follow the existing pattern in whichever feature you're touching.

## Fork context

This is a personal fork (`origin` = `MichaelCommitsAt3AM/NuvioDesktopButBetter`) of upstream `NuvioMedia/NuvioDesktop`, tracked via an `upstream` remote and periodically merged. `CONTRIBUTING.md`'s strict PR-scoping policy governs contributions back to the upstream project — it does not apply to work done directly on this fork.

### Upstream integration workflow (agreed 2026-10-18)

Maintain one primary development/release line containing the React/Tauri rewrite. Each upstream sync uses a short-lived integration branch based on the latest rewrite, rather than a separately maintained Compose product. Determine the current rewrite development branch when starting a sync; do not assume the remote default branch already contains it.

1. Fetch upstream and choose an exact upstream commit or release. Record the full previous integrated upstream SHA and target SHA, and review the changes between them. Prefer small batches around upstream releases, with urgent fixes integrated sooner.
2. Create `codex/sync-upstream-<release-or-date>` from the latest rewrite development tip. A separate worktree may be used to keep feature development independent. Merge the pinned upstream target normally into this branch, preserving Git ancestry.
3. Resolve conflicts deliberately, preserving shared Kotlin source paths, the fork Gradle hook, rewrite packaging, profiles/kids policies, database contracts, updater identity and versioning. Do not replace whole directories or use blanket ours/theirs resolutions. Keep shared Kotlin close to upstream and concentrate adaptation in `desktop-bridge/`.
4. Review every meaningful upstream change by behavior, not only by file path:
   - Kotlin repositories, storage, authentication, sync and stream resolution: integrate in Kotlin and repair bridge integration; do not duplicate business rules in React/Rust.
   - Compose screens and interactions: translate relevant behavior into React, including loading/error/empty states, settings defaults and navigation. Retain original UI source for reference without requiring identical visual design or full acceptance of the legacy app first.
   - Native player and desktop runtime: integrate and validate through rewrite playback, even when the changed code is Compose-based.
   - Build/dependencies/release configuration and Supabase: reconcile with the rewrite pipeline and fork schema; use forward migrations rather than changing applied migrations.
   - Mobile-only changes: retain where appropriate without spending time building, fixing or verifying mobile targets.
5. Keep the upstream merge and subsequent bridge/React adaptations in separate commits on the same sync branch. Update the canonical bridge schema and generated contracts/allowlists/locales as needed. Review the UI inventory/parity checklist before regenerating baselines; generated output is not proof of behavioral parity.
6. Validate the complete rewrite before integration: stage the Kotlin runtime, run relevant desktop/bridge tests, frontend tests/contract checks/production build, Rust formatting/tests and an embedded shell build. Exercise affected user journeys and native playback. Run the Supabase RPC contract/fresh-database/upgrade-database checks when relevant, and use CI build-only artifacts for affected platform/package checks. Record checks still pending on other hosts.
7. Record upstream SHAs, affected behavior, bridge/React mappings and validation in `docs/FORK_CHANGES.md`. Give each relevant change an explicit implemented, already covered or deferred decision; record understood outstanding bugs in `docs/KNOWN_ISSUES.md`. Update the README for user-visible changes.
8. Reconcile any newer rewrite development changes, repeat affected checks and merge the completed sync branch back while preserving upstream merge ancestry. Do not squash or rebase away the upstream merge. Follow the normal separate version-bump/release process afterward; completing a sync does not itself authorize publishing a release.

The operational runbook is `docs/UPSTREAM_SYNC.md`; read it before every sync. Record each batch in a separate report and maintain `desktop-bridge/contract/upstream-baseline.json` with the integrated upstream SHA. Rewrite architecture/build details remain in `docs/DESKTOP_UI_REWRITE.md`.

`docs/FORK_CHANGES.md` is the detailed reference of everything this fork changes versus upstream. Whenever a fork-only feature, fix, or behavior change lands (or an upstream sync supersedes or removes one), update the matching section there in the same change. If the change is user-visible, also update the short plain-language "What's different from upstream" list in `README.md`.

`docs/KNOWN_ISSUES.md` lists fork-specific bugs that are described (with the places to look) but not yet fixed. Add an entry there when a bug is understood but intentionally left for later.

### Versioning

Two independent versions are tracked, both managed through `scripts/set-version.sh` (don't hand-edit the files):

- **Base/mobile version** — `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` in `iosApp/Configuration/Version.xcconfig` (shared with the Android/iOS targets in this repo).
- **Desktop version** — `VERSION_NAME`/`VERSION_CODE` in `composeApp/Configuration/DesktopVersion.properties`.

```bash
./scripts/set-version.sh --show
./scripts/set-version.sh --desktop 0.1.15 --desktop-code 15
./scripts/set-version.sh --base 0.2.5 --base-code 76
```

`--base-code`/`--desktop-code` must strictly increase versus the currently-recorded value — `set-version.sh` enforces this and hard-errors otherwise, it's not just a convention. This matters beyond Android's install requirements: the Windows MSI's internal `ProductVersion` (`desktopReleasePackageVersion` in `composeApp/build.gradle.kts`) is deliberately `1.0.<desktop VERSION_CODE>`, decoupled entirely from `VERSION_NAME` — because this fork's MSI `UpgradeCode` is pinned across releases, and Windows Installer needs `ProductVersion` to strictly increase every release for the in-app updater's silent upgrade to work. A value derived from `VERSION_NAME` can't guarantee that (its components reset on upstream syncs), so don't change `desktopReleasePackageVersion` to reflect the marketing version without re-solving that problem.

### Android release automation

`.github/workflows/android-release.yml` (`workflow_dispatch`, modes `dry-run`/`draft`/`publish`) builds and publishes Android releases: it reads the version/tag from the latest bump to `Version.xcconfig` via `scripts/release-metadata.sh`, requires that bump commit to be the *last* change before releasing (fails otherwise), generates release notes from commit history via `scripts/generate-release-notes.sh` (filters out `bump version`/`cleanup`/conventional-commit noise and anything tagged `[skip release notes]`), then builds `:androidApp:assembleFullRelease` using secrets `NUVIO_LOCAL_PROPERTIES_BASE64` and `NUVIO_RELEASE_KEYSTORE_BASE64`, and creates the GitHub release. In other words: bump the base version with `set-version.sh --base`, commit that alone, then dispatch this workflow — don't bundle other changes into the bump commit.

Desktop packages (DMG/MSI/DEB/…) are **not** built by this workflow — see `desktop-release.yml` under Desktop release process below.

GitHub release notes (both Android and desktop) should be short, feature-level bullet points in plain non-technical language (what changed for a user, not what changed in the code) — not a raw commit list. `scripts/generate-release-notes.sh` produces a commit-list draft; rewrite that into a handful of plain-English bullets before publishing, grouping related commits into one line each.

### Desktop release process

**Desktop releases are built and signed only in CI — this fork no longer builds, signs, or uploads release packages locally.** Don't run local packaging to produce a release, hand-create tags, or `gh release upload` locally built installers; local packaging is for testing an installer before a change is merged.

Desktop releases are built on GitHub Actions by `.github/workflows/desktop-release.yml` (inherited from upstream, adapted for this fork). It builds all platforms on hosted runners — macOS DMG (arm64 + x86_64), Windows MSI, Linux Flatpak/DEB/RPM/AppImage — writes `SHA256SUMS.txt`, and creates the tag + GitHub release itself. Modes: `build-only` (artifacts only, any `target`), `dry-run` (validate release state), `draft`, `publish` (these two require `target=all`, and every platform must succeed).

Required setup (GitHub Environment `desktop-release`): secret `NUVIO_DESKTOP_LOCAL_PROPERTIES_BASE64` (base64 `local.properties`; must contain `NUVIO_SUPABASE_URL` and `NUVIO_SUPABASE_ANON_KEY`; Trakt credentials are not needed — Trakt sync UI is commented out in this fork). Optional: `SENTRY_DESKTOP_DSN`, and `SENTRY_AUTH_TOKEN` (source-bundle upload is skipped without it; note `desktopSentry` targets upstream's `nuviomedia` org). Runtime binaries (libmpv, macOS dylibs, `TorrServer.exe`) come from Git LFS. macOS notarization is off (`MACOS_NOTARIZATION_ENABLED: 'false'`, upstream's setting), so DMGs are unsigned; the MSI is not code-signed either.

1. Commit the feature/fix work first.
2. Bump the desktop version and commit that separately (`bump version`, matching existing history — don't bundle it with feature changes): `./scripts/set-version.sh --desktop <version> --desktop-code <code>`. The workflow refuses to release if anything other than the release workflow/scripts or Markdown docs (`*.md`) changed after the bump. On this fork, `VERSION_NAME` is `Major.Minor.Patch.Fork` — the first three segments mirror upstream's last-synced base version, and `Fork` increments by 1 per release since that sync (e.g. `0.1.14.1` → `0.1.14.2`). `Fork` resets to `1` only when the release is itself an upstream sync (e.g. after merging upstream `0.1.15`, the next release is `0.1.15.1`). `VERSION_CODE` always goes up by 1 regardless of the version string.
3. `git push origin <branch>`, then **wait for GitHub Actions to go green on the pushed commit before releasing**. The `Supabase Database Tests` workflow (`rpc-contract` / `fresh-database` / `upgrade-database`) is the one that matters: it fires on any push touching `composeApp/src/**/*.kt`, so an upstream sync almost always triggers it, and it catches a merge that compiled fine but broke the client↔schema contract. The desktop release workflow does not check this for you.
4. Dispatch `Build Desktop Release` on that branch with `mode=draft`, `target=all`. Don't tag manually — the release job creates the tag (bare version, no `v` prefix) at the bump commit. The title is set automatically: `<Major.Minor.Patch> - Fork update <Fork>`, or `<Major.Minor.Patch> - sync with upstream` when `Fork` is `1`.
5. The draft's notes are a generated commit list — rewrite them into short user-facing bullets, then publish it as **Latest**: `gh release edit <version> --repo MichaelCommitsAt3AM/NuvioDesktopButBetter --draft=false --latest`. (`mode=publish` publishes straight away as Latest, but with the generated notes.) Always pass `--repo MichaelCommitsAt3AM/NuvioDesktopButBetter` to `gh release` commands: with both `origin` and `upstream` remotes, `gh` otherwise resolves to `upstream`.

If a CI release job fails, fix the workflow or code and dispatch the workflow again — don't fall back to building locally. If a build job fails, the release job never runs and no tag or release is created, so rerunning is safe (if the final release step itself fails, delete any partial release/tag it left before rerunning). For a risky change, publish the draft as a pre-release instead (`gh release edit <version> --repo MichaelCommitsAt3AM/NuvioDesktopButBetter --draft=false --prerelease`) and promote it later with `gh release edit <version> --repo MichaelCommitsAt3AM/NuvioDesktopButBetter --prerelease=false --latest`.
