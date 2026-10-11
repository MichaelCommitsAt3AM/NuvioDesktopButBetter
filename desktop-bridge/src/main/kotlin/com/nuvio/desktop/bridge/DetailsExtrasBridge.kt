package com.nuvio.desktop.bridge

import com.nuvio.app.features.details.MetaCompany
import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.details.MetaExternalRating
import com.nuvio.app.features.details.MetaLink
import com.nuvio.app.features.details.MetaPerson
import com.nuvio.app.features.details.MetaTrailer
import com.nuvio.app.features.details.MetaVideo
import com.nuvio.app.features.details.MetaDetailsRepository
import com.nuvio.app.features.home.MetaPreview
import com.nuvio.app.features.tmdb.TmdbEntityKind
import com.nuvio.app.features.tmdb.TmdbEntityMediaType
import com.nuvio.app.features.tmdb.TmdbEntityRailType
import com.nuvio.app.features.tmdb.TmdbMetadataService
import com.nuvio.app.features.tmdb.TmdbSettingsRepository
import com.nuvio.app.features.tmdb.normalizeTmdbLanguage
import com.nuvio.app.features.watched.WatchedRepository
import com.nuvio.app.features.watched.releasedEpisodesForSeason
import com.nuvio.app.features.watched.previousReleasedEpisodesBefore
import com.nuvio.app.features.watched.watchedItemKey
import com.nuvio.app.features.watching.application.WatchingActions
import com.nuvio.app.features.watchprogress.CurrentDateProvider
import com.nuvio.app.features.trakt.TraktAuthRepository
import com.nuvio.app.features.trakt.TraktCommentsRepository
import com.nuvio.app.features.trakt.TraktCommentsSettings
import com.nuvio.app.features.trakt.TraktConnectionMode
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
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.put

