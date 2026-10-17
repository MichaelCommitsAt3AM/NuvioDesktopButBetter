package com.nuvio.desktop.bridge

import com.nuvio.app.features.addons.AddonsUiState
import com.nuvio.app.features.addons.AddonManifest
import com.nuvio.app.features.addons.ManagedAddon
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.test.assertEquals

class BridgeHomeLoadingStateTest {
    @Test fun emptyLocalSnapshotWaitsForProfileInventory() {
        assertTrue(isHomeContentLoading(false, AddonsUiState(profileLoadPending = true)))
        assertFalse(isHomeContentLoading(false, AddonsUiState()))
    }
    @Test fun aLoadedStreamProviderDoesNotSettleAnotherPendingCatalog() {
        val stream = ManagedAddon("https://stream/manifest.json", manifest = AddonManifest(
            id = "stream", name = "Streams", description = "", version = "1", resources = emptyList(), types = listOf("movie"), catalogs = emptyList(), transportUrl = "https://stream/manifest.json",
        ))
        val pending = ManagedAddon("https://catalog/manifest.json", isRefreshing = true)
        assertTrue(isHomeContentLoading(false, AddonsUiState(listOf(stream, pending))))
        assertFalse(isHomeContentLoading(false, AddonsUiState(listOf(stream, pending.copy(isRefreshing = false, errorMessage = "Unavailable")))))
        assertFalse(isHomeContentLoading(false, AddonsUiState(listOf(stream, pending.copy(enabled = false)))))
    }
    @Test fun catalogRequestsKeepLoadingAfterManifestsSettle() {
        assertTrue(isHomeContentLoading(true, AddonsUiState()))
        assertFalse(isHomeContentLoading(false, AddonsUiState(profileLoadError = "Unavailable")))
    }
    @Test fun sourceFailuresReportAnErrorRatherThanAnInstallAddonsEmptyState() {
        val failed = ManagedAddon("https://failed/manifest.json", errorMessage = "Manifest unavailable")
        assertEquals("Manifest unavailable", homeContentError(null, AddonsUiState(listOf(failed)), false))
        assertEquals("Profile unavailable", homeContentError(null, AddonsUiState(profileLoadError = "Profile unavailable"), false))
        assertEquals(null, homeContentError(null, AddonsUiState(), false))
    }
}
