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
}
