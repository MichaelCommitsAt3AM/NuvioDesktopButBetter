package com.nuvio.desktop.bridge

import com.nuvio.app.features.collection.AvailableCatalog
import com.nuvio.app.features.collection.Collection
import com.nuvio.app.features.collection.CollectionEditorRepository
import com.nuvio.app.features.collection.CollectionEditorUiState
import com.nuvio.app.features.collection.CollectionFolder
import com.nuvio.app.features.collection.CollectionRepository
import com.nuvio.app.features.collection.CollectionSource
import com.nuvio.app.features.collection.FolderDetailRepository
import com.nuvio.app.features.collection.FolderDetailUiState
import com.nuvio.app.features.collection.FolderViewMode
import com.nuvio.app.features.collection.TmdbBuilderMode
import com.nuvio.app.features.collection.TmdbCollectionFilters
import com.nuvio.app.features.collection.TmdbCollectionMediaType
import com.nuvio.app.features.collection.TmdbCollectionSourceResolver
import com.nuvio.app.features.home.MetaPreview
import com.nuvio.app.features.home.PosterShape
import com.nuvio.app.features.trakt.TraktPublicListSearchResult
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

/** Desktop bridge for collection management, the original collection editor, and folder browsing. */
object CollectionsBridge {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    fun reset() {
        FolderDetailRepository.clear()
        CollectionEditorRepository.clear()
    }

