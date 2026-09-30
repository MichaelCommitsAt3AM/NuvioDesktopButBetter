# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Nuvio Desktop is a Kotlin Multiplatform + Compose Multiplatform media hub for Windows, macOS, and Linux (alpha, testers-only per README). It's built from the same monorepo lineage as the separate NuvioMobile project — Android and iOS targets exist here too (`androidApp/`, `iosApp/`), sharing the same `com.nuvio.app` package and feature set in `composeApp/src/commonMain/`, but the desktop target (`composeApp/src/desktopMain/`) is this repo's primary focus. It's a client for the Stremio addon ecosystem — it does not host or distribute content itself (see README "Legal & DMCA" section before making any change that touches source/addon handling).

## Commands

```bash
# Run desktop from source
./gradlew :composeApp:run                          # or gradlew.bat on Windows

# Local packaging — for testing an installer only; releases are built in CI (see Desktop release process)
./gradlew :composeApp:packageReleaseDistributionForCurrentOS
./gradlew :composeApp:packageReleaseMsi --rerun-tasks   # Windows
./scripts/build-macos-release-dmgs.sh --package-only    # macOS
./gradlew :composeApp:packageReleaseDeb                  # Linux

# Android (shares the mobile flavor setup)
./gradlew :androidApp:assembleFullDebug
./gradlew :androidApp:assembleFullRelease

# Tests
./gradlew :composeApp:testAndroidHostTest     # Android host tests (also runs commonTest on the JVM)
./gradlew :composeApp:desktopTest             # desktopMain-specific tests
./gradlew :composeApp:iosSimulatorArm64Test   # iOS simulator target
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
2. Bump the desktop version and commit that separately (`bump version`, matching existing history — don't bundle it with feature changes): `./scripts/set-version.sh --desktop <version> --desktop-code <code>`. The workflow refuses to release if anything other than the workflow/release scripts changed after the bump. On this fork, `VERSION_NAME` is `Major.Minor.Patch.Fork` — the first three segments mirror upstream's last-synced base version, and `Fork` increments by 1 per release since that sync (e.g. `0.1.14.1` → `0.1.14.2`). `Fork` resets to `1` only when the release is itself an upstream sync (e.g. after merging upstream `0.1.15`, the next release is `0.1.15.1`). `VERSION_CODE` always goes up by 1 regardless of the version string.
3. `git push origin <branch>`, then **wait for GitHub Actions to go green on the pushed commit before releasing**. The `Supabase Database Tests` workflow (`rpc-contract` / `fresh-database` / `upgrade-database`) is the one that matters: it fires on any push touching `composeApp/src/**/*.kt`, so an upstream sync almost always triggers it, and it catches a merge that compiled fine but broke the client↔schema contract. The desktop release workflow does not check this for you.
4. Dispatch `Build Desktop Release` on that branch with `mode=draft`, `target=all`. Don't tag manually — the release job creates the tag (bare version, no `v` prefix) at the bump commit. The title is set automatically: `<Major.Minor.Patch> - Fork update <Fork>`, or `<Major.Minor.Patch> - sync with upstream` when `Fork` is `1`.
5. The draft's notes are a generated commit list — rewrite them into short user-facing bullets, then publish it as **Latest**: `gh release edit <version> --repo MichaelCommitsAt3AM/NuvioDesktopButBetter --draft=false --latest`. (`mode=publish` publishes straight away as Latest, but with the generated notes.) Always pass `--repo MichaelCommitsAt3AM/NuvioDesktopButBetter` to `gh release` commands: with both `origin` and `upstream` remotes, `gh` otherwise resolves to `upstream`.

If a CI release job fails, fix the workflow or code and dispatch the workflow again — don't fall back to building locally. If a build job fails, the release job never runs and no tag or release is created, so rerunning is safe (if the final release step itself fails, delete any partial release/tag it left before rerunning). For a risky change, publish the draft as a pre-release instead (`gh release edit <version> --repo MichaelCommitsAt3AM/NuvioDesktopButBetter --draft=false --prerelease`) and promote it later with `gh release edit <version> --repo MichaelCommitsAt3AM/NuvioDesktopButBetter --prerelease=false --latest`.
