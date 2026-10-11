package com.nuvio.desktop.bridge

import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.catalog.CatalogRepository
import com.nuvio.app.features.catalog.CatalogTarget
import com.nuvio.app.features.home.HomeRepository
import com.nuvio.app.features.home.MetaPreview
import com.nuvio.app.features.search.DiscoverCatalogOption
import com.nuvio.app.features.search.SearchHistoryRepository
import com.nuvio.app.features.search.SearchRepository
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

/** Desktop bridge adapter for catalog browsing, discover selection, and recent-search history. */
object CatalogBridge {
    private data class ActiveCatalog(
        val key: String,
        val source: String,
        val title: String,
        val subtitle: String,
        val target: CatalogTarget,
    )

    private var activeCatalog: ActiveCatalog? = null

    /** Clears in-memory selections and cached feature requests when the active profile changes. */
    fun reset() {
        activeCatalog = null
        CatalogRepository.clear()
        SearchRepository.reset()
        SearchHistoryRepository.onProfileChanged()
    }

    /** Dispatches catalog/discover/history RPCs. Unknown methods are left for the main runtime. */
    fun dispatch(method: String, params: JsonObject): JsonElement? = when (method) {
        "search.clear" -> {
            SearchRepository.clear()
            buildJsonObject { put("cleared", true) }
        }
        "catalog.open" -> openCatalog(params)
        "catalog.snapshot" -> catalogSnapshot()
        "catalog.loadMore" -> {
            CatalogRepository.loadMore()
            catalogSnapshot()
        }
        "catalog.refresh" -> {
            activeCatalog?.let { CatalogRepository.load(it.target, force = true) }
            catalogSnapshot()
        }
        "catalog.saveScrollPosition" -> {
            activeCatalog?.let { active ->
                CatalogRepository.saveScrollPosition(
                    target = active.target,
                    firstVisibleItemIndex = params.int("firstVisibleItemIndex", 0),
                    firstVisibleItemScrollOffset = params.int("firstVisibleItemScrollOffset", 0),
                )
            }
            catalogSnapshot()
        }
        "discover.snapshot" -> discoverSnapshot()
        "discover.refresh" -> {
            SearchRepository.refreshDiscover(
                addons = AddonRepository.uiState.value.addons,
                forceRefresh = params.bool("force", false),
            )
            discoverSnapshot()
        }
        "discover.selectType" -> {
            SearchRepository.selectDiscoverType(params.str("type"))
            discoverSnapshot()
        }
        "discover.selectCatalog" -> {
            SearchRepository.selectDiscoverCatalog(params.str("catalogKey"))
            discoverSnapshot()
        }
        "discover.selectGenre" -> {
            SearchRepository.selectDiscoverGenre(params.optionalStr("genre"))
            discoverSnapshot()
        }
        "discover.loadMore" -> {
            SearchRepository.loadMoreDiscover()
            discoverSnapshot()
        }
        "search.historySnapshot" -> searchHistorySnapshot()
        "search.historyRemove" -> {
            SearchHistoryRepository.removeSearch(params.str("query"))
            searchHistorySnapshot()
        }
        "search.historyUse" -> {
            val query = params.str("query").trim()
            SearchHistoryRepository.recordSearch(query)
            searchHistorySnapshot()
        }
        "search.historyEnabled" -> {
            SearchHistoryRepository.setEnabled(params.bool("enabled", true))
            searchHistorySnapshot()
        }
        "search.historyRecord" -> {
            SearchHistoryRepository.recordSearch(params.str("query"))
            searchHistorySnapshot()
        }
        else -> null
    }

    /** Snapshot hook for the runtime's websocket events. */
    fun snapshot(topic: String): JsonObject? = when (topic) {
        "catalog" -> catalogSnapshot()
        "discover" -> discoverSnapshot()
        "searchHistory" -> searchHistorySnapshot()
        else -> null
    }