    fun dispatch(method: String, params: JsonObject): JsonElement? {
        CollectionRepository.initialize()
        return when (method) {
            "collections.snapshot" -> collectionsSnapshot()
            "collections.export" -> buildJsonObject { put("json", CollectionRepository.exportToJson()) }
            "collections.validateImport" -> CollectionRepository.validateJson(params.str("json")).let { validation -> buildJsonObject {
                put("valid", validation.valid); put("error", validation.error)
                put("collectionCount", validation.collectionCount); put("folderCount", validation.folderCount)
            } }
            "collections.import" -> {
                require(params.bool("confirmed")) { "Confirm replacing collections before importing" }
                CollectionRepository.importFromJson(params.str("json")).getOrThrow()
                collectionsSnapshot()
            }
            "collections.remove" -> { CollectionRepository.removeCollection(params.str("id")); collectionsSnapshot() }
            "collections.move" -> { CollectionRepository.moveByIndex(params.int("from"), params.int("to")); collectionsSnapshot() }
            "collections.editor.snapshot" -> editorSnapshot()
            "collections.editor.open" -> { CollectionEditorRepository.initialize(params.optionalStr("collectionId")); editorSnapshot() }
            "collections.editor.setTitle" -> { CollectionEditorRepository.setTitle(params.str("title")); editorSnapshot() }
            "collections.editor.setBackdrop" -> { CollectionEditorRepository.setBackdropImageUrl(params.str("url")); editorSnapshot() }
            "collections.editor.setPinToTop" -> { CollectionEditorRepository.setPinToTop(params.bool("enabled")); editorSnapshot() }
            "collections.editor.setViewMode" -> { CollectionEditorRepository.setViewMode(enumValue<FolderViewMode>(params.str("mode"))); editorSnapshot() }
            "collections.editor.setShowAllTab" -> { CollectionEditorRepository.setShowAllTab(params.bool("enabled")); editorSnapshot() }
            "collections.editor.addFolder" -> { CollectionEditorRepository.addFolder(params.str("title")); editorSnapshot() }
            "collections.editor.editFolder" -> { CollectionEditorRepository.editFolder(params.str("id")); editorSnapshot() }
            "collections.editor.removeFolder" -> { CollectionEditorRepository.removeFolder(params.str("id")); editorSnapshot() }
            "collections.editor.moveFolder" -> { CollectionEditorRepository.moveFolderByIndex(params.int("from"), params.int("to")); editorSnapshot() }
            "collections.editor.cancelFolder" -> { CollectionEditorRepository.cancelFolderEdit(); editorSnapshot() }
            "collections.editor.saveFolder" -> { CollectionEditorRepository.saveFolderEdit(); editorSnapshot() }
            "collections.editor.save" -> {
                if (!CollectionEditorRepository.save()) error("Enter a collection name before saving")
                CollectionEditorRepository.clear()
                collectionsSnapshot()
            }
            "collections.editor.cancel" -> { CollectionEditorRepository.clear(); editorSnapshot() }
            "collections.editor.updateFolder" -> updateFolder(params)
            "collections.editor.showCatalogPicker" -> { CollectionEditorRepository.showCatalogPicker(); editorSnapshot() }
            "collections.editor.hideCatalogPicker" -> { CollectionEditorRepository.hideCatalogPicker(); editorSnapshot() }
            "collections.editor.toggleCatalog" -> { CollectionEditorRepository.toggleCatalogSource(catalog(params.json("catalog"))); editorSnapshot() }
            "collections.editor.removeSource" -> { CollectionEditorRepository.removeCatalogSource(params.int("index")); editorSnapshot() }
            "collections.editor.setCatalogGenre" -> { CollectionEditorRepository.updateCatalogSourceGenre(params.int("index"), params.optionalStr("genre")); editorSnapshot() }
            "collections.editor.showGenrePicker" -> { CollectionEditorRepository.showGenrePicker(params.int("index")); editorSnapshot() }
            "collections.editor.hideGenrePicker" -> { CollectionEditorRepository.hideGenrePicker(); editorSnapshot() }
            "collections.editor.showTmdbPicker" -> { CollectionEditorRepository.showTmdbSourcePicker(); editorSnapshot() }
            "collections.editor.hideTmdbPicker" -> { CollectionEditorRepository.hideTmdbSourcePicker(); editorSnapshot() }
            "collections.editor.tmdb.setMode" -> { CollectionEditorRepository.setTmdbBuilderMode(enumValue<TmdbBuilderMode>(params.str("mode"))); editorSnapshot() }
            "collections.editor.tmdb.setInput" -> { CollectionEditorRepository.setTmdbInput(params.str("value")); editorSnapshot() }
            "collections.editor.tmdb.setTitle" -> { CollectionEditorRepository.setTmdbTitleInput(params.str("value")); editorSnapshot() }
            "collections.editor.tmdb.setMediaType" -> { CollectionEditorRepository.setTmdbMediaType(enumValue<TmdbCollectionMediaType>(params.str("value"))); editorSnapshot() }
            "collections.editor.tmdb.setMediaBoth" -> { CollectionEditorRepository.setTmdbMediaBoth(params.bool("enabled")); editorSnapshot() }
            "collections.editor.tmdb.setSort" -> { CollectionEditorRepository.setTmdbSortBy(params.str("value")); editorSnapshot() }
            "collections.editor.tmdb.setFilters" -> { CollectionEditorRepository.updateTmdbFilters { filters(params.json("filters")) }; editorSnapshot() }
            "collections.editor.tmdb.searchCompanies" -> { CollectionEditorRepository.searchTmdbCompanies(); editorSnapshot() }
            "collections.editor.tmdb.searchCollections" -> { CollectionEditorRepository.searchTmdbCollections(); editorSnapshot() }
            "collections.editor.tmdb.addInput" -> { CollectionEditorRepository.addTmdbSourceFromInput(); editorSnapshot() }
            "collections.editor.tmdb.addSource" -> { CollectionEditorRepository.addTmdbSource(source(params.json("source"))); editorSnapshot() }
            "collections.editor.tmdb.addPreset" -> {
                val preset = TmdbCollectionSourceResolver.presets().getOrNull(params.int("index")) ?: error("Unknown preset")
                CollectionEditorRepository.addTmdbPreset(preset.source); editorSnapshot()
            }
            "collections.editor.tmdb.addSources" -> { CollectionEditorRepository.addTmdbSourcesFromPicker(params.json("sources").jsonArray.map { source(it.jsonObject) }); editorSnapshot() }
            "collections.editor.showTraktPicker" -> { CollectionEditorRepository.showTraktSourcePicker(); editorSnapshot() }
            "collections.editor.hideTraktPicker" -> { CollectionEditorRepository.hideTraktSourcePicker(); editorSnapshot() }
            "collections.editor.editTraktSource" -> { CollectionEditorRepository.editTraktSource(params.int("index")); editorSnapshot() }
            "collections.editor.trakt.setInput" -> { CollectionEditorRepository.setTraktInput(params.str("value")); editorSnapshot() }
            "collections.editor.trakt.setTitle" -> { CollectionEditorRepository.setTraktTitleInput(params.str("value")); editorSnapshot() }
            "collections.editor.trakt.setMediaType" -> { CollectionEditorRepository.setTraktMediaType(enumValue<TmdbCollectionMediaType>(params.str("value"))); editorSnapshot() }
            "collections.editor.trakt.setMediaBoth" -> { CollectionEditorRepository.setTraktMediaBoth(params.bool("enabled")); editorSnapshot() }
            "collections.editor.trakt.setSort" -> { CollectionEditorRepository.setTraktSortBy(params.str("value")); editorSnapshot() }
            "collections.editor.trakt.setDirection" -> { CollectionEditorRepository.setTraktSortHow(params.str("value")); editorSnapshot() }
            "collections.editor.trakt.search" -> { CollectionEditorRepository.searchTraktLists(); editorSnapshot() }
            "collections.editor.trakt.addInput" -> { CollectionEditorRepository.addTraktSourceFromInput(); editorSnapshot() }
            "collections.editor.trakt.addResult" -> { CollectionEditorRepository.addTraktSourceFromResult(traktResult(params.json("result"))); editorSnapshot() }
            "collections.editor.trakt.addSources" -> { params.json("results").jsonArray.forEach { CollectionEditorRepository.addTraktSourceFromResult(traktResult(it.jsonObject)) }; editorSnapshot() }
            "collections.folder.snapshot" -> folderSnapshot()
            "collections.folder.open" -> { FolderDetailRepository.initialize(params.str("collectionId"), params.str("folderId")); folderSnapshot() }
            "collections.folder.selectTab" -> { FolderDetailRepository.selectTab(params.int("index")); folderSnapshot() }
            "collections.folder.loadMore" -> { FolderDetailRepository.loadMoreSelectedTab(); folderSnapshot() }
            "collections.folder.refresh" -> { FolderDetailRepository.clear(); FolderDetailRepository.initialize(params.str("collectionId"), params.str("folderId")); folderSnapshot() }
            else -> null
        }
    }

