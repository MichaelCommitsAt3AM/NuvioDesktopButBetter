package com.nuvio.app.features.datasaver

import com.nuvio.app.features.downloads.DataUsePreset
import com.nuvio.app.features.downloads.StreamResolutionTier
import com.nuvio.app.features.streams.StreamAutoPlayMode
import com.nuvio.app.features.streams.StreamAutoPlaySelector
import com.nuvio.app.features.streams.StreamAutoPlaySource
import com.nuvio.app.features.streams.StreamBehaviorHints
import com.nuvio.app.features.streams.StreamItem
import kotlin.test.Test
import kotlin.test.assertEquals

class DataSaverStreamRankingTest {

    private val mb = 1_000_000L
    private val hour = 3_600L
    // The ranking cases are written against the Balanced targets, whatever the default level is.
    private val targets = DataSaverPlaybackConfig(enabled = true).withDataUse(DataUsePreset.BALANCED)

    /** A file of [mbps] average over an hour. */
    private fun sizeFor(mbps: Double): Long = (mbps * 1_000_000 / 8 * hour).toLong()

    @Test
    fun `picks the 1080p file closest to the target`() {
        val remux = stream("remux", "Movie.1080p.BluRay.REMUX.x264", sizeFor(30.0))
        val near = stream("near", "Movie.1080p.WEB-DL.x264", sizeFor(6.5))
        val small = stream("small", "Movie.1080p.WEB-DL.x264.Small", sizeFor(2.0))

        assertEquals(listOf(near, small, remux), order(remux, near, small))
    }

    @Test
    fun `when every copy is above the target the leanest one wins`() {
        val atv = stream("atv", "Movie.1080p.ATVP.WEB-DL.x264", sizeFor(18.0))
        val atvBigger = stream("atv2", "Movie.1080p.ATVP.WEB-DL.x264.Bigger", sizeFor(24.0))

        assertEquals(atv, order(atvBigger, atv).first())
    }

    @Test
    fun `when every copy is below the target the best looking one wins`() {
        val tiny = stream("tiny", "Old.Movie.1080p.WEB-DL.x264", sizeFor(1.5))
        val better = stream("better", "Old.Movie.1080p.BluRay.x264", sizeFor(3.5))

        assertEquals(better, order(tiny, better).first())
    }

    @Test
    fun `prefers the maximum resolution, then lower ones, leaving out higher and untagged files`() {
        val uhd = stream("uhd", "Movie.2160p.WEB-DL.x265", sizeFor(6.0))
        val untagged = stream("untagged", "Movie.WEB-DL.x264", sizeFor(6.0))
        val sd = stream("sd", "Movie.480p.WEB-DL.x264", sizeFor(2.0))
        val hd = stream("hd", "Movie.720p.WEB-DL.x264", sizeFor(6.0))
        val fhd = stream("fhd", "Movie.1080p.WEB-DL.x264", sizeFor(12.0))

        assertEquals(listOf(fhd, hd, sd), order(uhd, untagged, sd, hd, fhd))
    }

    @Test
    fun `a lower resolution is judged against its own target`() {
        // No 1080p copy: 720p is held to its 3 Mbps target, not the 6 Mbps 1080p one.
        val bloated = stream("bloated", "Movie.720p.BluRay.x264", sizeFor(6.0))
        val lean = stream("lean", "Movie.720p.WEB-DL.x264", sizeFor(3.2))

        assertEquals(lean, order(bloated, lean).first())
    }

    @Test
    fun `a lower maximum resolution moves the cut-off down`() {
        val hd = stream("hd", "Movie.720p.WEB-DL.x264", sizeFor(3.0))
        val fhd = stream("fhd", "Movie.1080p.WEB-DL.x264", sizeFor(6.0))

        assertEquals(listOf(hd), DataSaverStreamRanking.order(listOf(fhd, hd), targets::targetFor, hour, StreamResolutionTier.HD_720))
    }

    @Test
    fun `HEVC is held to a lower target than H264`() {
        // HEVC at 3.6 Mbps is the same quality target as H.264 at 6.
        val hevc = stream("hevc", "Movie.1080p.WEB-DL.x265", sizeFor(3.6))
        val hevcBig = stream("hevcBig", "Movie.1080p.WEB-DL.x265.Big", sizeFor(6.0))

        assertEquals(hevc, order(hevcBig, hevc).first())
    }

    @Test
    fun `files without a size come after sized ones`() {
        val unsized = StreamItem(url = "https://example.com/u.mkv", name = "Movie.1080p.WEB-DL", addonName = "T", addonId = "t")
        val sized = stream("sized", "Movie.1080p.WEB-DL.x264", sizeFor(20.0))

        assertEquals(listOf(sized, unsized), order(unsized, sized))
    }

    @Test
    fun `auto-pick follows the target only when Data Saver is on`() {
        val remux = stream("remux", "Movie.1080p.BluRay.REMUX.x264", sizeFor(30.0))
        val near = stream("near", "Movie.1080p.WEB-DL.x264", sizeFor(6.5))

        fun pick(target: DataSaverPlaybackConfig?) = StreamAutoPlaySelector.evaluateAutoPlayStream(
            streams = listOf(remux, near),
            mode = StreamAutoPlayMode.FIRST_STREAM,
            regexPattern = "",
            source = StreamAutoPlaySource.ALL_SOURCES,
            installedAddonNames = setOf("Test"),
            selectedAddons = emptySet(),
            selectedPlugins = emptySet(),
            demoteDolbyVisionOnly = false,
            dataSaverTargets = target,
            runtimeSeconds = hour,
            dataSaverMaxResolution = StreamResolutionTier.FHD_1080,
        ).stream

        assertEquals(near, pick(targets))
        assertEquals(remux, pick(null))
    }

    private fun order(vararg streams: StreamItem) =
        DataSaverStreamRanking.order(streams.toList(), targets::targetFor, hour, StreamResolutionTier.FHD_1080)

    private fun stream(id: String, title: String, size: Long) = StreamItem(
        url = "https://example.com/$id.mkv",
        name = title,
        addonName = "Test",
        addonId = "test",
        behaviorHints = StreamBehaviorHints(videoSize = size),
    )
}
