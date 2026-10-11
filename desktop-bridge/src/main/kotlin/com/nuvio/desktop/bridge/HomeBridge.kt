package com.nuvio.desktop.bridge

import com.nuvio.app.features.details.MetaDetailsRepository
import com.nuvio.app.features.details.MetaVideo
import com.nuvio.app.features.home.HomeRepository
import com.nuvio.app.features.watched.WatchedRepository
import com.nuvio.app.features.watchprogress.ContinueWatchingPreferencesRepository
import com.nuvio.app.features.watchprogress.ContinueWatchingSectionStyle
import com.nuvio.app.features.watchprogress.ContinueWatchingSortMode
import com.nuvio.app.features.watchprogress.WatchProgressEntry
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
import kotlinx.serialization.json.put
import java.time.LocalDate

/** Desktop adapter for Home's richer continue-watching rows and controls. */
object HomeBridge {
    private var upcomingCache: List<JsonObject> = emptyList()

    suspend fun dispatch(method: String, params: JsonObject): JsonElement? = when (method) {
        // Continue Watching is available from the local progress snapshot and
        // should not wait for the potentially slow Next Up metadata lookups.
        // The UI requests `home.extras.refresh` separately for that enrichment.
        "home.extras.snapshot" -> snapshot()
        "home.extras.refresh" -> refreshSnapshot()
        "home.continueWatching.remove" -> {
            WatchProgressRepository.removeProgress(
                contentId = params.str("contentId"),
                seasonNumber = params.intOrNull("seasonNumber"),
                episodeNumber = params.intOrNull("episodeNumber"),
            )
            refreshSnapshot()
        }
        "home.continueWatching.reset" -> {
            val id = params.str("parentMetaId")
            WatchProgressRepository.clearProgress(params.str("videoId"), id)
            ContinueWatchingPreferencesRepository.removeDismissedNextUpKeysForContent(id)
            refreshSnapshot()
        }
        "home.continueWatching.dismissUpNext" -> {
            val key = "${params.str("contentId").trim()}|${params.intOrNull("seasonNumber") ?: -1}|${params.intOrNull("episodeNumber") ?: -1}"
            ContinueWatchingPreferencesRepository.addDismissedNextUpKey(key)
            refreshSnapshot()
        }
        "home.preferences.setVisible" -> { ContinueWatchingPreferencesRepository.setVisible(params.bool("enabled", true)); refreshSnapshot() }
        "home.preferences.setStyle" -> {
            ContinueWatchingPreferencesRepository.setStyle(enumValue<ContinueWatchingSectionStyle>(params.str("style")))
            refreshSnapshot()
        }
        "home.preferences.setUpNextFromFurthestEpisode" -> { ContinueWatchingPreferencesRepository.setUpNextFromFurthestEpisode(params.bool("enabled", true)); refreshSnapshot() }
        "home.preferences.setUseEpisodeThumbnails" -> { ContinueWatchingPreferencesRepository.setUseEpisodeThumbnails(params.bool("enabled", true)); refreshSnapshot() }
        "home.preferences.setShowUnairedNextUp" -> { ContinueWatchingPreferencesRepository.setShowUnairedNextUp(params.bool("enabled", true)); refreshSnapshot() }
        "home.preferences.setBlurNextUp" -> { ContinueWatchingPreferencesRepository.setBlurNextUp(params.bool("enabled", false)); refreshSnapshot() }
        "home.preferences.setSortMode" -> {
            ContinueWatchingPreferencesRepository.setSortMode(enumValue<ContinueWatchingSortMode>(params.str("sortMode")))
            refreshSnapshot()
        }
        else -> null
    }

