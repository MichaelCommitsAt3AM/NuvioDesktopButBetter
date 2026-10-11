package com.nuvio.desktop.bridge.features

import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.details.MetaVideo
import com.nuvio.app.features.downloads.DownloadEnqueueResult
import com.nuvio.app.features.downloads.DownloadFilterConfig
import com.nuvio.app.features.downloads.DownloadFilterSettingsRepository
import com.nuvio.app.features.downloads.DownloadItem
import com.nuvio.app.features.downloads.DownloadsRepository
import com.nuvio.app.features.downloads.DownloadStatus
import com.nuvio.app.features.downloads.StreamResolutionTier
import com.nuvio.app.features.downloads.StreamSourceType
import com.nuvio.app.features.streams.StreamItem
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

sealed interface DownloadEnqueueBridgeResult {
    data class RequiresReplacementConfirmation(val existingDownload: JsonObject) : DownloadEnqueueBridgeResult
    data class Enqueued(val result: DownloadEnqueueResult, val snapshot: JsonObject) : DownloadEnqueueBridgeResult
}

/** Local downloads RPC projection. Source URLs, request headers and file URIs are never serialized. */
object DownloadsBridge {
    suspend fun dispatch(method: String, params: JsonObject): JsonElement? = when (method) {
        "downloads.snapshot" -> snapshot()
        "downloads.pause" -> mutate(params.str("id"), setOf(DownloadStatus.Downloading), "pause")
        "downloads.resume" -> mutate(params.str("id"), setOf(DownloadStatus.Paused, DownloadStatus.Failed), "resume")
        "downloads.retry" -> mutate(params.str("id"), setOf(DownloadStatus.Failed), "retry")
        "downloads.cancel" -> mutate(params.str("id"), setOf(DownloadStatus.Downloading, DownloadStatus.Paused, DownloadStatus.Failed), "cancel")
        "downloads.remove" -> mutate(params.str("id"), null, "remove")
        "downloads.markSeen" -> {
            DownloadsRepository.ensureLoaded()
            DownloadsRepository.markCompletedSeen()
            snapshot()
        }
        "downloads.filter.snapshot" -> filterSnapshot()
        "downloads.filter.setMaxResolution" -> {
            DownloadFilterSettingsRepository.setMaxResolution(enumValue(params.str("tier")))
            filterSnapshot()
        }
        "downloads.filter.setSourceAllowed" -> {
            DownloadFilterSettingsRepository.setSourceAllowed(enumValue(params.str("source")), params.bool("allowed"))
            filterSnapshot()
        }
        "downloads.filter.setMaxSizeBytes" -> {
            val bytes = params.long("bytes")
            if (bytes <= 0L) throw BridgeFeatureException("INVALID_ARGUMENT", "bytes must be positive")
            DownloadFilterSettingsRepository.setMaxSizeBytes(bytes)
            filterSnapshot()
        }
        "downloads.filter.setShowUnknownSize" -> {
            DownloadFilterSettingsRepository.setShowUnknownSizeStreams(params.bool("enabled"))
            filterSnapshot()
        }
        "downloads.filter.reset" -> {
            DownloadFilterSettingsRepository.resetToDefaults()
            filterSnapshot()
        }
        else -> null
    }

    fun snapshot(): JsonObject {
        DownloadsRepository.ensureLoaded()
        return buildJsonObject {
            put("items", JsonArray(DownloadsRepository.uiState.value.items.map(::itemJson)))
            put("hasUnseenCompleted", DownloadsRepository.hasUnseenCompleted.value)
            put("filter", filterSnapshot())
        }
    }

    fun filterSnapshot(): JsonObject {
        val config = DownloadFilterSettingsRepository.snapshot()
        return buildJsonObject {
            put("maxResolution", config.maxResolution.name.lowercase())
            put("allowedSources", JsonArray(config.allowedSources.map { JsonPrimitive(it.name.lowercase()) }.sortedBy { it.content }))
            put("maxSizeBytes", config.maxSizeBytes)
            put("showUnknownSizeStreams", config.showUnknownSizeStreams)
            put("minMaxSizeBytes", DownloadFilterConfig.MIN_MAX_SIZE_BYTES)
            put("maxMaxSizeBytes", DownloadFilterConfig.MAX_MAX_SIZE_BYTES)
        }
    }

    /**
     * Enqueue a resolved/direct stream for a metadata item. Existing downloads for the same logical
     * movie or episode are left untouched until the caller passes explicit replacement confirmation.
     */
    fun enqueue(
        stream: StreamItem,
        meta: MetaDetails,
        video: MetaVideo? = null,
        replaceExistingConfirmed: Boolean = false,
    ): DownloadEnqueueBridgeResult {
        DownloadsRepository.ensureLoaded()
        val season = video?.season
        val episode = video?.episode
        val logicalKey = if (season != null && episode != null) {
            "${meta.id.trim()}|$season|$episode"
        } else {
            "${meta.id.trim()}|movie"
        }
        val existing = DownloadsRepository.uiState.value.items.firstOrNull { it.logicalContentKey == logicalKey }
        if (existing != null && !replaceExistingConfirmed) {
            return DownloadEnqueueBridgeResult.RequiresReplacementConfirmation(itemJson(existing))
        }
        val result = DownloadsRepository.enqueueFromStream(
            contentType = meta.type,
            videoId = video?.id ?: meta.defaultVideoId ?: meta.id,
            parentMetaId = meta.id,
            parentMetaType = meta.type,
            title = meta.name,
            logo = meta.logo,
            poster = meta.poster,
            background = meta.background,
            seasonNumber = season,
            episodeNumber = episode,
            episodeTitle = video?.title,
            episodeThumbnail = video?.thumbnail,
            stream = stream,
        )
        return DownloadEnqueueBridgeResult.Enqueued(result, snapshot())
    }

