package com.nuvio.desktop.bridge.features

import com.nuvio.app.core.storage.DesktopStorage
import com.nuvio.app.core.storage.ProfileScopedKey
import com.nuvio.app.features.addons.AddonCatalog
import com.nuvio.app.features.addons.AddonExtraProperty
import com.nuvio.app.features.addons.AddonManifest
import com.nuvio.app.features.addons.ManagedAddon
import com.nuvio.app.features.home.HomeCatalogSettingsRepository
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.jsonArray
import kotlin.test.Test
import kotlin.test.assertEquals

class HomePreferencesBridgeTest {
    @Test fun unchangedInstalledAddonsRepopulateSettingsAfterAProfileReset() = runBlocking {
        val store = DesktopStorage.store("nuvio_home_catalog_settings")
        val key = ProfileScopedKey.of("home_catalog_settings")
        val original = store.getString(key)
        val addon = ManagedAddon("https://example.test/manifest.json", manifest = AddonManifest(
            id = "test-addon", name = "Test addon", description = "", version = "1", resources = emptyList(),
            types = listOf("movie", "series"), transportUrl = "https://example.test/manifest.json",
            catalogs = listOf(AddonCatalog("movie", "popular", "Popular"), AddonCatalog("series", "popular", "Popular"),
                AddonCatalog("movie", "search", "Search", listOf(AddonExtraProperty("search", isRequired = true)))),
        ))
        try {
            HomeCatalogSettingsRepository.onProfileChanged()
            AppearanceBridge.synchronizeHomeCatalogs(listOf(addon), emptyList())
            assertEquals(2, AppearanceBridge.homePreferencesSnapshot()["items"]!!.jsonArray.size)
            // Selecting a profile can reset Home without any addon StateFlow emission.
            HomeCatalogSettingsRepository.onProfileChanged()
            assertEquals(0, HomeCatalogSettingsRepository.uiState.value.items.size)
            AppearanceBridge.synchronizeHomeCatalogs(listOf(addon), emptyList())
            assertEquals(2, AppearanceBridge.homePreferencesSnapshot()["items"]!!.jsonArray.size)
            assertEquals(2, HomeCatalogSettingsRepository.uiState.value.items.count { it.heroSourceEnabled })
        } finally {
            store.putString(key, original)
            HomeCatalogSettingsRepository.onProfileChanged()
        }
    }

    private fun addon(id: String, vararg catalogs: AddonCatalog) = ManagedAddon("https://$id.test/manifest.json", manifest = AddonManifest(
        id = id, name = id, description = "", version = "1", resources = emptyList(),
        types = listOf("movie", "series"), transportUrl = "https://$id.test/manifest.json", catalogs = catalogs.toList(),
    ))

    @Test fun changingAddonsSelectsTheFirstHeroCatalogWhenNoneIsSelected() = runBlocking {
        val store = DesktopStorage.store("nuvio_home_catalog_settings")
        val key = ProfileScopedKey.of("home_catalog_settings")
        val original = store.getString(key)
        val first = addon("first-addon", AddonCatalog("movie", "trending", "Trending"), AddonCatalog("series", "trending", "Trending"))
        try {
            HomeCatalogSettingsRepository.onProfileChanged()
            // Hero sources come from a second add-on; the first add-on's catalogs are switched off.
            val second = addon("second-addon", AddonCatalog("movie", "new", "New"))
            AppearanceBridge.synchronizeHomeCatalogs(listOf(first, second), emptyList())
            HomeCatalogSettingsRepository.uiState.value.items.forEach { HomeCatalogSettingsRepository.setHeroSourceEnabled(it.key, it.key.startsWith("second-addon")) }
            assertEquals(1, HomeCatalogSettingsRepository.uiState.value.items.count { it.heroSourceEnabled })

            // Removing that add-on leaves 0 selected, so the first remaining catalog is picked.
            AppearanceBridge.synchronizeHomeCatalogs(listOf(first), emptyList())
            val items = HomeCatalogSettingsRepository.uiState.value.items
            assertEquals(listOf(items.minBy { it.order }.key), items.filter { it.heroSourceEnabled }.map { it.key }, "only the first catalog in Home order is selected")

            // An add-on set with no Home catalogs has nothing to select.
            HomeCatalogSettingsRepository.onProfileChanged()
            AppearanceBridge.synchronizeHomeCatalogs(listOf(addon("search-only", AddonCatalog("movie", "search", "Search", listOf(AddonExtraProperty("search", isRequired = true))))), emptyList())
            assertEquals(0, HomeCatalogSettingsRepository.uiState.value.items.count { it.heroSourceEnabled })
        } finally {
            store.putString(key, original)
            HomeCatalogSettingsRepository.onProfileChanged()
        }
    }
}
