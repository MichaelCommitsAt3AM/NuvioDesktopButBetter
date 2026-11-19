package com.nuvio.app.features.details

import com.nuvio.app.core.time.parseEpisodeReleaseEpochMs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class MetaDetailsReleaseStatusTest {
    private val today = "2026-11-19"
    private val now = requireNotNull(parseEpisodeReleaseEpochMs("2026-11-19T12:00:00Z"))

    private fun meta(
        type: String = "movie",
        releaseInfo: String? = "2026",
        released: String? = null,
        status: String? = null,
        videos: List<MetaVideo> = emptyList(),
        window: MetaReleaseWindow? = null,
    ) = MetaDetails(
        id = "tt1",
        type = type,
        name = "Title",
        releaseInfo = releaseInfo,
        released = released,
        status = status,
        videos = videos,
        tmdbReleaseWindow = window,
    )

    @Test
    fun `future exact release date this year is unreleased`() {
        assertEquals(true, meta(released = "2026-12-18T00:00:00.000Z").isUnreleased(today, now))
    }

    @Test
    fun `past exact release date is released even with a stale pre-release status`() {
        assertEquals(false, meta(released = "2026-03-01T00:00:00.000Z", status = "Post Production").isUnreleased(today, now))
    }

    @Test
    fun `pre-release TMDB status marks a current-year title unreleased`() {
        assertEquals(true, meta(status = "Post Production").isUnreleased(today, now))
        assertEquals(true, meta(status = "In Production").isUnreleased(today, now))
        assertEquals(true, meta(status = "Planned").isUnreleased(today, now))
    }

    @Test
    fun `released status keeps a current-year title released`() {
        assertEquals(false, meta(status = "Released").isUnreleased(today, now))
    }

    @Test
    fun `year only falls back to comparing with the current year`() {
        assertEquals(true, meta(releaseInfo = "2027").isUnreleased(today, now))
        assertEquals(false, meta(releaseInfo = "2012").isUnreleased(today, now))
    }

    @Test
    fun `current year alone or missing release info is unknown`() {
        assertNull(meta(releaseInfo = "2026").isUnreleased(today, now))
        assertNull(meta(releaseInfo = null).isUnreleased(today, now))
    }

    @Test
    fun `series with an aired episode is released despite in production status`() {
        val aired = MetaVideo(id = "tt1:1:1", title = "Pilot", released = "2026-10-01T00:00:00.000Z")
        assertEquals(false, meta(type = "series", status = "In Production", videos = listOf(aired)).isUnreleased(today, now))
    }

    @Test
    fun `no release state without TMDB enrichment`() {
        assertNull(meta(released = "2026-12-18T00:00:00.000Z", status = "Post Production").releaseState(today, now))
        assertNull(meta(releaseInfo = "2012").releaseState(today, now))
    }

    @Test
    fun `cinema date passed and at-home date ahead is in cinemas`() {
        val window = MetaReleaseWindow(theatrical = "2026-10-20T00:00:00.000Z", digital = "2027-01-10T00:00:00.000Z")
        assertEquals(MetaReleaseState.IN_CINEMAS, meta(window = window).releaseState(today, now))
    }

    @Test
    fun `recent cinema release without an at-home date is in cinemas`() {
        val window = MetaReleaseWindow(theatrical = "2026-11-01T00:00:00.000Z")
        assertEquals(MetaReleaseState.IN_CINEMAS, meta(window = window).releaseState(today, now))
    }

    @Test
    fun `old cinema release without an at-home date counts as released`() {
        val window = MetaReleaseWindow(theatrical = "2012-06-29T00:00:00.000Z")
        assertEquals(MetaReleaseState.RELEASED, meta(releaseInfo = "2012", window = window).releaseState(today, now))
    }

    @Test
    fun `past at-home date is released`() {
        val window = MetaReleaseWindow(theatrical = "2026-08-01T00:00:00.000Z", digital = "2026-10-15T00:00:00.000Z")
        assertEquals(MetaReleaseState.RELEASED, meta(window = window).releaseState(today, now))
    }

    @Test
    fun `future cinema date is unreleased`() {
        val window = MetaReleaseWindow(theatrical = "2026-12-18T00:00:00.000Z")
        assertEquals(MetaReleaseState.UNRELEASED, meta(status = "Post Production", window = window).releaseState(today, now))
    }

    @Test
    fun `series with TMDB enrichment uses status and episodes`() {
        val aired = MetaVideo(id = "tt1:1:1", title = "Pilot", released = "2026-10-01T00:00:00.000Z")
        assertEquals(
            MetaReleaseState.RELEASED,
            meta(type = "series", status = "Returning Series", videos = listOf(aired), window = MetaReleaseWindow()).releaseState(today, now),
        )
        assertEquals(
            MetaReleaseState.UNRELEASED,
            meta(type = "series", status = "Planned", window = MetaReleaseWindow()).releaseState(today, now),
        )
    }
}