    fun snapshot(): JsonObject {
        WatchProgressRepository.ensureLoaded()
        WatchedRepository.ensureLoaded()
        ContinueWatchingPreferencesRepository.ensureLoaded()
        val prefs = ContinueWatchingPreferencesRepository.uiState.value
        val progress = WatchProgressRepository.continueWatching()
            .filterNot { it.parentMetaId in WatchProgressRepository.uiState.value.hiddenContentIds }
            .sortedByDescending(WatchProgressEntry::lastUpdatedEpochMs)
            .take(30)
        return buildJsonObject {
            // ensureLoaded() synchronously reads this profile's saved progress.
            // Remote sync enriches local data and may fail or remain offline;
            // it must not prevent displaying entries or settling an empty profile.
            put("loading", false)
            put("continueWatching", JsonArray(progress.map(::progressJson)))
            put("upcoming", JsonArray(upcomingCache.filterNot { item ->
                val id = item["parentMetaId"]?.jsonPrimitive?.contentOrNull ?: return@filterNot false
                val season = item["nextUpSeedSeasonNumber"]?.jsonPrimitive?.intOrNull ?: -1
                val episode = item["nextUpSeedEpisodeNumber"]?.jsonPrimitive?.intOrNull ?: -1
                "$id|$season|$episode" in prefs.dismissedNextUpKeys
            }))
            put("preferences", buildJsonObject {
                put("isVisible", prefs.isVisible)
                put("style", prefs.style.name)
                put("upNextFromFurthestEpisode", prefs.upNextFromFurthestEpisode)
                put("useEpisodeThumbnails", prefs.useEpisodeThumbnails)
                put("showUnairedNextUp", prefs.showUnairedNextUp)
                put("blurNextUp", prefs.blurNextUp)
                put("showResumePromptOnLaunch", prefs.showResumePromptOnLaunch)
                put("sortMode", prefs.sortMode.name)
            })
            put("source", WatchProgressRepository.uiState.value.source.name)
        }
    }

    suspend fun refreshSnapshot(): JsonObject {
        WatchProgressRepository.ensureLoaded()
        WatchedRepository.ensureLoaded()
        ContinueWatchingPreferencesRepository.ensureLoaded()
        val prefs = ContinueWatchingPreferencesRepository.uiState.value
        val entries = WatchProgressRepository.uiState.value.entries
            .filterNot { it.parentMetaId in WatchProgressRepository.uiState.value.hiddenContentIds }
        upcomingCache = resolveUpNext(entries, prefs.dismissedNextUpKeys, prefs.showUnairedNextUp, prefs.upNextFromFurthestEpisode)
        return snapshot()
    }

    fun snapshot(topic: String): JsonObject? = if (topic == "homeExtras") snapshot() else null

    private suspend fun resolveUpNext(
        entries: List<WatchProgressEntry>,
        dismissed: Set<String>,
        showUnaired: Boolean,
        preferFurthest: Boolean,
    ): List<JsonObject> {
        data class Seed(val id: String, val type: String, val season: Int, val episode: Int, val updated: Long)
        val progressSeeds = entries.asSequence()
            .filter { it.isEffectivelyCompleted && it.seasonNumber != null && it.episodeNumber != null && it.seasonNumber != 0 }
            .map { Seed(it.parentMetaId, it.parentMetaType, it.seasonNumber!!, it.episodeNumber!!, it.lastUpdatedEpochMs) }
        val watchedSeeds = WatchedRepository.uiState.value.items.asSequence()
            .filter { it.season != null && it.episode != null && it.season != 0 }
            .map { item -> Seed(item.id, item.type, item.season!!, item.episode!!, item.markedAtEpochMs) }
        val seeds = (progressSeeds + watchedSeeds)
            .groupBy(Seed::id)
            .values.mapNotNull { rows ->
                if (preferFurthest) rows.maxWithOrNull(compareBy<Seed> { it.season }.thenBy { it.episode }.thenBy { it.updated })
                else rows.maxByOrNull(Seed::updated)
            }
            .sortedByDescending(Seed::updated)
            .take(16)
        val now = LocalDate.now().toString()
        return seeds.mapNotNull { seed ->
            val meta = MetaDetailsRepository.fetch(seed.type, seed.id) ?: return@mapNotNull null
            val next = meta.videos.asSequence()
                .filter { video -> video.season != null && video.episode != null && video.season != 0 }
                .filter { video -> compareEpisode(video, seed.season, seed.episode) > 0 }
                .filter { video -> showUnaired || video.released.isNullOrBlank() || video.released.take(10) <= now }
                .sortedWith(compareBy<MetaVideo> { it.season }.thenBy { it.episode })
                .firstOrNull() ?: return@mapNotNull null
            val key = "${seed.id}|${seed.season}|${seed.episode}"
            if (key in dismissed) return@mapNotNull null
            buildJsonObject {
                put("parentMetaId", seed.id); put("parentMetaType", seed.type)
                put("videoId", next.id); put("title", meta.name)
                put("subtitle", "S${next.season} · E${next.episode}${next.title.takeIf(String::isNotBlank)?.let { " · $it" }.orEmpty()}")
                putNullable("imageUrl", next.thumbnail ?: meta.background ?: meta.poster)
                putNullable("logo", meta.logo); putNullable("poster", meta.poster); putNullable("background", meta.background)
                put("seasonNumber", next.season!!); put("episodeNumber", next.episode!!)
                putNullable("episodeTitle", next.title); putNullable("episodeThumbnail", next.thumbnail)
                putNullable("pauseDescription", next.overview); putNullable("released", next.released)
                put("isNextUp", true); put("nextUpSeedSeasonNumber", seed.season)
                put("nextUpSeedEpisodeNumber", seed.episode)
                put("lastUpdatedEpochMs", seed.updated)
                put("resumePositionMs", 0); put("durationMs", 0); put("progressFraction", 0)
                put("isReleaseAlert", false); put("isNewSeasonRelease", false)
            }
        }
    }

