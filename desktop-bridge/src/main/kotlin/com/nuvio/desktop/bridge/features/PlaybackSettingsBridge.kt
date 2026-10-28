package com.nuvio.desktop.bridge.features

import androidx.compose.ui.graphics.Color
import com.nuvio.app.core.build.AppFeaturePolicy
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.plugins.PluginRepository
import com.nuvio.app.features.autosync.AutoSyncPreferencesRepository
import com.nuvio.app.features.player.PlayerSettingsRepository
import com.nuvio.app.features.player.AvailableLanguageOptions
import com.nuvio.app.features.player.SubtitleStyleState
import com.nuvio.app.features.player.subtitleColorFromStorage
import com.nuvio.app.features.player.toStorageHexString
import com.nuvio.app.features.player.skip.AutoSkipSegmentType
import com.nuvio.app.features.player.skip.NextEpisodeThresholdMode
import com.nuvio.app.features.player.skip.SkipIntroRepository
import com.nuvio.app.isWindows
import com.nuvio.app.features.p2p.P2pCacheSize
import com.nuvio.app.features.p2p.P2pSettingsRepository
import com.nuvio.app.features.p2p.P2pStreamingEngine
import com.nuvio.app.features.p2p.P2pStreamingState
import com.nuvio.app.features.p2p.P2pTorrentProfile
import com.nuvio.app.features.streams.StreamAutoPlayMode
import com.nuvio.app.features.streams.StreamAutoPlaySource
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** Desktop RPC adapter for the real player and peer-to-peer preference repositories. */
object PlaybackSettingsBridge {
    suspend fun dispatch(method: String, params: JsonObject): JsonElement? = when (method) {
        "playbackSettings.snapshot" -> snapshot()
        "playbackSettings.set" -> set(params)
        "playbackSettings.setAutoSkipType" -> {
            PlayerSettingsRepository.setAutoSkipSegmentTypeEnabled(enumValue<AutoSkipSegmentType>(params.str("type")), params.bool("enabled"))
            snapshot()
        }
        "playbackSettings.saveSkipCredential" -> saveSkipCredential(params)
        "p2p.snapshot" -> p2pSnapshot()
        "p2p.setEnabled" -> {
            ensureP2pAvailable()
            val enabled = params.bool("enabled")
            if (enabled && params.optionalBool("consentAccepted") != true) {
                throw BridgeFeatureException("P2P_CONSENT_REQUIRED", "Accept the peer-to-peer sharing notice before enabling torrent playback")
            }
            P2pSettingsRepository.setP2pEnabled(enabled)
            p2pSnapshot()
        }
        "p2p.setUploadEnabled" -> { ensureP2pAvailable(); P2pSettingsRepository.setEnableUpload(params.bool("enabled")); p2pSnapshot() }
        "p2p.setHideStats" -> { ensureP2pAvailable(); P2pSettingsRepository.setHideTorrentStats(params.bool("enabled")); p2pSnapshot() }
        "p2p.setTorrentProfile" -> { ensureP2pAvailable(); P2pSettingsRepository.setTorrentProfile(enumValue(params.str("profile"))); p2pSnapshot() }
        "p2p.setCacheSize" -> { ensureP2pAvailable(); P2pSettingsRepository.setCacheSize(enumValue(params.str("size"))); p2pSnapshot() }
        "p2p.clearCache" -> {
            ensureP2pAvailable()
            val result = try { P2pStreamingEngine.clearCache() } catch (error: Throwable) {
                if (error is CancellationException) throw error
                throw BridgeFeatureException("P2P_CACHE_CLEAR_FAILED", error.message ?: "Torrent cache could not be cleared")
            }
            buildJsonObject {
                put("snapshot", p2pSnapshot())
                put("reclaimedBytes", result.reclaimedBytes)
                put("remainingBytes", result.remainingBytes)
                put("protectedBytes", result.protectedBytes)
            }
        }
        else -> null
    }

