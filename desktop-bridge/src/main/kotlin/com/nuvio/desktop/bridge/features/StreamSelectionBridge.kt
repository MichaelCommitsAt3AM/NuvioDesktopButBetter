package com.nuvio.desktop.bridge.features

import com.nuvio.app.features.downloads.DownloadStreamFilterMode
import com.nuvio.app.features.debrid.DirectDebridPlaybackResolver
import com.nuvio.app.features.streams.StreamBadgeSettingsRepository
import com.nuvio.app.features.streams.StreamBadgePlacement
import com.nuvio.app.features.streams.StreamBackgroundMode
import com.nuvio.app.features.streams.StreamBadgeImportResult
import com.nuvio.app.features.streams.StreamItem
import com.nuvio.app.features.streams.StreamsRepository
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** Safe presentation and upstream state actions for streams. Stream identity stays owned by the caller. */
object StreamSelectionBridge {
    private val badgeJson = Json { encodeDefaults = true }

    suspend fun dispatch(
        method: String,
        params: JsonObject,
        resolveStream: (String) -> StreamItem? = { null },
    ): JsonElement? = when (method) {
        "streams.snapshot" -> snapshot()
        "streams.badges.setFileSizeEnabled" -> { StreamBadgeSettingsRepository.setShowFileSizeBadges(params.bool("enabled")); snapshot() }
        "streams.badges.setAddonLogoEnabled" -> { StreamBadgeSettingsRepository.setShowAddonLogo(params.bool("enabled")); snapshot() }
        "streams.badges.setPlacement" -> { StreamBadgeSettingsRepository.setBadgePlacement(bridgeEnum(params.str("placement"))); snapshot() }
        "streams.badges.setBackgroundMode" -> { StreamBadgeSettingsRepository.setBackgroundMode(bridgeEnum(params.str("mode"))); snapshot() }
        "streams.badges.rules.importFromUrl" -> {
            when (val result = StreamBadgeSettingsRepository.importStreamBadgeRulesFromUrl(params.str("url"))) {
                is StreamBadgeImportResult.Success -> snapshot()
                is StreamBadgeImportResult.Error -> throw BridgeFeatureException("INVALID_ARGUMENT", result.message)
            }
        }
        "streams.badges.rules.setActive" -> { StreamBadgeSettingsRepository.setActiveStreamBadgeRulesSource(params.str("url")); snapshot() }
        "streams.badges.rules.remove" -> { StreamBadgeSettingsRepository.deleteStreamBadgeRulesSource(params.str("url")); snapshot() }
        "streams.filter.set" -> {
            val addonId = params["addonId"]?.let { if (it == JsonNull) null else it.str("addonId") }
            if (addonId != null && StreamsRepository.uiState.value.groups.none { it.addonId == addonId }) {
                throw BridgeFeatureException("NOT_FOUND", "The selected stream provider is no longer available.")
            }
            StreamsRepository.selectFilter(addonId)
            snapshot()
        }
        "streams.downloadFilter.set" -> {
            val value = enumValue(params.str("mode"))
            StreamsRepository.setDownloadFilterMode(value)
            snapshot()
        }
        "streams.cancel" -> {
            StreamsRepository.cancelLoading()
            snapshot()
        }
        "streams.autoplay.consume" -> {
            StreamsRepository.consumeAutoPlay()
            snapshot()
        }
        "streams.autoplay.skip" -> {
            val id = params.str("streamId")
            val stream = resolveStream(id) ?: throw BridgeFeatureException("NOT_FOUND", "The selected stream is no longer available.")
            buildJsonObject {
                put("hasNext", StreamsRepository.skipAutoPlayStream(stream))
                put("snapshot", snapshot())
            }
        }
        else -> null
    }

    fun snapshot(): JsonObject {
        StreamBadgeSettingsRepository.ensureLoaded()
        val state = StreamsRepository.uiState.value
        val badgeSettings = StreamBadgeSettingsRepository.uiState.value
        return buildJsonObject {
            put("requestId", state.requestToken ?: "")
            put("loading", state.isAnyLoading)
            put("autoPlayDecided", state.autoPlayDecided)
            put("selectedAddonId", state.selectedFilter?.let(::JsonPrimitive) ?: JsonNull)
            put("downloadFilterMode", state.downloadFilterMode.name.lowercase())
            put("emptyState", state.emptyStateReason?.name?.lowercase()?.let(::JsonPrimitive) ?: JsonNull)
            put("autoPlay", buildJsonObject {
                put("enabled", state.autoPlayStream != null || state.isDirectAutoPlayFlow)
                put("hasSelectedStream", state.autoPlayStream != null)
                put("candidateCount", state.autoPlayCandidates.size)
                put("directFlow", state.isDirectAutoPlayFlow)
                put("overlayVisible", state.showDirectAutoPlayOverlay)
                put("message", state.overlayMessage?.let(::JsonPrimitive) ?: JsonNull)
            })
            put("providers", JsonArray(state.groups.map { group ->
                buildJsonObject {
                    put("id", group.addonId)
                    put("name", group.addonName)
                    put("loading", group.isLoading)
                    put("error", group.error?.let { JsonPrimitive(safeText(it)) } ?: JsonNull)
                    put("count", group.streams.size)
                }
            }))
            put("badges", buildJsonObject {
                put("showFileSize", badgeSettings.showFileSizeBadges)
                put("showAddonLogo", badgeSettings.showAddonLogo)
                put("placement", badgeSettings.badgePlacement.name.lowercase())
                put("backgroundMode", badgeSettings.backgroundMode.name.lowercase())
                put("rules", badgeJson.encodeToJsonElement(badgeSettings.rules.normalized()))
            })
        }
    }