    fun snapshot(topic: String): JsonObject? = when (topic) {
        "collections" -> collectionsSnapshot()
        "collectionEditor" -> editorSnapshot()
        "folderDetail" -> folderSnapshot()
        else -> null
    }

    private fun collectionsSnapshot() = buildJsonObject {
        put("items", JsonArray(CollectionRepository.collections.value.map { encode(it) }))
    }

    private fun editorSnapshot(): JsonObject {
        val state = CollectionEditorRepository.uiState.value
        return editorJson(state)
    }

    private fun editorJson(state: CollectionEditorUiState) = buildJsonObject {
        put("isNew", state.isNew); put("collectionId", state.collectionId); put("title", state.title)
        put("backdropImageUrl", state.backdropImageUrl); put("pinToTop", state.pinToTop)
        put("viewMode", state.viewMode.name); put("showAllTab", state.showAllTab)
        put("folders", JsonArray(state.folders.map(::encode))); put("isLoading", state.isLoading)
        put("availableCatalogs", JsonArray(state.availableCatalogs.map(::catalogJson)))
        put("editingFolder", state.editingFolder?.let(::encode) ?: JsonNull)
        put("showFolderEditor", state.showFolderEditor); put("showCatalogPicker", state.showCatalogPicker)
        put("showTmdbSourcePicker", state.showTmdbSourcePicker); put("showTraktSourcePicker", state.showTraktSourcePicker)
        put("editingTraktSourceIndex", state.editingTraktSourceIndex?.let(::JsonPrimitive) ?: JsonNull)
        put("genrePickerSourceIndex", state.genrePickerSourceIndex?.let(::JsonPrimitive) ?: JsonNull)
        put("tmdbBuilderMode", state.tmdbBuilderMode.name); put("tmdbInput", state.tmdbInput); put("tmdbTitleInput", state.tmdbTitleInput)
        put("tmdbMediaType", state.tmdbMediaType.name); put("tmdbMediaBoth", state.tmdbMediaBoth); put("tmdbSortBy", state.tmdbSortBy)
        put("tmdbFilters", encode(state.tmdbFilters)); put("tmdbCompanyResults", JsonArray(state.tmdbCompanyResults.map { buildJsonObject {
            put("id", it.id); putNullable("name", it.name); putNullable("originCountry", it.originCountry)
        } }))
        put("tmdbPresets", JsonArray(TmdbCollectionSourceResolver.presets().map { preset -> buildJsonObject {
            put("label", preset.label); put("source", encode(preset.source))
        } }))
        put("tmdbCollectionResults", JsonArray(state.tmdbCollectionResults.map { buildJsonObject {
            put("id", it.id); putNullable("name", it.name); putNullable("posterPath", it.posterPath); putNullable("backdropPath", it.backdropPath)
        } }))
        putNullable("tmdbSearchError", state.tmdbSearchError); put("traktInput", state.traktInput); put("traktTitleInput", state.traktTitleInput)
        put("traktMediaType", state.traktMediaType.name); put("traktMediaBoth", state.traktMediaBoth); put("traktSortBy", state.traktSortBy); put("traktSortHow", state.traktSortHow)
        put("traktSearchResults", JsonArray(state.traktSearchResults.map(::traktResultJson)))
        put("traktTrendingResults", JsonArray(state.traktTrendingResults.map(::traktResultJson)))
        put("traktPopularResults", JsonArray(state.traktPopularResults.map(::traktResultJson)))
        putNullable("traktSearchError", state.traktSearchError); put("sourcePickerCompletionGeneration", state.sourcePickerCompletionGeneration)
    }

