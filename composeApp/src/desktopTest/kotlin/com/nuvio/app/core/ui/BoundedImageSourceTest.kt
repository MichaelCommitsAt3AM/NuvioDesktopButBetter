package com.nuvio.app.core.ui

import okio.Buffer
import okio.Source
import okio.Timeout
import okio.buffer
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class BoundedImageSourceTest {
    @Test
    fun normalImageBytesArePreserved() {
        val bytes = ByteArray(1024) { (it % 251).toByte() }
        assertContentEquals(bytes, Buffer().write(bytes).readBoundedImageBytes())
    }

    @Test
    fun oversizedStreamIsRejectedBeforeItIsFullyRead() {
        var consumed = 0L
        val source = object : Source {
            override fun read(sink: Buffer, byteCount: Long): Long {
                val count = minOf(byteCount, 8192L)
                sink.write(ByteArray(count.toInt()))
                consumed += count
                return count
            }
            override fun timeout() = Timeout.NONE
            override fun close() {}
        }
        source.buffer().use { buffered ->
            assertFailsWith<IllegalStateException> { buffered.readBoundedImageBytes() }
        }
        assertTrue(consumed <= MaxEncodedImageBytes + 8192L)
    }
}
