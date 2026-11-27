package com.nuvio.app.features.streams

import kotlin.test.Test
import kotlin.test.assertEquals

class StreamDolbyVisionTest {

    @Test
    fun `labels Dolby Vision streams by whether an HDR fallback is tagged`() {
        assertEquals(StreamDolbyVisionLabel.Only, label(name = "4K DV", title = "Movie.2024.2160p.WEB-DL.DV.HEVC"))
        assertEquals(StreamDolbyVisionLabel.Only, label(title = "Movie 2024 2160p DoVi WEB"))
        assertEquals(StreamDolbyVisionLabel.Only, label(title = "Movie (2024) 2160p Dolby Vision"))
        assertEquals(StreamDolbyVisionLabel.WithHdrFallback, label(name = "4K DV | HDR10"))
        assertEquals(StreamDolbyVisionLabel.WithHdrFallback, label(title = "Movie.2024.2160p.BluRay.REMUX.DV.HDR.HEVC"))
        assertEquals(StreamDolbyVisionLabel.WithHdrFallback, label(name = "4K", title = "Movie.2024.2160p.DV.HDR10+.WEB-DL"))
        assertEquals(StreamDolbyVisionLabel.None, label(name = "4K HDR10", title = "Movie.2024.2160p.WEB-DL.HDR10"))
        assertEquals(StreamDolbyVisionLabel.None, label(title = "Movie.1999.DVDRip.XviD"))
        assertEquals(StreamDolbyVisionLabel.None, label(title = "Movie.2024.1080p.WEB-DL"))
    }

    @Test
    fun `ignores the add-on name when labelling`() {
        val stream = StreamItem(url = "https://example.com/a.mkv", name = "1080p", addonName = "DV Streams", addonId = "dv")
        assertEquals(StreamDolbyVisionLabel.None, StreamDolbyVision.label(stream))
    }

    @Test
    fun `orders Dolby Vision only streams last and keeps the rest in place`() {
        val dvOnly = stream("a", name = "4K DV")
        val dvHdr = stream("b", name = "4K DV | HDR10")
        val hdr = stream("c", name = "4K HDR10")
        val dvOnlyLow = stream("d", name = "1080p DV")
        val sdr = stream("e", name = "1080p")

        val ordered = StreamDolbyVision.orderForDeviceWithoutDolbyVision(listOf(dvOnly, dvHdr, hdr, dvOnlyLow, sdr))

        assertEquals(listOf(dvHdr, hdr, sdr, dvOnly, dvOnlyLow), ordered)
    }

    @Test
    fun `auto-pick skips a Dolby Vision only stream when demoting`() {
        val dvOnly = stream("a", name = "4K DV")
        val dvHdr = stream("b", name = "4K DV | HDR10")

        fun pick(demote: Boolean) = StreamAutoPlaySelector.evaluateAutoPlayStream(
            streams = listOf(dvOnly, dvHdr),
            mode = StreamAutoPlayMode.FIRST_STREAM,
            regexPattern = "",
            source = StreamAutoPlaySource.ALL_SOURCES,
            installedAddonNames = setOf("Test"),
            selectedAddons = emptySet(),
            selectedPlugins = emptySet(),
            demoteDolbyVisionOnly = demote,
        ).stream

        assertEquals(dvHdr, pick(demote = true))
        assertEquals(dvOnly, pick(demote = false))
    }

    private fun label(name: String? = null, title: String? = null): StreamDolbyVisionLabel =
        StreamDolbyVision.label(
            StreamItem(url = "https://example.com/v.mkv", name = name, title = title, addonName = "Test", addonId = "test"),
        )

    private fun stream(id: String, name: String): StreamItem =
        StreamItem(url = "https://example.com/$id.mkv", name = name, addonName = "Test", addonId = "test")
}
