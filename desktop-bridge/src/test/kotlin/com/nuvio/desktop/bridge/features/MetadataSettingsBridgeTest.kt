package com.nuvio.desktop.bridge.features

import com.nuvio.app.features.details.MetaScreenSettingsRepository
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

class MetadataSettingsBridgeTest {
    @Test fun heroTrailerAutoplayIsSupportedAndDefaultsOnButStaysIndependentOfTheLegacyFlag() = runBlocking {
        val original = MetaScreenSettingsRepository.uiState.value.desktopHeroTrailerAutoplay
        val legacy = MetaScreenSettingsRepository.uiState.value.heroTrailerPlayback
        try {
            MetaScreenSettingsRepository.resetToDefaults()
            val snapshot = MetadataSettingsBridge.snapshot()
            assertEquals("true", snapshot["heroTrailerPlaybackSupported"]?.jsonPrimitive?.content)
            assertEquals("true", snapshot["heroTrailerPlayback"]?.jsonPrimitive?.content)

            val off = MetadataSettingsBridge.dispatch("metadataSettings.set", Json.parseToJsonElement("""{"key":"heroTrailerPlayback","value":false}""") as JsonObject) as JsonObject
            assertEquals("false", off["heroTrailerPlayback"]?.jsonPrimitive?.content)
            assertEquals(false, MetaScreenSettingsRepository.uiState.value.desktopHeroTrailerAutoplay)
            assertEquals(legacy, MetaScreenSettingsRepository.uiState.value.heroTrailerPlayback)
        } finally {
            MetaScreenSettingsRepository.setDesktopHeroTrailerAutoplay(original)
        }
    }
}
