package com.nuvio.app.features.addons

import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The manifest cache is what stops a profile switch from re-downloading every
 * add-on, so a cached manifest must seed a rebuilt pending addon.
 */
class AddonPendingSeedingTest {
    private val url = "https://seed.example/manifest.json"
    private val payload = """
        {"id":"seed","name":"Seed","version":"1.0.0","types":["movie"],
         "catalogs":[{"type":"movie","id":"top","name":"Top"}]}
    """.trimIndent()

    @BeforeTest
    fun setUp() = AddonManifestCache.clear()

    @AfterTest
    fun tearDown() = AddonManifestCache.clear()

    @Test
    fun `a cached manifest seeds a rebuilt pending addon`() {
        AddonManifestCache.record(url, payload, now = 1_000L)

        val addon = (null as ManagedAddon?).toPendingAddon(url, enabled = true)

        assertEquals("seed", addon.manifest?.id)
        assertFalse(addon.isRefreshing)
        assertEquals(url, addon.manifestUrl)
        assertTrue(addon.enabled)
    }

    @Test
    fun `an uncached addon still starts as a pending fetch`() {
        val addon = (null as ManagedAddon?).toPendingAddon(url, enabled = true)

        assertNull(addon.manifest)
        assertTrue(addon.isRefreshing)
    }

    @Test
    fun `an existing resolved manifest is kept and marked settled`() {
        val existing = ManagedAddon(
            manifestUrl = url,
            manifest = AddonManifest(
                id = "existing",
                name = "Existing",
                description = "",
                version = "1.0.0",
                resources = emptyList(),
                types = listOf("movie"),
                transportUrl = url,
            ),
            isRefreshing = true,
        )

        val addon = existing.toPendingAddon(url, enabled = true)

        assertEquals("existing", addon.manifest?.id)
        assertFalse(addon.isRefreshing)
    }
}
