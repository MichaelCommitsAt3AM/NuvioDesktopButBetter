// Fork-only MDBList copy: no canonical Kotlin source exists for these keys,
// so they stay English-only. Every other tracking string resolves through the
// generated locale catalog (scripts/desktop-ui/generate-locales.mjs).
import { formatPattern, translateActive } from '../../i18n/strings';

const copy: Record<string, string> = {
  "settings_mdblist_library_description": "Watchlist and your static movie and show lists.",
  "settings_mdblist_progress_description": "Watched history, resume progress and Next Up from MDBList.",
  "settings_mdblist_connect": "Connect MDBList",
  "settings_mdblist_connected_as": "Connected as %1$s",
  "settings_mdblist_connected_description": "Sync watched history and playback progress across devices",
  "settings_mdblist_sign_in_description": "Sync watched history and playback progress across devices",
  "settings_mdblist_finish_sign_in": "Finish connection approval",
  "settings_mdblist_approval_description": "Approve the connection in your MDBList account.",
  "settings_mdblist_open_login": "Open sign-in page",
  "settings_mdblist_disconnect": "Disconnect MDBList",
  "settings_mdblist_missing_credentials": "MDBList connection is unavailable in this build.",
  "settings_mdblist_sync_now": "Sync now",
  "settings_mdblist_visit": "Visit MDBList",
  "settings_mdblist_unavailable": "Could not sync with MDBList. Please try again.",
  "settings_mdblist_rate_limited": "MDBList’s request limit has been reached. Syncing will resume after the limit resets.",
  "settings_mdblist_auth_expired": "This code has expired. Try again to get a new code.",
  "settings_mdblist_auth_denied": "Connection was declined. Try again to connect your account.",
  "settings_mdblist_auth_revoked": "Your MDBList connection has expired or been revoked. Connect again to resume syncing.",
  "settings_mdblist_invalid_response": "MDBList returned an incomplete response. Please try again.",
  "settings_mdblist_write_required": "MDBList did not grant permission to update watch history. Reconnect and allow write access.",
  "settings_mdblist_disconnect_description": "Stop sending watch updates from this profile. Your MDBList history is kept.",
  "settings_mdblist_revoke_failed": "Disconnected on this device. Remove this app in your MDBList account settings to revoke its access.",
  "settings_mdblist_account_fallback": "MDBList user",
  "settings_mdblist_syncing": "Syncing watched history and playback progress…",
  "settings_mdblist_last_synced": "Last synced %1$s"
};
export function trackingText(key: string, ...args: Array<string | number>) {
  if (key in copy) return formatPattern(copy[key], args);
  return translateActive(key, args);
}