/** Bridge adapter for rich details metadata, TMDB entity/person browsing, and watched actions. */
object DetailsExtrasBridge {
    suspend fun dispatch(method: String, params: JsonObject): JsonElement? = when (method) {
        "details.shuffle.snapshot", "details.shuffle.pick", "details.shuffle.save" -> shuffleSnapshot(method, params)
        "details.extras" -> metaDetailsJson(requireMeta(params.str("type"), params.str("id")))
        "details.comments.page" -> commentsPage(params)
        "details.person" -> {
            val personId = params.int("personId")
            val detail = TmdbMetadataService.fetchPersonDetail(
                personId = personId,
                preferCrewCredits = params.nullableBool("preferCrew"),
            ) ?: error("Person details are unavailable")
            personDetailJson(detail)
        }
        "details.entity" -> {
            val kind = TmdbEntityKind.fromRouteValue(params.str("kind"))
            val entityId = params.int("entityId")
            val browse = TmdbMetadataService.fetchEntityBrowse(
                entityKind = kind,
                entityId = entityId,
                sourceType = params.str("sourceType"),
                fallbackName = params.optionalStr("name"),
            ) ?: error("Company details are unavailable")
            buildJsonObject {
                put("header", buildJsonObject {
                    put("id", browse.header.id)
                    put("kind", browse.header.kind.routeValue)
                    put("name", browse.header.name)
                    putNullable("logo", browse.header.logo)
                    putNullable("originCountry", browse.header.originCountry)
                    putNullable("secondaryLabel", browse.header.secondaryLabel)
                    putNullable("description", browse.header.description)
                })
                put("rails", JsonArray(browse.rails.map { rail -> buildJsonObject {
                    put("mediaType", rail.mediaType.value)
                    put("railType", rail.railType.value)
                    put("currentPage", rail.currentPage)
                    put("hasMore", rail.hasMore)
                    put("loading", rail.isLoading)
                    put("items", JsonArray(rail.items.map(::mediaJson)))
                } }))
            }
        }
        "details.entity.page" -> {
            val kind = TmdbEntityKind.fromRouteValue(params.str("kind"))
            val mediaType = TmdbEntityMediaType.entries.firstOrNull { it.value == params.str("mediaType") }
                ?: error("mediaType must be movie or tv")
            val railType = TmdbEntityRailType.entries.firstOrNull { it.value == params.str("railType") }
                ?: error("Unknown entity rail type")
            val page = params.int("page")
            require(page > 0) { "page must be positive" }
            val result = TmdbMetadataService.fetchEntityRailPage(
                entityKind = kind,
                entityId = params.int("entityId"),
                mediaType = mediaType,
                railType = railType,
                language = normalizeTmdbLanguage(TmdbSettingsRepository.snapshot().language),
                page = page,
            )
            buildJsonObject {
                put("page", page)
                put("hasMore", result.hasMore)
                put("items", JsonArray(result.items.map(::mediaJson)))
            }
        }
        "details.watched.snapshot" -> watchedSnapshot(params.optionalStr("type"), params.optionalStr("id"))
        "details.watched.toggle" -> {
            WatchedRepository.ensureLoaded()
            WatchingActions.togglePosterWatched(
                MetaPreview(
                    id = params.str("id"),
                    type = params.str("type"),
                    name = params.str("name"),
                    poster = params.optionalStr("poster"),
                    banner = params.optionalStr("background"),
                    logo = params.optionalStr("logo"),
                    description = params.optionalStr("description"),
                    releaseInfo = params.optionalStr("releaseInfo"),
                    rawReleaseDate = null,
                    imdbRating = params.optionalStr("rating"),
                    genres = params.stringArray("genres"),
                ),
            )
            watchedSnapshot(params.optionalStr("type"), params.optionalStr("id"))
        }
        "details.watched.toggleEpisode" -> {
            val meta = requireMeta(params.str("type"), params.str("id"))
            val episode = meta.videos.firstOrNull { video ->
                video.id == params.optionalStr("videoId") ||
                    (video.season == params.optionalInt("season") && video.episode == params.optionalInt("episode"))
            } ?: error("Episode details are unavailable")
            WatchedRepository.ensureLoaded()
            val currentlyWatched = WatchedRepository.isWatched(meta.id, meta.type, episode.season, episode.episode)
            WatchingActions.toggleEpisodeWatched(meta, episode, currentlyWatched)
            watchedSnapshot(meta.type, meta.id)
        }
        "details.watched.togglePreviousEpisodes" -> {
            val meta = requireMeta(params.str("type"), params.str("id"))
            val episode = meta.videos.firstOrNull { video ->
                video.id == params.optionalStr("videoId") ||
                    (video.season == params.optionalInt("season") && video.episode == params.optionalInt("episode"))
            } ?: error("Episode details are unavailable")
            val previous = meta.previousReleasedEpisodesBefore(episode, CurrentDateProvider.todayIsoDate())
            require(previous.isNotEmpty()) { "No earlier released episodes are available" }
            WatchedRepository.ensureLoaded()
            val allWatched = previous.all { item ->
                WatchedRepository.isWatched(meta.id, meta.type, item.season, item.episode)
            }
            WatchingActions.togglePreviousEpisodesWatched(meta, previous, allWatched)
            watchedSnapshot(meta.type, meta.id)
        }
        "details.watched.toggleSeason" -> {
            val meta = requireMeta(params.str("type"), params.str("id"))
            val season = params.int("season")
            val episodes = meta.releasedEpisodesForSeason(season, CurrentDateProvider.todayIsoDate())
            require(episodes.isNotEmpty()) { "No released episodes are available for this season" }
            WatchedRepository.ensureLoaded()
            val allWatched = episodes.all { episode ->
                WatchedRepository.isWatched(meta.id, meta.type, episode.season, episode.episode)
            }
            WatchingActions.toggleSeasonWatched(meta, episodes, allWatched)
            watchedSnapshot(meta.type, meta.id)
        }
        else -> null
    }

    private suspend fun requireMeta(type: String, id: String): MetaDetails {
        MetaDetailsRepository.peek(type, id)?.let { return it }
        return MetaDetailsRepository.fetch(type, id) ?: error("Title details are unavailable")
    }

