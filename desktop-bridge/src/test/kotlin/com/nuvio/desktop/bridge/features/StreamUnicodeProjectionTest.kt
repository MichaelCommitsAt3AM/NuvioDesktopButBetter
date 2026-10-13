package com.nuvio.desktop.bridge.features

import com.nuvio.app.features.streams.StreamItem
import io.ktor.websocket.Frame
import java.nio.CharBuffer
import java.nio.charset.CodingErrorAction
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

class StreamUnicodeProjectionTest {
    @Test
    fun `description truncation cannot cut an emoji in half`() {
        val stream = StreamItem(addonName = "Test", addonId = "addon:test",
            description = "x".repeat(239) + "🎤 more", url = "https://example.test/video")
        val projected = StreamSelectionBridge.present("test", stream)
        assertEquals("x".repeat(239), projected.getValue("description").jsonPrimitive.content)
        Charsets.UTF_8.newEncoder().onMalformedInput(CodingErrorAction.REPORT)
            .encode(CharBuffer.wrap(projected.toString()))
        Frame.Text(projected.toString()) // The actual bridge transport used to throw here.
    }

    @Test
    fun `complete emoji at the length boundary is preserved`() {
        val description = "x".repeat(238) + "🎤"
        val stream = StreamItem(addonName = "Test", addonId = "addon:test",
            description = description + " more", url = "https://example.test/video")
        assertEquals(description, StreamSelectionBridge.present("test", stream)
            .getValue("description").jsonPrimitive.content)
    }
}
