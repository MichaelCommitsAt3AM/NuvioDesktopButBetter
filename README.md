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

## What's different from upstream

- Home Layout and Detail Page sections share Kotlin-style rows with visibility switches and drag reordering. Home catalogs follow addon and collection updates, with catalog renaming, locked pinned collections, and hero source selection.
- Playback sliders show their selectable stops. Skip Segments follows Kotlin's separate detection switch, automatic-skipping dialog, and AnimeSkip/IntroDB credential dialogs, including IntroDB key verification.

**Desktop UI preview**
- Starting a search resets Discover's scroll immediately, and returning from a Discover title keeps Discover instead of reopening an old search.
- Discover remembers your scroll position when you open a title and go back, with the restored cards kept stable as the grid loads.
- Offline launches open Downloads directly. Downloads has the details-style back arrow and local title/episode search; offline watch progress and completed viewing sync to Nuvio Sync after reconnection.
- Library cards use Home's right-click action menu; the extra “Manage lists” buttons below cards have been removed.
- Library has a labeled Downloads button and a fullscreen control in the top-right corner; the header layout toggle has been removed.
- The Downloads content filter labels its combined movies-and-series option “All”.
- Bottom sheets slide up when opened and down when dismissed, including episode actions, narrow-window tracking pickers and the player's audio, subtitle and speed panels.
- On Windows, stream loading stays visible while the native player prepares its loading screen, avoiding the blank handoff before buffering.
- Torbox and Premiumize use Kotlin-style account dialogs with browser approval, automatic status checks, API-key entry and disconnect actions.
- Returning Home reuses its rendered cards and saved scroll position, and the top-bar bubble avoids repeated layout measurements during its animation.
- Horizontal episode rows use the same circular scrolling arrows as Home. Unsupported hero trailer previews are clearly marked in Settings.
- The rewrite offers to resume playback on launch when you close the app from the player; the Continue Watching setting controls the prompt.
- The rewrite has a signed desktop updater with download progress, installation and restart. Release CI builds Windows MSI, macOS DMG, and Linux AppImage/DEB/RPM/Flatpak packages with bundled Java; Flatpak updates stay with the system installation.
- Rewrite releases use the existing desktop build-number sequence and Windows MSI upgrade identity. Testing the actual Kotlin-to-rewrite upgrade remains a release gate.
- The rewrite's window, installer and Start Menu branding use Nuvio, matching the original desktop app.
- Top Bar is the default desktop layout. The rewrite now includes Kotlin-style glass tint, hover blur, adaptive labels and a moving, stretchy selection highlight.
- The rewrite's top bar highlight follows Home, Search, Library and Settings after navigation, including when development effects restart.
- Rewrite screen changes now take input priority so the destination can appear promptly alongside the top bar selection.
- The rewrite’s Collections settings follow the Kotlin screen, with drag reordering, JSON clipboard export, and validated import.
- An opt-in React/Tauri desktop UI is being developed while keeping the existing Kotlin backend and native player. See [the migration notes](docs/DESKTOP_UI_REWRITE.md) for build instructions and remaining feature work.
- The preview now includes profiles/PINs, catalog discovery, rich details, cloud library, collections, downloads and expanded settings. Full animation, language and release-delivery parity is still in progress; [the coverage checklist](docs/DESKTOP_UI_PARITY.md) tracks what remains.
- Profile PINs use a four-dot keypad with automatic submission, visible errors and lockout feedback. Cloud PIN setup, verification, removal and account-password recovery have been repaired.
- The edit profile screen includes a Delete profile button with confirmation for secondary profiles.
- The streams selection screen uses the same background dimming as title details.
- Holding Settings opens Kotlin-style profile avatar tiles with opening/closing transitions. Unfinished episodes show saved progress on their thumbnails; stream loading keeps the title background throughout.
- Stream selection and autoplay fetch fresh sources on every entry, without reusing local stream results. Expanded Home catalogs use the same circular back arrow as title details.
- Emoji in stream descriptions no longer break search results. Sources appear with settled debrid labels and ordering; requests time out and diagnostic logs record search failures.
- Settings now follows the Kotlin category/sidebar and nested-page structure, with connected controls for appearance, playback, Home, posters, Continue Watching, addons, integrations, plugins, account, About and Advanced. Detailed screen-by-screen parity and remaining differences are tracked in [the Settings comparison notes](docs/DESKTOP_UI_PARITY.md).
- Movie cards share Home’s sizes, label typography, corners, spacing, loading placeholders and expanded previews across screens.
- Settings search follows Kotlin’s word matching across setting names, descriptions and categories, with clearable results and working page/action targets.
- Continue Watching’s card style previews match the original Kotlin diagrams, including the poster progress pill and selection checkmark.
- Settings → Tracking now follows the Kotlin account cards and source pickers, with Simkl sign-in, approval codes, syncing, disconnect confirmation and anime preferences. The MDBList login card is temporarily hidden until its build credentials are configured.
- The profile chooser now follows the original centered logo, gradient backdrop, circular avatars and in-place Manage Profiles mode. It opens on launch when Remember Last Profile is off, and is available through the profile menu.
- After profile selection, the preview shows the original-style centered Nuvio logo and animated loading arc over the profile backdrop until Home is ready, then fades into the app.
- Downloads opens from Library. Hold the Settings navigation item to switch profiles; its icon shows the current avatar. Content is enlarged independently of the top bar, and horizontal card rows have scroll arrows.
- While streams load, the stream-selection screen shows active scraper names and shimmer cards like the Kotlin desktop build.
- Continue Watching shows saved progress immediately, updates as synchronization finishes, and uses the same shimmer placeholders as Search while its initial snapshot loads.
- Expanded title previews close with a short fade and subtle shrink across Home, Search and Library.
- Title action menus and Continue Watching action menus close with a coordinated fade and subtle movement.
- Search displays each addon's results as they arrive; Downloads uses a more compact layout and controls.
- Portable rewrite builds use bundled backend resources and Java without depending on the source checkout; Windows WebView2 is required.
- The rewrite's Windows MSI includes bundled Java, backend resources, Start Menu shortcuts, automatic WebView2 installation when needed, and the original app's upgrade identity.
- The rewrite's Windows backend starts in the background without opening a terminal window.
- Player keyboard shortcuts work when the rewrite window is focused, including after Alt-Tab, without clicking the video first.
- Fullscreen is shared between the rewrite UI and its embedded Windows player; closing playback keeps the selected mode, and the player can exit fullscreen entered from the UI.
- Picture-in-Picture in the rewrite shows a restore button in the main window; exiting PiP returns video and controls to the app.
- The download size filter shows a marker at every selectable GB step, matching the other stepped sliders.
- In-app notifications confirm when a download starts and finishes, including while browsing other screens.
- Right-click menus appear on designed action areas and text fields; ordinary rewrite backgrounds and navigation no longer open the browser menu.
- Startup shows cached profiles as soon as login is restored, while cloud profiles, add-ons and avatar choices refresh in the background.
- Opening a stream prepares the Kotlin player host while its URL resolves, keeping the existing loading screen and controls.
- Details playback buttons use the Kotlin resume and episode-selection logic, and playback loading artwork follows the selected title when resuming from Continue Watching.
  Series episodes open on the season containing the resolved playback episode, while allowing manual season changes.
  Continue Watching starts the shared Kotlin cloud sync on sign-in and profile selection, so progress from other devices can populate Home without a window focus change.
