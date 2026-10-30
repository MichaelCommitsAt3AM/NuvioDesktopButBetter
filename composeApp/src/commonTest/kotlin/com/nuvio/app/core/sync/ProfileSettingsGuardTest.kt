package com.nuvio.app.core.sync

import kotlin.test.*

class ProfileSettingsGuardTest {
    @Test fun anOldResponseCannotCommitAfterLeavingAndReturningToTheSameProfile() {
        var profile = 1
        val guard = ProfileSettingsGuard { profile }
        val captured = guard.capture { "profile-1-settings" }
        guard.switching { profile = 2 }
        guard.switching { profile = 1 }
        var applied = false
        assertFalse(guard.runIfCurrent(captured.token) { applied = true })
        assertFalse(applied)
    }
    @Test fun aResponseForAnotherProfileCannotCommitAndCurrentResponsesCan() {
        var profile = 1
        val guard = ProfileSettingsGuard { profile }
        val captured = guard.capture { "A" }
        guard.switching { profile = 2 }
        assertFalse(guard.runIfCurrent(captured.token) { error("Wrong profile") })
        val current = guard.capture { "B" }
        var applied = ""
        assertTrue(guard.runIfCurrent(current.token) { applied = current.value })
        assertEquals("B", applied)
    }
}