    /** Project a StreamItem to UI-safe metadata. Never includes URLs, headers, magnet URIs or credentials. */
    fun present(streamId: String, stream: StreamItem): JsonObject = buildJsonObject {
        put("id", streamId)
        put("name", safeText(stream.streamLabel))
        put("description", stream.streamSubtitle?.let { JsonPrimitive(safeText(it)) } ?: JsonNull)
        put("provider", safeText(stream.addonName))
        put("providerId", safeText(stream.addonId))
        put("providerLogo", stream.addonLogo?.takeIf { it.startsWith("https://", true) }?.let(::JsonPrimitive) ?: JsonNull)
        put("source", stream.sourceName?.let { JsonPrimitive(safeText(it)) } ?: JsonNull)
        put("streamType", stream.streamType?.let { JsonPrimitive(safeText(it)) } ?: JsonNull)
        put("playable", stream.hasPlayableSource)
        put("direct", stream.playableDirectUrl != null)
        put("external", stream.shouldOpenExternally)
        put("torrent", stream.isTorrentStream)
        put("cached", stream.isCachedDebridTorrentStream)
        put("resolvingDebrid", DirectDebridPlaybackResolver.shouldResolveToPlayableStream(stream))
        put("fileName", stream.behaviorHints.filename?.let { JsonPrimitive(safeText(it)) } ?: JsonNull)
        put("fileSizeBytes", stream.behaviorHints.videoSize?.let(::JsonPrimitive) ?: JsonNull)
        put("bingeGroup", stream.behaviorHints.bingeGroup?.let { JsonPrimitive(safeText(it)) } ?: JsonNull)
        put("notWebReady", stream.behaviorHints.notWebReady)
        put("cacheStatus", stream.debridCacheStatus?.state?.name?.lowercase()?.let(::JsonPrimitive) ?: JsonNull)
        put("badges", JsonArray(stream.badges.map { badge ->
            buildJsonObject {
                put("name", safeText(badge.name))
                put("imageUrl", badge.imageURL.takeIf { it.startsWith("https://", true) } ?: "")
                put("tagColor", safeColor(badge.tagColor))
                put("tagStyle", safeText(badge.tagStyle))
                put("textColor", safeColor(badge.textColor))
                put("borderColor", safeColor(badge.borderColor))
            }
        }))
        val parsed = stream.clientResolve?.stream?.raw?.parsed
        if (parsed != null) put("metadata", buildJsonObject {
            put("resolution", parsed.resolution?.let { JsonPrimitive(safeText(it)) } ?: JsonNull)
            put("quality", parsed.quality?.let { JsonPrimitive(safeText(it)) } ?: JsonNull)
            put("codec", parsed.codec?.let { JsonPrimitive(safeText(it)) } ?: JsonNull)
            put("hdr", JsonArray(parsed.hdr.map { JsonPrimitive(safeText(it)) }))
            put("audio", JsonArray(parsed.audio.map { JsonPrimitive(safeText(it)) }))
            put("channels", JsonArray(parsed.channels.map { JsonPrimitive(safeText(it)) }))
            put("languages", JsonArray(parsed.languages.map { JsonPrimitive(safeText(it)) }))
            put("year", parsed.year?.let(::JsonPrimitive) ?: JsonNull)
        }) else put("metadata", JsonNull)
    }

    private fun safeText(value: String): String = value
        .replace(Regex("(?i)\\b(?:https?|magnet|torrent)://\\S+"), "")
        .replace(Regex("(?i)\\b(?:token|apikey|api_key|password|authorization)=\\S+"), "")
        .replace(Regex("[\\r\\n\\t]+"), " ")
        .trim()
        .take(240)

    private fun safeColor(value: String): String = value.trim().takeIf {
        it.matches(Regex("#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})"))
    }?.let { if (it.startsWith('#')) it else "#$it" } ?: ""
}

private fun JsonElement.str(name: String): String = jsonPrimitive.content

private fun JsonObject.bool(key: String): Boolean =
    this[key]?.jsonPrimitive?.booleanOrNull ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be a boolean")

private fun enumValue(value: String): DownloadStreamFilterMode =
    DownloadStreamFilterMode.entries.firstOrNull { it.name.equals(value, ignoreCase = true) }
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "Unsupported stream filter mode.")

private inline fun <reified T : Enum<T>> bridgeEnum(value: String): T =
    enumValues<T>().firstOrNull { it.name.equals(value, ignoreCase = true) }
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "Unsupported value.")
