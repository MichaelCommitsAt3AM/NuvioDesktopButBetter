package com.nuvio.app.features.tmdb

import com.nuvio.app.core.time.parseEpisodeReleaseEpochMs
import com.nuvio.app.features.details.MetaDetails
import com.nuvio.app.features.details.MetaReleaseState
import com.nuvio.app.features.details.releaseState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TmdbReleaseWindowTest {
    private val now = requireNotNull(parseEpisodeReleaseEpochMs("2026-11-19T12:00:00Z"))

    private fun country(code: String, vararg dates: Pair<Int, String>) = TmdbMovieReleaseDateCountry(
        iso31661 = code,
        releaseDates = dates.map { (type, date) -> TmdbReleaseDate(type = type, releaseDate = date) },
    )

    // The Mongoose (TMDB 1294189): US lists only a cinema date, while several countries
    // released it digitally on Prime Video.
    private val mongoose = listOf(
        country("AE", 3 to "2026-10-29T00:00:00.000Z"),
        country("DE", 4 to "2026-11-04T00:00:00.000Z"),
        country("BR", 4 to "2026-11-04T00:00:00.000Z"),
        country("US", 3 to "2026-10-30T00:00:00.000Z"),
    )

    @Test
    fun `cinema date comes from the preferred region and digital from any region`() {
        val window = mongoose.selectReleaseWindow("en-US")
        assertEquals("2026-10-30T00:00:00.000Z", window.theatrical)
        assertEquals("2026-11-04T00:00:00.000Z", window.digital)
    }

    @Test
    fun `a digital release abroad makes the title released`() {
        val meta = MetaDetails(
            id = "tt1",
            type = "movie",
            name = "The Mongoose",
            releaseInfo = "2026",
            tmdbReleaseWindow = mongoose.selectReleaseWindow("en-US"),
        )
        assertEquals(MetaReleaseState.RELEASED, meta.releaseState("2026-11-19", now))
    }

    @Test
    fun `cinema date falls back to the earliest anywhere when preferred regions have none`() {
        val window = listOf(country("AE", 3 to "2026-10-29T00:00:00.000Z"), country("TW", 3 to "2026-10-30T00:00:00.000Z"))
            .selectReleaseWindow("en-US")
        assertEquals("2026-10-29T00:00:00.000Z", window.theatrical)
        assertNull(window.digital)
    }
}