    fun snapshot(): JsonObject {
        PlayerSettingsRepository.ensureLoaded()
        val state = PlayerSettingsRepository.uiState.value
        val style = state.subtitleStyle
        AutoSyncPreferencesRepository.ensureLoaded()
        return buildJsonObject {
            put("chaptersEnabled", state.androidExoChaptersEnabled)
            put("subtitleAutoSync", buildJsonObject {
                put("enabled", AutoSyncPreferencesRepository.preferredSubtitleAutoSyncOnStart.value)
                put("aggressiveMode", AutoSyncPreferencesRepository.aggressiveMode.value)
                put("toleranceMs", AutoSyncPreferencesRepository.syncToleranceMs.value)
            })
            put("showLoadingOverlay", state.showLoadingOverlay)
            put("showPlayerLoadingStatus", state.showPlayerLoadingStatus)
            put("pauseOverlayEnabled", state.pauseOverlayEnabled)
            put("showParentalGuide", state.showParentalGuide)
            put("preferredAudioLanguage", state.preferredAudioLanguage)
            put("availableLanguages", JsonArray(AvailableLanguageOptions.map { JsonPrimitive(it.code) }))
            putNullable("secondaryPreferredAudioLanguage", state.secondaryPreferredAudioLanguage)
            put("preferredSubtitleLanguage", state.preferredSubtitleLanguage)
            putNullable("secondaryPreferredSubtitleLanguage", state.secondaryPreferredSubtitleLanguage)
            put("subtitleStyle", buildJsonObject {
                put("textColor", style.textColor.toStorageHexString())
                put("backgroundColor", style.backgroundColor.toStorageHexString())
                put("outlineColor", style.outlineColor.toStorageHexString())
                put("outlineEnabled", style.outlineEnabled); put("outlineWidth", style.outlineWidth)
                put("bold", style.bold); put("fontSizeSp", style.fontSizeSp); put("bottomOffset", style.bottomOffset)
                put("stripSdh", style.stripSdh); put("useForcedSubtitles", style.useForcedSubtitles)
                put("showOnlyPreferredLanguages", style.showOnlyPreferredLanguages)
            })
            put("streamReuseLastLinkEnabled", state.streamReuseLastLinkEnabled)
            put("streamReuseLastLinkCacheHours", state.streamReuseLastLinkCacheHours)
            put("streamAutoPlayMode", state.streamAutoPlayMode.name)
            put("streamAutoPlaySource", state.streamAutoPlaySource.name)
            put("streamAutoPlaySelectedAddons", JsonArray(state.streamAutoPlaySelectedAddons.sorted().map(::JsonPrimitive)))
            put("streamAutoPlaySelectedPlugins", JsonArray(state.streamAutoPlaySelectedPlugins.sorted().map(::JsonPrimitive)))
            put("streamAutoPlayRegex", state.streamAutoPlayRegex)
            put("streamAutoPlayTimeoutSeconds", state.streamAutoPlayTimeoutSeconds)
            put("decoderPriority", state.decoderPriority)
            put("holdToSpeedEnabled", state.holdToSpeedEnabled)
            put("holdToSpeedValue", state.holdToSpeedValue)
            put("skipIntroEnabled", state.skipIntroEnabled)
            put("autoSkipSegmentTypes", JsonArray(state.autoSkipSegmentTypes.map { JsonPrimitive(it.name) }.sortedBy { it.content }))
            put("animeSkipEnabled", state.animeSkipEnabled)
            put("animeSkipClientIdConfigured", state.animeSkipClientId.isNotBlank())
            put("introDbApiKeyConfigured", state.introDbApiKey.isNotBlank())
            // These two editable fields mirror the Kotlin settings rows/dialogs.
            put("animeSkipClientId", state.animeSkipClientId)
            put("introDbApiKey", state.introDbApiKey)
            put("introSubmitEnabled", state.introSubmitEnabled)
            put("streamAutoPlayNextEpisodeEnabled", state.streamAutoPlayNextEpisodeEnabled)
            put("streamAutoPlayNextEpisodeFallbackEnabled", state.streamAutoPlayNextEpisodeFallbackEnabled)
            put("streamAutoPlayPreferBingeGroup", state.streamAutoPlayPreferBingeGroup)
            put("streamAutoPlayReuseBingeGroup", state.streamAutoPlayReuseBingeGroup)
            put("nextEpisodeThresholdMode", state.nextEpisodeThresholdMode.name)
            put("nextEpisodeThresholdPercent", state.nextEpisodeThresholdPercent)
            put("nextEpisodeThresholdMinutesBeforeEnd", state.nextEpisodeThresholdMinutesBeforeEnd)
            put("preloadNextEpisodeSources", state.preloadNextEpisodeSources)
            put("useLibass", state.useLibass)
            put("nvidiaRtxSuperResolutionEnabled", state.nvidiaRtxSuperResolutionEnabled)
            put("nvidiaRtxSuperResolutionSupported", isWindows)
        }
    }

