package com.nuvio.desktop.bridge.features

import com.nuvio.app.features.player.PlayerSettingsRepository
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** The chapter title, audio delay and source fallback rows Kotlin shows on desktop. */
class PlaybackParitySettingsBridgeTest {
    private suspend fun set(key: String, value: JsonPrimitive) = PlaybackSettingsBridge.dispatch(
        "playbackSettings.set", buildJsonObject { put("key", key); put("value", value) },
    )

    @Test fun settingsRoundTripThroughThePlayerRepository(): Unit = runBlocking {
        PlayerSettingsRepository.ensureLoaded()
        val before = PlayerSettingsRepository.uiState.value
        try {
            set("chapterTitleEnabled", JsonPrimitive(!before.chapterTitleEnabled))
            set("rememberAudioDelayPerDevice", JsonPrimitive(!before.rememberAudioDelayPerDevice))
            set("streamAutoPlayFallbackOnFailure", JsonPrimitive(!before.streamAutoPlayFallbackOnFailure))
            set("streamAutoPlayFallbackMaxSources", JsonPrimitive(7))
            set("streamAutoPlayFallbackStartupTimeoutSeconds", JsonPrimitive(25))

            val state = PlayerSettingsRepository.uiState.value
            assertEquals(!before.chapterTitleEnabled, state.chapterTitleEnabled)
            assertEquals(!before.rememberAudioDelayPerDevice, state.rememberAudioDelayPerDevice)
            assertEquals(!before.streamAutoPlayFallbackOnFailure, state.streamAutoPlayFallbackOnFailure)
            assertEquals(7, state.streamAutoPlayFallbackMaxSources)
            assertEquals(25, state.streamAutoPlayFallbackStartupTimeoutSeconds)

            val snapshot = PlaybackSettingsBridge.snapshot()
            assertEquals(!before.chapterTitleEnabled, snapshot["chapterTitleEnabled"]!!.jsonPrimitive.boolean)
            assertEquals(7, snapshot["streamAutoPlayFallbackMaxSources"]!!.jsonPrimitive.int)
            assertEquals(25, snapshot["streamAutoPlayFallbackStartupTimeoutSeconds"]!!.jsonPrimitive.int)
        } finally {
            PlayerSettingsRepository.setChapterTitleEnabled(before.chapterTitleEnabled)
            PlayerSettingsRepository.setRememberAudioDelayPerDevice(before.rememberAudioDelayPerDevice)
            PlayerSettingsRepository.setStreamAutoPlayFallbackOnFailure(before.streamAutoPlayFallbackOnFailure)
            PlayerSettingsRepository.setStreamAutoPlayFallbackMaxSources(before.streamAutoPlayFallbackMaxSources)
            PlayerSettingsRepository.setStreamAutoPlayFallbackStartupTimeoutSeconds(before.streamAutoPlayFallbackStartupTimeoutSeconds)
        }
    }

    @Test fun outOfRangeFallbackValuesAreRejected(): Unit = runBlocking {
        assertFailsWith<BridgeFeatureException> { set("streamAutoPlayFallbackMaxSources", JsonPrimitive(11)) }
        assertFailsWith<BridgeFeatureException> { set("streamAutoPlayFallbackStartupTimeoutSeconds", JsonPrimitive(12)) }
        assertFailsWith<BridgeFeatureException> { set("streamAutoPlayFallbackStartupTimeoutSeconds", JsonPrimitive(50)) }
    }
}
