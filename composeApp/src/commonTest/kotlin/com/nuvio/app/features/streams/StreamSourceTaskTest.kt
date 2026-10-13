package com.nuvio.app.features.streams

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class StreamSourceTaskTest {
    @Test
    fun `a hung source settles as an error instead of waiting forever`() = runBlocking {
        val result = runStreamSourceTask(timeoutMillis = 20) { awaitCancellation() }
        assertTrue(result.isFailure)
        assertEquals("Stream source timed out. Please try again.", result.exceptionOrNull()?.message)
    }

    @Test
    fun `navigation cancellation is not converted into a source error`() {
        assertFailsWith<CancellationException> {
            runBlocking { runStreamSourceTask { throw CancellationException("navigation") } }
        }
    }

    @Test
    fun `a failed source does not prevent a later title from succeeding`() = runBlocking {
        assertTrue(runStreamSourceTask<Int> { error("malformed response") }.isFailure)
        assertEquals(3, runStreamSourceTask { 3 }.getOrThrow())
    }
}
