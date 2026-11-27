package com.nuvio.app.features.downloads

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Sizes written into a stream's text, for add-ons such as Torrentio that send no structured size. */
class StreamTextSizeTest {
    private val gib = 1024L * 1024 * 1024

    @Test fun readsTorrentiosFloppyDiskSize() {
        val title = "Shadow Force 2025 UHD BluRay 2160p HDR10 DV HEVC TrueHD Atmos 7.1 x265-E\n👤 4 💾 24.3 GB ⚙️ EXT\n🇬🇧 / 🇪🇸"
        assertEquals((24.3 * gib).toLong(), StreamQualityClassifier.sizeInText(title))
    }

    @Test fun prefersTheMarkedSizeAndFallsBackToAPlainOne() {
        assertEquals(700L * 1024 * 1024, StreamQualityClassifier.sizeInText("rip 1.5 gb extra 💾 700 MB"))
        assertEquals((1.66 * gib).toLong(), StreamQualityClassifier.sizeInText("WEB-DL HEVC 1,66 GB TheRARBG"))
    }

    @Test fun ignoresAudioChannelsBitratesAndTextWithoutASize() {
        assertNull(StreamQualityClassifier.sizeInText("DD+ 5.1 Atmos 15 mbps"))
        assertNull(StreamQualityClassifier.sizeInText("Shadow Force 2025 1080p"))
    }
}
