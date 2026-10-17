package com.nuvio.desktop.bridge.features

import com.nuvio.app.features.addons.AddonRow
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class ProfileAddonCopyTest {
    private val rows = listOf(
        AddonRow("https://second/manifest.json", "Second", false, 2),
        AddonRow("https://first/manifest.json", "First", true, 0),
        AddonRow("https://omit/manifest.json", "Omit", true, 1),
    )

    @Test
    fun selectionPreservesSourceOrderConfigurationAndEnabledState() {
        val selected = ProfilesBridge.selectCopiedAddons(rows, listOf(rows[0].url, rows[1].url, rows[0].url))
        assertEquals(listOf(rows[1], rows[0]), selected)
    }

    @Test
    fun emptySelectionCopiesNothingRatherThanEverything() {
        assertEquals(emptyList(), ProfilesBridge.selectCopiedAddons(rows, emptyList()))
    }

    @Test
    fun rejectsRemovedOrUnrecognizedAddonUrls() {
        assertFailsWith<BridgeFeatureException> {
            ProfilesBridge.selectCopiedAddons(rows, listOf("https://missing/manifest.json"))
        }
    }
}
