package com.nuvio.desktop.bridge

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse

class PreparedPlaybackHostTest {
    @Test fun preparesWhileResolutionIsPendingAndHandsOffTheSameHost() = runBlocking {
        val prepared = CompletableDeferred<Any>()
        val resolved = CompletableDeferred<String>()
        var discarded = false
        val host = Any()
        val start = async {
            withPreparedPlaybackHost(Dispatchers.Default,
                prepare = { host.also { prepared.complete(it) } },
                resolve = { resolved.await() },
                attach = { ready, source -> assertEquals(host, ready); source },
                discard = { discarded = true },
            )
        }
        withTimeout(2_000) { prepared.await() }
        assertFalse(start.isCompleted)
        resolved.complete("playable URL")
        assertEquals("playable URL", start.await())
        assertFalse(discarded)
    }

    @Test fun cancellationDisposesThePreparedHostWithoutAttachingMedia() = runBlocking {
        val prepared = CompletableDeferred<Unit>()
        var discarded = 0
        var attached = false
        val start = async {
            withPreparedPlaybackHost(Dispatchers.Default,
                prepare = { Any().also { prepared.complete(Unit) } },
                resolve = { CompletableDeferred<String>().await() },
                attach = { _, _ -> attached = true },
                discard = { discarded++ },
            )
        }
        withTimeout(2_000) { prepared.await() }
        start.cancelAndJoin()
        assertEquals(1, discarded)
        assertFalse(attached)
    }

    @Test fun resolutionFailureDisposesTheHost() = runBlocking {
        val prepared = CompletableDeferred<Unit>()
        var discarded = 0
        assertFailsWith<IllegalStateException> {
            withPreparedPlaybackHost<Any, String, Unit>(Dispatchers.Default,
                prepare = { Any().also { prepared.complete(Unit) } },
                resolve = { prepared.await(); error("resolution failed") },
                attach = { _, _ -> error("must not attach") },
                discard = { discarded++ },
            )
        }
        assertEquals(1, discarded)
    }

    @Test fun cancellationWhileWaitingForPresentationDisposesTheAttachedHost() = runBlocking {
        val attached = CompletableDeferred<Unit>()
        var discarded = 0
        val start = async {
            withPreparedPlaybackHost(Dispatchers.Default,
                prepare = { Any() },
                resolve = { "playable URL" },
                attach = { _, _ ->
                    attached.complete(Unit)
                    CompletableDeferred<Unit>().await()
                },
                discard = { discarded++ },
            )
        }
        withTimeout(2_000) { attached.await() }
        start.cancelAndJoin()
        assertEquals(1, discarded)
    }
}
