package com.nuvio.desktop.bridge

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlin.test.Test
import kotlin.test.assertEquals

class BridgeBackgroundValueTest {
    @Test fun coldMetadataDoesNotKeepTheRequestMutexHeld() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        val metadata = CompletableDeferred<String>()
        val value = BridgeBackgroundValue("local progress", scope)
        val rpcMutex = Mutex()
        try {
            rpcMutex.withLock { value.refresh { metadata.await() } }
            assertEquals("home snapshot", withTimeout(500) { rpcMutex.withLock { "home snapshot" } })
            assertEquals("local progress", value.state.value)
            metadata.complete("enriched progress")
            assertEquals("enriched progress", value.state.value)
        } finally { scope.cancel() }
    }

    @Test fun aProfileResetDiscardsEvenUncooperativeOldMetadata() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        val metadata = CompletableDeferred<String>()
        val value = BridgeBackgroundValue("empty", scope)
        try {
            value.refresh { withContext(NonCancellable) { metadata.await() } }
            value.reset()
            metadata.complete("previous profile")
            assertEquals("empty", value.state.value)
        } finally { scope.cancel() }
    }

    @Test fun latestRefreshWinsAndFailuresKeepTheAvailableSnapshot() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        val metadata = CompletableDeferred<String>()
        val value = BridgeBackgroundValue("empty", scope)
        try {
            value.refresh { withContext(NonCancellable) { metadata.await() } }
            value.refresh { "current profile" }
            metadata.complete("old result")
            assertEquals("current profile", value.state.value)
            value.refresh { error("metadata unavailable") }
            assertEquals("current profile", value.state.value)
        } finally { scope.cancel() }
    }
}
