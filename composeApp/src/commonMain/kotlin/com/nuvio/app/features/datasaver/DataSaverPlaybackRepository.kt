package com.nuvio.app.features.datasaver

import com.nuvio.app.features.downloads.DataUsePreset
import com.nuvio.app.features.downloads.StreamResolutionTier
import com.nuvio.app.features.downloads.effectivePreset
import com.nuvio.app.features.downloads.presetTiers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Data Saver's on/off switch and the bitrate auto-pick aims for at each resolution. While on,
 * auto source selection prefers the file closest to its resolution's target (see
 * [DataSaverStreamRanking]), the streams list opens in Data Saver mode, and the details screen
 * does not autoplay trailers. Targets are for H.264; HEVC and AV1 are held to less.
 */
@Serializable
data class DataSaverPlaybackConfig(
    val enabled: Boolean = false,
    /** The 1080p target (named before there was one per resolution, kept so saved values load). */
    val targetBitrateKbps: Int = DEFAULT_DATA_USE.scale(BALANCED_TARGET_BITRATE_KBPS),
    val uhdTargetKbps: Int = DEFAULT_DATA_USE.scale(BALANCED_UHD_TARGET_KBPS),
    val hdTargetKbps: Int = DEFAULT_DATA_USE.scale(BALANCED_HD_TARGET_KBPS),
    val sdTargetKbps: Int = DEFAULT_DATA_USE.scale(BALANCED_SD_TARGET_KBPS),
    /** The data use level last chosen for the targets (see [dataUsePreset]). */
    val dataUse: DataUsePreset = DEFAULT_DATA_USE,
) {
    /** The level the current targets match; Custom when they were set per resolution. */
    fun dataUsePreset(): DataUsePreset = effectivePreset(dataUse, ::targetFor, ::balancedTargetFor)

    /**
     * Every resolution's target set to [preset]'s level. Custom starts from the Balanced targets,
     * unless the targets are already Custom, which are kept.
     */
    fun withDataUse(preset: DataUsePreset): DataSaverPlaybackConfig {
        if (preset == DataUsePreset.CUSTOM) {
            val start = if (dataUsePreset() == preset) this else withDataUse(DataUsePreset.BALANCED)
            return start.copy(dataUse = preset)
        }
        return presetTiers.fold(copy(dataUse = preset)) { config, tier ->
            config.withTarget(tier, preset.scale(balancedTargetFor(tier)))
        }
    }

    fun targetFor(tier: StreamResolutionTier): Int = when (tier) {
        StreamResolutionTier.UHD_4K -> uhdTargetKbps
        StreamResolutionTier.HD_720 -> hdTargetKbps
        StreamResolutionTier.SD -> sdTargetKbps
        StreamResolutionTier.FHD_1080, StreamResolutionTier.UNKNOWN -> targetBitrateKbps
    }

    fun withTarget(tier: StreamResolutionTier, kbps: Int): DataSaverPlaybackConfig = when (tier) {
        StreamResolutionTier.UHD_4K -> copy(uhdTargetKbps = kbps)
        StreamResolutionTier.HD_720 -> copy(hdTargetKbps = kbps)
        StreamResolutionTier.SD -> copy(sdTargetKbps = kbps)
        StreamResolutionTier.FHD_1080, StreamResolutionTier.UNKNOWN -> copy(targetBitrateKbps = kbps)
    }

    companion object {
        /** The level a fresh install and "Reset to defaults" use. */
        val DEFAULT_DATA_USE = DataUsePreset.LOW

        /** The Balanced target for [tier], which every level scales from. */
        fun balancedTargetFor(tier: StreamResolutionTier): Int = when (tier) {
            StreamResolutionTier.UHD_4K -> BALANCED_UHD_TARGET_KBPS
            StreamResolutionTier.HD_720 -> BALANCED_HD_TARGET_KBPS
            StreamResolutionTier.SD -> BALANCED_SD_TARGET_KBPS
            StreamResolutionTier.FHD_1080, StreamResolutionTier.UNKNOWN -> BALANCED_TARGET_BITRATE_KBPS
        }

        /** Netflix's average for 1080p. */
        const val BALANCED_TARGET_BITRATE_KBPS = 6_000
        /** About Netflix's 4K level once the usual HEVC encode is taken into account (25 x 0.6 = 15). */
        const val BALANCED_UHD_TARGET_KBPS = 25_000
        const val BALANCED_HD_TARGET_KBPS = 3_000
        const val BALANCED_SD_TARGET_KBPS = 1_500
        const val MIN_TARGET_BITRATE_KBPS = 500
        const val MAX_TARGET_BITRATE_KBPS = 40_000
    }
}

object DataSaverPlaybackRepository {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val _uiState = MutableStateFlow(DataSaverPlaybackConfig())
    val uiState: StateFlow<DataSaverPlaybackConfig> = _uiState.asStateFlow()

    private var hasLoaded = false

    fun ensureLoaded() {
        if (hasLoaded) return
        loadFromDisk()
    }

    fun onProfileChanged() {
        loadFromDisk()
    }

    fun clearLocalState() {
        hasLoaded = false
        _uiState.value = DataSaverPlaybackConfig()
    }

    fun snapshot(): DataSaverPlaybackConfig {
        ensureLoaded()
        return _uiState.value
    }

    /** The bitrate auto-pick should aim for, or null while Data Saver is off. */
    /** The targets auto-pick should aim for, or null while Data Saver is off. */
    fun activeTargets(): DataSaverPlaybackConfig? = snapshot().takeIf { it.enabled }

    fun setEnabled(enabled: Boolean) {
        ensureLoaded()
        if (_uiState.value.enabled == enabled) return
        update(_uiState.value.copy(enabled = enabled))
    }

    fun setTargetKbps(tier: StreamResolutionTier, kbps: Int) {
        ensureLoaded()
        val clamped = kbps.coerceIn(
            DataSaverPlaybackConfig.MIN_TARGET_BITRATE_KBPS,
            DataSaverPlaybackConfig.MAX_TARGET_BITRATE_KBPS,
        )
        if (_uiState.value.targetFor(tier) == clamped) return
        update(_uiState.value.withTarget(tier, clamped).copy(dataUse = DataUsePreset.CUSTOM))
    }

    /** Sets every resolution's target to [preset]'s level, or marks them Custom to edit one by one. */
    fun setDataUse(preset: DataUsePreset) {
        ensureLoaded()
        val next = _uiState.value.withDataUse(preset)
        if (next == _uiState.value) return
        update(next)
    }

    /** Back to the default targets; the switch stays as it is. */
    fun resetTargets() {
        ensureLoaded()
        update(DataSaverPlaybackConfig(enabled = _uiState.value.enabled))
    }

    private fun update(config: DataSaverPlaybackConfig) {
        _uiState.value = config
        runCatching { DataSaverSettingsStorage.savePlaybackConfig(json.encodeToString(config)) }
    }

    private fun loadFromDisk() {
        hasLoaded = true
        val stored = runCatching { DataSaverSettingsStorage.loadPlaybackConfig() }.getOrNull()
            ?.takeIf { it.isNotBlank() }
        _uiState.value = stored?.let(::parse) ?: DataSaverPlaybackConfig()
    }

    private fun parse(payload: String): DataSaverPlaybackConfig? =
        try {
            json.decodeFromString<DataSaverPlaybackConfig>(payload)
        } catch (_: SerializationException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
}
