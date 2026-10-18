package com.nuvio.desktop.bridge

import com.nuvio.app.features.addons.AddonCatalog
import com.nuvio.app.features.addons.AddonManifest
import com.nuvio.app.features.addons.ManagedAddon
import com.nuvio.app.features.collection.Collection
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class BridgeHomeCatalogLifecycleTest {
    @Test fun serverChangesRefreshHomeWithoutAddonChanges() = runBlocking {
        lifecycle.update(1, listOf(loaded), emptyList(), serverRevision = 1)
        calls.clear()
        lifecycle.update(1, listOf(loaded), emptyList(), serverRevision = 2)
        assertEquals(listOf("catalogs:1", "collections:0", "home:1"), calls)
        calls.clear()
        lifecycle.update(1, listOf(loaded), emptyList(), serverRevision = 2)
        assertTrue(calls.isEmpty())
    }

    private val calls = mutableListOf<String>()
    private val lifecycle = BridgeHomeCatalogLifecycle(
        syncCatalogs = { calls += "catalogs:${it.size}" },
        syncCollections = { collections, _ -> calls += "collections:${collections.size}" },
        refreshHome = { calls += "home:${it.size}" },
    )
    private val pending = ManagedAddon("https://example.test/manifest.json", isRefreshing = true)
    private val loaded = pending.copy(isRefreshing = false, manifest = AddonManifest(
        id = "addon", name = "Addon", description = "", version = "1", resources = emptyList(),
        types = listOf("movie"), catalogs = listOf(AddonCatalog("movie", "popular", "Popular")), transportUrl = pending.manifestUrl,
    ))

    @Test fun lateManifestsPopulateSettingsBeforeRefreshingHome() = runBlocking {
        lifecycle.update(1, listOf(pending), emptyList())
        assertTrue(calls.isEmpty())
        lifecycle.update(1, listOf(loaded), emptyList())
        assertEquals(listOf("catalogs:1", "collections:0", "home:1"), calls)
    }

    @Test fun addonAndCollectionCloudChangesRefreshWithoutAnRpc() = runBlocking {
        lifecycle.update(1, listOf(loaded), emptyList())
        calls.clear()
        lifecycle.update(1, listOf(loaded), listOf(Collection("saved", "Saved", pinToTop = true)))
        assertEquals(listOf("catalogs:1", "collections:1", "home:1"), calls)
        calls.clear()
        lifecycle.update(1, listOf(loaded.copy(enabled = false)), emptyList())
        assertEquals(listOf("catalogs:0", "collections:0", "home:0"), calls)
    }

    @Test fun unchangedInputsAreSkippedButNewProfilesResynchronize() = runBlocking {
        lifecycle.update(1, listOf(loaded), emptyList())
        calls.clear()
        lifecycle.update(1, listOf(loaded), emptyList())
        assertTrue(calls.isEmpty())
        lifecycle.update(2, listOf(loaded), emptyList())
        assertEquals(listOf("catalogs:1", "collections:0", "home:1"), calls)
    }

    @Test fun failedFirstManifestSettlesAndSuccessfulRetryRepopulates() = runBlocking {
        lifecycle.update(1, listOf(pending.copy(isRefreshing = false, errorMessage = "Unavailable")), emptyList())
        assertEquals(listOf("catalogs:1", "collections:0", "home:1"), calls)
        calls.clear()
        lifecycle.update(1, listOf(loaded), emptyList())
        assertEquals(listOf("catalogs:1", "collections:0", "home:1"), calls)
    }
}
