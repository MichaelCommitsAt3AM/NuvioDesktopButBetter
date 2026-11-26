package com.nuvio.desktop.bridge

import com.nuvio.app.features.details.MetaDetailsRepository
import com.nuvio.app.features.details.MetaVideo
import com.nuvio.app.features.home.HomeRepository
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.shuffle.EpisodeShuffleRepository
import com.nuvio.app.features.shuffle.ShuffleSurface
import com.nuvio.app.features.shuffle.shuffleEpisodeProgress
import com.nuvio.app.features.shuffle.watchedShuffleEpisodes
import com.nuvio.app.features.watched.WatchedRepository
import com.nuvio.app.features.watching.application.WatchingActions
import com.nuvio.app.features.watching.application.canMarkWatched
import com.nuvio.app.features.watching.domain.isReleasedBy
import com.nuvio.app.features.watchprogress.ContinueWatchingItem
import com.nuvio.app.features.watchprogress.toContinueWatchingItem
import com.nuvio.app.features.watchprogress.ContinueWatchingPreferencesRepository
import com.nuvio.app.features.watchprogress.ContinueWatchingSectionStyle
import com.nuvio.app.features.watchprogress.ContinueWatchingSortMode
import com.nuvio.app.features.watchprogress.WatchProgressEntry
import com.nuvio.app.features.watchprogress.WatchProgressRepository
import com.nuvio.app.features.watchprogress.ResumePromptRepository
import com.nuvio.app.features.watchprogress.calculateReleaseAlertState
import com.nuvio.app.features.watchprogress.parseReleaseDateToEpochMs
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.time.LocalDate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/** Desktop adapter for Home's richer continue-watching rows and controls. */
object HomeBridge {
    private val upcoming = BridgeBackgroundValue<List<JsonObject>>(emptyList(), CoroutineScope(SupervisorJob() + Dispatchers.Default))
    internal val updates = upcoming.state