    /** Returns an internal repository item only when it resolves to a playable local file. */
    fun getPlayableItem(downloadId: String): DownloadItem? {
        DownloadsRepository.ensureLoaded()
        val item = DownloadsRepository.uiState.value.items.firstOrNull { it.id == downloadId } ?: return null
        if (!item.isPlayable || DownloadsRepository.playableLocalFileUri(item).isNullOrBlank()) return null
        return DownloadsRepository.uiState.value.items.firstOrNull { it.id == downloadId && it.status == DownloadStatus.Completed }
    }

    private fun mutate(id: String, allowed: Set<DownloadStatus>?, operation: String): JsonObject {
        DownloadsRepository.ensureLoaded()
        val current = DownloadsRepository.uiState.value.items.firstOrNull { it.id == id }
            ?: throw BridgeFeatureException("DOWNLOAD_NOT_FOUND", "Download does not exist")
        if (allowed != null && current.status !in allowed) {
            throw BridgeFeatureException("INVALID_DOWNLOAD_STATE", "Cannot $operation a download in ${current.status.name.lowercase()} state")
        }
        when (operation) {
            "pause" -> DownloadsRepository.pauseDownload(id)
            "resume" -> DownloadsRepository.resumeDownload(id)
            "retry" -> DownloadsRepository.retryDownload(id)
            "cancel", "remove" -> DownloadsRepository.cancelDownload(id)
            else -> throw BridgeFeatureException("UNKNOWN_OPERATION", "Unknown download operation")
        }
        if (operation == "cancel" || operation == "remove") {
            if (DownloadsRepository.uiState.value.items.any { it.id == id }) {
                throw BridgeFeatureException("DOWNLOAD_OPERATION_FAILED", "Download could not be removed")
            }
        } else {
            val next = DownloadsRepository.uiState.value.items.firstOrNull { it.id == id }
            val expected = when (operation) {
                "pause" -> DownloadStatus.Paused
                "resume", "retry" -> DownloadStatus.Downloading
                else -> current.status
            }
            if (next == null || next.status != expected) {
                throw BridgeFeatureException("DOWNLOAD_OPERATION_FAILED", "Download could not be $operation")
            }
        }
        return snapshot()
    }

    private fun itemJson(item: DownloadItem) = buildJsonObject {
        put("id", item.id); put("contentType", item.contentType); put("parentMetaId", item.parentMetaId)
        put("parentMetaType", item.parentMetaType); put("videoId", item.videoId); put("title", item.title)
        putNullable("logo", item.logo); putNullable("poster", item.poster); putNullable("background", item.background)
        putNullable("seasonNumber", item.seasonNumber); putNullable("episodeNumber", item.episodeNumber)
        putNullable("episodeTitle", item.episodeTitle); putNullable("episodeThumbnail", item.episodeThumbnail)
        put("streamTitle", item.streamTitle); putNullable("streamSubtitle", item.streamSubtitle); put("providerName", item.providerName)
        put("fileName", item.fileName); put("status", item.status.name.lowercase())
        put("downloadedBytes", item.downloadedBytes); putNullable("totalBytes", item.totalBytes)
        put("progress", item.progressFraction.toDouble()); putNullable("error", item.errorMessage)
        put("createdAtEpochMs", item.createdAtEpochMs); put("updatedAtEpochMs", item.updatedAtEpochMs)
        put("playable", item.isPlayable)
    }

    private inline fun <reified T : Enum<T>> enumValue(value: String): T = enumValues<T>().firstOrNull { it.name.equals(value, true) }
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "Unknown ${T::class.simpleName}: $value")

    private fun JsonObject.str(key: String) = this[key]?.jsonPrimitive?.contentOrNull
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key is required")
    private fun JsonObject.bool(key: String) = this[key]?.jsonPrimitive?.booleanOrNull
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be a boolean")
    private fun JsonObject.long(key: String) = this[key]?.jsonPrimitive?.longOrNull
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be an integer")
    private fun kotlinx.serialization.json.JsonObjectBuilder.putNullable(key: String, value: String?) { put(key, value?.let(::JsonPrimitive) ?: JsonNull) }
    private fun kotlinx.serialization.json.JsonObjectBuilder.putNullable(key: String, value: Int?) { put(key, value?.let(::JsonPrimitive) ?: JsonNull) }
    private fun kotlinx.serialization.json.JsonObjectBuilder.putNullable(key: String, value: Long?) { put(key, value?.let(::JsonPrimitive) ?: JsonNull) }
}
