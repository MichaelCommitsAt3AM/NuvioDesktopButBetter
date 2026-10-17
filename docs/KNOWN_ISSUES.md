# Known issues

Fork-specific issues that are understood well enough to describe but not yet fixed. This is not the
upstream issue tracker.

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