    internal suspend fun saveSkipCredential(
        params: JsonObject,
        verifyIntroDb: suspend (String) -> Boolean = SkipIntroRepository::verifyIntroDbApiKey,
    ): JsonObject {
        PlayerSettingsRepository.ensureLoaded()
        val value = params.str("value").trim()
        when (params.str("key")) {
            "animeSkipClientId" -> PlayerSettingsRepository.setAnimeSkipClientId(value)
            "introDbApiKey" -> {
                val previous = PlayerSettingsRepository.uiState.value.introDbApiKey
                if (value.isNotEmpty() && value != previous && !verifyIntroDb(value)) {
                    throw BridgeFeatureException("INVALID_API_KEY", "Invalid API Key or connection failed")
                }
                PlayerSettingsRepository.setIntroDbApiKey(value)
            }
            else -> throw BridgeFeatureException("INVALID_ARGUMENT", "Unknown skip credential")
        }
        return snapshot()
    }

    private fun set(params: JsonObject): JsonObject {
        PlayerSettingsRepository.ensureLoaded()
        val key = params.str("key")
        val value = params["value"] ?: throw BridgeFeatureException("INVALID_ARGUMENT", "value is required")
        when (key) {
            "chaptersEnabled" -> PlayerSettingsRepository.setAndroidExoChaptersEnabled(value.asBool(key))
            "subtitleAutoSyncEnabled" -> AutoSyncPreferencesRepository.setPreferredSubtitleAutoSyncOnStart(value.asBool(key))
            "subtitleAutoSyncAggressiveMode" -> AutoSyncPreferencesRepository.setAggressiveMode(value.asBool(key))
            "subtitleAutoSyncToleranceMs" -> {
                val tolerance = value.asInt(key)
                if (tolerance !in AutoSyncPreferencesRepository.syncToleranceOptionsMs) invalid(key)
                AutoSyncPreferencesRepository.setSyncToleranceMs(tolerance)
            }
            "showLoadingOverlay" -> PlayerSettingsRepository.setShowLoadingOverlay(value.asBool(key))
            "showPlayerLoadingStatus" -> PlayerSettingsRepository.setShowPlayerLoadingStatus(value.asBool(key))
            "pauseOverlayEnabled" -> PlayerSettingsRepository.setPauseOverlayEnabled(value.asBool(key))
            "showParentalGuide" -> PlayerSettingsRepository.setShowParentalGuide(value.asBool(key))
            "preferredAudioLanguage" -> PlayerSettingsRepository.setPreferredAudioLanguage(value.asString(key))
            "secondaryPreferredAudioLanguage" -> PlayerSettingsRepository.setSecondaryPreferredAudioLanguage(value.asNullableString(key))
            "preferredSubtitleLanguage" -> PlayerSettingsRepository.setPreferredSubtitleLanguage(value.asString(key))
            "secondaryPreferredSubtitleLanguage" -> PlayerSettingsRepository.setSecondaryPreferredSubtitleLanguage(value.asNullableString(key))
            "subtitleStyle" -> PlayerSettingsRepository.setSubtitleStyle(parseSubtitleStyle(value.jsonObject))
            "streamReuseLastLinkEnabled" -> PlayerSettingsRepository.setStreamReuseLastLinkEnabled(value.asBool(key))
            "streamReuseLastLinkCacheHours" -> {
                val hours = value.asInt(key)
                if (hours !in setOf(1, 2, 3, 6, 12, 24, 48, 72, 168)) invalid(key)
                PlayerSettingsRepository.setStreamReuseLastLinkCacheHours(hours)
            }
            "streamAutoPlayMode" -> PlayerSettingsRepository.setStreamAutoPlayMode(enumValue(value.asString(key)))
            "streamAutoPlaySource" -> {
                val source = enumValue<StreamAutoPlaySource>(value.asString(key))
                if (source == StreamAutoPlaySource.ENABLED_PLUGINS_ONLY && !AppFeaturePolicy.pluginsEnabled) throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", "Plugins are unavailable in this app build")
                PlayerSettingsRepository.setStreamAutoPlaySource(source)
            }
            "streamAutoPlaySelectedAddons" -> {
                val selected = value.asStringSet(key)
                val available = AddonRepository.uiState.value.addons.filter { it.isActive }.map { it.displayTitle }.toSet()
                if (!available.containsAll(selected)) throw BridgeFeatureException("INVALID_ARGUMENT", "Selected add-ons must be installed and active")
                PlayerSettingsRepository.setStreamAutoPlaySelectedAddons(selected)
            }
            "streamAutoPlaySelectedPlugins" -> {
                val selected = value.asStringSet(key)
                if (!AppFeaturePolicy.pluginsEnabled && selected.isNotEmpty()) throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", "Plugins are unavailable in this app build")
                val available = PluginRepository.uiState.value.scrapers.filter { it.enabled }.map { it.name }.toSet()
                if (!available.containsAll(selected)) throw BridgeFeatureException("INVALID_ARGUMENT", "Selected plugins must be installed and enabled")
                PlayerSettingsRepository.setStreamAutoPlaySelectedPlugins(selected)
            }
            "streamAutoPlayRegex" -> PlayerSettingsRepository.setStreamAutoPlayRegex(value.asString(key))
            "streamAutoPlayTimeoutSeconds" -> {
                val timeout = value.asInt(key)
                if (timeout !in com.nuvio.app.features.player.STREAM_AUTO_PLAY_TIMEOUT_VALUES) throw BridgeFeatureException("INVALID_ARGUMENT", "Unsupported stream timeout")
                PlayerSettingsRepository.setStreamAutoPlayTimeoutSeconds(timeout)
            }
            "decoderPriority" -> {
                val priority = value.asInt(key)
                if (priority !in 0..2) invalid(key)
                PlayerSettingsRepository.setDecoderPriority(priority)
            }
            "holdToSpeedEnabled" -> PlayerSettingsRepository.setHoldToSpeedEnabled(value.asBool(key))
            "holdToSpeedValue" -> PlayerSettingsRepository.setHoldToSpeedValue(value.asFloat(key).also { if (it !in 1f..4f || (it * 4f) % 1f != 0f) invalid(key) })
            "skipIntroEnabled" -> PlayerSettingsRepository.setSkipIntroEnabled(value.asBool(key))
            "autoSkipSegmentTypes" -> {
                val types = value.asStringSet(key).map { enumValue<AutoSkipSegmentType>(it) }.toSet()
                AutoSkipSegmentType.entries.forEach { PlayerSettingsRepository.setAutoSkipSegmentTypeEnabled(it, it in types) }
            }
            "animeSkipEnabled" -> PlayerSettingsRepository.setAnimeSkipEnabled(value.asBool(key))
            "animeSkipClientId" -> PlayerSettingsRepository.setAnimeSkipClientId(value.asString(key))
            "introDbApiKey" -> PlayerSettingsRepository.setIntroDbApiKey(value.asString(key))
            "introSubmitEnabled" -> PlayerSettingsRepository.setIntroSubmitEnabled(value.asBool(key))
            "streamAutoPlayNextEpisodeEnabled" -> PlayerSettingsRepository.setStreamAutoPlayNextEpisodeEnabled(value.asBool(key))
            "streamAutoPlayNextEpisodeFallbackEnabled" -> PlayerSettingsRepository.setStreamAutoPlayNextEpisodeFallbackEnabled(value.asBool(key))
            "streamAutoPlayPreferBingeGroup" -> PlayerSettingsRepository.setStreamAutoPlayPreferBingeGroup(value.asBool(key))
            "streamAutoPlayReuseBingeGroup" -> PlayerSettingsRepository.setStreamAutoPlayReuseBingeGroup(value.asBool(key))
            "nextEpisodeThresholdMode" -> PlayerSettingsRepository.setNextEpisodeThresholdMode(enumValue<NextEpisodeThresholdMode>(value.asString(key)))
            "nextEpisodeThresholdPercent" -> PlayerSettingsRepository.setNextEpisodeThresholdPercent(value.asFloat(key).also { if (it !in 97f..100f || ((it - 97f) * 2f) % 1f != 0f) invalid(key) })
            "nextEpisodeThresholdMinutesBeforeEnd" -> PlayerSettingsRepository.setNextEpisodeThresholdMinutesBeforeEnd(value.asFloat(key).also { if (it !in 0f..3.5f || (it * 2f) % 1f != 0f) invalid(key) })
            "preloadNextEpisodeSources" -> PlayerSettingsRepository.setPreloadNextEpisodeSources(value.asBool(key))
            "useLibass" -> PlayerSettingsRepository.setUseLibass(value.asBool(key))
            "nvidiaRtxSuperResolutionEnabled" -> PlayerSettingsRepository.setNvidiaRtxSuperResolutionEnabled(value.asBool(key))
            else -> throw BridgeFeatureException("UNKNOWN_SETTING", "Unknown playback setting: $key")
        }
        return snapshot()
    }

