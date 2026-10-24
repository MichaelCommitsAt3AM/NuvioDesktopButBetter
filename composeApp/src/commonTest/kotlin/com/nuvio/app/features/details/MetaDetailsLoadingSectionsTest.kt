package com.nuvio.app.features.details

import com.nuvio.app.features.home.MetaPreview
import com.nuvio.app.features.tmdb.TmdbSettings
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class MetaDetailsLoadingSectionsTest {
    private val allModules = TmdbSettings(enabled = true)
    private val meta = MetaDetails(id = "tmdb:1", type = "movie", name = "Title")

    @Test fun pendingSectionsFollowEnabledModulesAndEmptyContent() {
        assertEquals(
            setOf(
                MetaDetailsSection.DETAILS,
                MetaDetailsSection.PRODUCTION,
                MetaDetailsSection.CAST,
                MetaDetailsSection.TRAILERS,
                MetaDetailsSection.MORE_LIKE_THIS,
            ),
            pendingTmdbSections(meta, allModules, hasAccess = true),
        )

        val disabled = allModules.copy(
            useDetails = false,
            useProductions = false,
            useNetworks = false,
            useCredits = false,
            useTrailers = false,
            useCollections = false,
            useMoreLikeThis = false,
        )
        assertEquals(emptySet(), pendingTmdbSections(meta, disabled, hasAccess = true))
        assertEquals(emptySet(), pendingTmdbSections(meta, allModules, hasAccess = false))
        assertEquals(emptySet(), pendingTmdbSections(meta, allModules.copy(enabled = false), hasAccess = true))
    }

    @Test fun alreadyLoadedContentIsPreservedInsteadOfBeingReplacedByASkeleton() {
        val loaded = meta.copy(
            status = "Released",
            runtime = "117m",
            ageRating = "PG",
            country = "US",
            language = "en",
            cast = listOf(MetaPerson(name = "Actor")),
            trailers = listOf(MetaTrailer(id = "v1", key = "k", name = "Trailer", site = "YouTube")),
            collectionName = "Saga",
            collectionItems = listOf(MetaPreview(id = "tmdb:2", type = "movie", name = "Sequel")),
            moreLikeThis = listOf(MetaPreview(id = "tmdb:3", type = "movie", name = "Related")),
            productionCompanies = listOf(MetaCompany(name = "Studio")),
        )
        assertTrue(pendingTmdbSections(loaded, allModules, hasAccess = true).isEmpty())

        val partial = meta.copy(status = "Released")
        assertTrue(MetaDetailsSection.DETAILS in pendingTmdbSections(partial, allModules, hasAccess = true))
        assertFalse(MetaDetailsSection.CAST in pendingTmdbSections(loaded.copy(cast = emptyList()), allModules.copy(useCredits = false), hasAccess = true))
    }

    @Test fun aSingleLoadedProductionListSuppressesTheWholeProductionSkeleton() {
        val meta = meta.copy(productionCompanies = listOf(MetaCompany(name = "Studio")))
        assertFalse(MetaDetailsSection.PRODUCTION in pendingTmdbSections(meta, allModules, hasAccess = true))
    }
}
