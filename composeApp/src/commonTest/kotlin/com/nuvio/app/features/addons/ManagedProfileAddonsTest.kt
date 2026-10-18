package com.nuvio.app.features.addons

import com.nuvio.app.features.profiles.NuvioProfile
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ManagedProfileAddonsTest {
    private val kids = NuvioProfile(profileIndex = 5, kidsEnabled = true, kidsServiceUrl = "https://kids.example", kidsConfigId = "configured", kidsMaxRating = "PG")
    private val stream = AddonRow("https://stream.example/manifest.json", "My provider", enabled = false, sortOrder = 3)

    @Test fun missingManagedCatalogIsRecoveredWithoutReplacingProviders() {
        val result = reconcileManagedProfileAddons(listOf(stream), kids)
        assertEquals(stream, result.first())
        assertEquals("https://kids.example/configured/manifest.json", result.last().url)
        assertTrue(result.last().enabled)
        assertEquals(4, result.last().sortOrder)
        assertEquals(result, reconcileManagedProfileAddons(result, kids))
    }

    @Test fun managedCatalogRemainsEnabledAndKeepsItsPosition() {
        val catalog = AddonRow("https://kids.example/configured/manifest.json", "Kids", enabled = false)
        assertEquals(listOf(catalog.copy(enabled = true), stream), reconcileManagedProfileAddons(listOf(catalog, stream), kids))
    }

    @Test fun ordinaryAndUnconfiguredProfilesDoNotInventCatalogs() {
        for (profile in listOf(null, NuvioProfile(), kids.copy(kidsConfigId = null), kids.copy(kidsEnabled = false))) {
            assertEquals(listOf(stream), reconcileManagedProfileAddons(listOf(stream), profile))
        }
    }
}
