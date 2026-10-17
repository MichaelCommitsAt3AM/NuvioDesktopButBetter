package com.nuvio.app.core.ui

import coil3.decode.ImageSource
import java.util.Base64
import kotlinx.coroutines.runBlocking
import okio.Buffer
import okio.FileSystem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class SkiaGifDecoderTest {
    @Test
    fun decodedFirstFrameRemainsUsableAfterCodecIsClosed() = runBlocking {
        val bytes = Base64.getDecoder().decode(
            "R0lGODlhAgACAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAFAAAACwAAAAAAgACAAAIBgABCAQQEAAh+QQBFAABACwAAAAAAgACAIEAgAAAAAAAAAAAAAAIBgABCAQQEAA7",
        )
        val result = SkiaGifDecoder(ImageSource(Buffer().write(bytes), FileSystem.SYSTEM)).decode()
        val image = assertNotNull(result).image
        assertEquals(2, image.width)
        assertEquals(2, image.height)
    }
}
