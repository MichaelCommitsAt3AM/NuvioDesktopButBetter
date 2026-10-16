package com.nuvio.desktop.bridge.features

import com.nuvio.app.features.debrid.*
import com.nuvio.app.features.streams.StreamItem
import kotlinx.coroutines.runBlocking
import kotlin.test.*

class DebridDeviceAuthFlowTest {
    private var time = 0L
    private val stored = mutableMapOf<String, String>()
    private val keys = mutableMapOf<String, String>()
    private var starts = 0
    private var polls = 0
    private var result: DebridDeviceAuthorizationTokenResult = DebridDeviceAuthorizationTokenResult.Pending
    private var offline = false
    private val authorization = DebridDeviceAuthorization("torbox", "private-device-code", "ABCD", "https://example.test/approve", "example.test", 2, null)
    private val api = object : DebridProviderApi {
        override val provider = DebridProviders.byId("torbox")!!
        override suspend fun validateApiKey(apiKey: String) = true
        override suspend fun startDeviceAuthorization(appName: String): DebridDeviceAuthorization { starts++; return authorization }
        override suspend fun redeemDeviceAuthorization(deviceCode: String): DebridDeviceAuthorizationTokenResult {
            assertEquals("private-device-code", deviceCode)
            polls++
            if (offline) error("offline")
            return result
        }
        override suspend fun resolveClientStream(stream: StreamItem, apiKey: String, season: Int?, episode: Int?): DirectDebridResolveResult = error("unused")
    }
    private fun flow() = DebridDeviceAuthFlow(
        apiFor = { api }, load = { stored[it] }, save = { id, payload -> stored[id] = payload },
        clear = { stored.remove(it); Unit }, connect = { id, key -> keys[id] = key }, now = { time },
    )

    @Test fun resumesStoredKotlinSessionWithoutIssuingAnotherCode() = runBlocking {
        val first = flow()
        first.start("torbox")
        assertEquals(authorization, flow().start("torbox"))
        assertEquals(1, starts)
        assertTrue(stored.containsKey("torbox"))
    }

    @Test fun respectsPollingIntervalThenStoresTheAuthorizedCredentialAndClearsPending() = runBlocking {
        val flow = flow()
        flow.start("torbox")
        assertEquals("pending", flow.poll("torbox"))
        assertEquals(0, polls)
        time = 2000
        result = DebridDeviceAuthorizationTokenResult.Authorized("private-access-token")
        assertEquals("authorized", flow.poll("torbox"))
        assertEquals("private-access-token", keys["torbox"])
        assertTrue(stored.isEmpty())
        assertNull(flow.nextPoll("torbox"))
    }

    @Test fun transientNetworkFailureKeepsPollingAndPersistentFailureIsBounded() = runBlocking {
        val flow = flow()
        flow.start("torbox")
        offline = true
        time = 2000
        assertEquals("pending", flow.poll("torbox"))
        assertEquals(4000, flow.nextPoll("torbox"))
        time = 15 * 60_000L
        assertEquals("failed", flow.poll("torbox"))
        assertTrue(stored.isEmpty())
        assertTrue(keys.isEmpty())
    }

    @Test fun expiredAndDeniedCodesClearPendingAndRetryGetsAFreshCode() = runBlocking {
        val flow = flow()
        flow.start("torbox")
        time = 2000
        result = DebridDeviceAuthorizationTokenResult.Expired
        assertEquals("expired", flow.poll("torbox"))
        assertTrue(stored.isEmpty())
        flow.start("torbox", restart = true)
        assertEquals(2, starts)
        time = 4000
        result = DebridDeviceAuthorizationTokenResult.Failed("denied")
        assertEquals("failed", flow.poll("torbox"))
        assertTrue(stored.isEmpty())
        assertTrue(keys.isEmpty())
    }
}
