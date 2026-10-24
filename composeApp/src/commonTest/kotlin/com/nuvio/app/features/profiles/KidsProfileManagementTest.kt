package com.nuvio.app.features.profiles

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class KidsProfileManagementTest {
    private val base = "https://kids-screen.vercel.app"
    private val profile = NuvioProfile(kidsEnabled = true, kidsConfigId = "a".repeat(43), kidsServiceUrl = base)

    @Test fun aSignedInSecondDeviceCanAuthorizeManagementForTheTrustedConfiguration() {
        assertEquals("session-token", kidsOwnerSessionToken(profile, base, "session-token"))
        assertNull(kidsOwnerSessionToken(profile, base, null))
        assertNull(kidsOwnerSessionToken(profile, base, " "))
        assertNull(kidsOwnerSessionToken(profile.copy(kidsEnabled = false), base, "session-token"))
    }

    @Test fun customOrChangedServersNeverReceiveTheNuvioSession() {
        for (url in listOf("https://custom.example", "http://kids-screen.vercel.app", "https://kids-screen.vercel.app:444", "https://kids-screen.vercel.app.evil.example", "$base/other")) {
            assertNull(kidsOwnerSessionToken(profile.copy(kidsServiceUrl = url), url, "secret-session"), url)
            assertNull(kidsOwnerSessionToken(profile, url, "secret-session"), url)
        }
    }
}
