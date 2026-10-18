# Known issues

Fork-specific issues that are understood well enough to describe but not yet fixed. This is not the
upstream issue tracker.

## Upstream watch parties and media-server cloud sync are unavailable

Recorded 2026-10-18 during the sync to upstream `e808a584` (`0.1.31-alpha`).
The imported watch-party code needs the upstream `watch_party_*` RPCs and realtime
service, which this fork does not host. `officialConfiguration().capabilities.watchParty`
stays false; a React party/invite flow is deferred with that backend dependency.
Media-server connections work locally, but `ServerCapabilities.mediaServerSync`
defaults false so ordinary profile sync does not call absent
`sync_pull_media_servers` / `sync_push_media_servers` RPCs. Do not enable either
service by simply removing the static RPC exemptions: supply forward migrations,
authorization/contract tests and the required React/event flows first. No production
migration was deployed by the sync. See `UPSTREAM_SYNC_2026-10-18.md`.

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