    private fun parseSubtitleStyle(json: JsonObject): SubtitleStyleState {
        val defaults = PlayerSettingsRepository.uiState.value.subtitleStyle
        fun color(key: String, default: Color): Color {
            val element = json[key] ?: return default
            return subtitleColorFromStorage(element.asString(key))
                ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be a hexadecimal color")
        }
        fun bool(key: String, default: Boolean) = json[key]?.asBool(key) ?: default
        fun int(key: String, default: Int) = json[key]?.asInt(key) ?: default
        val fontSize = int("fontSizeSp", defaults.fontSizeSp)
        val outlineWidth = int("outlineWidth", defaults.outlineWidth)
        val bottomOffset = int("bottomOffset", defaults.bottomOffset)
        if (fontSize !in 6..40 || outlineWidth !in 0..10 || bottomOffset !in 0..200) throw BridgeFeatureException("INVALID_ARGUMENT", "Subtitle style values are out of range")
        return SubtitleStyleState(
            textColor = color("textColor", defaults.textColor), backgroundColor = color("backgroundColor", defaults.backgroundColor), outlineColor = color("outlineColor", defaults.outlineColor),
            outlineEnabled = bool("outlineEnabled", defaults.outlineEnabled), outlineWidth = outlineWidth, bold = bool("bold", defaults.bold), fontSizeSp = fontSize,
            bottomOffset = bottomOffset, stripSdh = bool("stripSdh", defaults.stripSdh), useForcedSubtitles = bool("useForcedSubtitles", defaults.useForcedSubtitles),
            showOnlyPreferredLanguages = bool("showOnlyPreferredLanguages", defaults.showOnlyPreferredLanguages),
        )
    }

