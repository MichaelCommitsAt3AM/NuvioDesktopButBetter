package com.nuvio.app.features.downloads

import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.details.MetaVideo
import com.nuvio.app.features.streams.StreamBehaviorHints
import com.nuvio.app.features.streams.StreamItem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DownloadFilterBitrateTest {
    private val gb = 1_000_000_000L
    private val minutes90 = 90L * 60
    private val config = DownloadFilterConfig()

    private fun stream(title: String, sizeBytes: Long? = null) = StreamItem(
        name = title,
        addonName = "Test",
        addonId = "test",
        behaviorHints = StreamBehaviorHints(videoSize = sizeBytes),
    )

    @Test
    fun hugeFhdStreamUnderSizeCapIsRejectedByBitrate() {
        // 7.9 GB / 90 min is about 11.7 Mbps: under the 8 GiB size cap but far above Netflix-like.
        val huge = stream("Movie.2023.1080p.WEB-DL.H264-GRP", 7_900_000_000L)
        assertTrue(config.copy(bitrateLimitEnabled = false).allows(huge, minutes90))
        assertFalse(config.allows(huge, minutes90))
    }

    @Test
    fun leanFhdStreamPasses() {
        // 3.0 GB / 90 min is about 4.4 Mbps.
        assertTrue(config.allows(stream("Movie.1080p.WEB-DL.x264", 3 * gb), minutes90))
    }

    @Test
    fun longTitleGetsProportionallyMoreBytes() {
        val threeHours = 3L * 3600
        // 6.5 GB / 3 h is about 4.8 Mbps, so it passes even though it is large.
        assertTrue(config.allows(stream("Epic.1080p.WEB-DL.x264", 6_500_000_000L), threeHours))
        // The same file for a 90 minute film is about 9.6 Mbps.
        assertFalse(config.allows(stream("Short.1080p.WEB-DL.x264", 6_500_000_000L), minutes90))
    }

    @Test
    fun hevcGetsAStricterCeilingThanAvc() {
        val size = 3 * gb // about 4.4 Mbps over 90 minutes
        assertTrue(config.allows(stream("Movie.1080p.WEB-DL.x264", size), minutes90))
        assertFalse(config.allows(stream("Movie.1080p.WEB-DL.x265.HEVC", size), minutes90))
        val unscaled = config.copy(scaleBitrateByCodec = false)
        assertTrue(unscaled.allows(stream("Movie.1080p.WEB-DL.x265.HEVC", size), minutes90))
    }

    @Test
    fun ceilingScalesWithResolution() {
        // 720p ceiling is 40% of 6 Mbps = 2.4 Mbps. 1.5 GB / 90 min is about 2.2 Mbps.
        assertTrue(config.allows(stream("Movie.720p.WEB-DL.x264", 1_500_000_000L), minutes90))
        // 2 GB / 90 min is about 3.0 Mbps.
        assertFalse(config.allows(stream("Movie.720p.WEB-DL.x264", 2 * gb), minutes90))
    }

    @Test
    fun fourKHevcCeilingMatchesNetflix4k() {
        // 6 Mbps x 4.5 (4K) x 0.6 (HEVC) = 16.2 Mbps.
        assertEquals(16_200.0, config.bitrateCeilingKbps(StreamResolutionTier.UHD_4K, StreamCodec.HEVC), 0.001)
    }

    @Test
    fun unknownRuntimeFallsBackToTheSizeCapOnly() {
        val huge = stream("Movie.1080p.WEB-DL.x264", 7_900_000_000L)
        assertTrue(config.allows(huge, null))
        assertTrue(config.allows(huge, 0L))
        assertFalse(config.allows(stream("Movie.1080p.WEB-DL.x264", 9 * gb + 1_000_000_000L), null))
    }

    @Test
    fun filterAppliesRuntimeAndCountsHiddenStreams() {
        val group = com.nuvio.app.features.streams.AddonStreamGroup(
            addonName = "Test",
            addonId = "test",
            streams = listOf(
                stream("Movie.1080p.WEB-DL.x264", 3 * gb),
                stream("Movie.1080p.WEB-DL.x264.Bloated", 7_900_000_000L),
            ),
        )
        val result = DownloadStreamFilter.apply(listOf(group), config, minutes90)
        assertEquals(1, result.groups.single().streams.size)
        assertEquals(1, result.hiddenCount)
    }

    @Test
    fun detectsCodecs() {
        assertEquals(StreamCodec.HEVC, StreamQualityClassifier.codecOf("movie.1080p.web-dl.x265-grp"))
        assertEquals(StreamCodec.HEVC, StreamQualityClassifier.codecOf("movie 1080p h.265"))
        assertEquals(StreamCodec.HEVC, StreamQualityClassifier.codecOf("movie 1080p hevc"))
        assertEquals(StreamCodec.AV1, StreamQualityClassifier.codecOf("movie 1080p av1 opus"))
        assertEquals(StreamCodec.AVC, StreamQualityClassifier.codecOf("movie 1080p x264"))
        assertEquals(StreamCodec.AVC, StreamQualityClassifier.codecOf("movie 1080p h264"))
        assertEquals(StreamCodec.UNKNOWN, StreamQualityClassifier.codecOf("movie 1080p web-dl"))
    }

    @Test
    fun computesBitrate() {
        // 5.4 GB over 90 minutes is exactly 8000 kbps.
        assertEquals(8000.0, StreamQualityClassifier.bitrateKbps(5_400_000_000L, minutes90), 0.001)
    }

    @Test
    fun resolvesRuntimeFromEpisodeThenTitle() {
        val meta = MetaDetails(
            id = "tt1",
            type = "series",
            name = "Show",
            runtime = "45 min",
            videos = listOf(
                MetaVideo(id = "tt1:1:1", title = "One", runtime = 52),
                MetaVideo(id = "tt1:1:2", title = "Two"),
            ),
        )
        assertEquals(52L * 60, DownloadRuntimeResolver.runtimeSeconds(meta, "tt1:1:1"))
        assertEquals(45L * 60, DownloadRuntimeResolver.runtimeSeconds(meta, "tt1:1:2"))
        assertEquals(45L * 60, DownloadRuntimeResolver.runtimeSeconds(meta, null))
        assertNull(DownloadRuntimeResolver.runtimeSeconds(null, null))
        assertNull(DownloadRuntimeResolver.runtimeSeconds(meta.copy(runtime = null), "tt1:1:2"))
    }
}
