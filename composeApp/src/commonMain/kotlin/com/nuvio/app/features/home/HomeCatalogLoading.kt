package com.nuvio.app.features.home

import com.nuvio.app.features.catalog.CatalogPage
import com.nuvio.app.features.catalog.mergeCatalogItems
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.asFlow
import kotlinx.coroutines.flow.flatMapMerge
import kotlinx.coroutines.flow.flow

// Keep a fixed number of fetches running and consume completed results serially.
// Unlike fixed batches, one slow catalog cannot prevent ready catalogs from loading.
@OptIn(ExperimentalCoroutinesApi::class)
internal suspend fun <T, R> forEachHomeCatalogResult(
    requests: List<T>,
    parallelism: Int,
    fetch: suspend (T) -> R,
    onResult: suspend (R) -> Unit,
) {
    forEachHomeCatalogUpdate(requests, parallelism, fetch = { request, publish ->
        publish(fetch(request))
    }, onResult = onResult)
}

/** Workers may publish a usable first page before finishing a larger preview. */
@OptIn(ExperimentalCoroutinesApi::class)
internal suspend fun <T, R> forEachHomeCatalogUpdate(
    requests: List<T>,
    parallelism: Int,
    fetch: suspend (T, suspend (R) -> Unit) -> Unit,
    onResult: suspend (R) -> Unit,
) {
    requests.asFlow()
        .flatMapMerge(concurrency = parallelism) { request -> flow { fetch(request) { emit(it) } } }
        .collect { onResult(it) }
}

/** Paint each usable page before requesting the rest of a desktop shelf. */
internal suspend fun loadHomeCatalogPreview(
    supportsPagination: Boolean,
    itemLimit: Int,
    maxPages: Int,
    fetch: suspend (skip: Int?, remaining: Int) -> CatalogPage,
    onPreview: suspend (CatalogPage) -> Unit,
): CatalogPage {
    var items = emptyList<MetaPreview>()
    var rawItemCount = 0
    var nextSkip: Int? = null
    var pagesFetched = 0
    do {
        val page = fetch(nextSkip, itemLimit - items.size)
        items = mergeCatalogItems(items, page.items).take(itemLimit)
        rawItemCount += page.rawItemCount
        nextSkip = page.nextSkip
        pagesFetched++
        val preview = CatalogPage(items, rawItemCount, nextSkip)
        if (!supportsPagination || nextSkip == null || items.size >= itemLimit || pagesFetched >= maxPages) return preview
        onPreview(preview)
    } while (true)
}