    private suspend fun commentsPage(params: JsonObject): JsonObject {
        TraktCommentsSettings.ensureLoaded()
        val enabled = TraktCommentsSettings.enabled.value &&
            TraktAuthRepository.uiState.value.mode == TraktConnectionMode.CONNECTED
        if (!enabled) return buildJsonObject {
            put("enabled", false); put("items", JsonArray(emptyList()))
            put("currentPage", 0); put("pageCount", 0); put("itemCount", 0)
        }
        val meta = requireMeta(params.str("type"), params.str("id"))
        val result = TraktCommentsRepository.getCommentsPage(
            meta = meta,
            page = params.int("page", 1).coerceAtLeast(1),
            forceRefresh = params.bool("forceRefresh", false),
        )
        return buildJsonObject {
            put("enabled", true); put("currentPage", result.currentPage)
            put("pageCount", result.pageCount); put("itemCount", result.itemCount)
            put("items", JsonArray(result.items.map { comment -> buildJsonObject {
                put("id", comment.id); put("authorDisplayName", comment.authorDisplayName)
                putNullable("authorUsername", comment.authorUsername); put("comment", comment.comment)
                put("spoiler", comment.spoiler); put("containsInlineSpoilers", comment.containsInlineSpoilers)
                put("review", comment.review); put("likes", comment.likes)
                putNullable("rating", comment.rating); putNullable("createdAt", comment.createdAt)
                putNullable("updatedAt", comment.updatedAt)
            } }))
        }
    }

    private fun watchedSnapshot(type: String?, id: String?): JsonObject {
        WatchedRepository.ensureLoaded()
        val watched = WatchedRepository.uiState.value
        return buildJsonObject {
            put("loaded", watched.isLoaded)
            put("watchedKeys", JsonArray(watched.watchedKeys.map(::JsonPrimitive)))
            if (!type.isNullOrBlank() && !id.isNullOrBlank()) {
                put("watched", WatchedRepository.isWatched(id, type))
                put("fullyWatched", WatchedRepository.isFullyWatchedSeries(id, type))
                put("seriesKey", watchedItemKey(type, id))
                put("episodes", JsonArray(watched.items.filter { item -> item.id == id && item.type == type && item.season != null && item.episode != null }.map { item -> buildJsonObject {
                    put("season", item.season)
                    put("episode", item.episode)
                    putNullable("videoId", item.videoId)
                    put("key", watchedItemKey(type, id, item.season, item.episode))
                } }))
            }
        }
    }

    private fun metaDetailsJson(meta: MetaDetails) = buildJsonObject {
        put("id", meta.id)
        put("type", meta.type)
        put("name", meta.name)
        putNullable("imdbId", meta.imdbId)
        putNullable("poster", meta.poster)
        putNullable("background", meta.background)
        putNullable("logo", meta.logo)
        putNullable("description", meta.description)
        putNullable("releaseInfo", meta.releaseInfo)
        putNullable("lastAirDate", meta.lastAirDate)
        putNullable("status", meta.status)
        putNullable("rating", meta.imdbRating)
        putNullable("ageRating", meta.ageRating)
        putNullable("runtime", meta.runtime)
        put("externalRatings", JsonArray(meta.externalRatings.map(::externalRatingJson)))
        put("genres", JsonArray(meta.genres.map(::JsonPrimitive)))
        put("director", JsonArray(meta.director.map(::JsonPrimitive)))
        put("writer", JsonArray(meta.writer.map(::JsonPrimitive)))
        put("cast", JsonArray(meta.cast.map(::personJson)))
        put("productionCompanies", JsonArray(meta.productionCompanies.map(::companyJson)))
        put("networks", JsonArray(meta.networks.map(::companyJson)))
        putNullable("country", meta.country)
        putNullable("awards", meta.awards)
        putNullable("language", meta.language)
        putNullable("website", meta.website)
        put("hasScheduledVideos", meta.hasScheduledVideos)
        putNullable("defaultVideoId", meta.defaultVideoId)
        put("moreLikeThis", JsonArray(meta.moreLikeThis.map(::mediaJson)))
        putNullable("moreLikeThisSource", meta.moreLikeThisSource?.name?.lowercase())
        putNullable("collectionName", meta.collectionName)
        put("collectionItems", JsonArray(meta.collectionItems.map(::mediaJson)))
        put("trailers", JsonArray(meta.trailers.map(::trailerJson)))
        put("links", JsonArray(meta.links.map(::linkJson)))
        put("seasonPosters", buildJsonObject {
            meta.seasonPosters.forEach { (season, poster) -> put(season.toString(), poster) }
        })
        put("videos", JsonArray(meta.videos.map(::videoJson)))
    }

