package com.nuvio.app.features.tmdb

import kotlinx.coroutines.async
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

enum class TmdbEnrichmentStage { CORE, TRAILERS, MORE_LIKE_THIS, COLLECTION }

/** Start independent requests together, then publish cumulative snapshots as each finishes. */
internal suspend fun progressiveTmdbEnrichment(
    core: suspend () -> TmdbEnrichment?,
    extras: Map<TmdbEnrichmentStage, suspend () -> (TmdbEnrichment) -> TmdbEnrichment>,
    onProgress: suspend (TmdbEnrichment, Set<TmdbEnrichmentStage>) -> Unit,
): TmdbEnrichment? = coroutineScope {
    val coreRequest = async { core() }
    val requests = extras.mapValues { (_, request) ->
        async {
            try {
                request()
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                // An optional section must not discard successful sections.
                val unchanged: (TmdbEnrichment) -> TmdbEnrichment = { it }
                unchanged
            }
        }
    }
    var current = coreRequest.await() ?: return@coroutineScope null
    var pending = extras.keys.toSet()
    onProgress(current, pending)
    val mutex = Mutex()
    requests.map { (stage, request) ->
        launch {
            val merge = request.await()
            mutex.withLock {
                current = merge(current)
                pending = pending - stage
                onProgress(current, pending)
            }
        }
    }.joinAll()
    current
}
