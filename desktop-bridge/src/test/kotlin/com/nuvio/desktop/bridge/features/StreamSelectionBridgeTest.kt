package com.nuvio.desktop.bridge.features

import com.nuvio.app.features.downloads.DownloadStreamFilterMode
import com.nuvio.app.features.streams.StreamsRepository
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class StreamSelectionBridgeTest {
    @Test
    fun switchingQualityReadsTheModeFieldAndReturnsTheUpdatedSnapshot() = runBlocking {
        val original = StreamsRepository.uiState.value.downloadFilterMode
        try {
            for (mode in listOf("data_saver", "best_quality", "DATA_SAVER")) {
                val params = Json.parseToJsonElement("{\"mode\":\"$mode\"}") as JsonObject
                val result = StreamSelectionBridge.dispatch("streams.downloadFilter.set", params) as JsonObject
                assertEquals(mode.lowercase(), result["downloadFilterMode"]?.jsonPrimitive?.content)
                assertEquals(DownloadStreamFilterMode.valueOf(mode.uppercase()), StreamsRepository.uiState.value.downloadFilterMode)
            }
        } finally {
            StreamsRepository.setDownloadFilterMode(original)
        }
    }

    @Test
    fun malformedModesAreRejectedWithoutChangingSelection() = runBlocking {
        val original = StreamsRepository.uiState.value.downloadFilterMode
        for (payload in listOf("{}", "{\"mode\":null}", "{\"mode\":3}", "{\"mode\":{}}", "{\"mode\":\"invalid\"}")) {
            val error = assertFailsWith<BridgeFeatureException> {
                StreamSelectionBridge.dispatch("streams.downloadFilter.set", Json.parseToJsonElement(payload) as JsonObject)
            }
            assertEquals("INVALID_ARGUMENT", error.code)
            assertEquals(original, StreamsRepository.uiState.value.downloadFilterMode)
        }
    }

    @Test
    fun nullAddonFilterStillSelectsAllProviders() = runBlocking {
        val result = StreamSelectionBridge.dispatch("streams.filter.set", Json.parseToJsonElement("{\"addonId\":null}") as JsonObject) as JsonObject
        assertEquals("null", result["selectedAddonId"].toString())
    }
}
