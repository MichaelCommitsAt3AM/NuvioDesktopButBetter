package com.nuvio.desktop.bridge

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext

/** Builds the host alongside URL resolution, retaining ownership until handoff succeeds. */
internal suspend fun <Host : Any, Source, Result> withPreparedPlaybackHost(
    dispatcher: CoroutineDispatcher,
    prepare: () -> Host,
    resolve: suspend () -> Source,
    attach: suspend (Host, Source) -> Result,
    discard: suspend (Host) -> Unit,
): Result = coroutineScope {
    var host: Host? = null
    var attached = false
    val preparation = async(dispatcher) { prepare().also { host = it } }
    try {
        val source = resolve()
        attach(preparation.await(), source).also { attached = true }
    } finally {
        withContext(NonCancellable) {
            preparation.cancelAndJoin()
            if (!attached) host?.let { discard(it) }
        }
    }
}
