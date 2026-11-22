# Niche screens parity audit (to do)

The main screens (Home, Search, Library, Settings root and the common settings pages, Details, Downloads) have been checked by hand and match the Kotlin build. The gaps that keep turning up are in rarely visited screens, dialogs and sheets: they exist in the rewrite but don't look like the Kotlin build, or aren't finished (for example the collection folder page and the company/network page, both fixed on 2026-11-22).

This is the list of those less-visited surfaces still to compare. Created 2026-11-22; nothing below has been audited yet.

## How to audit each item

1. Read the Kotlin desktop version (only what renders on desktop: check `isDesktop` branches and `AppFeaturePolicy.desktop.kt`) next to the React counterpart.
2. Note concrete differences: layout and columns, sizes and spacing, header and back button, missing or extra controls, row arrows, empty/loading/error states, and behaviour such as paging.
3. Fix them, add or adjust tests, and record the change in `FORK_CHANGES.md`.
4. Tick the item here. Note anything intentionally different and why.

A source comparison misses small visual details (exact colours, font weights), so a final side-by-side look at both builds is still worthwhile.

## Screens

| Done | Surface | Kotlin source (`composeApp/src/commonMain/kotlin/com/nuvio/app/`) |
|---|---|---|
| [ ] | Collection editor: folder editor | `features/collection/CollectionEditorScreen.kt` |
| [ ] | Collection editor: TMDB, Trakt and add-on source pickers | `features/collection/CollectionEditorScreen.kt` |
| [ ] | Media servers list | `features/settings/MediaServersSettingsPage.kt` |
| [ ] | Single media server page | `features/settings/MediaServerSettingsPage.kt` |
| [ ] | Server sign-in sheet | `features/settings/ServerSignInSheet.kt` |
| [ ] | About | `features/settings/AboutSettingsPage.kt` |
| [ ] | Supporters & Contributors | `features/settings/SupportersContributorsPage.kt` |
| [ ] | Licenses & Attributions | `features/settings/LicensesAttributionsPage.kt` |
| [ ] | Poster customization | `features/settings/PosterCustomizationSettingsPage.kt` |
| [ ] | Hover preview | `features/settings/HoverPreviewSettingsPage.kt` |
| [ ] | Content discovery | `features/settings/ContentDiscoverySettingsPage.kt` |
| [ ] | Debrid | `features/settings/DebridSettingsPage.kt` |
| [ ] | TMDB | `features/settings/TmdbSettingsPage.kt` |
| [ ] | MDBList | `features/settings/MdbListSettingsPage.kt` |
| [ ] | Account | `features/settings/AccountSettingsPage.kt` |
| [ ] | Advanced: update channel, renderer, diagnostics | `features/settings/AdvancedSettingsPage.kt`, `UpdateChannelSettings.kt`, `DesktopRendererSettings.kt` |
| [ ] | Watch party | `features/party/` |

## Dialogs and sheets

| Done | Surface | Kotlin source |
|---|---|---|
| [ ] | Profile PIN entry | `features/profiles/PinEntryDialog.kt` |
| [ ] | Avatar picker | `features/profiles/AvatarPicker.kt` |
| [ ] | Profile background picker | `features/profiles/ProfileBackgroundPicker.kt` |
| [ ] | Server connection dialogs (sign-in) | `features/auth/ServerConnectionDialogs.kt` |
| [ ] | Tracking add-on consent | `features/addons/TrackingAddonConsentDialog.kt` |
| [ ] | P2P consent | `features/p2p/P2pConsentDialog.kt` |
| [ ] | Download quality picker | `features/downloads/DownloadQualityPicker.kt` |
| [ ] | Library list management | `features/library/LibraryListManagementDialog.kt` |
| [ ] | Tracking list picker | `core/ui/TrackingListPickerDialog.kt` |
| [ ] | MDBList library lists picker | `features/settings/MdbListLibraryListsPicker.kt` |
| [ ] | Poster action sheet | `core/ui/PosterActionSheet.kt` |
| [ ] | Continue Watching action sheet | `core/ui/ContinueWatchingActionSheet.kt` |
| [ ] | Episode shuffle sheet | `features/shuffle/EpisodeShuffleSheet.kt` |
| [ ] | Resume prompt on launch | `features/watchprogress/ResumePromptRepository.kt` (and its Home UI) |
| [ ] | Auto-skip segment selection | `features/settings/AutoSkipSegmentSelectionDialog.kt` |
| [ ] | Playback stream dialogs (regex pattern, timeout) | `features/settings/PlaybackStreamDialogs.kt`, `PlaybackSettingsDialogs.kt` |
| [ ] | Theme picker | `features/settings/AppearanceThemePicker.kt` |
| [ ] | Custom theme colour picker | `features/settings/ThemeColorPicker.kt` |
| [ ] | App icon picker | `features/settings/AppIconPicker.kt` |
| [ ] | Navigation bar settings sheet | `features/settings/NavigationBarSettingsSheet.kt` |
| [ ] | Simkl sync info | `features/settings/SimklSyncInfoDialog.kt` |

## Out of scope

- **Player overlays** (subtitles, audio, stream info, P2P stats, gestures): the desktop player window is the Kotlin player itself, so they are already identical.
- **Notifications settings:** Kotlin hides them on desktop (`AppFeaturePolicy.notificationsEnabled = false`).
- **Already matched:** actor page, company/network page, collection folder page, collections management, Downloads, Home layout settings, Tracking settings.
- **Deep links** (`nuvio://`, `stremio://`): deferred separately; see `DESKTOP_UI_PARITY.md`.