    private fun folderSnapshot() = folderJson(FolderDetailRepository.uiState.value)
    private fun folderJson(state: FolderDetailUiState) = buildJsonObject {
        put("folder", state.folder?.let(::encode) ?: JsonNull); put("collectionTitle", state.collectionTitle)
        put("viewMode", state.viewMode.name); put("selectedTabIndex", state.selectedTabIndex)
        put("isLoading", state.isLoading); put("showAllTab", state.showAllTab)
        put("tabs", JsonArray(state.tabs.map { tab -> buildJsonObject {
            put("label", tab.label); put("typeLabel", tab.typeLabel); put("source", tab.source?.let(::encode) ?: JsonNull)
            put("sourceKey", tab.sourceKey?.let(::JsonPrimitive) ?: JsonNull); put("manifestUrl", tab.manifestUrl?.let(::JsonPrimitive) ?: JsonNull)
            put("type", tab.type); put("catalogId", tab.catalogId); putNullable("genre", tab.genre)
            put("supportsPagination", tab.supportsPagination); put("items", JsonArray(tab.items.map(::mediaJson)))
            put("isLoading", tab.isLoading); put("isLoadingMore", tab.isLoadingMore); put("canLoadMore", tab.canLoadMore)
            putNullable("error", tab.error); put("isAllTab", tab.isAllTab)
        } }))
    }

    private fun updateFolder(params: JsonObject): JsonObject {
        when (params.str("field")) {
            "title" -> CollectionEditorRepository.updateFolderTitle(params.str("value"))
            "coverImageUrl" -> CollectionEditorRepository.updateFolderCoverImage(params.str("value"))
            "focusGifUrl" -> CollectionEditorRepository.updateFolderFocusGifUrl(params.str("value"))
            "mobileFocusGifEnabled" -> CollectionEditorRepository.updateFolderMobileFocusGifEnabled(params.bool("enabled"))
            "coverEmoji" -> CollectionEditorRepository.updateFolderCoverEmoji(params.str("value"))
            "clearCover" -> CollectionEditorRepository.clearFolderCover()
            "tileShape" -> CollectionEditorRepository.updateFolderTileShape(enumValue<PosterShape>(params.str("value")))
            "hideTitle" -> CollectionEditorRepository.updateFolderHideTitle(params.bool("enabled"))
            else -> error("Unknown folder field")
        }
        return editorSnapshot()
    }

