package com.nuvio.app.features.home

import com.nuvio.app.features.catalog.CatalogPage
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class HomeCatalogLoadingTest {
    @Test
    fun firstPageIsPublishedWhileContinuationIsStillWaiting() = runTest {
        val continuation = CompletableDeferred<Unit>()
        val first = MetaPreview("first", "movie", "First")
        val second = MetaPreview("second", "movie", "Second")
        val results = mutableListOf<CatalogPage>()
        val skips = mutableListOf<Int?>()
        val job = launch {
            forEachHomeCatalogUpdate<Int, CatalogPage>(listOf(1), 1, fetch = { _, publish ->
                val complete = loadHomeCatalogPreview(true, 64, 4, fetch = { skip, _ ->
                    skips += skip
                    if (skip == null) CatalogPage(listOf(first), 20, 20)
                    else {
                        continuation.await()
                        CatalogPage(listOf(first, second), 2, null)
                    }
                }, onPreview = publish)
                publish(complete)
            }) { results += it }
        }
        runCurrent()
        assertEquals(listOf(first), results.single().items)
        assertTrue(job.isActive)
        continuation.complete(Unit)
        job.join()
        assertEquals(listOf(null, 20), skips)
        assertEquals(listOf(first, second), results.last().items)
        assertEquals(22, results.last().rawItemCount)
        assertEquals(null, results.last().nextSkip)
    }

    @Test
    fun cancellingContinuationKeepsFirstPageAndStopsFurtherFetching() = runTest {
        val continuation = CompletableDeferred<Unit>()
        val results = mutableListOf<CatalogPage>()
        var fetches = 0
        val job = launch {
            loadHomeCatalogPreview(true, 64, 4, fetch = { _, _ ->
                fetches++
                if (fetches > 1) continuation.await()
                CatalogPage(listOf(MetaPreview("first", "movie", "First")), 20, 20)
            }) { results += it }
        }
        runCurrent()
        job.cancel()
        job.join()
        assertEquals(1, results.size)
        assertEquals(2, fetches)
        assertTrue(job.isCancelled)
    }

    @Test
    fun previewHonorsPageLimitAndNonPaginatedCatalogs() = runTest {
        for ((pagination, expectedPages) in listOf(true to 4, false to 1)) {
            var fetched = 0
            val result = loadHomeCatalogPreview(pagination, 64, 4, fetch = { _, _ ->
                fetched++
                CatalogPage(listOf(MetaPreview("$fetched", "movie", "Title")), 1, fetched)
            }) {}
            assertEquals(expectedPages, fetched)
            assertEquals(expectedPages, result.items.size)
            assertEquals(expectedPages, result.nextSkip)
        }
    }

    @Test
    fun previewCapsItemsAndRequestsOnlyRemainingCapacity() = runTest {
        val capacities = mutableListOf<Int>()
        val result = loadHomeCatalogPreview(true, 3, 4, fetch = { skip, remaining ->
            capacities += remaining
            val start = skip ?: 0
            CatalogPage((start..start + 1).map { MetaPreview("$it", "movie", "Title") }, 2, start + 2)
        }) {}
        assertEquals(listOf(3, 1), capacities)
        assertEquals(listOf("0", "1", "2"), result.items.map { it.id })
        assertEquals(4, result.nextSkip)
    }

    @Test
    fun slowCatalogDoesNotBlockReadyResultsOrLaterCatalogs() = runTest {
        val slowCatalog = CompletableDeferred<Unit>()
        val results = mutableListOf<Int>()
        val job = launch {
            forEachHomeCatalogResult((0..5).toList(), parallelism = 2, fetch = { request ->
                if (request == 0) slowCatalog.await()
                request
            }) { results += it }
        }
        runCurrent()
        assertEquals(listOf(1, 2, 3, 4, 5), results)
        slowCatalog.complete(Unit)
        job.join()
        assertEquals((0..5).toSet(), results.toSet())
    }

    @Test
    fun fetchConcurrencyIsBoundedAndCancellationStopsWorkers() = runTest {
        val gate = CompletableDeferred<Unit>()
        var active = 0
        var peak = 0
        val job = launch {
            forEachHomeCatalogResult((0..9).toList(), parallelism = 4, fetch = {
                active++
                peak = maxOf(peak, active)
                try {
                    gate.await()
                } finally {
                    active--
                }
            }) {}
        }
        runCurrent()
        assertEquals(4, peak)
        job.cancel()
        job.join()
        assertEquals(0, active)
        assertTrue(job.isCancelled)
    }
}
