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
    fun fourKGetsAScaledSizeCapAndBitrateCeiling() {
        // 8.5 GB over 90 minutes is about 12.6 Mbps, within the 15 Mbps 4K ceiling and the scaled size cap.
        val ok = stream("Movie.2160p.WEB-DL.x264", 8_500_000_000L)
        assertSame(ok, pick(ok).single().stream)
        // 12 GB is about 17.8 Mbps, above the ceiling.
        assertTrue(pick(stream("Movie.2160p.WEB-DL.x264", 12_000_000_000L)).isEmpty())
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
        // 5 GB over 90 minutes is about 7.4 Mbps, inside the 9 Mbps HEVC ceiling for 4K.
        assertTrue(pick(stream("Movie.2160p.WEB-DL.HDR10.x265", 5_000_000_000L)).single().hdr)
        assertTrue(pick(stream("Movie.2160p.WEB-DL.DV.HDR.x265", 5_000_000_000L)).single().hdr)
        assertFalse(pick(stream("Movie.2160p.WEB-DL.x265", 5_000_000_000L)).single().hdr)
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
    fun hevcOverItsScaledCeilingIsRejectedEvenThoughAvcWouldPass() {
        // 2.7 GB over 90 minutes is 4000 kbps: fine for AVC (6000) but above the HEVC ceiling (3600).
        assertTrue(pick(stream("Movie.1080p.WEB-DL.x265", 2_700_000_000L)).isEmpty())
        val unscaled = pick(stream("Movie.1080p.WEB-DL.x265", 2_700_000_000L), cfg = config.copy(scaleBitrateByCodec = false))
        assertEquals(4000, unscaled.single().bitrateKbps)
    }
}
