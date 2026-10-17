package com.nuvio.app.features.downloads

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class DesktopDownloadProgressTest {
    @Test
    fun fastTransferCoalescesWritesAndReportsExactResumedByteCount() = runBlocking {
        val bytes = ByteArray(2 * 1024 * 1024) { (it % 251).toByte() }
        val output = ByteArrayOutputStream()
        val updates = mutableListOf<Pair<Long, Long?>>()
        var clock = 0L
        val resumeBytes = 10_000L
        val totalBytes = resumeBytes + bytes.size

        copyDesktopDownload(
            ByteArrayInputStream(bytes), output, resumeBytes, totalBytes,
            onProgress = { transferred, total -> updates += transferred to total },
            nanoTime = { clock.also { clock += 1_000_000L } },
        )

        assertContentEquals(bytes, output.toByteArray())
        assertEquals(resumeBytes to totalBytes, updates.first())
        assertEquals(totalBytes to totalBytes, updates.last())
        assertEquals(3, updates.size, "256 chunks should produce only start, timed, and final updates")
        assertTrue(updates.zipWithNext().all { (a, b) -> b.first > a.first })
    }

    @Test
    fun unknownLengthShortTransferStillReportsFinalProgress() = runBlocking {
        val updates = mutableListOf<Pair<Long, Long?>>()
        copyDesktopDownload(
            ByteArrayInputStream(ByteArray(100)), ByteArrayOutputStream(), 0L, null,
            onProgress = { transferred, total -> updates += transferred to total },
            nanoTime = { 0L },
        )
        assertEquals(listOf<Pair<Long, Long?>>(0L to null, 100L to null), updates)
    }
}
