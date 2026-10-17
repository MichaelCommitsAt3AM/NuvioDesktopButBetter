package com.nuvio.app.features.home

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
