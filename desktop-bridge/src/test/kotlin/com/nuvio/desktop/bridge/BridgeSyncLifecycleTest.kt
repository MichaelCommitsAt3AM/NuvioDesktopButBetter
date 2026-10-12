package com.nuvio.desktop.bridge

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class BridgeSyncLifecycleTest {
    private val calls = mutableListOf<String>()
    private val lifecycle = BridgeSyncLifecycle(
        startWatchSource = { calls += "source" },
        pullProfile = { calls += "full:$it" },
        startPeriodic = { calls += "periodic:$it" },
        pullForeground = { calls += "foreground:$it" },
        stopPeriodic = { calls += "stop" },
    )

    @Test fun focusBeforeAuthenticationDoesNotLoseTheInitialCloudPull() {
        lifecycle.update(null, null, true)
        calls.clear()
        lifecycle.update("account", 2, true)
        assertEquals(listOf("stop", "source", "full:2", "periodic:2", "foreground:2"), calls)
    }

    @Test fun profileAndAccountSwitchesPullTheNewProfile() {
        lifecycle.update("account", 1, true)
        calls.clear()
        lifecycle.update("account", 3, true)
        lifecycle.update("other-account", 3, true)
        assertEquals(2, calls.count { it == "full:3" })
        assertEquals(2, calls.count { it == "source" })
        assertTrue(calls.indexOf("stop") < calls.indexOf("full:3"))
    }

    @Test fun backgroundStopsPollingAndForegroundUsesTheSharedThrottledPull() {
        lifecycle.update("account", 1, false)
        assertTrue("full:1" in calls)
        assertTrue(calls.none { it.startsWith("periodic:") })
        calls.clear()
        lifecycle.update("account", 1, true)
        assertEquals(listOf("periodic:1", "foreground:1"), calls)
        calls.clear()
        lifecycle.update("account", 1, false)
        assertEquals(listOf("stop"), calls)
    }

    @Test fun signedOutAndGuestSessionsNeverPullCloudProgressAndStopClearsTheSession() {
        lifecycle.update(null, 1, true)
        assertTrue(calls.all { it == "stop" })
        lifecycle.update("account", 1, true)
        lifecycle.stop()
        calls.clear()
        lifecycle.update("account", 1, true)
        assertTrue("full:1" in calls)
    }
}
