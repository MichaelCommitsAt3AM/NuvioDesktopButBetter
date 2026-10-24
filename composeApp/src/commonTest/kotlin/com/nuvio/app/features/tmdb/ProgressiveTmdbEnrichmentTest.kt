package com.nuvio.app.features.tmdb

import com.nuvio.app.features.details.MetaTrailer
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class ProgressiveTmdbEnrichmentTest {
    private val core = TmdbEnrichment(
        localizedTitle = "Enriched title", description = "Overview", genres = emptyList(),
        backdrop = null, logo = null, poster = null, people = emptyList(),
        director = emptyList(), writer = emptyList(), releaseInfo = null, rating = null,
        runtimeMinutes = 100, ageRating = "PG", status = "Released", countries = emptyList(),
        language = "en", productionCompanies = emptyList(), networks = emptyList(),
    )

    @Test
    fun `core and fast extras publish while a slower section is still pending`() = runTest {
        val coreReady = CompletableDeferred<Unit>()
        val trailersReady = CompletableDeferred<Unit>()
        val relatedReady = CompletableDeferred<Unit>()
        val started = mutableSetOf<TmdbEnrichmentStage>()
        val updates = mutableListOf<Pair<TmdbEnrichment, Set<TmdbEnrichmentStage>>>()
        val job = launch {
            progressiveTmdbEnrichment(
                core = { started += TmdbEnrichmentStage.CORE; coreReady.await(); core },
                extras = mapOf(
                    TmdbEnrichmentStage.TRAILERS to {
                        started += TmdbEnrichmentStage.TRAILERS
                        trailersReady.await()
                        val merge: (TmdbEnrichment) -> TmdbEnrichment = { it.copy(collectionName = "Fast section") }
                        merge
                    },
                    TmdbEnrichmentStage.MORE_LIKE_THIS to {
                        started += TmdbEnrichmentStage.MORE_LIKE_THIS
                        relatedReady.await()
                        val merge: (TmdbEnrichment) -> TmdbEnrichment = { it.copy(description = "Last section") }
                        merge
                    },
                ),
                onProgress = { value, pending -> updates += value to pending },
            )
        }
        runCurrent()
        assertEquals(setOf(TmdbEnrichmentStage.CORE, TmdbEnrichmentStage.TRAILERS, TmdbEnrichmentStage.MORE_LIKE_THIS), started)
        assertTrue(updates.isEmpty())
        coreReady.complete(Unit)
        runCurrent()
        assertEquals(core, updates.single().first)
        assertEquals(setOf(TmdbEnrichmentStage.TRAILERS, TmdbEnrichmentStage.MORE_LIKE_THIS), updates.last().second)
        trailersReady.complete(Unit)
        runCurrent()
        assertFalse(job.isCompleted)
        assertEquals("Fast section", updates.last().first.collectionName)
        assertEquals(setOf(TmdbEnrichmentStage.MORE_LIKE_THIS), updates.last().second)
        relatedReady.complete(Unit)
        runCurrent()
        assertTrue(job.isCompleted)
        assertEquals("Fast section", updates.last().first.collectionName)
        assertEquals("Last section", updates.last().first.description)
        assertTrue(updates.last().second.isEmpty())
    }

    @Test
    fun `optional failure completes its loader without discarding successful metadata`() = runTest {
        val updates = mutableListOf<Pair<TmdbEnrichment, Set<TmdbEnrichmentStage>>>()
        val result = progressiveTmdbEnrichment(
            core = { core },
            extras = mapOf(TmdbEnrichmentStage.TRAILERS to { error("Unavailable") }),
            onProgress = { value, pending -> updates += value to pending },
        )
        assertEquals(core, result)
        assertEquals(core, updates.last().first)
        assertTrue(updates.last().second.isEmpty())
    }

    @Test
    fun `no optional requests publishes core once with no pending sections`() = runTest {
        val updates = mutableListOf<Set<TmdbEnrichmentStage>>()
        assertEquals(core, progressiveTmdbEnrichment({ core }, emptyMap()) { _, pending -> updates += pending })
        assertEquals(listOf(emptySet()), updates)
    }

    @Test
    fun `cancelling a title prevents late section updates`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val updates = mutableListOf<TmdbEnrichment>()
        val job = launch {
            progressiveTmdbEnrichment(
                core = { core },
                extras = mapOf(TmdbEnrichmentStage.TRAILERS to {
                    gate.await()
                    val merge: (TmdbEnrichment) -> TmdbEnrichment = { it.copy(description = "Obsolete") }
                    merge
                }),
                onProgress = { value, _ -> updates += value },
            )
        }
        runCurrent()
        assertEquals(listOf(core), updates)
        job.cancel()
        gate.complete(Unit)
        runCurrent()
        assertEquals(listOf(core), updates)
        assertTrue(job.isCancelled)
    }
}
