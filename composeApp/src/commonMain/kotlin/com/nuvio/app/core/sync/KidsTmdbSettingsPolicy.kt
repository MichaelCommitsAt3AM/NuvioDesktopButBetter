package com.nuvio.app.core.sync

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

internal const val KIDS_TMDB_SHARED_SYNC_PLATFORM = "shared_tmdb_v1"

/** Merge this profile's enrichment and cast preferences, preserving other settings. */
internal fun withKidsTmdbEnrichment(settings: JsonObject, enabled: Boolean, useCredits: Boolean? = null, useProductions: Boolean? = null, useNetworks: Boolean? = null): JsonObject {
    val features = settings["features"] as? JsonObject ?: JsonObject(emptyMap())
    val tmdb = features[PROFILE_TMDB_SETTINGS_FEATURE] as? JsonObject ?: JsonObject(emptyMap())
    val updated = (withoutProfileCredentials(PROFILE_TMDB_SETTINGS_FEATURE, tmdb) +
        ("tmdb_enabled" to encodeSyncBoolean(enabled))).toMutableMap()
    useCredits?.let { updated["tmdb_use_credits"] = encodeSyncBoolean(it) }
    useProductions?.let { updated["tmdb_use_productions"] = encodeSyncBoolean(it) }
    useNetworks?.let { updated["tmdb_use_networks"] = encodeSyncBoolean(it) }
    return JsonObject(settings + ("features" to JsonObject(features + (PROFILE_TMDB_SETTINGS_FEATURE to JsonObject(updated)))))
}

internal fun kidsTmdbEnabledPreference(local: Boolean?, remote: JsonObject): Boolean =
    local ?: ((remote["features"] as? JsonObject)?.get(PROFILE_TMDB_SETTINGS_FEATURE) as? JsonObject)
        ?.decodeSyncBoolean("tmdb_enabled") ?: true

internal fun kidsTmdbCreditsPreference(local: Boolean?, remote: JsonObject): Boolean =
    local ?: ((remote["features"] as? JsonObject)?.get(PROFILE_TMDB_SETTINGS_FEATURE) as? JsonObject)
        ?.decodeSyncBoolean("tmdb_use_credits") ?: true

/** Local or synced explicit production choices win; missing kids preferences default off. */
internal fun kidsTmdbProductionPreference(local: Boolean?, remote: JsonObject, key: String): Boolean =
    local ?: tmdbSettingsFromProfileBlob(remote).decodeSyncBoolean(key) ?: false

/** Only the sanitized TMDB preference object, never API keys, from a platform settings blob. */
internal fun tmdbSettingsFromProfileBlob(blob: JsonObject?): JsonObject =
    ((blob?.get("features") as? JsonObject)?.get(PROFILE_TMDB_SETTINGS_FEATURE) as? JsonObject)
        ?.let { withoutProfileCredentials(PROFILE_TMDB_SETTINGS_FEATURE, it) }
        ?: JsonObject(emptyMap())

internal fun tmdbSettingsWithPreferences(
    settings: JsonObject,
    enabled: Boolean?,
    useCredits: Boolean?,
    useProductions: Boolean? = null,
    useNetworks: Boolean? = null,
): JsonObject {
    val updated = withoutProfileCredentials(PROFILE_TMDB_SETTINGS_FEATURE, settings).toMutableMap()
    enabled?.let { updated["tmdb_enabled"] = encodeSyncBoolean(it) }
    useCredits?.let { updated["tmdb_use_credits"] = encodeSyncBoolean(it) }
    useProductions?.let { updated["tmdb_use_productions"] = encodeSyncBoolean(it) }
    useNetworks?.let { updated["tmdb_use_networks"] = encodeSyncBoolean(it) }
    return JsonObject(updated)
}

/**
 * Overlay the profile's shared TMDB preferences on one platform blob. Other platform-specific
 * settings (player, theme, debrid, ...) and local credentials stay untouched.
 */
internal fun withSharedTmdbSettings(blob: JsonObject, shared: JsonObject): JsonObject {
    val sanitized = withoutProfileCredentials(PROFILE_TMDB_SETTINGS_FEATURE, shared)
    if (sanitized.isEmpty()) return blob
    val features = blob["features"] as? JsonObject ?: JsonObject(emptyMap())
    val local = (features[PROFILE_TMDB_SETTINGS_FEATURE] as? JsonObject)
        ?.let { withoutProfileCredentials(PROFILE_TMDB_SETTINGS_FEATURE, it) }
        ?: JsonObject(emptyMap())
    val merged = JsonObject(local + sanitized)
    return JsonObject(blob + ("features" to JsonObject(features + (PROFILE_TMDB_SETTINGS_FEATURE to merged))))
}

/** Minimal, self-describing record for the shared_tmdb_v1 bucket. No credentials are ever written. */
internal fun sharedTmdbRecord(settings: JsonObject): JsonObject = buildJsonObject {
    put("version", 1)
    put(PROFILE_TMDB_SETTINGS_FEATURE, withoutProfileCredentials(PROFILE_TMDB_SETTINGS_FEATURE, settings))
}

internal fun sharedTmdbSettings(record: JsonObject?): JsonObject? =
    (record?.get(PROFILE_TMDB_SETTINGS_FEATURE) as? JsonObject)
        ?.let { withoutProfileCredentials(PROFILE_TMDB_SETTINGS_FEATURE, it) }

/** Prefer the current platform's explicit choices, filling gaps from the other platform. */
internal fun migratedTmdbSettings(platformBlobs: List<JsonObject>, kids: Boolean): JsonObject {
    val merged = JsonObject(platformBlobs.asReversed().fold(emptyMap<String, kotlinx.serialization.json.JsonElement>()) { result, blob ->
        result + tmdbSettingsFromProfileBlob(blob)
    })
    if (!kids) return merged
    val (enabled, credits) = legacyKidsTmdbPreferences(platformBlobs)
    return tmdbSettingsWithPreferences(merged, enabled, credits,
        useProductions = merged.decodeSyncBoolean("tmdb_use_productions") ?: false,
        useNetworks = merged.decodeSyncBoolean("tmdb_use_networks") ?: false)
}

/**
 * Legacy migration before a shared record exists. An explicit true on either platform wins, so a
 * copied/default false on the other platform cannot turn a configured kids profile back off. If
 * no platform stored a preference at all, use the kids setup default: enrichment on, cast off.
 */
internal fun legacyKidsTmdbPreferences(platformBlobs: List<JsonObject>): Pair<Boolean, Boolean> {
    val settings = platformBlobs.map(::tmdbSettingsFromProfileBlob).filter { it.isNotEmpty() }
    val enabled = settings.mapNotNull { it.decodeSyncBoolean("tmdb_enabled") }
    val credits = settings.mapNotNull { it.decodeSyncBoolean("tmdb_use_credits") }
    val enabledValue = when {
        enabled.any { it } -> true
        enabled.isNotEmpty() -> false
        else -> true
    }
    val creditsValue = when {
        credits.any { !it } -> false
        credits.isNotEmpty() -> true
        else -> false
    }
    return enabledValue to creditsValue
}
