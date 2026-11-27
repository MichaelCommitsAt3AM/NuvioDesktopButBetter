package com.nuvio.app.features.home

import com.nuvio.app.features.addons.AddonCatalog
import com.nuvio.app.features.addons.AddonManifest
import com.nuvio.app.features.addons.AddonResource
import com.nuvio.app.features.addons.ManagedAddon
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class HomeCatalogDefinitionTest {
    private val definition = HomeCatalogDefinition(
        key = "addon:movie:popular",
        defaultTitle = "Popular - Movie",
        catalogName = "Popular",
        addonName = "Addon",
        manifestUrl = "https://example.com/manifest.json",
        type = "movie",
        catalogId = "popular",
        supportsPagination = true,
        descriptorSignature = "signature",
    )

    @Test
    fun `shows the type suffix by default`() {
        assertEquals("Popular - Movie", definition.titleFor(showCatalogType = true))
    }

    @Test
    fun `omits the type suffix when disabled`() {
        assertEquals("Popular", definition.titleFor(showCatalogType = false))
    }

    @Test
    fun `addon refresh signature tracks catalog identity not transient refresh state`() {
        val pendingAddon = ManagedAddon(
            manifestUrl = "https://example.test/manifest.json",
            isRefreshing = true,
        )
        val failedAddon = pendingAddon.copy(
            isRefreshing = false,
            errorMessage = "Timed out",
        )
        val loadedAddon = pendingAddon.copy(
            manifest = AddonManifest(
                id = "addon",
                name = "Addon",
                description = "",
                version = "1.0.0",
                resources = listOf(AddonResource(name = "meta", types = listOf("movie"))),
                types = listOf("movie"),
                catalogs = emptyList(),
                transportUrl = pendingAddon.manifestUrl,
            ),
            isRefreshing = false,
        )

        val pendingSignature = buildAddonCatalogRefreshSignature(listOf(pendingAddon))
        val failedSignature = buildAddonCatalogRefreshSignature(listOf(failedAddon))
        val loadedSignature = buildAddonCatalogRefreshSignature(listOf(loadedAddon))

        assertTrue(pendingSignature.isNotEmpty())
        // Transient refresh state must not churn the signature: doing so would
        // discard cached Home sections and force a refetch on every revalidation.
        assertEquals(pendingSignature, failedSignature)
        assertEquals(loadedSignature, buildAddonCatalogRefreshSignature(listOf(loadedAddon.copy(userSetName = "Renamed"))))
        // Resolving a manifest and identity changes are tracked.
        assertNotEquals(pendingSignature, loadedSignature)
        assertNotEquals(loadedSignature, buildAddonCatalogRefreshSignature(listOf(loadedAddon.copy(enabled = false))))
        assertNotEquals(
            loadedSignature,
            buildAddonCatalogRefreshSignature(listOf(loadedAddon.copy(manifestUrl = "https://other.example/manifest.json"))),
        )
    }

    @Test
    fun `catalog cache keys ignore the addon display name and refresh state`() {
        val localAddon = catalogAddon()
        val serverAddon = localAddon.copy(userSetName = "My addon", errorMessage = "Timed out")

        val localKeys = buildHomeCatalogDefinitions(listOf(localAddon)).map(HomeCatalogDefinition::cacheKey)
        val serverDefinitions = buildHomeCatalogDefinitions(listOf(serverAddon))

        assertEquals(localKeys, serverDefinitions.map(HomeCatalogDefinition::cacheKey))
        assertEquals("My addon", serverDefinitions.single().addonName)
    }

    @Test
    fun `catalog cache keys change when the manifest changes`() {
        val addon = catalogAddon()
        val updated = addon.copy(manifest = addon.manifest?.copy(version = "2.0.0"))

        assertNotEquals(
            buildHomeCatalogDefinitions(listOf(addon)).single().cacheKey,
            buildHomeCatalogDefinitions(listOf(updated)).single().cacheKey,
        )
    }

    private fun catalogAddon() = ManagedAddon(
        manifestUrl = "https://example.test/manifest.json",
        manifest = AddonManifest(
            id = "addon",
            name = "Addon",
            description = "",
            version = "1.0.0",
            resources = listOf(AddonResource(name = "catalog", types = listOf("movie"))),
            types = listOf("movie"),
            catalogs = listOf(AddonCatalog(type = "movie", id = "popular", name = "Popular")),
            transportUrl = "https://example.test/manifest.json",
        ),
    )
}
