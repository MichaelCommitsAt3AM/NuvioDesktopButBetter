package com.nuvio.app.features.addons

import kotlin.test.Test
import kotlin.test.assertEquals

class ProfileAddonImportTest {
    @Test fun preservesTargetSettingsAndAppendsOnlyNewAddonsInSourceOrder() {
        val existing = listOf(AddonRow("https://two/manifest.json", "My disabled addon", false, 9), AddonRow("https://one/manifest.json", "My first addon", true, 2))
        val imported = listOf(AddonRow("https://four/manifest.json", "Fourth", true, 8), AddonRow("https://two/manifest.json", "Source rename", true, 0), AddonRow("https://three/manifest.json", "Third", false, 3))
        val merged = mergeProfileAddonImport(existing, imported)
        assertEquals(listOf("https://one/manifest.json", "https://two/manifest.json", "https://three/manifest.json", "https://four/manifest.json"), merged.map { it.url })
        assertEquals("My disabled addon", merged[1].name)
        assertEquals(false, merged[1].enabled)
        assertEquals(false, merged[2].enabled)
        assertEquals(listOf(0, 1, 2, 3), merged.map { it.sortOrder })
    }

    @Test fun repeatedImportsAreIdempotentAndEmptyImportKeepsTheTarget() {
        val existing = listOf(AddonRow("https://one/manifest.json", "One", true, 0))
        val imported = listOf(AddonRow("https://two/manifest.json", "Two", true, 0))
        val once = mergeProfileAddonImport(existing, imported)
        assertEquals(once, mergeProfileAddonImport(once, imported + imported))
        assertEquals(existing, mergeProfileAddonImport(existing, emptyList()))
    }

    @Test fun normalizesUrlsBeforeDeduplicationWithoutRemovingConfiguration() {
        val merged = mergeProfileAddonImport(listOf(AddonRow("https://one", "Keep", false, 0)), listOf(AddonRow("https://one/manifest.json", "Duplicate", true, 0), AddonRow("https://one/config/manifest.json", "Configured", true, 1)))
        assertEquals(listOf("https://one/manifest.json", "https://one/config/manifest.json"), merged.map { it.url })
        assertEquals("Keep", merged.first().name)
    }
}
