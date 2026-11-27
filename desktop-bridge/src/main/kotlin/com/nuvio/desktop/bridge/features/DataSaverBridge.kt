package com.nuvio.desktop.bridge.features

import com.nuvio.app.features.datasaver.DataSaverDesktopAccess
import com.nuvio.app.features.datasaver.DataSaverPlaybackConfig
import com.nuvio.app.features.datasaver.DataSaverPlaybackRepository
import com.nuvio.app.features.datasaver.DataSaverSettingsRepository
import com.nuvio.app.features.downloads.DataUsePreset
import com.nuvio.app.features.downloads.DownloadFilterConfig
import com.nuvio.app.features.downloads.StreamResolutionTier
import com.nuvio.app.features.downloads.StreamSourceType
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

/**
 * Data Saver (ported from NuvioMobileButBetter): its switch and per-resolution target bitrates
 * ([DataSaverPlaybackRepository]) plus its own streams-list rules ([DataSaverSettingsRepository]).
 */
object DataSaverBridge {
    fun dispatch(method: String, params: JsonObject): JsonElement? = when (method) {
        "dataSaver.snapshot" -> snapshot()
        "dataSaver.setEnabled" -> { DataSaverPlaybackRepository.setEnabled(params.bool("enabled")); snapshot() }
        "dataSaver.setDataUse" -> { DataSaverPlaybackRepository.setDataUse(preset(params.str("preset"))); snapshot() }
        "dataSaver.setTargetKbps" -> {
            DataSaverPlaybackRepository.setTargetKbps(settingTier(params.str("tier")), positiveKbps(params.long("kbps")))
            snapshot()
        }
        "dataSaver.setMaxResolution" -> { DataSaverSettingsRepository.setMaxResolution(settingTier(params.str("tier"))); snapshot() }
        "dataSaver.setSourceAllowed" -> {
            DataSaverSettingsRepository.setSourceAllowed(sourceType(params.str("source")), params.bool("allowed"))
            snapshot()
        }
        "dataSaver.setMaxSizeBytes" -> {
            val bytes = params.long("bytes")
            if (bytes <= 0L) throw BridgeFeatureException("INVALID_ARGUMENT", "bytes must be positive")
            DataSaverSettingsRepository.setMaxSizeBytes(bytes)
            snapshot()
        }
        "dataSaver.setShowUnknownSize" -> { DataSaverSettingsRepository.setShowUnknownSizeStreams(params.bool("enabled")); snapshot() }
        "dataSaver.reset" -> {
            DataSaverSettingsRepository.resetToDefaults()
            DataSaverPlaybackRepository.resetTargets()
            snapshot()
        }
        else -> null
    }

    fun snapshot(): JsonObject {
        DataSaverPlaybackRepository.ensureLoaded()
        DataSaverSettingsRepository.ensureLoaded()
        val playback = DataSaverPlaybackRepository.snapshot()
        val rules = DataSaverSettingsRepository.snapshot()
        val tiers = DataSaverDesktopAccess.settingResolutions
        return buildJsonObject {
            put("enabled", playback.enabled)
            put("dataUse", playback.dataUsePreset().name.lowercase())
            put("maxResolution", rules.maxResolution.name.lowercase())
            put("resolutions", JsonArray(tiers.map { JsonPrimitive(it.name.lowercase()) }))
            put("targetsKbps", buildJsonObject { tiers.forEach { put(it.name.lowercase(), playback.targetFor(it)) } })
            // What each level means at the maximum resolution, for the "~x GB/h" on its tile.
            put("levelKbps", buildJsonObject {
                DataUsePreset.levels.forEach { put(it.name.lowercase(), it.scale(DataSaverPlaybackConfig.balancedTargetFor(rules.maxResolution))) }
            })
            put("choicesKbps", choices(tiers))
            put("allowedSources", JsonArray(rules.allowedSources.map { JsonPrimitive(it.name.lowercase()) }.sortedBy { it.content }))
            put("maxSizeBytes", rules.maxSizeBytes)
            put("minMaxSizeBytes", DataSaverSettingsRepository.minMaxSizeBytes)
            put("maxMaxSizeBytes", DownloadFilterConfig.MAX_MAX_SIZE_BYTES)
            put("showUnknownSizeStreams", rules.showUnknownSizeStreams)
        }
    }

    internal fun choices(tiers: List<StreamResolutionTier>) = buildJsonObject {
        tiers.forEach { tier -> put(tier.name.lowercase(), JsonArray(DataSaverDesktopAccess.bitrateChoices(tier).map(::JsonPrimitive))) }
    }

    internal fun preset(value: String): DataUsePreset =
        DataUsePreset.entries.firstOrNull { it.name.equals(value, ignoreCase = true) }
            ?: throw BridgeFeatureException("INVALID_ARGUMENT", "Unknown data use level")

    internal fun settingTier(value: String): StreamResolutionTier =
        DataSaverDesktopAccess.settingResolutions.firstOrNull { it.name.equals(value, ignoreCase = true) }
            ?: throw BridgeFeatureException("INVALID_ARGUMENT", "Unsupported resolution")

    internal fun positiveKbps(kbps: Long): Int {
        if (kbps <= 0L) throw BridgeFeatureException("INVALID_ARGUMENT", "kbps must be positive")
        return kbps.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    }

    private fun sourceType(value: String): StreamSourceType =
        StreamSourceType.entries.firstOrNull { it.name.equals(value, ignoreCase = true) }
            ?: throw BridgeFeatureException("INVALID_ARGUMENT", "Unknown source type")

    private fun JsonObject.str(key: String): String =
        this[key]?.jsonPrimitive?.contentOrNull ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key is required")

    private fun JsonObject.bool(key: String): Boolean =
        this[key]?.jsonPrimitive?.booleanOrNull ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be a boolean")

    private fun JsonObject.long(key: String): Long =
        this[key]?.jsonPrimitive?.longOrNull ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be a number")
}
