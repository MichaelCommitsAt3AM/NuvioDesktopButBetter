package com.nuvio.app.core.sync

import kotlinx.serialization.json.*
import kotlin.test.*

class KidsTmdbSettingsPolicyTest {
    @Test fun productionDefaultsOverrideCopiedSettingsAndPreserveLaterOptIns() {
        val copied = withKidsTmdbEnrichment(JsonObject(emptyMap()), true,
            useProductions = true, useNetworks = true)
        val child = withKidsTmdbEnrichment(copied, true,
            useProductions = false, useNetworks = false)
        for (key in listOf("tmdb_use_productions", "tmdb_use_networks")) {
            assertFalse(kidsTmdbProductionPreference(null, child, key))
            assertFalse(kidsTmdbProductionPreference(false, copied, key))
            assertTrue(kidsTmdbProductionPreference(true, child, key))
            assertFalse(kidsTmdbProductionPreference(null, JsonObject(emptyMap()), key))
        }
        val optedIn = tmdbSettingsWithPreferences(tmdbSettingsFromProfileBlob(child), null, null,
            useProductions = true, useNetworks = true)
        val shared = sharedTmdbSettings(sharedTmdbRecord(optedIn))!!
        val onAnotherDevice = withSharedTmdbSettings(child, shared)
        assertTrue(kidsTmdbProductionPreference(null, onAnotherDevice, "tmdb_use_productions"))
        assertTrue(kidsTmdbProductionPreference(null, onAnotherDevice, "tmdb_use_networks"))
        val edited = withKidsTmdbEnrichment(onAnotherDevice, true)
        assertTrue(kidsTmdbProductionPreference(null, edited, "tmdb_use_productions"))
        assertTrue(kidsTmdbProductionPreference(null, edited, "tmdb_use_networks"))
    }

    @Test fun setupEnablesEnrichmentWithoutReplacingOtherPreferencesOrUploadingKeys() {
        val original = buildJsonObject {
            put("version", 4); put("futureRoot", "keep")
            put("features", buildJsonObject {
                put("player_settings", buildJsonObject { put("keep", "player") })
                put("futureFeature", "keep")
                put("tmdb_settings", buildJsonObject {
                    put("tmdb_enabled", encodeSyncBoolean(false))
                    put("tmdb_api_key", encodeSyncString("must-not-upload"))
                    put("tmdb_language", encodeSyncString("fr"))
                    put("tmdb_use_trailers", encodeSyncBoolean(false))
                    put("tmdb_use_credits", encodeSyncBoolean(true))
                })
            })
        }
        val updated = withKidsTmdbEnrichment(original, true, useCredits = false)
        val tmdb = updated["features"]!!.jsonObject["tmdb_settings"]!!.jsonObject
        assertEquals(true, tmdb.decodeSyncBoolean("tmdb_enabled"))
        assertEquals(false, tmdb.decodeSyncBoolean("tmdb_use_credits"))
        assertEquals(false, tmdb.decodeSyncBoolean("tmdb_use_trailers"))
        assertEquals("fr", tmdb.decodeSyncString("tmdb_language"))
        assertFalse(tmdb.containsKey("tmdb_api_key"))
        assertEquals(original["futureRoot"], updated["futureRoot"])
        assertEquals(original["features"]!!.jsonObject["player_settings"], updated["features"]!!.jsonObject["player_settings"])
        assertEquals(original["features"]!!.jsonObject["futureFeature"], updated["features"]!!.jsonObject["futureFeature"])
    }

    @Test fun castDefaultOverridesTheCopiedSettingAndLaterEditsPreserveTheChoice() {
        val copied = withKidsTmdbEnrichment(JsonObject(emptyMap()), true, useCredits = true)
        val child = withKidsTmdbEnrichment(copied, true, useCredits = false)
        assertFalse(kidsTmdbCreditsPreference(null, child))
        assertFalse(kidsTmdbCreditsPreference(false, copied))
        assertTrue(kidsTmdbCreditsPreference(true, child))
        assertEquals(false, withKidsTmdbEnrichment(child, false)["features"]!!.jsonObject["tmdb_settings"]!!.jsonObject.decodeSyncBoolean("tmdb_use_credits"))
        assertTrue(kidsTmdbCreditsPreference(null, JsonObject(emptyMap())))
    }

