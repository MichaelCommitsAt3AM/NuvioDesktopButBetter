package com.nuvio.desktop.bridge

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class OfflinePlaybackSyncTest {
    @Test fun retriesPartialProgressAndWatchedIndependentlyAcrossAllProfiles() = runTest {
        val context = MutableStateFlow(OfflinePlaybackSyncContext(false, "account", listOf(1, 2)))
        val pendingProgress = mutableSetOf(1, 2)
        val pendingWatched = mutableSetOf(1, 2)
        var fail = true
        var failures = 0
        val progressUploads = mutableListOf<Int>()
        val watchedUploads = mutableListOf<Int>()
        backgroundScope.startOfflinePlaybackSync(context,
            pushProgress = { profile, _ ->
                if (profile in pendingProgress) {
                    if (fail) error("offline upload failed")
                    progressUploads += profile
                    pendingProgress -= profile
                }
            },
            pushWatched = { profile, _ -> if (pendingWatched.remove(profile)) watchedUploads += profile },
            onFailure = { failures++ },
        )
        runCurrent()
        assertEquals(listOf(), watchedUploads)
        context.value = context.value.copy(online = true)
        runCurrent()
        assertEquals(listOf(1, 2), watchedUploads)
        assertEquals(setOf(1, 2), pendingProgress)
        assertEquals(2, failures)
        fail = false
        advanceTimeBy(30_000)
        runCurrent()
        assertEquals(listOf(1, 2), progressUploads)
        assertTrue(pendingProgress.isEmpty())
        advanceTimeBy(30_000)
        runCurrent()
        assertEquals(listOf(1, 2), progressUploads)
        assertEquals(listOf(1, 2), watchedUploads)
    }

    @Test fun startupOnlineFlushesSavedChangesAndAccountChangeCancelsOldUploads() = runTest {
        val context = MutableStateFlow(OfflinePlaybackSyncContext(true, "old", listOf(1)))
        val uploads = mutableListOf<String>()
        var oldAcknowledged = false
        backgroundScope.startOfflinePlaybackSync(context,
            pushProgress = { _, account ->
                uploads += account
                if (account == "old") {
                    CompletableDeferred<Unit>().await()
                    oldAcknowledged = true
                }
            },
            pushWatched = { _, _ -> },
        )
        runCurrent()
        assertEquals(listOf("old"), uploads)
        context.value = context.value.copy(accountId = "new")
        runCurrent()
        assertEquals(listOf("old", "new"), uploads)
        assertFalse(oldAcknowledged)
        context.value = context.value.copy(accountId = null)
        runCurrent()
        advanceTimeBy(60_000)
        runCurrent()
        assertEquals(listOf("old", "new"), uploads)
    }

    @Test fun offlineAndUnauthenticatedStatesNeverUpload() = runTest {
        val context = MutableStateFlow(OfflinePlaybackSyncContext(true, null, listOf(1)))
        var uploads = 0
        backgroundScope.startOfflinePlaybackSync(context,
            pushProgress = { _, _ -> uploads++ }, pushWatched = { _, _ -> uploads++ },
        )
        runCurrent()
        context.value = OfflinePlaybackSyncContext(false, "account", listOf(1))
        runCurrent()
        advanceTimeBy(60_000)
        runCurrent()
        assertEquals(0, uploads)
    }
}