    private fun compareEpisode(video: MetaVideo, season: Int, episode: Int): Int =
        compareValues(video.season ?: 0, season).takeIf { it != 0 }
            ?: compareValues(video.episode ?: 0, episode)

    fun reset() { upcomingCache = emptyList() }

    private fun progressJson(entry: WatchProgressEntry) = buildJsonObject {
        put("parentMetaId", entry.parentMetaId); put("parentMetaType", entry.parentMetaType)
        put("videoId", entry.videoId); put("title", entry.title)
        put("subtitle", episodeSubtitle(entry))
        putNullable("imageUrl", entry.episodeThumbnail ?: entry.background ?: entry.poster)
        putNullable("logo", entry.logo); putNullable("poster", entry.poster); putNullable("background", entry.background)
        putNullable("seasonNumber", entry.seasonNumber); putNullable("episodeNumber", entry.episodeNumber)
        putNullable("episodeTitle", entry.episodeTitle); putNullable("episodeThumbnail", entry.episodeThumbnail)
        putNullable("pauseDescription", entry.pauseDescription); put("isNextUp", false)
        put("resumePositionMs", entry.lastPositionMs); put("durationMs", entry.durationMs)
        put("progressFraction", entry.progressFraction); put("progressPercent", entry.progressFraction * 100f)
        put("lastUpdatedEpochMs", entry.lastUpdatedEpochMs); put("isWatched", entry.isEffectivelyCompleted)
        putNullable("providerName", entry.providerName); putNullable("lastStreamTitle", entry.lastStreamTitle)
        putNullable("lastStreamSubtitle", entry.lastStreamSubtitle)
    }

    private fun episodeSubtitle(entry: WatchProgressEntry): String = when {
        entry.seasonNumber != null && entry.episodeNumber != null -> "S${entry.seasonNumber} · E${entry.episodeNumber}${entry.episodeTitle?.takeIf(String::isNotBlank)?.let { " · $it" }.orEmpty()}"
        else -> entry.title
    }

    private inline fun <reified T : Enum<T>> enumValue(value: String): T =
        enumValues<T>().firstOrNull { it.name.equals(value, ignoreCase = true) }
            ?: error("Unknown ${T::class.simpleName}: $value")

    private fun JsonObject.str(key: String): String = this[key]?.jsonPrimitive?.contentOrNull ?: error("$key is required")
    private fun JsonObject.bool(key: String, default: Boolean): Boolean = this[key]?.jsonPrimitive?.booleanOrNull ?: default
    private fun JsonObject.intOrNull(key: String): Int? = this[key]?.takeUnless { it == JsonNull }?.jsonPrimitive?.intOrNull
    private fun kotlinx.serialization.json.JsonObjectBuilder.putNullable(key: String, value: String?) {
        put(key, value?.let(::JsonPrimitive) ?: JsonNull)
    }
    private fun kotlinx.serialization.json.JsonObjectBuilder.putNullable(key: String, value: Int?) {
        put(key, value?.let(::JsonPrimitive) ?: JsonNull)
    }
}