    private fun openCatalog(params: JsonObject): JsonObject {
        val key = params.str("key")
        val source = params.str("source")
        require(source == "home" || source == "search") { "source must be home or search" }
        val section = when (source) {
            "home" -> HomeRepository.uiState.value.sections.firstOrNull { it.key == key }
            else -> SearchRepository.uiState.value.sections.firstOrNull { it.key == key }
        } ?: error("Catalog is no longer available")
        activeCatalog = ActiveCatalog(
            key = section.key,
            source = source,
            title = section.title,
            subtitle = section.subtitle,
            target = section.target,
        )
        CatalogRepository.load(section.target)
        return catalogSnapshot()
    }

    private fun catalogSnapshot(): JsonObject {
        val active = activeCatalog
        val state = CatalogRepository.uiState.value
        val position = active?.let { CatalogRepository.scrollPosition(it.target) }
        return buildJsonObject {
            put("key", active?.key)
            put("source", active?.source)
            put("title", active?.title ?: "Catalog")
            put("subtitle", active?.subtitle ?: "")
            put("contentType", active?.target?.contentType ?: "")
            put("loading", state.isLoading)
            put("hasMore", state.canLoadMore)
            put("error", state.errorMessage)
            put("items", JsonArray(state.items.map(::mediaJson)))
            put("firstVisibleItemIndex", position?.firstVisibleItemIndex ?: 0)
            put("firstVisibleItemScrollOffset", position?.firstVisibleItemScrollOffset ?: 0)
        }
    }

    private fun discoverSnapshot(): JsonObject {
        val state = SearchRepository.discoverUiState.value
        return buildJsonObject {
            put("loading", state.isLoading)
            put("typeOptions", JsonArray(state.typeOptions.map(::JsonPrimitive)))
            put("selectedType", state.selectedType)
            put("catalogOptions", JsonArray(state.catalogOptions.map(::discoverOptionJson)))
            put("selectedCatalogKey", state.selectedCatalogKey)
            put("selectedGenre", state.selectedGenre)
            put("genreOptions", JsonArray(state.genreOptions.map(::JsonPrimitive)))
            put("items", JsonArray(state.items.map(::mediaJson)))
            put("hasMore", state.canLoadMore)
            put("emptyStateReason", state.emptyStateReason?.name?.replaceFirstChar(Char::lowercase))
            put("error", state.errorMessage)
        }
    }

    private fun discoverOptionJson(option: DiscoverCatalogOption) = buildJsonObject {
        put("key", option.key)
        put("addonName", option.addonName)
        put("type", option.type)
        put("catalogId", option.catalogId)
        put("catalogName", option.catalogName)
        put("genreOptions", JsonArray(option.genreOptions.map(::JsonPrimitive)))
        put("genreRequired", option.genreRequired)
        put("supportsPagination", option.supportsPagination)
    }

    private fun searchHistorySnapshot(): JsonObject {
        SearchHistoryRepository.ensureLoaded()
        return buildJsonObject {
            put("enabled", SearchHistoryRepository.enabled.value)
            put("items", JsonArray(SearchHistoryRepository.uiState.value.map(::JsonPrimitive)))
        }
    }

    private fun mediaJson(item: MetaPreview) = buildJsonObject {
        put("id", item.id)
        put("type", item.type)
        put("name", item.name)
        put("poster", item.poster?.let(::JsonPrimitive) ?: JsonNull)
        put("background", (item.banner ?: item.landscapePoster)?.let(::JsonPrimitive) ?: JsonNull)
        put("logo", item.logo?.let(::JsonPrimitive) ?: JsonNull)
        put("description", item.description?.let(::JsonPrimitive) ?: JsonNull)
        put("releaseInfo", item.releaseInfo?.let(::JsonPrimitive) ?: JsonNull)
        put("rating", item.imdbRating?.let(::JsonPrimitive) ?: JsonNull)
        put("genres", JsonArray(item.genres.map(::JsonPrimitive)))
    }

    private fun JsonObject.str(key: String): String =
        this[key]?.jsonPrimitive?.contentOrNull ?: error("$key is required")

    private fun JsonObject.optionalStr(key: String): String? =
        this[key]?.takeUnless { it == JsonNull }?.jsonPrimitive?.contentOrNull

    private fun JsonObject.int(key: String, default: Int): Int =
        this[key]?.jsonPrimitive?.intOrNull ?: default

    private fun JsonObject.bool(key: String, default: Boolean): Boolean =
        this[key]?.jsonPrimitive?.booleanOrNull ?: default

}
