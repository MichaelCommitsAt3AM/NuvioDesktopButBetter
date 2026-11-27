# Known issues

Fork-specific issues that are understood well enough to describe but not yet fixed. This is not the
upstream issue tracker.

## Watch parties: backend is live, desktop React flow is not built

Updated 2026-11-13. The `watch_party_*` RPCs, Realtime channel policies and cleanup job are deployed
from the `nuvio_backend` repository (`20261113100000_watch_party.sql`), so
`officialConfiguration().capabilities.watchParty` is now true on desktop (mobile already was).
`PartyRepository` also asks `watch_party_enabled()`, so `select public.watch_party_set_enabled(false)`
on the backend turns the feature off for every client and ends live parties.

Desktop (React): a Watch Party button on Home (left of the fullscreen button) opens a dialog to join by code,or to see the current party, copy its code, open its streams page and leave. The last party is rememberedacross restarts so the dialog can offer Rejoin. A guest opening the party's title auto-plays the host's ownlink. Live Realtime delivery has been tried with one phone and the desktop, not at scale.

Media-server cloud sync is still unavailable: `ServerCapabilities.mediaServerSync` defaults false so
ordinary profile sync does not call the absent `sync_pull_media_servers` / `sync_push_media_servers`
RPCs. Do not enable it by simply removing the static RPC exemptions: supply forward migrations,
authorization/contract tests and the required React/event flows first. See
`UPSTREAM_SYNC_2026-10-18.md` for the original sync note.

## "Resolve playable links" sometimes turns itself off

Reported 2026-10-17. The **Settings → Connected Services → Resolve playable links** toggle
(`DebridSettingsRepository.enabled`) is occasionally found off even though the user leaves it on all
the time. It may or may not be tied to installing an update, and it has not been reproduced on
demand, so the trigger is unconfirmed.

Where to look if it recurs:

- **The sync pull replaces the whole payload.** `ProfileSettingsSync.applyRemoteBlob` calls
  `DebridSettingsStorage.replaceFromSyncPayload`, which removes *every* synced debrid key and then
  re-applies only the keys present in the remote blob. A remote blob that is missing
  `debrid_enabled` (for example one last written by another platform or an older build) therefore
  deletes the local value, and `DebridSettingsRepository.loadFromDisk` falls back to `false`.
  Fix direction: preserve local values for keys absent from the remote payload instead of wiping them.
- **Provider detection can force it off.** `DebridSettingsRepository.loadFromDisk` computes
  `enabled = stored && hasResolverProvider()`, and `disableIfNoResolver()` persists `false` when no
  resolver provider key is visible. A transient or blank provider key at load time can therefore flip
  it off for good.

Debugging aid: the local value lives in `%APPDATA%\Nuvio\nuvio_debrid_settings.properties` as
`debrid_enabled_1`.

## Shared collection folders show the same titles for custom catalogs

Added 2026-11-22. Studio and decade folders from a shared collection point at AIOMetadata custom discover catalogs (`tmdb.discover.movie.dreamworks.mp42jyh6`, `…best_movies_of_80s.mlyccp2c`). Their filters live in the collection author's AIOMetadata configuration, not in the ID. When the user's own configuration lacks them, `findCollectionCatalog`'s unlisted-catalog fallback (`collection/CollectionCatalogResolver.kt`) still requests them, and AIOMetadata 4.1.0 answers any unknown ID, even an invented one, with the same default list (Iron Man, The Odyssey, …). So every such folder row shows identical, unrelated titles. Verified against the add-on directly. Options: limit the fallback to IDs AIOMetadata knows globally (`streaming.*`, built-in `tmdb.*` lists) and show "not in your add-on configuration" for the rest, or detect identical default responses. Not changed yet, pending a decision.

## Upstream 0.1.39 items deferred for the React shell

Added 2026-11-27. See `UPSTREAM_SYNC_2026-11-27.md`.

- **JDK 25 private runtime.** Upstream packages with JDK 25 and adds `--enable-native-access=ALL-UNNAMED`. The rewrite still jlinks its private runtime from the CI JDK 17 (`scripts/desktop-ui/bundle-java.mjs`, `desktop-release.yml`), and `supervisor.rs` does not pass the flag. Move both together and recheck native loading (player bridge, JNA, Skiko) on all three platforms.
- **Bridge JVM heap flags.** Upstream's `-Xms128m -Xmx2g`, G1 free-ratio and periodic-GC flags only reach the Compose launcher. The Kotlin bridge started by `supervisor.rs` still sizes its heap from machine RAM. Measure the bridge's idle and peak memory before adopting them.
- **Device-language Traditional Chinese.** A saved `zh-Hant` choice now resolves correctly, but `pickLocale` maps device languages such as `zh-TW` or `zh-HK` to Simplified `zh` (it only matches the base language).

## Upstream 0.1.38 features not yet in the React shell

Added 2026-11-22.

- **Gamepad navigation.** Done 2026-11-26 with the browser Gamepad API in the React shell and `player-ui/gamepad.js` in the player overlay; not yet tried with a physical controller. See FORK_CHANGES.md.
- **Plex and Silo sign-in were not tried against real servers.** The guided dialog drives upstream's unchanged sign-in flows and is covered by unit tests only. Check a real plex.tv approval, Plex Home PIN and a Silo code/password sign-in before relying on it.

## Upstream 0.1.37 features not yet in the React shell

Added 2026-11-17. The Kotlin code is merged and compiled, but these have no bridge or React flow:

- **User ratings.** Done 2026-11-26 (rating chip, sheet, Rate episode and the Tracking Ratings source); see FORK_CHANGES.md.
- **Audio amplification, audio delay and center mix.** The player runtime supports them; the native overlay and React settings were not checked for controls, so assume they are missing.
- **Mpv subtitle auto-sync.** The coordinator is wired into the desktop player surface; the rewrite's auto-sync settings and result messaging were not re-reviewed against it.

`StreamSearchSessionsTest` lives only in the Android host tests, which this Windows desktop-only tree does not run.
