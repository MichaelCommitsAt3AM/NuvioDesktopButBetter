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
