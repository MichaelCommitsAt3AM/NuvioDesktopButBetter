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
import com.nuvio.app.features.downloads.DownloadsPlatformDownloader
import com.nuvio.app.features.downloads.posterArtwork
import com.nuvio.app.features.downloads.watchStatus
import com.nuvio.app.core.poster.CustomPosterScreen
import com.nuvio.app.core.poster.CustomPosterUrlRepository
import com.nuvio.app.core.poster.CustomPosterUrlResolver
import com.nuvio.app.features.watchprogress.WatchProgressRepository
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
        "downloads.pauseAll" -> { DownloadsRepository.pauseActiveDownloads(); snapshot() }
        "downloads.resumeAll" -> { DownloadsRepository.resumePausedDownloads(); snapshot() }
        "downloads.markSeen" -> {
            DownloadsRepository.ensureLoaded()
            DownloadsRepository.markCompletedSeen()
            snapshot()
        }
        "downloads.openFolder" -> {
            // Scoped to the backend-managed downloads directory resolved by
            // the existing platform downloader; never an arbitrary path.
            val opened = DownloadsPlatformDownloader.openDownloadsDirectory()
            if (!opened) throw BridgeFeatureException("PLATFORM_UNAVAILABLE", "The downloads folder could not be opened on this device")
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
        "downloads.filter.setBitrateLimitEnabled" -> {
            DownloadFilterSettingsRepository.setBitrateLimitEnabled(params.bool("enabled"))
            filterSnapshot()
        }
        "downloads.filter.setMaxBitrateKbps" -> {
            val kbps = params.long("kbps")
            if (kbps <= 0L) throw BridgeFeatureException("INVALID_ARGUMENT", "kbps must be positive")
            DownloadFilterSettingsRepository.setMaxBitrateKbps(kbps.coerceAtMost(Int.MAX_VALUE.toLong()).toInt())
            filterSnapshot()
        }
        "downloads.filter.setDataUse" -> {
            DownloadFilterSettingsRepository.setDataUse(DataSaverBridge.preset(params.str("preset")))
            filterSnapshot()
        }
        "downloads.filter.setTierBitrateKbps" -> {
            DownloadFilterSettingsRepository.setTierBitrateKbps(
                DataSaverBridge.settingTier(params.str("tier")),
                DataSaverBridge.positiveKbps(params.long("kbps")),
            )
            filterSnapshot()
        }
        "downloads.filter.setScaleBitrateByCodec" -> {
            DownloadFilterSettingsRepository.setScaleBitrateByCodec(params.bool("enabled"))
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
            val items = DownloadsRepository.uiState.value.items
            updateSpeeds(items)
            val progressState = WatchProgressRepository.uiState.value
            val posterPattern = libraryPosterPattern()
            put("items", JsonArray(items.map { item -> itemJson(item, progressState, posterPattern) }))
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
            put("minMaxSizeBytes", DownloadFilterSettingsRepository.minMaxSizeBytes)
            put("maxMaxSizeBytes", DownloadFilterConfig.MAX_MAX_SIZE_BYTES)
            put("bitrateLimitEnabled", config.bitrateLimitEnabled)
            put("maxBitrateKbps", config.maxBitrateKbps)
            put("scaleBitrateByCodec", config.scaleBitrateByCodec)
            put("minMaxBitrateKbps", DownloadFilterConfig.MIN_MAX_BITRATE_KBPS)
            put("maxMaxBitrateKbps", DownloadFilterConfig.MAX_MAX_BITRATE_KBPS)
            // Data use levels and per-resolution limits (ported from NuvioMobileButBetter).
            val tiers = com.nuvio.app.features.datasaver.DataSaverDesktopAccess.settingResolutions
            put("dataUse", config.dataUsePreset().name.lowercase())
            put("resolutions", JsonArray(tiers.map { JsonPrimitive(it.name.lowercase()) }))
            put("tierLimitsKbps", buildJsonObject { tiers.forEach { put(it.name.lowercase(), config.tierBitrateKbps(it)) } })
            put("levelKbps", buildJsonObject {
                com.nuvio.app.features.downloads.DataUsePreset.levels.forEach {
                    put(it.name.lowercase(), it.scale(DownloadFilterConfig.defaultTierBitrateKbps(StreamResolutionTier.FHD_1080)))
                }
            })
            put("choicesKbps", DataSaverBridge.choices(tiers))
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

    private suspend fun mutate(id: String, allowed: Set<DownloadStatus>?, operation: String): JsonObject {
        DownloadsRepository.ensureLoaded()
        val current = DownloadsRepository.uiState.value.items.firstOrNull { it.id == id }
            ?: throw BridgeFeatureException("DOWNLOAD_NOT_FOUND", "Download does not exist")
        KidsBridge.requireMedia(current.parentMetaType, current.parentMetaId)
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

    private fun itemJson(
        item: DownloadItem,
        progressState: com.nuvio.app.features.watchprogress.WatchProgressUiState = WatchProgressRepository.uiState.value,
        posterPattern: String = libraryPosterPattern(),
    ) = buildJsonObject {
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
        // Upstream 0.1.38 downloads redesign: live speed, watch state and the library custom-poster setting.
        putNullable("bytesPerSecond", synchronized(speedLock) { speeds[item.id] })
        val watch = item.watchStatus(progressState)
        put("watched", watch.isWatched); put("watchProgress", watch.progress.toDouble()); put("remainingMs", watch.remainingMs)
        putNullable("customPoster", customPosterUrl(item, posterPattern))
    }

    private val speedLock = Any()
    private val speedSamples = mutableMapOf<String, Pair<Long, Long>>()
    private val speeds = mutableMapOf<String, Long>()

    /** Same smoothing as upstream's DownloadSpeedTracker, sampled whenever the downloads state is published. */
    private fun updateSpeeds(items: List<DownloadItem>) = synchronized(speedLock) {
        val downloading = items.filter { it.status == DownloadStatus.Downloading }
        downloading.forEach { item ->
            val previous = speedSamples.put(item.id, item.downloadedBytes to item.updatedAtEpochMs) ?: return@forEach
            val elapsedMs = item.updatedAtEpochMs - previous.second
            val receivedBytes = item.downloadedBytes - previous.first
            if (elapsedMs <= 0L || receivedBytes < 0L) return@forEach
            val bytesPerSecond = receivedBytes * 1_000L / elapsedMs
            speeds[item.id] = speeds[item.id]?.let { (it * 7L + bytesPerSecond * 3L) / 10L } ?: bytesPerSecond
        }
        val ids = downloading.mapTo(mutableSetOf()) { it.id }
        speedSamples.keys.retainAll(ids)
        speeds.keys.retainAll(ids)
    }

    private fun libraryPosterPattern(): String {
        CustomPosterUrlRepository.ensureLoaded()
        return CustomPosterUrlRepository.pattern.value.takeIf { CustomPosterScreen.LIBRARY in CustomPosterUrlRepository.enabledScreens.value }.orEmpty()
    }

    private fun customPosterUrl(item: DownloadItem, pattern: String): String? {
        if (pattern.isBlank()) return null
        return CustomPosterUrlResolver.resolve(
            pattern = pattern,
            ids = CustomPosterUrlResolver.extractIds(item.parentMetaId),
            type = if (item.parentMetaType.equals("movie", ignoreCase = true)) "movie" else "series",
        )?.takeIf { it != item.posterArtwork() }
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
