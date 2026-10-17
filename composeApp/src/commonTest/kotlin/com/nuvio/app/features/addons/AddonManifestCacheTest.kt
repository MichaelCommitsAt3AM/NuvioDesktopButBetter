package com.nuvio.app.features.addons

import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AddonManifestCacheTest {
    private val url = "https://cache.example/manifest.json"
    private val payload = """
        {"id":"cache","name":"Cache","version":"1.0.0","types":["movie"],
         "catalogs":[{"type":"movie","id":"top","name":"Top"}]}
    """.trimIndent()

    @BeforeTest
    fun setUp() = AddonManifestCache.clear()

    @AfterTest
    fun tearDown() = AddonManifestCache.clear()

    @Test
    fun `records and reads back a parsed manifest`() {
        assertNull(AddonManifestCache.manifest(url))

        AddonManifestCache.record(url, payload, now = 1_000L)

        val manifest = assertNotNull(AddonManifestCache.manifest(url))
        assertEquals("cache", manifest.id)
        assertEquals("top", manifest.catalogs.single().id)
    }

    @Test
    fun `freshness uses the manifest ttl boundary`() {
        assertTrue(AddonManifestCache.isStale(url, now = 1_000L))

        AddonManifestCache.record(url, payload, now = 1_000L)

        assertFalse(AddonManifestCache.isStale(url, now = 1_000L))
        assertFalse(AddonManifestCache.isStale(url, now = 1_000L + ADDON_MANIFEST_CACHE_TTL_MS - 1))
        assertTrue(AddonManifestCache.isStale(url, now = 1_000L + ADDON_MANIFEST_CACHE_TTL_MS))
    }

    @Test
    fun `a re-fetch replaces the cached payload`() {
        AddonManifestCache.record(url, payload, now = 1_000L)

        AddonManifestCache.record(
            url,
            """{"id":"cache","name":"Cache v2","version":"2.0.0","types":["movie"]}""",
            now = 2_000L,
        )

        assertEquals("Cache v2", AddonManifestCache.manifest(url)?.name)
        assertFalse(AddonManifestCache.isStale(url, now = 2_000L))
    }

    @Test
    fun `malformed payload is not cached`() {
        AddonManifestCache.record(url, "{not json", now = 1_000L)

        assertNull(AddonManifestCache.manifest(url))
    }

    @Test
    fun `blank payload is ignored`() {
        AddonManifestCache.record(url, "   ", now = 1_000L)

        assertNull(AddonManifestCache.manifest(url))
        assertTrue(AddonManifestCache.isStale(url, now = 1_000L))
    }
}
