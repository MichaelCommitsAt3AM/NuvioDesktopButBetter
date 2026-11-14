package com.nuvio.app.features.details

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class HeroTrailerSelectorTest {

    @Test
    fun `selects official non-season YouTube trailer first`() {
        val trailers = listOf(
            trailer(id = "teaser", type = "Teaser", official = true, publishedAt = "2026-02-01"),
            trailer(id = "season", type = "Trailer", official = true, seasonNumber = 2, publishedAt = "2026-03-01"),
            trailer(id = "official", type = "Trailer", official = true, publishedAt = "2026-01-01"),
        )

        assertEquals("official", selectHeroTrailer(trailers)?.id)
    }

    @Test
    fun `falls back to addon-style YouTube trailer when official flag is absent`() {
        val trailers = listOf(
            trailer(id = "clip", type = "Clip", official = false, publishedAt = "2026-02-01"),
            trailer(id = "addon", type = "Trailer", official = false, publishedAt = "2026-01-01"),
        )

        assertEquals("addon", selectHeroTrailer(trailers)?.id)
    }

    @Test
    fun `uses season trailer when only season trailers are available`() {
        val trailers = listOf(
            trailer(id = "season-one", type = "Trailer", official = false, seasonNumber = 1),
            trailer(id = "season-two", type = "Trailer", official = true, seasonNumber = 2),
        )

        assertEquals("season-two", selectHeroTrailer(trailers)?.id)
    }

    @Test
    fun `filters out non YouTube trailers`() {
        val trailers = listOf(
            trailer(id = "vimeo", site = "Vimeo", type = "Trailer", official = true),
            trailer(id = "youtube", site = "YouTube", type = "Teaser", official = false),
        )

        assertEquals("youtube", selectHeroTrailer(trailers)?.id)
    }

    @Test
    fun `returns null for empty or unsupported trailer lists`() {
        assertNull(selectHeroTrailer(emptyList()))
        assertNull(selectHeroTrailer(listOf(trailer(id = "blank", key = ""))))
        assertNull(selectHeroTrailer(listOf(trailer(id = "other", site = "Vimeo"))))
    }

    @Test
    fun `original selector prefers the earliest official trailer over later cuts`() {
        val trailers = listOf(
            trailer(id = "international", type = "Trailer", official = true, publishedAt = "2026-04-02T10:00:00.000Z"),
            trailer(id = "trailer-2", type = "Trailer", official = true, publishedAt = "2026-03-01T10:00:00.000Z"),
            trailer(id = "original", type = "Trailer", official = true, publishedAt = "2026-01-15T10:00:00.000Z"),
            trailer(id = "early-teaser", type = "Teaser", official = true, publishedAt = "2025-12-01T10:00:00.000Z"),
        )

        assertEquals("original", selectOriginalTrailer(trailers)?.id)
        assertEquals("international", selectHeroTrailer(trailers)?.id)
    }

    @Test
    fun `original selector sends undated trailers last and keeps type priority`() {
        val undated = trailer(id = "undated", type = "Trailer", official = true, publishedAt = null)
        val dated = trailer(id = "dated", type = "Trailer", official = true, publishedAt = "2026-02-01")
        assertEquals("dated", selectOriginalTrailer(listOf(undated, dated))?.id)
        assertEquals("official", selectOriginalTrailer(listOf(
            trailer(id = "older-unofficial", type = "Trailer", official = false, publishedAt = "2025-01-01"),
            trailer(id = "official", type = "Trailer", official = true, publishedAt = "2026-01-01"),
        ))?.id)
        assertNull(selectOriginalTrailer(emptyList()))
    }

    @Test
    fun `original ordering lists oldest first with undated last`() {
        val sorted = listOf(
            trailer(id = "c", publishedAt = "2026-03-01"),
            trailer(id = "none", publishedAt = null),
            trailer(id = "a", publishedAt = "2026-01-01"),
            trailer(id = "b", publishedAt = "2026-02-01"),
        ).sortedWith(originalTrailerFirst).map { it.id }
        assertEquals(listOf("a", "b", "c", "none"), sorted)
    }

    private fun trailer(
        id: String,
        key: String = id,
        site: String = "YouTube",
        type: String = "Trailer",
        official: Boolean = false,
        publishedAt: String? = null,
        seasonNumber: Int? = null,
    ): MetaTrailer =
        MetaTrailer(
            id = id,
            key = key,
            name = id,
            site = site,
            type = type,
            official = official,
            publishedAt = publishedAt,
            seasonNumber = seasonNumber,
        )
}
