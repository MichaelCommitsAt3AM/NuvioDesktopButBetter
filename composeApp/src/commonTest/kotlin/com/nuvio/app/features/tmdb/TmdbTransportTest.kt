package com.nuvio.app.features.tmdb

import com.nuvio.app.features.profiles.NuvioProfile
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TmdbTransportTest {
    private val id = "A".repeat(43)
    private fun profile(
        enabled: Boolean = true,
        service: String? = "https://kids-screen.vercel.app",
        configId: String? = id,
    ) = NuvioProfile(profileIndex = 2, kidsEnabled = enabled, kidsServiceUrl = service, kidsConfigId = configId)

    @Test fun onlyThePinnedHttpsKidsScreenOriginGetsAProxyUrl() {
        assertEquals("https://kids-screen.vercel.app/v1/configurations/$id/tmdb", kidsTmdbProxyUrl(profile()))
        // A synced custom service address must never receive a Nuvio session token.
        assertNull(kidsTmdbProxyUrl(profile(service = "https://evil.example")))
        assertNull(kidsTmdbProxyUrl(profile(service = "https://kids-screen.vercel.app.evil.example")))
        assertNull(kidsTmdbProxyUrl(profile(service = "http://kids-screen.vercel.app")))
        assertNull(kidsTmdbProxyUrl(profile(service = "https://kids-screen.vercel.app/path")))
        assertNull(kidsTmdbProxyUrl(profile(service = "https://kids-screen.vercel.app?next=https://evil.example")))
        assertNull(kidsTmdbProxyUrl(profile(service = "https://user:pass@kids-screen.vercel.app")))
        assertNull(kidsTmdbProxyUrl(profile(service = "https://kids-screen.vercel.app:8443")))
        assertNull(kidsTmdbProxyUrl(profile(service = null)))
        assertNull(kidsTmdbProxyUrl(profile(enabled = false)))
        assertNull(kidsTmdbProxyUrl(profile(configId = null)))
        assertNull(kidsTmdbProxyUrl(profile(configId = "short")))
        assertNull(kidsTmdbProxyUrl(profile(configId = "!".repeat(43))))
        assertNull(kidsTmdbProxyUrl(null))
    }
}
