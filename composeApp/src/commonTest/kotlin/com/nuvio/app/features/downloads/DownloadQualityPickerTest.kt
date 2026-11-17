package com.nuvio.app.features.downloads

import com.nuvio.app.features.streams.StreamBehaviorHints
import com.nuvio.app.features.streams.StreamItem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class DownloadQualityPickerTest {
    private val config = DownloadFilterConfig()
    private val minutes90 = 90L * 60

    private fun stream(title: String, sizeBytes: Long? = null, url: String? = "https://example.com/a.mkv") = StreamItem(
        name = title,
        url = url,
        addonName = "Test",
        addonId = "test",
        behaviorHints = StreamBehaviorHints(videoSize = sizeBytes),
    )

    private fun pick(vararg streams: StreamItem, runtime: Long? = minutes90, cfg: DownloadFilterConfig = config) =
        DownloadQualityPicker.pick(streams.toList(), cfg, runtime)

    @Test
    fun onlyOffersTiersThatHaveAStream() {
        val result = pick(
            stream("Movie.1080p.WEB-DL.x264", 3_000_000_000L),
            stream("Movie.720p.WEB-DL.x264", 1_500_000_000L),
        )
        assertEquals(listOf(StreamResolutionTier.FHD_1080, StreamResolutionTier.HD_720), result.map { it.tier })
    }

    @Test
    fun ordersTiersFromHighestToLowest() {
        val result = pick(
            stream("Movie.720p.WEB-DL.x264", 1_500_000_000L),
            stream("Movie.2160p.WEB-DL.x265", 6_000_000_000L),
            stream("Movie.1080p.WEB-DL.x264", 3_000_000_000L),
        )
        assertEquals(
            listOf(StreamResolutionTier.UHD_4K, StreamResolutionTier.FHD_1080, StreamResolutionTier.HD_720),
            result.map { it.tier },
        )
    }

    @Test
    fun skipsBloatedStreamsAndKeepsTheLeanOne() {
        val lean = stream("Movie.1080p.WEB-DL.x264.Lean", 3_000_000_000L)
        val result = pick(stream("Movie.1080p.WEB-DL.x264.Bloated", 7_900_000_000L), lean)
        assertSame(lean, result.single().stream)
    }

    @Test
    fun aBloatedOnlyTierIsNotOffered() {
        assertTrue(pick(stream("Movie.1080p.BluRay.Remux.x264", 25_000_000_000L)).isEmpty())
    }

    @Test
    fun lowerBitrateIsFineForOldTitles() {
        val small = stream("Old.Movie.720p.BluRay.x264", 700_000_000L)
        assertSame(small, pick(small).single().stream)
    }

    @Test
    fun prefersTheMoreEfficientCodecAtComparableBudget() {
        val avc = stream("Movie.1080p.WEB-DL.x264", 3_000_000_000L) // about 4.4 Mbps
        val hevc = stream("Movie.1080p.WEB-DL.x265", 2_200_000_000L) // about 3.3 Mbps, worth about 5.4 as AVC
        assertSame(hevc, pick(avc, hevc).single().stream)
    }

    @Test
    fun fourKHasNoBitrateCeilingButKeepsTheSizeCap() {
        // 18 GB over 90 minutes is about 26.7 Mbps: far over any data saver ceiling, still offered as normal 4K.
        val big = stream("Movie.2160p.ATVP.WEB-DL.DV.x265", 18_000_000_000L)
        val option = pick(big).single()
        assertSame(big, option.stream)
        assertFalse(option.overBudget)
        // The 4K size cap is 2.5x the 8 GB cap (20 GiB): a 25 GB remux is never offered.
        assertTrue(pick(stream("Movie.2160p.BluRay.Remux.x265", 25_000_000_000L)).isEmpty())
    }

    @Test
    fun fourKSkipsAnOutlierFarBelowTheOtherCopies() {
        // Screenshot case: ten Apple TV copies at about 11 GB and one "2160p" file at 2.4 GB.
        val runtime = 58L * 60
        val typical = (0 until 10).map { stream("Show.S01E01.2160p.ATVP.WEB-DL.DV.x265.$it", 11_000_000_000L + it * 50_000_000L) }
        val tiny = stream("Show.S01E01.2160p.WEB-DL.x265.Tiny", 2_400_000_000L)
        val option = DownloadQualityPicker.pick(typical + tiny, config, runtime).single()
        assertSame(typical.first(), option.stream) // the leanest genuine copy
    }

    @Test
    fun fourKBelowThePlausibilityFloorIsDropped() {
        // Screenshot case: 1.6 GB over 47.5 minutes is about 4.5 Mbps, below the 8 Mbps HEVC floor. The 9-10 GB
        // copies are fine and the leanest of them is chosen.
        val runtime = 47L * 60 + 30
        val fake = stream("Lucky.S01E01.2160p.WEB-DL.x265.Small", 1_600_000_000L)
        val lean = stream("Lucky.S01E01.2160p.ATVP.WEB-DL.DV.x265.A", 9_550_000_000L)
        val big = stream("Lucky.S01E01.2160p.ATVP.WEB-DL.DV.x265.B", 9_880_000_000L)
        assertSame(lean, DownloadQualityPicker.pick(listOf(fake, big, lean), config, runtime).single().stream)
        // With only the fake one there is no 4K option at all.
        assertTrue(DownloadQualityPicker.pick(listOf(fake), config, runtime).isEmpty())
    }

    @Test
    fun theFloorScalesWithTheFilesCodec() {
        // 6 GB over 90 minutes is about 8.9 Mbps: plausible for HEVC (floor 8) but not for AVC (floor about 13.3).
        assertEquals(1, pick(stream("Movie.2160p.WEB-DL.x265", 6_000_000_000L)).size)
        assertTrue(pick(stream("Movie.2160p.WEB-DL.x264", 6_000_000_000L)).isEmpty())
        // An untagged 4K file is judged as HEVC.
        assertEquals(1, pick(stream("Movie.2160p.WEB-DL", 6_000_000_000L)).size)
    }

    @Test
    fun fourKIsNeverSmallerThanThe1080pOption() {
        val fourK = stream("Movie.2160p.WEB-DL.x265", 6_000_000_000L) // about 8.9 Mbps, plausible on its own
        val fhd = stream("Movie.1080p.BluRay.x264", 6_500_000_000L, ) // about 9.6 Mbps
        val result = pick(fourK, fhd, cfg = config.copy(maxBitrateKbps = 10_000))
        assertEquals(listOf(StreamResolutionTier.FHD_1080), result.map { it.tier })
    }

    @Test
    fun overBudget1080pIsOfferedAsALargeFile() {
        // Every 1080p copy is over the 6 Mbps ceiling (about 9.6 Mbps): the smallest is offered, marked large.
        val smaller = stream("Movie.1080p.WEB-DL.x264.A", 6_500_000_000L)
        val option = pick(stream("Movie.1080p.WEB-DL.x264.B", 7_500_000_000L), smaller).single()
        assertSame(smaller, option.stream)
        assertTrue(option.overBudget)
    }

    @Test
    fun theFallbackNeedsAKnownSize() {
        val unknown = stream("Movie.1080p.WEB-DL.x264", null)
        assertTrue(pick(unknown).isEmpty())
    }

    @Test
    fun acceptsBluRayEncodesButNeverCamRips() {
        val bluray = stream("Movie.1080p.BluRay.x264", 3_000_000_000L)
        assertSame(bluray, pick(bluray).single().stream)
        assertTrue(pick(stream("Movie.1080p.HDCAM.x264", 1_000_000_000L)).isEmpty())
    }

    @Test
    fun skipsStreamsThatCannotBeDownloaded() {
        val magnet = stream("Movie.1080p.WEB-DL.x264", 3_000_000_000L, url = null)
        val result = DownloadQualityPicker.pick(listOf(magnet), config, minutes90) { it.url != null }
        assertTrue(result.isEmpty())
    }

    @Test
    fun skipsUnknownSizeUnlessAllowed() {
        val unknown = stream("Movie.1080p.WEB-DL.x264", null)
        assertTrue(pick(unknown).isEmpty())
        assertSame(unknown, pick(unknown, cfg = config.copy(showUnknownSizeStreams = true)).single().stream)
    }

    @Test
    fun unknownRuntimeUsesAnAssumedRuntime() {
        val option = pick(stream("Movie.1080p.WEB-DL.x264", 3_000_000_000L), runtime = null).single()
        // 3 GB over the assumed 100 minutes is 4000 kbps.
        assertEquals(4000, option.bitrateKbps)
    }

    @Test
    fun reportsSizeBitrateAndCodec() {
        // 2.4 GB over 90 minutes is about 3555 kbps, just under the 3600 kbps HEVC ceiling.
        val option = pick(stream("Movie.1080p.WEB-DL.x265", 2_400_000_000L)).single()
        assertEquals(2_400_000_000L, option.sizeBytes)
        assertEquals(3555, option.bitrateKbps)
        assertEquals(StreamCodec.HEVC, option.codec)
        assertEquals(StreamSourceType.WEBDL, option.source)
    }

    @Test
    fun flagsHdrFilesOnly() {
        // 6 GB over 90 minutes is about 8.9 Mbps, above the 8 Mbps 4K HEVC floor.
        assertTrue(pick(stream("Movie.2160p.WEB-DL.HDR10.x265", 6_000_000_000L)).single().hdr)
        assertTrue(pick(stream("Movie.2160p.WEB-DL.DV.HDR.x265", 6_000_000_000L)).single().hdr)
        assertFalse(pick(stream("Movie.2160p.WEB-DL.x265", 6_000_000_000L)).single().hdr)
        // "HDRip" is a rip type, not HDR.
        assertFalse(pick(stream("Movie.1080p.HDRip.x264", 3_000_000_000L)).single().hdr)
    }

    @Test
    fun detectsHdrFormats() {
        for (text in listOf("movie 2160p hdr", "movie 2160p hdr10", "movie 2160p hdr10+", "movie 2160p dolby vision", "movie 2160p dolby.vision", "movie 2160p dv", "movie 2160p hlg")) {
            assertTrue(StreamQualityClassifier.isHdr(text), text)
        }
        for (text in listOf("movie 2160p web-dl x265", "movie 1080p hdrip", "movie 1080p dvd")) {
            assertFalse(StreamQualityClassifier.isHdr(text), text)
        }
    }

    @Test
    fun hevcOverItsScaledCeilingIsOverBudgetEvenThoughAvcWouldPass() {
        // 2.7 GB over 90 minutes is 4000 kbps: fine for AVC (6000) but above the HEVC ceiling (3600), so it is only
        // offered as the over-budget fallback.
        assertTrue(pick(stream("Movie.1080p.WEB-DL.x265", 2_700_000_000L)).single().overBudget)
        val unscaled = pick(stream("Movie.1080p.WEB-DL.x265", 2_700_000_000L), cfg = config.copy(scaleBitrateByCodec = false))
        assertEquals(4000, unscaled.single().bitrateKbps)
    }
}
