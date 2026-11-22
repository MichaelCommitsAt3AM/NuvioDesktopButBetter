package com.nuvio.app.features.collection

import com.nuvio.app.features.addons.AddonCatalog
import com.nuvio.app.features.addons.AddonManifest
import com.nuvio.app.features.addons.ManagedAddon
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class CollectionCatalogResolverTest {
    private fun addon(id: String, url: String, vararg catalogs: AddonCatalog, enabled: Boolean = true) = ManagedAddon(
        manifestUrl = url,
        enabled = enabled,
        manifest = AddonManifest(
            id = id,
            name = id,
            description = "",
            version = "1.0.0",
            resources = emptyList(),
            types = listOf("movie"),
            catalogs = catalogs.toList(),
            transportUrl = url,
        ),
    )

    @Test
    fun listedCatalogResolvesToItsManifestEntry() {
        val listed = AddonCatalog(type = "movie", id = "tmdb.top", name = "Popular")
        val addons = listOf(addon("aio-metadata", "https://aio/manifest.json", listed))

        val resolved = addons.findCollectionCatalog(CollectionCatalogSource("aio-metadata", "movie", "tmdb.top"))

        assertEquals(listed, resolved?.catalog)
    }

    @Test
    fun unlistedCatalogFallsBackToTheDeclaredAddon() {
        val addons = listOf(
            addon("other", "https://other/manifest.json"),
            addon("aio-metadata", "https://aio/manifest.json", AddonCatalog(type = "movie", id = "tmdb.top", name = "Popular")),
        )

        val resolved = addons.findCollectionCatalog(CollectionCatalogSource("aio-metadata", "movie", "streaming.nfx"))

        assertEquals("https://aio/manifest.json", resolved?.addon?.manifestUrl)
        assertEquals("streaming.nfx", resolved?.catalog?.id)
        assertEquals("movie", resolved?.catalog?.type)
        assertEquals("Netflix", resolved?.catalog?.name)
    }

    @Test
    fun unnamedCatalogIdsBecomeReadableNames() {
        assertEquals("Netflix", readableCatalogName("streaming.nfx"))
        assertEquals("Disney+", readableCatalogName("streaming.dnp"))
        assertEquals("Streaming Xyz", readableCatalogName("streaming.xyz"))
        assertEquals("Action Movies", readableCatalogName("tmdb.discover.movie.action_movies.28"))
        assertEquals("Action Adventure Shows", readableCatalogName("tmdb.discover.tv.action_adventure_shows.10759"))
        assertEquals("FlixPatrol Netflix World", readableCatalogName("flixpatrol.netflix.world.movie"))
        assertEquals("Top", readableCatalogName("tmdb.top"))
        assertEquals("Tmdb", readableCatalogName("tmdb.movie"))
        assertEquals("28", readableCatalogName("28"))
    }

    @Test
    fun missingOrDisabledAddonStillResolvesToNothing() {
        val addons = listOf(addon("aio-metadata", "https://aio/manifest.json", enabled = false))

        assertNull(addons.findCollectionCatalog(CollectionCatalogSource("aio-metadata", "movie", "streaming.nfx")))
        assertNull(addons.findCollectionCatalog(CollectionCatalogSource("cinemeta", "movie", "top")))
    }
}