    private fun personDetailJson(person: com.nuvio.app.features.details.PersonDetail) = buildJsonObject {
        put("tmdbId", person.tmdbId)
        put("name", person.name)
        putNullable("biography", person.biography)
        putNullable("birthday", person.birthday)
        putNullable("deathday", person.deathday)
        putNullable("placeOfBirth", person.placeOfBirth)
        putNullable("profilePhoto", person.profilePhoto)
        putNullable("knownFor", person.knownFor)
        put("movieCredits", JsonArray(person.movieCredits.map(::mediaJson)))
        put("tvCredits", JsonArray(person.tvCredits.map(::mediaJson)))
    }

    private fun mediaJson(item: MetaPreview) = buildJsonObject {
        put("id", item.id)
        put("type", item.type)
        put("name", item.name)
        putNullable("poster", item.poster)
        putNullable("background", item.banner ?: item.landscapePoster)
        putNullable("logo", item.logo)
        putNullable("description", item.description)
        putNullable("releaseInfo", item.releaseInfo)
        putNullable("rating", item.imdbRating)
        put("genres", JsonArray(item.genres.map(::JsonPrimitive)))
    }

    private fun externalRatingJson(rating: MetaExternalRating) = buildJsonObject {
        put("source", rating.source)
        put("value", rating.value)
        put("certified", rating.isCertified)
    }

    private fun personJson(person: MetaPerson) = buildJsonObject {
        put("name", person.name)
        putNullable("role", person.role)
        putNullable("photo", person.photo)
        put("tmdbId", person.tmdbId?.let(::JsonPrimitive) ?: JsonNull)
    }

    private fun companyJson(company: MetaCompany) = buildJsonObject {
        put("name", company.name)
        putNullable("logo", company.logo)
        put("tmdbId", company.tmdbId?.let(::JsonPrimitive) ?: JsonNull)
    }

    private fun trailerJson(trailer: MetaTrailer) = buildJsonObject {
        put("id", trailer.id)
        put("key", trailer.key)
        put("name", trailer.name)
        put("site", trailer.site)
        put("size", trailer.size?.let(::JsonPrimitive) ?: JsonNull)
        put("type", trailer.type)
        put("official", trailer.official)
        putNullable("publishedAt", trailer.publishedAt)
        put("seasonNumber", trailer.seasonNumber?.let(::JsonPrimitive) ?: JsonNull)
        putNullable("displayName", trailer.displayName)
        putNullable("iso6391", trailer.iso6391)
        put("youtubeUrl", trailer.key.takeIf { it.startsWith("http://") || it.startsWith("https://") }
            ?: "https://www.youtube.com/watch?v=${trailer.key}")
    }

    private fun linkJson(link: MetaLink) = buildJsonObject {
        put("name", link.name)
        put("category", link.category)
        put("url", link.url)
    }

