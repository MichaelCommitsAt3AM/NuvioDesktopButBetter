package com.nuvio.desktop.bridge.features

import com.nuvio.app.features.details.MetaScreenSettingsRepository
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class MetadataSettingsBridgeTest {
    @Test fun rewriteDoesNotAdvertiseOrEnableTheMissingHeroTrailerRenderer() = runBlocking {
        val snapshot = MetadataSettingsBridge.snapshot()
        assertEquals("false", snapshot["heroTrailerPlaybackSupported"]?.jsonPrimitive?.content)
        assertEquals("false", snapshot["heroTrailerPlayback"]?.jsonPrimitive?.content)
        val original = MetaScreenSettingsRepository.uiState.value.heroTrailerPlayback
        val error = assertFailsWith<BridgeFeatureException> {
            MetadataSettingsBridge.dispatch("metadataSettings.set", Json.parseToJsonElement("""{"key":"heroTrailerPlayback","value":true}""") as JsonObject)
        }
        assertEquals("CAPABILITY_UNAVAILABLE", error.code)
        assertEquals(original, MetaScreenSettingsRepository.uiState.value.heroTrailerPlayback)
    }
}
