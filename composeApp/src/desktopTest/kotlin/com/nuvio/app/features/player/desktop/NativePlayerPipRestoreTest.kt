package com.nuvio.app.features.player.desktop

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NativePlayerPipRestoreTest {
    private fun NativePlayerController.setNativeHandleForTest(value: Long) {
        javaClass.getDeclaredField("handle").also { field ->
            field.isAccessible = true
            field.setLong(this, value)
        }
    }

    @Test fun restoresToTheAttachParentInsteadOfTheHiddenCanvas() {
        val parents = mutableListOf<Long>()
        var parent = 123L
        val controller = NativePlayerController(
            host = NativePlayerHost(),
            isHostDisplayable = { true },
            resolveHostView = { parent },
            nativeReparent = { handle, target ->
                assertEquals(42L, handle)
                parents += target
                true
            },
        )
        controller.setNativeHandleForTest(42L)
        assertTrue(controller.restoreSurface())
        // Resolve the current parent again on every restore; never cache the PiP HWND.
        parent = 456L
        assertTrue(controller.restoreSurface())
        assertEquals(listOf(123L, 456L), parents)
    }

    @Test fun unresolvableReparentTargetReportsFailureWithoutTouchingNative() {
        var calls = 0
        val controller = NativePlayerController(
            host = NativePlayerHost(),
            isHostDisplayable = { true },
            nativeReparent = { _, _ -> calls++; true },
        )
        controller.setNativeHandleForTest(42L)
        // A PiP host with no native peer must not claim the surface moved.
        assertFalse(controller.reparentSurface(NativePlayerHost()))
        assertEquals(0, calls)
    }

    @Test fun unavailableParentAndNativeFailureDoNotReportSuccessfulRestore() {
        var displayable = false
        var parent = 0L
        var calls = 0
        val controller = NativePlayerController(
            host = NativePlayerHost(),
            isHostDisplayable = { displayable },
            resolveHostView = { parent },
            nativeReparent = { _, _ -> calls++; false },
        )
        assertFalse(controller.restoreSurface())
        controller.setNativeHandleForTest(42L)
        assertFalse(controller.restoreSurface())
        displayable = true
        assertFalse(controller.restoreSurface())
        assertEquals(0, calls)
        parent = 123L
        assertFalse(controller.restoreSurface())
        assertEquals(1, calls)
    }
}