- The preview profile editor can sync add-ons with any other profile. Linked profiles share additions, removals, ordering and enabled states; unlinking keeps the current list. The cloud migration is installed on the linked backend.

- Home is being aligned against the installed Compose app: full-width hero, in-card Continue Watching details, poster actions/previews and hover arrows. See [the Home comparison](docs/DESKTOP_HOME_COMPARISON.md) for verified behavior and remaining differences.

**Your account and sync**
- This build is mainly optimized for syncing through NuvioSync.
- Sign-in and sync run on this fork's own server, separate from the official Nuvio service.
- Library changes sync between your devices faster and more reliably.

**Profiles**
- When you create a profile, you can copy all of the main profile's addons or just the ones you pick. After that, each profile manages its own addons.
- New profiles start with the same settings and home screen layout as the profile you're using, not a blank default.
- Connect your debrid service once and every profile can use it.

**Finding the right stream**
- Releases whose titles match the movie or series are preferred over clear mismatches, including during automatic playback. This defaults to on and can be switched off under **Settings → Streams**.
- Debrid results are sorted by your preferred language first, then by quality, so the version you want is near the top.
- English releases without a language label are no longer pushed to the bottom or hidden.
- 20 more languages to choose from in debrid language preferences.
- You can paste a debrid API key (for example Torbox) instead of signing in through the browser.
- New **Data saver** mode on the streams list hides very large files (like 4K remuxes). You set the maximum quality, source type and file size.
  The rewrite’s quality switch uses the same Kotlin filter and correctly handles switching to Data saver and back.

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