    fun p2pSnapshot(): JsonObject {
        ensureP2pAvailable(); P2pSettingsRepository.ensureLoaded()
        val prefs = P2pSettingsRepository.uiState.value
        val cache = P2pStreamingEngine.cacheState.value
        val stream = P2pStreamingEngine.state.value
        return buildJsonObject {
            put("available", P2pSettingsRepository.isVisible); put("enabled", prefs.p2pEnabled); put("enableUpload", prefs.enableUpload); put("hideTorrentStats", prefs.hideTorrentStats)
            put("torrentProfile", prefs.torrentProfile.name); put("cacheSize", prefs.cacheSize.name)
            put("cache", buildJsonObject { put("usedBytes", cache.usedBytes); put("protectedBytes", cache.protectedBytes); put("isClearing", cache.isClearing); put("hasMeasurement", cache.hasMeasurement) })
            put("stream", when (stream) {
                P2pStreamingState.Idle -> buildJsonObject { put("state", "idle") }
                is P2pStreamingState.Connecting -> buildJsonObject { put("state", "connecting"); put("phase", stream.phase); put("downloadSpeed", stream.downloadSpeed); put("uploadSpeed", stream.uploadSpeed); put("peers", stream.peers); put("seeds", stream.seeds) }
                is P2pStreamingState.Streaming -> buildJsonObject { put("state", "streaming"); put("downloadSpeed", stream.downloadSpeed); put("uploadSpeed", stream.uploadSpeed); put("peers", stream.peers); put("seeds", stream.seeds); put("bufferProgress", stream.bufferProgress); put("totalProgress", stream.totalProgress) }
                is P2pStreamingState.Error -> buildJsonObject { put("state", "error"); put("errorMessage", stream.message) }
            })
        }
    }

    private fun ensureP2pAvailable() { if (!P2pSettingsRepository.isVisible) throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", "Peer-to-peer playback is unavailable in this app build") }
    private inline fun <reified T : Enum<T>> enumValue(value: String): T = enumValues<T>().firstOrNull { it.name.equals(value, true) }
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "Unknown ${T::class.simpleName}: $value")
    private fun invalid(key: String): Nothing = throw BridgeFeatureException("INVALID_ARGUMENT", "Invalid value for $key")
    private fun JsonObject.str(key: String): String = this[key]?.asString(key) ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key is required")
    private fun JsonObject.bool(key: String): Boolean = optionalBool(key) ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be a boolean")
    private fun JsonObject.optionalBool(key: String): Boolean? = this[key]?.takeUnless { it == JsonNull }?.jsonPrimitive?.booleanOrNull
    private fun JsonElement.asString(key: String): String = jsonPrimitive.contentOrNull ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be a string")
    private fun JsonElement.asNullableString(key: String): String? = if (this == JsonNull) null else asString(key)
    private fun JsonElement.asBool(key: String): Boolean = jsonPrimitive.booleanOrNull ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be a boolean")
    private fun JsonElement.asInt(key: String): Int = jsonPrimitive.intOrNull ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be an integer")
    private fun JsonElement.asFloat(key: String): Float = jsonPrimitive.doubleOrNull?.toFloat()?.takeIf(Float::isFinite) ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be a finite number")
    private fun JsonElement.asStringSet(key: String): Set<String> = (this as? JsonArray)?.map { it.asString(key) }?.toSet() ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be an array of strings")
    private fun kotlinx.serialization.json.JsonObjectBuilder.putNullable(key: String, value: String?) { put(key, value?.let(::JsonPrimitive) ?: JsonNull) }
}