    @Test fun laterKeyChangesPreserveTheLocalOptOutAndFreshDevicesRespectSyncedOptOut() {
        val remoteEnabled = withKidsTmdbEnrichment(JsonObject(emptyMap()), true)
        val remoteDisabled = withKidsTmdbEnrichment(JsonObject(emptyMap()), false)
        assertFalse(kidsTmdbEnabledPreference(false, remoteEnabled))
        assertFalse(kidsTmdbEnabledPreference(null, remoteDisabled))
        assertTrue(kidsTmdbEnabledPreference(true, remoteDisabled))
        assertTrue(kidsTmdbEnabledPreference(null, JsonObject(emptyMap())))
    }
    @Test fun sharedBucketCarriesPreferencesOnlyAndPreservesPlatformSpecificSettings() {
        val platform = buildJsonObject {
            put("version", 4)
            put("features", buildJsonObject {
                put("player_settings", buildJsonObject { put("keep", "player") })
                put("theme_settings", buildJsonObject { put("keep", "theme") })
                put("tmdb_settings", buildJsonObject {
                    put("tmdb_enabled", encodeSyncBoolean(false))
                    put("tmdb_api_key", encodeSyncString("local-secret"))
                    put("tmdb_language", encodeSyncString("de"))
                    put("tmdb_use_trailers", encodeSyncBoolean(false))
                    put("tmdb_use_credits", encodeSyncBoolean(true))
                })
            })
        }
        val shared = tmdbSettingsWithPreferences(tmdbSettingsFromProfileBlob(platform), true, false)
        val record = sharedTmdbRecord(shared)
        assertFalse(record.toString().contains("local-secret"))
        assertFalse(record.toString().contains("tmdb_api_key"))
        val merged = withSharedTmdbSettings(platform, record["tmdb_settings"]!!.jsonObject)
        val features = merged["features"]!!.jsonObject
        val tmdb = features["tmdb_settings"]!!.jsonObject
        assertEquals(true, tmdb.decodeSyncBoolean("tmdb_enabled"))
        assertEquals(false, tmdb.decodeSyncBoolean("tmdb_use_credits"))
        assertEquals("de", tmdb.decodeSyncString("tmdb_language"))
        assertEquals(false, tmdb.decodeSyncBoolean("tmdb_use_trailers"))
        assertFalse(tmdb.containsKey("tmdb_api_key"))
        assertEquals(platform["features"]!!.jsonObject["player_settings"], features["player_settings"])
        assertEquals(platform["features"]!!.jsonObject["theme_settings"], features["theme_settings"])
        assertEquals(platform["version"], merged["version"])
    }

    @Test fun legacyMigrationPrefersAnExplicitOnValueAndKeepsCastDisabled() {
        val desktop = withKidsTmdbEnrichment(JsonObject(emptyMap()), true, useCredits = false)
        val mobile = withKidsTmdbEnrichment(JsonObject(emptyMap()), false, useCredits = true)
        assertEquals(true to false, legacyKidsTmdbPreferences(listOf(desktop, mobile)))
        // A later explicit shared opt-out always wins, even if a platform blob still says on.
        val optedOut = tmdbSettingsWithPreferences(tmdbSettingsFromProfileBlob(desktop), false, true)
        val merged = withSharedTmdbSettings(desktop, optedOut)
        assertFalse(kidsTmdbEnabledPreference(null, merged))
        assertTrue(kidsTmdbCreditsPreference(null, merged))
        // No stored platform preference uses the kids setup default.
        assertEquals(true to false, legacyKidsTmdbPreferences(listOf(JsonObject(emptyMap()))))
        assertEquals(false to true, legacyKidsTmdbPreferences(listOf(
            withKidsTmdbEnrichment(JsonObject(emptyMap()), false, useCredits = true),
            withKidsTmdbEnrichment(JsonObject(emptyMap()), false, useCredits = true),
        )))
        // Explicit cast opt-ins on both platforms are preserved too.
        assertEquals(true to true, legacyKidsTmdbPreferences(listOf(
            withKidsTmdbEnrichment(JsonObject(emptyMap()), true, useCredits = true),
            withKidsTmdbEnrichment(JsonObject(emptyMap()), true, useCredits = true),
        )))
    }

}
