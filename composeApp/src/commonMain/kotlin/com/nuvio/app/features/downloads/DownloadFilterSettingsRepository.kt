package com.nuvio.app.features.downloads

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * One persisted set of [DownloadFilterConfig] rules, exposed as a [StateFlow]. The download
 * filter ([DownloadFilterSettingsRepository]) and Data Saver
 * ([com.nuvio.app.features.datasaver.DataSaverSettingsRepository]) each keep their own.
 *
 * @param defaults what a fresh install and "Reset to defaults" use.
 * @param minMaxSizeBytes the smallest size cap this set offers.
 * @param loadLegacy for a set split off from another: the other set's saved rules, copied the
 *   first time this one loads so nothing changes until the user edits it.
 */
open class FilterConfigStore(
    val defaults: DownloadFilterConfig,
    val minMaxSizeBytes: Long,
    private val load: () -> String?,
    private val save: (String) -> Unit,
    private val loadLegacy: (() -> String?)? = null,
) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val _uiState = MutableStateFlow(defaults)
    val uiState: StateFlow<DownloadFilterConfig> = _uiState.asStateFlow()

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
        _uiState.value = defaults
    }

    fun snapshot(): DownloadFilterConfig {
        ensureLoaded()
        return _uiState.value
    }

    fun setMaxResolution(tier: StreamResolutionTier) {
        ensureLoaded()
        if (_uiState.value.maxResolution == tier) return
        update(_uiState.value.copy(maxResolution = tier))
    }

    fun setSourceAllowed(source: StreamSourceType, allowed: Boolean) {
        ensureLoaded()
        val current = _uiState.value.allowedSources
        val next = if (allowed) current + source else current - source
        if (next == current) return
        update(_uiState.value.copy(allowedSources = next))
    }

    fun setMaxSizeBytes(bytes: Long) {
        ensureLoaded()
        val clamped = bytes.coerceIn(minMaxSizeBytes, DownloadFilterConfig.MAX_MAX_SIZE_BYTES)
        if (_uiState.value.maxSizeBytes == clamped) return
        update(_uiState.value.copy(maxSizeBytes = clamped))
    }

    fun setShowUnknownSizeStreams(enabled: Boolean) {
        ensureLoaded()
        if (_uiState.value.showUnknownSizeStreams == enabled) return
        update(_uiState.value.copy(showUnknownSizeStreams = enabled))
    }

    fun setBitrateLimitEnabled(enabled: Boolean) {
        ensureLoaded()
        if (_uiState.value.bitrateLimitEnabled == enabled) return
        update(_uiState.value.copy(bitrateLimitEnabled = enabled))
    }

    fun setMaxBitrateKbps(kbps: Int) {
        ensureLoaded()
        val clamped = kbps.coerceIn(
            DownloadFilterConfig.MIN_MAX_BITRATE_KBPS,
            DownloadFilterConfig.MAX_MAX_BITRATE_KBPS,
        )
        if (_uiState.value.maxBitrateKbps == clamped) return
        update(_uiState.value.copy(maxBitrateKbps = clamped, dataUse = DataUsePreset.CUSTOM))
    }

    /** Sets one resolution's bitrate limit; 1080p is [setMaxBitrateKbps], the others scale from it until set. */
    fun setTierBitrateKbps(tier: StreamResolutionTier, kbps: Int) {
        ensureLoaded()
        when (tier) {
            StreamResolutionTier.FHD_1080, StreamResolutionTier.UNKNOWN -> setMaxBitrateKbps(kbps)
            else -> {
                val clamped = kbps.coerceIn(MIN_TIER_BITRATE_KBPS, MAX_TIER_BITRATE_KBPS)
                if (_uiState.value.tierBitrateKbps(tier) == clamped) return
                update(
                    _uiState.value.copy(
                        bitrateOverridesKbps = _uiState.value.bitrateOverridesKbps + (tier to clamped),
                        dataUse = DataUsePreset.CUSTOM,
                    ),
                )
            }
        }
    }

    /** Sets every resolution's limit to [preset]'s level, or marks them Custom to edit one by one. */
    fun setDataUse(preset: DataUsePreset) {
        ensureLoaded()
        val next = _uiState.value.withDataUse(preset)
        if (next == _uiState.value) return
        update(next)
    }

    fun setScaleBitrateByCodec(enabled: Boolean) {
        ensureLoaded()
        if (_uiState.value.scaleBitrateByCodec == enabled) return
        update(_uiState.value.copy(scaleBitrateByCodec = enabled))
    }

    fun resetToDefaults() {
        ensureLoaded()
        if (_uiState.value == defaults) return
        update(defaults)
    }

    private companion object {
        const val MIN_TIER_BITRATE_KBPS = 500
        const val MAX_TIER_BITRATE_KBPS = 60_000
    }

    private fun update(config: DownloadFilterConfig) {
        _uiState.value = config
        save(json.encodeToString(config))
    }

    private fun loadFromDisk() {
        hasLoaded = true
        val stored = load()?.takeIf { it.isNotBlank() }
        if (stored == null) {
            // First load after the split: start from the rules this set was split from.
            val legacy = loadLegacy?.invoke()?.takeIf { it.isNotBlank() }?.let(::parse)
            _uiState.value = legacy ?: defaults
            if (legacy != null) save(json.encodeToString(legacy))
            return
        }
        _uiState.value = parse(stored) ?: defaults
    }

    private fun parse(payload: String): DownloadFilterConfig? =
        try {
            json.decodeFromString<DownloadFilterConfig>(payload).let { config ->
                // 480p is no longer offered as a maximum, so a saved one moves up to 720p.
                if (config.maxResolution == StreamResolutionTier.SD) {
                    config.copy(maxResolution = StreamResolutionTier.HD_720)
                } else {
                    config
                }
            }
        } catch (_: SerializationException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
}

/**
 * Persisted limits for the Download button's quality options (bitrate, size, unknown size).
 * Resolution and source rules in it are not used there: the picker sets its own per quality.
 */
object DownloadFilterSettingsRepository : FilterConfigStore(
    defaults = DownloadFilterConfig.DEFAULT,
    minMaxSizeBytes = DownloadFilterConfig.MIN_MAX_SIZE_BYTES,
    load = DownloadFilterSettingsStorage::loadConfig,
    save = DownloadFilterSettingsStorage::saveConfig,
)
