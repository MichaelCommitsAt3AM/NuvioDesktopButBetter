package com.nuvio.desktop.bridge.features

import com.nuvio.app.features.datasaver.DataSaverPlaybackRepository
import com.nuvio.app.features.datasaver.DataSaverSettingsRepository
import com.nuvio.app.features.downloads.DataUsePreset
import com.nuvio.app.features.downloads.DownloadFilterSettingsRepository
import com.nuvio.app.features.downloads.StreamResolutionTier
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** Desktop storage is the real app-data folder in tests, so every value changed here is restored. */
class DataSaverBridgeTest {
    private val tiers = listOf(StreamResolutionTier.UHD_4K, StreamResolutionTier.FHD_1080, StreamResolutionTier.HD_720)
    private fun params(json: String) = Json.parseToJsonElement(json) as JsonObject

    @Test fun dataSaverLevelsTargetsAndSwitchRoundTrip(): Unit = runBlocking {
        DataSaverPlaybackRepository.ensureLoaded(); DataSaverSettingsRepository.ensureLoaded()
        val playback = DataSaverPlaybackRepository.snapshot()
        val maxResolution = DataSaverSettingsRepository.snapshot().maxResolution
        try {
            val snapshot = DataSaverBridge.snapshot()
            assertEquals(listOf("uhd_4k", "fhd_1080", "hd_720"), snapshot["resolutions"]!!.jsonArray.map { it.jsonPrimitive.content })
            assertTrue(snapshot["choicesKbps"]!!.jsonObject["fhd_1080"]!!.jsonArray.isNotEmpty())

            val balanced = DataSaverBridge.dispatch("dataSaver.setDataUse", params("""{"preset":"BALANCED"}""")) as JsonObject
            assertEquals("balanced", balanced["dataUse"]!!.jsonPrimitive.content)

            val custom = DataSaverBridge.dispatch("dataSaver.setTargetKbps", params("""{"tier":"FHD_1080","kbps":4200}""")) as JsonObject
            assertEquals("custom", custom["dataUse"]!!.jsonPrimitive.content)
            assertEquals(4200, custom["targetsKbps"]!!.jsonObject["fhd_1080"]!!.jsonPrimitive.int)

            val on = DataSaverBridge.dispatch("dataSaver.setEnabled", params("""{"enabled":true}""")) as JsonObject
            assertEquals("true", on["enabled"]!!.jsonPrimitive.content)

            val capped = DataSaverBridge.dispatch("dataSaver.setMaxResolution", params("""{"tier":"HD_720"}""")) as JsonObject
            assertEquals("hd_720", capped["maxResolution"]!!.jsonPrimitive.content)

            assertFailsWith<BridgeFeatureException> { DataSaverBridge.dispatch("dataSaver.setMaxResolution", params("""{"tier":"SD"}""")) }
            assertFailsWith<BridgeFeatureException> { DataSaverBridge.dispatch("dataSaver.setDataUse", params("""{"preset":"ULTRA"}""")) }
        } finally {
            DataSaverPlaybackRepository.setEnabled(playback.enabled)
            DataSaverSettingsRepository.setMaxResolution(maxResolution)
            if (playback.dataUsePreset() == DataUsePreset.CUSTOM) {
                DataSaverPlaybackRepository.setDataUse(DataUsePreset.CUSTOM)
                (tiers + StreamResolutionTier.SD).forEach { DataSaverPlaybackRepository.setTargetKbps(it, playback.targetFor(it)) }
            } else {
                DataSaverPlaybackRepository.setDataUse(playback.dataUsePreset())
            }
        }
    }

    @Test fun downloadFilterTakesLevelsAndPerResolutionLimits(): Unit = runBlocking {
        DownloadFilterSettingsRepository.ensureLoaded()
        val original = DownloadFilterSettingsRepository.snapshot()
        try {
            val low = DownloadsBridge.dispatch("downloads.filter.setDataUse", params("""{"preset":"LOW"}""")) as JsonObject
            assertEquals("low", low["dataUse"]!!.jsonPrimitive.content)
            assertEquals(DataUsePreset.LOW.scale(6_000), low["tierLimitsKbps"]!!.jsonObject["fhd_1080"]!!.jsonPrimitive.int)

            val custom = DownloadsBridge.dispatch("downloads.filter.setTierBitrateKbps", params("""{"tier":"UHD_4K","kbps":20000}""")) as JsonObject
            assertEquals("custom", custom["dataUse"]!!.jsonPrimitive.content)
            assertEquals(20000, custom["tierLimitsKbps"]!!.jsonObject["uhd_4k"]!!.jsonPrimitive.int)
            assertEquals(3L * 1024 * 1024 * 1024, custom["minMaxSizeBytes"]!!.jsonPrimitive.content.toLong())
        } finally {
            if (original.dataUsePreset() == DataUsePreset.CUSTOM) {
                DownloadFilterSettingsRepository.setDataUse(DataUsePreset.CUSTOM)
                tiers.forEach { DownloadFilterSettingsRepository.setTierBitrateKbps(it, original.tierBitrateKbps(it)) }
            } else {
                DownloadFilterSettingsRepository.setDataUse(original.dataUsePreset())
            }
        }
    }
}