    private suspend fun shuffleSnapshot(method: String, params: JsonObject): JsonObject {
        val repository = com.nuvio.app.features.shuffle.EpisodeShuffleRepository
        repository.ensureLoaded(); WatchedRepository.ensureLoaded()
        com.nuvio.app.features.watchprogress.WatchProgressRepository.ensureLoaded()
        val meta = requireMeta(params.str("type"), params.str("id"))
        val profileId = com.nuvio.app.features.profiles.ProfileRepository.activeProfileId
        val saved = repository.uiState.value.settings(meta.id, meta.type)
        val includeWatched = params.bool("includeWatched", saved.includeWatched)
        if (method == "details.shuffle.save") {
            require(repository.uiState.value.available) { "Enable episode shuffle in Details settings first" }
            check(repository.save(meta.id, com.nuvio.app.features.shuffle.EpisodeShuffleSettings(params.bool("enabled", true), includeWatched), profileId)) { "Shuffle settings could not be saved" }
        }
        val watched = com.nuvio.app.features.shuffle.watchedShuffleEpisodes(meta.id, meta.type, meta.videos, WatchedRepository.uiState.value.watchedKeys)
        val progress = com.nuvio.app.features.shuffle.shuffleEpisodeProgress(meta.id, com.nuvio.app.features.watchprogress.WatchProgressRepository.uiState.value.entries)
        val picker = com.nuvio.app.features.shuffle.RandomEpisodePicker(meta.id, meta.videos, watched, progress)
        val selected = if (method == "details.shuffle.pick") {
            if (params.bool("reroll", false)) repository.shuffle.clearSelection(profileId, meta.id, com.nuvio.app.features.shuffle.ShuffleSurface.DETAIL)
            repository.shuffle.select(profileId, meta.id, meta.videos, includeWatched, watched, progress, com.nuvio.app.features.shuffle.ShuffleSurface.DETAIL)
        } else null
        com.nuvio.app.features.details.MetaScreenSettingsRepository.ensureLoaded()
        val blur = com.nuvio.app.features.details.MetaScreenSettingsRepository.uiState.value.blurUnwatchedEpisodes
        return buildJsonObject {
            put("available", repository.uiState.value.available && meta.type.lowercase() in setOf("series", "tv", "show", "tvshow"))
            put("enabled", repository.uiState.value.settings(meta.id, meta.type).enabled)
            put("includeWatched", includeWatched); put("allCount", picker.count(true)); put("unwatchedCount", picker.count(false))
            put("episode", selected?.let(::videoJson) ?: JsonNull)
            put("watched", selected?.let(picker::isWatched) ?: false)
            put("hideArtwork", selected != null && blur && !picker.isWatched(selected))
            put("resume", selected?.let { progress[it.season to it.episode]?.isResumable } ?: false)
        }
    }

    private fun videoJson(video: MetaVideo) = buildJsonObject {
        put("id", video.id)
        put("title", video.title)
        putNullable("released", video.released)
        put("available", video.available)
        putNullable("thumbnail", video.thumbnail)
        putNullable("seasonPoster", video.seasonPoster)
        put("season", video.season?.let(::JsonPrimitive) ?: JsonNull)
        put("episode", video.episode?.let(::JsonPrimitive) ?: JsonNull)
        putNullable("overview", video.overview)
        put("runtime", video.runtime?.let(::JsonPrimitive) ?: JsonNull)
        put("rating", video.rating?.let(::JsonPrimitive) ?: JsonNull)
    }

    private fun JsonObject.str(key: String): String =
        this[key]?.jsonPrimitive?.contentOrNull ?: error("$key is required")

    private fun JsonObject.optionalStr(key: String): String? =
        this[key]?.takeUnless { it == JsonNull }?.jsonPrimitive?.contentOrNull

    private fun JsonObject.int(key: String): Int =
        this[key]?.jsonPrimitive?.intOrNull ?: error("$key must be an integer")

    private fun JsonObject.int(key: String, default: Int): Int =
        this[key]?.jsonPrimitive?.intOrNull ?: default

    private fun JsonObject.bool(key: String, default: Boolean): Boolean =
        this[key]?.jsonPrimitive?.booleanOrNull ?: default

    private fun JsonObject.optionalInt(key: String): Int? =
        this[key]?.takeUnless { it == JsonNull }?.jsonPrimitive?.intOrNull

    private fun JsonObject.nullableBool(key: String): Boolean? =
        this[key]?.takeUnless { it == JsonNull }?.jsonPrimitive?.booleanOrNull

    private fun JsonObject.stringArray(key: String): List<String> =
        (this[key] as? JsonArray).orEmpty().mapNotNull { it.jsonPrimitive.contentOrNull }

    private fun JsonObjectBuilder.putNullable(key: String, value: String?) {
        put(key, value?.let(::JsonPrimitive) ?: JsonNull)
    }

    private fun JsonObjectBuilder.putNullable(key: String, value: Int?) {
        put(key, value?.let(::JsonPrimitive) ?: JsonNull)
    }
}
