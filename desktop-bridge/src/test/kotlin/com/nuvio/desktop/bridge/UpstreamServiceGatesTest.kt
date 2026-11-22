package com.nuvio.desktop.bridge

import com.nuvio.app.core.network.ServerCapabilities
import com.nuvio.app.core.network.officialConfiguration
import com.nuvio.desktop.bridge.features.BridgeFeatureException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class UpstreamServiceGatesTest {
    @Test fun undeployedServicesAreDisabledByDefaultAndWatchPartyIsOnForThisBackend() {
        val defaults = ServerCapabilities(emailPasswordAuth = false, tvLogin = false)
        val official = officialConfiguration().capabilities
        assertFalse(defaults.watchParty)
        assertFalse(defaults.mediaServerSync)
        assertTrue(official.watchParty)
        assertFalse(official.mediaServerSync)
        assertFalse(official.tvLogin)
    }

    @Test fun serverErrorsDoNotReturnCredentialsOrProviderDetails() = runBlocking {
        val error = assertFailsWith<BridgeFeatureException> {
            ServersBridge.dispatch("servers.connect", buildJsonObject {
                put("provider", "invalid-private-provider"); put("password", "private-password")
            })
        }
        assertEquals("The server operation failed. Check the server address, connection and sign-in details.", error.message)
    }

    @Test fun plexAndSiloNeverAcceptPasswordsThroughTheGenericConnect() = runBlocking {
        for (provider in listOf("plex", "silo")) {
            val error = assertFailsWith<BridgeFeatureException> {
                ServersBridge.dispatch("servers.connect", buildJsonObject {
                    put("provider", provider); put("address", "https://server.test"); put("username", "user"); put("password", "private-password")
                })
            }
            assertFalse(error.message.orEmpty().contains("private-password"))
        }
    }

    @Test fun guidedSignInRequiresAStartedFlowAndExposesNoState() = runBlocking {
        assertFailsWith<BridgeFeatureException> {
            ServersBridge.dispatch("servers.signIn.pin", buildJsonObject { put("pin", "1234") })
        }
        assertEquals(kotlinx.serialization.json.JsonNull, ServerSignInBridge.snapshot())
    }
}
