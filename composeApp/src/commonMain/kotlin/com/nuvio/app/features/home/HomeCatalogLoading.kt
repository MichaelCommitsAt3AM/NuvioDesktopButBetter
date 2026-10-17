package com.nuvio.app.features.home

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
    requests.asFlow()
        .flatMapMerge(concurrency = parallelism) { request -> flow { emit(fetch(request)) } }
        .collect { onResult(it) }
}
