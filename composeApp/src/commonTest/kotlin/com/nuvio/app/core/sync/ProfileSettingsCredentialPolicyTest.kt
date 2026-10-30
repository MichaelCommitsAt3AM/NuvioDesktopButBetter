package com.nuvio.app.core.sync

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class ProfileSettingsCredentialPolicyTest {
    @Test
    fun `older settings blobs preserve configured integration switches but explicit false wins`() {
        listOf(
            Triple(PROFILE_TMDB_SETTINGS_FEATURE, "tmdb_enabled", "tmdb_use_credits"),
            Triple(PROFILE_MDBLIST_SETTINGS_FEATURE, "mdblist_enabled", "mdblist_use_tomatoes"),
            Triple(PROFILE_DEBRID_SETTINGS_FEATURE, "debrid_enabled", "debrid_cloud_library_enabled"),
            Triple(PROFILE_PLAYER_SETTINGS_FEATURE, "animeskip_enabled", "skip_intro_enabled"),
        ).forEach { (feature, enabled, module) ->
            val local = buildJsonObject { put(enabled, encodeSyncBoolean(true)); put(module, encodeSyncBoolean(false)) }
            val absent = preservingLocalProfileCredentials(feature, buildJsonObject {}, local)
            assertEquals(local, absent, feature)
            val remote = buildJsonObject { put(enabled, encodeSyncBoolean(false)) }
            val merged = preservingLocalProfileCredentials(feature, remote, local)
            assertEquals(false, merged.decodeSyncBoolean(enabled), feature)
            assertEquals(false, merged.decodeSyncBoolean(module), feature)
        }
    }

    @Test
    fun `credential fields are removed from profile settings payloads`() {
        val payload = buildJsonObject {
            put("debrid_enabled", JsonPrimitive(true))
            put("debrid_torbox_api_key", JsonPrimitive("secret"))
            put("debrid_premiumize_api_key", JsonPrimitive("secret"))
        }

        val sanitized = withoutProfileCredentials(PROFILE_DEBRID_SETTINGS_FEATURE, payload)

        assertFalse("debrid_torbox_api_key" in sanitized)
        assertFalse("debrid_premiumize_api_key" in sanitized)
        assertEquals(JsonPrimitive(true), sanitized["debrid_enabled"])
    }

    @Test
    fun `legacy remote credential fields cannot overwrite local credentials`() {
        val remote = buildJsonObject {
            put("mdblist_enabled", JsonPrimitive(true))
            put("mdblist_api_key", JsonPrimitive("remote"))
        }
        val local = buildJsonObject {
            put("mdblist_api_key", JsonPrimitive("local"))
        }

        val merged = preservingLocalProfileCredentials(PROFILE_MDBLIST_SETTINGS_FEATURE, remote, local)

        assertEquals(JsonPrimitive("local"), merged["mdblist_api_key"])
        assertEquals(JsonPrimitive(true), merged["mdblist_enabled"])
    }

    @Test
    fun `legacy TMDB credentials are discarded from local and remote settings`() {
        val remote = buildJsonObject {
            put("tmdb_enabled", JsonPrimitive(true))
            put("tmdb_api_key", JsonPrimitive("remote"))
        }
        val local = buildJsonObject {
            put("tmdb_api_key", JsonPrimitive("local"))
        }

        val merged = preservingLocalProfileCredentials(PROFILE_TMDB_SETTINGS_FEATURE, remote, local)
        val sanitized = withoutProfileCredentials(PROFILE_TMDB_SETTINGS_FEATURE, local)

        assertFalse("tmdb_api_key" in merged)
        assertFalse("tmdb_api_key" in sanitized)
        assertEquals(JsonPrimitive(true), merged["tmdb_enabled"])
    }
}