    private fun catalog(params: JsonObject): AvailableCatalog {
        val c = params.jsonObject
        return AvailableCatalog(c.str("addonId"), c.str("addonName"), c.str("type"), c.str("catalogId"), c.str("catalogName"), c["genreOptions"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }.orEmpty(), c.bool("genreRequired", false))
    }
    private fun source(value: JsonObject): CollectionSource = json.decodeFromJsonElement(value)
    private fun filters(value: JsonObject): TmdbCollectionFilters = json.decodeFromJsonElement(value)
    private fun traktResult(value: JsonObject) = TraktPublicListSearchResult(
        traktListId = value["traktListId"]?.jsonPrimitive?.longOrNull ?: error("traktListId must be an integer"),
        title = value.str("title"), subtitle = value.str("subtitle"), coverImageUrl = value.optionalStr("coverImageUrl"),
        sortBy = value.optionalStr("sortBy"), sortHow = value.optionalStr("sortHow"),
    )
    private fun catalogJson(c: AvailableCatalog) = buildJsonObject {
        put("addonId", c.addonId); put("addonName", c.addonName); put("type", c.type); put("catalogId", c.catalogId); put("catalogName", c.catalogName)
        put("genreOptions", JsonArray(c.genreOptions.map(::JsonPrimitive))); put("genreRequired", c.genreRequired)
    }
    private fun traktResultJson(value: TraktPublicListSearchResult) = buildJsonObject {
        put("traktListId", value.traktListId); put("title", value.title); put("subtitle", value.subtitle)
        putNullable("coverImageUrl", value.coverImageUrl); putNullable("sortBy", value.sortBy); putNullable("sortHow", value.sortHow)
    }
    private fun mediaJson(item: MetaPreview) = buildJsonObject {
        put("id", item.id); put("type", item.type); put("name", item.name); putNullable("poster", item.poster)
        putNullable("background", item.banner ?: item.landscapePoster); putNullable("logo", item.logo); putNullable("description", item.description)
        putNullable("releaseInfo", item.releaseInfo); putNullable("rating", item.imdbRating); put("genres", JsonArray(item.genres.map(::JsonPrimitive)))
    }
    private fun encode(collection: Collection): JsonElement = json.encodeToJsonElement(Collection.serializer(), collection)
    private fun encode(folder: CollectionFolder): JsonElement = json.encodeToJsonElement(CollectionFolder.serializer(), folder)
    private fun encode(source: CollectionSource): JsonElement = json.encodeToJsonElement(CollectionSource.serializer(), source)
    private fun encode(filters: TmdbCollectionFilters): JsonElement = json.encodeToJsonElement(TmdbCollectionFilters.serializer(), filters)

    private inline fun <reified T : Enum<T>> enumValue(value: String): T = enumValues<T>().firstOrNull { it.name.equals(value, true) } ?: error("Unknown ${T::class.simpleName}: $value")
    private fun JsonObject.str(key: String): String = this[key]?.jsonPrimitive?.contentOrNull ?: error("$key is required")
    private fun JsonObject.optionalStr(key: String): String? = this[key]?.takeUnless { it == JsonNull }?.jsonPrimitive?.contentOrNull
    private fun JsonObject.int(key: String): Int = this[key]?.jsonPrimitive?.intOrNull ?: error("$key must be an integer")
    private fun JsonObject.bool(key: String, default: Boolean = false): Boolean = this[key]?.jsonPrimitive?.booleanOrNull ?: default
    private fun JsonObject.json(key: String): JsonObject = this[key]?.jsonObject ?: error("$key is required")
    private fun JsonObjectBuilder.putNullable(key: String, value: String?) { put(key, value?.let(::JsonPrimitive) ?: JsonNull) }
}
