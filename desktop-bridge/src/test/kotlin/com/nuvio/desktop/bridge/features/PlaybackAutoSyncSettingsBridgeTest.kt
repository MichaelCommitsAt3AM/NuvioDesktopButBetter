package com.nuvio.desktop.bridge.features

import com.nuvio.app.features.autosync.AutoSyncPreferencesDesktop
import com.nuvio.app.features.autosync.AutoSyncPreferencesRepository
import com.nuvio.app.features.player.PlayerSettingsRepository
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class PlaybackAutoSyncSettingsBridgeTest {
    @Test fun preferencesRoundTripThroughKotlinPersistenceAndRejectUnsupportedTolerance() = runBlocking {
        var enabled = false
        var aggressive = true
        var tolerance = 0
        AutoSyncPreferencesRepository.installPersistence(
            load = { enabled }, save = { enabled = it },
            loadAggressiveMode = { aggressive }, saveAggressiveMode = { aggressive = it },
            loadSyncToleranceMs = { tolerance }, saveSyncToleranceMs = { tolerance = it },
        )
        suspend fun set(key: String, value: JsonPrimitive) = PlaybackSettingsBridge.dispatch(
            "playbackSettings.set", buildJsonObject { put("key", key); put("value", value) },
        )
        try {
            set("subtitleAutoSyncEnabled", JsonPrimitive(true))
            set("subtitleAutoSyncAggressiveMode", JsonPrimitive(false))
            set("subtitleAutoSyncToleranceMs", JsonPrimitive(300))
            assertEquals(true, enabled)
            assertEquals(false, aggressive)
            assertEquals(300, tolerance)
            assertFailsWith<BridgeFeatureException> { set("subtitleAutoSyncToleranceMs", JsonPrimitive(250)) }
            val snapshot = PlaybackSettingsBridge.snapshot()["subtitleAutoSync"]!!.jsonObject
            assertEquals(true, snapshot["enabled"]!!.jsonPrimitive.boolean)
            assertEquals(false, snapshot["aggressiveMode"]!!.jsonPrimitive.boolean)
            assertEquals(300, snapshot["toleranceMs"]!!.jsonPrimitive.int)
        } finally { AutoSyncPreferencesDesktop.initialize() }
    }

    @Test fun chaptersUseTheNativePlayerSetting() = runBlocking {
        PlayerSettingsRepository.ensureLoaded()
        val previous = PlayerSettingsRepository.uiState.value.androidExoChaptersEnabled
        try {
            PlaybackSettingsBridge.dispatch("playbackSettings.set", buildJsonObject {
                put("key", "chaptersEnabled"); put("value", !previous)
            })
            assertEquals(!previous, PlayerSettingsRepository.uiState.value.androidExoChaptersEnabled)
            assertEquals(!previous, PlaybackSettingsBridge.snapshot()["chaptersEnabled"]!!.jsonPrimitive.boolean)
        } finally { PlayerSettingsRepository.setAndroidExoChaptersEnabled(previous) }
    }
}
