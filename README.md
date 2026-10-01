<div align="center">

  <img src="composeApp/src/commonMain/composeResources/drawable/app_logo_wordmark.png" alt="Nuvio" width="300" />
  <br />
  <br />

  [![Contributors][contributors-shield]][contributors-url]
  [![Forks][forks-shield]][forks-url]
  [![Stargazers][stars-shield]][stars-url]
  [![Issues][issues-shield]][issues-url]
  [![License][license-shield]][license-url]

  <p>
    A fork of Nuvio Desktop with extra features and fixes.
    <br />
    A desktop media app for Windows, macOS, and Linux: browse, organize, and play media from sources you add.
  </p>

</div>

## About this fork

**Nuvio Desktop But Better** is a personal fork of [Nuvio Desktop](https://github.com/NuvioMedia/NuvioDesktop). It follows upstream closely and merges new upstream releases regularly, and adds its own improvements, fixes and changes on top.

Nuvio Desktop is a media client for browsing metadata, managing collections and watch progress, downloading media, and playing streams from user-installed extensions or user-provided sources.

## ⚠️ Alpha Software - Testers Only

Like upstream, this is alpha software intended for testers. It is not suitable for daily use.

Expect breaking changes with every update. Features, settings, stored data, and compatibility may change or stop working without notice. Please report any issues you run into.

## What's different from upstream

**Your account and sync**
- Sign-in and sync run on this fork's own server, separate from the official Nuvio service.
- Library changes sync between your devices faster and more reliably.

**Profiles**
- When you create a profile, you can copy all of the main profile's addons or just the ones you pick. After that, each profile manages its own addons.
- New profiles start with the same settings and home screen layout as the profile you're using, not a blank default.
- Connect your debrid service once and every profile can use it.

**Finding the right stream**
- Debrid results are sorted by your preferred language first, then by quality, so the version you want is near the top.
- English releases without a language label are no longer pushed to the bottom or hidden.
- 20 more languages to choose from in debrid language preferences.
- You can paste a debrid API key (for example Torbox) instead of signing in through the browser.
- New **Data saver** mode on the streams list hides very large files (like 4K remuxes). You set the maximum quality, source type and file size.

**Watching**
- Subtitles are ready when playback starts, so the first subtitle switch no longer freezes the video.
- Player controls appear when you move over the video and get out of the way when you don't.
- Press **F** to toggle fullscreen and **Esc** to leave it.
- Keyboard shortcuts work right after switching back to the app, without clicking the video first.
- Fixed the app sometimes opening as a tiny sliver after being closed in fullscreen. Fullscreen also works properly on multi-monitor setups.
- Fewer player crashes on Windows.

**Speed and smoothness**
- The app window appears faster at startup.
- Posters and artwork load faster and scroll smoothly on the home screen.
- Title pages open right away and fill in extra details as they load.
- Smoother scrolling with a mouse wheel or trackpad.
- Arrow buttons appear when you hover a row, so you can page through it.
- "More like this" shows more related titles.
- Addons that fail to load at startup now retry on their own instead of staying empty.
- Continue Watching no longer gets stuck showing items without their titles or artwork.

**Updates**
- The app updates itself from this fork's releases.
- On Windows, updates install quietly in the background and the app reopens by itself.

**Removed or turned off**
- **Trakt is deprecated in this fork and may be removed in a future release.** Trakt changed its terms so that features which used to be free now require a paid account. I, along with many others, don't agree with that change. Trakt sign-in and sync are already hidden in this fork's builds.
- Signing in with a code from another device is turned off, because this fork's server doesn't support it yet.

For the full technical list of changes, see [`docs/FORK_CHANGES.md`](docs/FORK_CHANGES.md).

## Installation

Download the latest desktop build from [GitHub Releases](https://github.com/MichaelCommitsAt3AM/NuvioDesktopButBetter/releases/latest).

Release packages are provided for supported desktop platforms:

- Windows: MSI installer
- macOS: DMG installer (unsigned)
- Linux: DEB, RPM, FLATPAK and AppImage available.

## Development

```bash
git clone https://github.com/MichaelCommitsAt3AM/NuvioDesktopButBetter.git
cd NuvioDesktopButBetter
```

Run from source:

```bash
./gradlew :composeApp:run
```

On Windows PowerShell:

```powershell
.\gradlew.bat :composeApp:run
```

Build a package for the current host. This is for testing an installer locally; official releases are built by GitHub Actions:

```bash
./gradlew :composeApp:packageReleaseDistributionForCurrentOS
```

Platform-specific packaging:

```bash
# Windows
./gradlew :composeApp:packageReleaseMsi --rerun-tasks

# macOS
./scripts/build-macos-release-dmgs.sh --package-only

# Linux
./gradlew :composeApp:packageReleaseDeb
```

## Project Structure

- `composeApp/` contains the app code.
- `composeApp/src/commonMain/` contains shared UI, features, repositories, and platform-agnostic logic.
- `composeApp/src/desktopMain/` contains desktop-specific integrations.
- `supabase/` contains this fork's backend (database migrations and edge functions). See [`supabase/README.md`](supabase/README.md).
- `composeApp/Configuration/DesktopVersion.properties` contains the desktop release version and build code.

## Versioning

Desktop versions use the format `Major.Minor.Patch.Fork`. The first three numbers match the upstream release this fork last synced with. `Fork` counts this fork's releases since that sync, and resets to `1` on each upstream sync (for example `0.1.14.1` → `0.1.14.2`, then `0.1.15.1` after syncing upstream `0.1.15`).

Versions are set in `composeApp/Configuration/DesktopVersion.properties` using the version helper:

```bash
./scripts/set-version.sh --show
./scripts/set-version.sh --desktop 0.1.15.2 --desktop-code 16
```

The build code must go up with every release.

## Legal & DMCA

Nuvio functions solely as a client-side interface for browsing metadata and playing media provided by user-installed extensions and/or user-provided sources. It is intended for content the user owns or is otherwise authorized to access.

Nuvio is not affiliated with any third-party extensions, catalogs, sources, or content providers. It does not host, store, or distribute any media content.

For comprehensive legal information, including our full disclaimer, third-party extension policy, and DMCA/Copyright information, please visit our [Legal & Disclaimer Page](https://nuvioapp.space/legal).

## Built With

- Kotlin Multiplatform
- Compose Multiplatform
- Kotlin
- Compose Desktop packaging
- Native desktop player integrations

## Credits

This fork is built on [Nuvio Desktop](https://github.com/NuvioMedia/NuvioDesktop) by the NuvioMedia team and its contributors.

## Upstream Star History

<a href="https://www.star-history.com/#NuvioMedia/NuvioDesktop&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=NuvioMedia/NuvioDesktop&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=NuvioMedia/NuvioDesktop&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=NuvioMedia/NuvioDesktop&type=date&legend=top-left" />
 </picture>
</a>

<!-- MARKDOWN LINKS & IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/MichaelCommitsAt3AM/NuvioDesktopButBetter.svg?style=for-the-badge
[contributors-url]: https://github.com/MichaelCommitsAt3AM/NuvioDesktopButBetter/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/MichaelCommitsAt3AM/NuvioDesktopButBetter.svg?style=for-the-badge
[forks-url]: https://github.com/MichaelCommitsAt3AM/NuvioDesktopButBetter/network/members
[stars-shield]: https://img.shields.io/github/stars/MichaelCommitsAt3AM/NuvioDesktopButBetter.svg?style=for-the-badge
[stars-url]: https://github.com/MichaelCommitsAt3AM/NuvioDesktopButBetter/stargazers
[issues-shield]: https://img.shields.io/github/issues/MichaelCommitsAt3AM/NuvioDesktopButBetter.svg?style=for-the-badge
[issues-url]: https://github.com/MichaelCommitsAt3AM/NuvioDesktopButBetter/issues
[license-shield]: https://img.shields.io/github/license/MichaelCommitsAt3AM/NuvioDesktopButBetter.svg?style=for-the-badge
[license-url]: https://github.com/MichaelCommitsAt3AM/NuvioDesktopButBetter/blob/Dev/LICENSE
