package com.nuvio.app.features.downloads

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Persisted "data saver" download-filter preferences. Backed by
 * [DownloadFilterSettingsStorage] and exposed as a [StateFlow] so both the
 * streams page and the customisation UI observe the same config.
 */
object DownloadFilterSettingsRepository {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val _uiState = MutableStateFlow(DownloadFilterConfig.DEFAULT)
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
        _uiState.value = DownloadFilterConfig.DEFAULT
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
        val clamped = bytes.coerceIn(
            DownloadFilterConfig.MIN_MAX_SIZE_BYTES,
            DownloadFilterConfig.MAX_MAX_SIZE_BYTES,
        )
        if (_uiState.value.maxSizeBytes == clamped) return
        update(_uiState.value.copy(maxSizeBytes = clamped))
    }

    fun setShowUnknownSizeStreams(enabled: Boolean) {
        ensureLoaded()
        if (_uiState.value.showUnknownSizeStreams == enabled) return
        update(_uiState.value.copy(showUnknownSizeStreams = enabled))
    }

    fun resetToDefaults() {
        ensureLoaded()
        if (_uiState.value == DownloadFilterConfig.DEFAULT) return
        update(DownloadFilterConfig.DEFAULT)
    }

    private fun update(config: DownloadFilterConfig) {
        _uiState.value = config
        DownloadFilterSettingsStorage.saveConfig(json.encodeToString(config))
    }

    private fun loadFromDisk() {
        hasLoaded = true
        val stored = DownloadFilterSettingsStorage.loadConfig()?.takeIf { it.isNotBlank() }
        _uiState.value = stored?.let(::parse) ?: DownloadFilterConfig.DEFAULT
    }

    private fun parse(payload: String): DownloadFilterConfig? =
        try {
            json.decodeFromString<DownloadFilterConfig>(payload)
        } catch (_: SerializationException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
}