    suspend fun dispatch(method: String, params: JsonObject): JsonElement? = when (method) {
        "home.resumePrompt.consume" -> {
            ContinueWatchingPreferencesRepository.ensureLoaded()
            if (!ContinueWatchingPreferencesRepository.uiState.value.showResumePromptOnLaunch) {
                ResumePromptRepository.markPlayerExitedNormally()
                JsonNull
            } else ResumePromptRepository.consumeResumePrompt()?.let { item ->
                buildJsonObject {
                    put("parentMetaId", item.parentMetaId); put("parentMetaType", item.parentMetaType)
                    put("videoId", item.videoId); put("title", item.title); put("subtitle", item.subtitle)
                    putNullable("poster", item.poster); putNullable("background", item.background)
                    putNullable("logo", item.logo); putNullable("imageUrl", item.imageUrl)
                    putNullable("seasonNumber", item.seasonNumber); putNullable("episodeNumber", item.episodeNumber)
                    putNullable("episodeTitle", item.episodeTitle); putNullable("episodeThumbnail", item.episodeThumbnail)
                    put("resumePositionMs", item.resumePositionMs); put("progressFraction", item.progressFraction)
                    put("resumeProgressFraction", item.resumeProgressFraction?.let(::JsonPrimitive) ?: JsonNull)
                }
            } ?: JsonNull
        }
        // Continue Watching is available from the local progress snapshot and
        // should not wait for the potentially slow Next Up metadata lookups.
        // The UI requests `home.extras.refresh` separately for that enrichment.
        "home.extras.snapshot" -> snapshot()
        // Each Home activation is a new shuffle visit, so shuffled series pick a fresh episode the
        // way Kotlin's rememberShuffleHomeItems does on re-activation.
        "home.extras.refresh" -> { shuffleVisit += 1; refreshSnapshot() }
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
        "home.continueWatching.markWatched" -> {
            // Upstream 0.1.35: mark a Continue Watching or Up Next item watched through the
            // shared WatchingActions path (watched state, progress clearing, series reconcile).
            val parentMetaId = params.str("parentMetaId")
            val videoId = params.str("videoId")
            val item = WatchProgressRepository.uiState.value.entries
                .firstOrNull { it.parentMetaId == parentMetaId && it.videoId == videoId }
                ?.toContinueWatchingItem()
                ?: ContinueWatchingItem(
                    parentMetaId = parentMetaId,
                    parentMetaType = params.str("parentMetaType"),
                    videoId = videoId,
                    title = params.str("title"),
                    subtitle = "",
                    imageUrl = null,
                    seasonNumber = params.intOrNull("seasonNumber"),
                    episodeNumber = params.intOrNull("episodeNumber"),
                    episodeTitle = params["episodeTitle"]?.jsonPrimitive?.contentOrNull,
                    released = params["released"]?.jsonPrimitive?.contentOrNull,
                    isNextUp = true,
                    resumePositionMs = 0L,
                    durationMs = 0L,
                    progressFraction = 0f,
                )
            require(item.canMarkWatched()) { "This item cannot be marked as watched yet." }
            WatchingActions.markContinueWatchingWatched(item)
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
            val (continueWatching, upNext) = applyEpisodeShuffle(
                progress.map(::progressJson),
                upcoming.state.value.filterNot { item ->
                    val id = item["parentMetaId"]?.jsonPrimitive?.contentOrNull ?: return@filterNot false
                    val season = item["nextUpSeedSeasonNumber"]?.jsonPrimitive?.intOrNull ?: -1
                    val episode = item["nextUpSeedEpisodeNumber"]?.jsonPrimitive?.intOrNull ?: -1
                    "$id|$season|$episode" in prefs.dismissedNextUpKeys
                },
            )
            put("continueWatching", JsonArray(continueWatching))
            put("upcoming", JsonArray(upNext))
            put("preferences", buildJsonObject {
                put("isVisible", prefs.isVisible)
                put("style", prefs.style.name)
                put("upNextFromFurthestEpisode", prefs.upNextFromFurthestEpisode)
                put("useEpisodeThumbnails", prefs.useEpisodeThumbnails)
                put("showUnairedNextUp", prefs.showUnairedNextUp)
                put("blurNextUp", prefs.blurNextUp)
                put("showResumePromptOnLaunch", prefs.showResumePromptOnLaunch)
                put("sortMode", prefs.sortMode.name)
                put("clickAction", prefs.clickAction.name)
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
        // dispatch runs under the runtime RPC mutex. Return local progress now;
        // cold Next Up metadata may need many remote requests and must not block
        // addon lifecycle observers, profile selection or other snapshots.
        upcoming.refresh {
            resolveUpNext(entries, prefs.dismissedNextUpKeys, prefs.showUnairedNextUp, prefs.upNextFromFurthestEpisode)
        }
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
        EpisodeShuffleRepository.ensureLoaded()
        val shuffleProfile = EpisodeShuffleRepository.uiState.value
        return seeds.mapNotNull { seed ->
            val meta = MetaDetailsRepository.fetch(seed.type, seed.id) ?: return@mapNotNull null
            val next = meta.videos.asSequence()
                .filter { video -> video.season != null && video.episode != null && video.season != 0 }
                .filter { video -> compareEpisode(video, seed.season, seed.episode) > 0 }
                .filter { video -> showUnaired || video.released.isNullOrBlank() || video.released.take(10) <= now }
                .sortedWith(compareBy<MetaVideo> { it.season }.thenBy { it.episode })
                .firstOrNull()
                // A finished series stays on Home while shuffle is on (Kotlin's completed-series
                // shuffle seeds); applyEpisodeShuffle replaces this placeholder with a random pick.
                ?: meta.videos.firstOrNull { it.season != null && it.episode != null }
                    ?.takeIf { shuffleProfile.settings(seed.id, seed.type).enabled }
                ?: return@mapNotNull null
            val key = "${seed.id}|${seed.season}|${seed.episode}"
            if (key in dismissed) return@mapNotNull null
            // Kotlin CachedNextUpItem.toContinueWatchingItem: an episode that aired after the
            // seed was watched (within 60 days) is a "New Episode"/"New Season" alert and sorts
            // by its release time. The shuffle placeholder is never an alert.
            val releaseEpochMs = parseReleaseDateToEpochMs(next.released)
            val alert = if (compareEpisode(next, seed.season, seed.episode) > 0) {
                calculateReleaseAlertState(
                    seedLastUpdatedEpochMs = seed.updated,
                    seedSeasonNumber = seed.season,
                    nextSeasonNumber = next.season,
                    releasedIso = next.released,
                    releaseEpochMs = releaseEpochMs,
                )
            } else {
                null
            }
            val isReleaseAlert = alert?.isReleaseAlert == true
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
                put("lastUpdatedEpochMs", if (isReleaseAlert) releaseEpochMs ?: seed.updated else seed.updated)
                put("resumePositionMs", 0); put("durationMs", 0); put("progressFraction", 0)
                put("isReleaseAlert", isReleaseAlert); put("isNewSeasonRelease", isReleaseAlert && alert?.isNewSeasonRelease == true)
                put("canMarkWatched", isReleasedBy(now, next.released))
            }
        }
    }

    /**
     * Kotlin's applyHomeShuffle for the bridge's JSON rows: a shuffle-enabled series keeps only its
     * most recent in-progress episode, otherwise its Up Next row becomes a randomly picked episode.
     * Both are marked `shufflePlayback` for the card badge. Picks need the series' episode list,
     * which resolveUpNext has already cached; until it has, the series has no shuffled row.
     */
    internal fun applyEpisodeShuffle(
        continueWatching: List<JsonObject>,
        upNext: List<JsonObject>,
    ): Pair<List<JsonObject>, List<JsonObject>> {
        EpisodeShuffleRepository.ensureLoaded()
        val profile = EpisodeShuffleRepository.uiState.value
        fun JsonObject.text(key: String) = this[key]?.jsonPrimitive?.contentOrNull.orEmpty()
        fun JsonObject.enabled() = profile.settings(text("parentMetaId"), text("parentMetaType")).enabled
        if ((continueWatching + upNext).none { it.enabled() }) return continueWatching to upNext
        fun JsonObject.with(vararg fields: Pair<String, JsonElement>) = JsonObject(this + fields)

        val resumable = continueWatching.filter { it.enabled() }
            .groupBy { it.text("parentMetaId") }
            .mapValues { (_, rows) -> rows.maxBy { it["lastUpdatedEpochMs"]?.jsonPrimitive?.longOrNull ?: 0L } }
        val shuffledProgress = continueWatching.mapNotNull { item ->
            when {
                !item.enabled() -> item
                item === resumable[item.text("parentMetaId")] -> item.with("shufflePlayback" to JsonPrimitive(true))
                else -> null
            }
        }

        val profileId = ProfileRepository.activeProfileId
        val entries = WatchProgressRepository.uiState.value.entries
        val watchedKeys = WatchedRepository.uiState.value.watchedKeys
        val now = LocalDate.now().toString()
        val shuffledUpNext = upNext.mapNotNull { item ->
            if (!item.enabled()) return@mapNotNull item
            val id = item.text("parentMetaId")
            val type = item.text("parentMetaType")
            if (id in resumable) return@mapNotNull null
            val videos = MetaDetailsRepository.peek(type, id)?.videos ?: return@mapNotNull null
            val watched = watchedShuffleEpisodes(id, type, videos, watchedKeys)
            val progress = shuffleEpisodeProgress(id, entries)
            val selected = EpisodeShuffleRepository.shuffle.select(
                profileId, id, videos, profile.settings(id, type).includeWatched,
                watched, progress, ShuffleSurface.HOME, visit = shuffleVisit,
            ) ?: return@mapNotNull null
            val season = selected.season
            val episode = selected.episode
            val artwork = selected.thumbnail ?: item.text("background").ifBlank { null } ?: item.text("poster").ifBlank { null }
            val subtitle = if (season != null && episode != null) {
                "S$season · E$episode" + (selected.title.takeIf(String::isNotBlank)?.let { " · $it" } ?: "")
            } else selected.title
            val isWatched = (season != null && episode != null && (season to episode) in watched) ||
                (season != null && episode != null && progress[season to episode]?.isEffectivelyCompleted == true)
            item.with(
                "videoId" to JsonPrimitive(selected.id),
                "seasonNumber" to (season?.let(::JsonPrimitive) ?: JsonNull),
                "episodeNumber" to (episode?.let(::JsonPrimitive) ?: JsonNull),
                "episodeTitle" to JsonPrimitive(selected.title),
                "episodeThumbnail" to (selected.thumbnail?.let(::JsonPrimitive) ?: JsonNull),
                "pauseDescription" to (selected.overview?.let(::JsonPrimitive) ?: JsonNull),
                "imageUrl" to (artwork?.let(::JsonPrimitive) ?: JsonNull),
                "subtitle" to JsonPrimitive(subtitle),
                "released" to (selected.released?.let(::JsonPrimitive) ?: JsonNull),
                "isWatched" to JsonPrimitive(isWatched),
                "isReleaseAlert" to JsonPrimitive(false),
                "isNewSeasonRelease" to JsonPrimitive(false),
                "canMarkWatched" to JsonPrimitive(isReleasedBy(now, selected.released)),
                "shufflePlayback" to JsonPrimitive(true),
            )
        }.distinctBy { if (it.enabled()) it.text("parentMetaId") else it.text("parentMetaId") + ":" + it.text("videoId") }
        return shuffledProgress to shuffledUpNext
    }

    private fun compareEpisode(video: MetaVideo, season: Int, episode: Int): Int =
        compareValues(video.season ?: 0, season).takeIf { it != 0 }
            ?: compareValues(video.episode ?: 0, episode)

    private var shuffleVisit = System.currentTimeMillis()

    fun reset() { upcoming.reset() }

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
        put("canMarkWatched", entry.toContinueWatchingItem().canMarkWatched())
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
