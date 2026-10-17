package com.nuvio.app.features.player.desktop

import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EmbeddedTauriPlayerHostTest {
    @AfterTest fun clearHost() = EmbeddedTauriPlayerHost.clear()

    @Test fun attachmentDoesNotCompletePresentationAndPresentationIsDeliveredOnce() {
        var presentations = 0
        EmbeddedTauriPlayerHost.begin(1L, presented = { presentations++ })
        EmbeddedTauriPlayerHost.playerAttached()
        assertEquals(0, presentations)
        EmbeddedTauriPlayerHost.playerPresented()
        EmbeddedTauriPlayerHost.playerPresented()
        assertEquals(1, presentations)
    }

    @Test fun closingOrReplacingTheHostDropsItsPendingPresentation() {
        var presentations = 0
        EmbeddedTauriPlayerHost.begin(1L, presented = { presentations++ })
        EmbeddedTauriPlayerHost.clear()
        EmbeddedTauriPlayerHost.playerPresented()
        assertEquals(0, presentations)
        EmbeddedTauriPlayerHost.begin(1L, presented = { presentations++ })
        EmbeddedTauriPlayerHost.begin(2L)
        EmbeddedTauriPlayerHost.playerPresented()
        assertEquals(0, presentations)
    }

    @Test fun inheritsShellFullscreenAndRequestsExitThroughTheShell() {
        var requests = 0
        EmbeddedTauriPlayerHost.begin(1L, initialFullscreen = true, toggleFullscreen = { requests++ })
        assertTrue(EmbeddedTauriPlayerHost.isFullscreen())
        EmbeddedTauriPlayerHost.toggleFullscreen()
        assertEquals(1, requests)
        // The shell's acknowledgement updates controls after the window changes.
        assertTrue(EmbeddedTauriPlayerHost.isFullscreen())
        EmbeddedTauriPlayerHost.updateFullscreen(false)
        assertFalse(EmbeddedTauriPlayerHost.isFullscreen())
    }

    @Test fun presentationFailureIsDeliveredOnceAndCannotPresentAfterwards() {
        var failures = 0
        var presentations = 0
        EmbeddedTauriPlayerHost.begin(1L, presented = { presentations++ }, presentationFailed = { failures++ })
        EmbeddedTauriPlayerHost.playerPresentationFailed()
        EmbeddedTauriPlayerHost.playerPresentationFailed()
        EmbeddedTauriPlayerHost.playerPresented()
        assertEquals(1, failures)
        assertEquals(0, presentations)
    }

    @Test fun successfulPresentationOrClearDropsTheFailureCallback() {
        var failures = 0
        EmbeddedTauriPlayerHost.begin(1L, presented = {}, presentationFailed = { failures++ })
        EmbeddedTauriPlayerHost.playerPresented()
        EmbeddedTauriPlayerHost.playerPresentationFailed()
        EmbeddedTauriPlayerHost.begin(1L, presentationFailed = { failures++ })
        EmbeddedTauriPlayerHost.clear()
        EmbeddedTauriPlayerHost.playerPresentationFailed()
        assertEquals(0, failures)
    }

    @Test fun closingFullscreenPlaybackPreservesTheShellMode() {
        var shellFullscreen = false
        EmbeddedTauriPlayerHost.begin(1L, toggleFullscreen = { shellFullscreen = !shellFullscreen })
        EmbeddedTauriPlayerHost.toggleFullscreen()
        EmbeddedTauriPlayerHost.updateFullscreen(shellFullscreen)
        assertTrue(EmbeddedTauriPlayerHost.isFullscreen())
        EmbeddedTauriPlayerHost.clear()
        assertTrue(shellFullscreen)
        assertFalse(EmbeddedTauriPlayerHost.isEmbedded())
        EmbeddedTauriPlayerHost.updateFullscreen(true)
        EmbeddedTauriPlayerHost.toggleFullscreen()
        assertFalse(EmbeddedTauriPlayerHost.isFullscreen())
        assertTrue(shellFullscreen)
        EmbeddedTauriPlayerHost.begin(1L, initialFullscreen = shellFullscreen)
        assertTrue(EmbeddedTauriPlayerHost.isFullscreen())
    }
}
