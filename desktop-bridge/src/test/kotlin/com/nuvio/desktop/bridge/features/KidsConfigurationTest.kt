package com.nuvio.desktop.bridge.features

import com.nuvio.app.features.profiles.NuvioProfile
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import kotlin.test.*

class KidsConfigurationTest {
    private val base = "https://kids.example"
    private val profile = NuvioProfile(kidsEnabled = true, kidsConfigId = "a".repeat(43), kidsServiceUrl = base, kidsMaxRating = "G")
    private val result = buildJsonObject { put("id", "b".repeat(43)); put("managementToken", "c".repeat(43)) }

    @Test fun ratingEditOnASecondDeviceUsesAccountOwnershipWithoutTheOldManagementToken() = runBlocking<Unit> {
        assertEquals(result, KidsBridge.prepareConfiguration(
            profile, "PG", base, "", managementToken = { null },
            ownerSessionToken = { "verified-account-session" },
        ) { path, data, token ->
            assertEquals("/v1/configurations/${profile.kidsConfigId}/clone-owned", path)
            assertEquals(buildJsonObject { put("maxRating", "PG") }, data)
            assertEquals("verified-account-session", token)
            result
        })
    }

    @Test fun ratingEditReusesServerKeyWithManagementAuthorization() = runBlocking<Unit> {
        var called = false
        val created = KidsBridge.prepareConfiguration(profile, "PG", base, "", { "private-management-token" }) { path, data, token ->
            called = true
            assertEquals("/v1/configurations/${profile.kidsConfigId}/clone", path)
            assertEquals(buildJsonObject { put("maxRating", "PG") }, data)
            assertEquals("private-management-token", token)
            result
        }
        assertTrue(called)
        assertEquals(result, created)
    }

    @Test fun unchangedPolicyKeepsConfigurationWithoutKeyOrManagementRequest() = runBlocking<Unit> {
        assertNull(KidsBridge.prepareConfiguration(profile, "G", base, "", { error("unused") }) { _, _, _ -> error("unused") })
    }

    @Test fun replacementKeyCreatesANewConfigurationWithoutUsingTheOldToken() = runBlocking<Unit> {
        assertEquals(result, KidsBridge.prepareConfiguration(profile, "PG", base, "replacement-key", { error("unused") }) { path, data, token ->
            assertEquals("/v1/configurations", path)
            assertEquals("replacement-key", data["apiKey"]!!.jsonPrimitive.content)
            assertEquals("PG", data["maxRating"]!!.jsonPrimitive.content)
            assertNull(token)
            result
        })
    }

    @Test fun missingManagementAccessDoesNotTreatPlaceholderDotsAsAKey() = runBlocking<Unit> {
        val error = assertFailsWith<BridgeFeatureException> {
            KidsBridge.prepareConfiguration(profile, "PG", base, "", { null }) { _, _, _ -> error("must not provision") }
        }
        assertEquals("KIDS_CONFIGURATION_ACCESS_REQUIRED", error.code)
    }

    @Test fun newProfilesAndServiceMovesStillRequireTheirOwnKey() = runBlocking<Unit> {
        for (target in listOf(profile.copy(kidsEnabled = false), profile.copy(kidsConfigId = null), profile.copy(kidsServiceUrl = "https://other.example"))) {
            val error = assertFailsWith<BridgeFeatureException> {
                KidsBridge.prepareConfiguration(target, "PG", base, "", { "must-not-send-to-another-service" }) { _, _, _ -> error("must not provision") }
            }
            assertEquals("TMDB_KEY_REQUIRED", error.code)
        }
    }

    @Test fun provisioningFailureIsReturnedInsteadOfSilentlyKeepingTheOldRating() = runBlocking<Unit> {
        assertFailsWith<BridgeFeatureException> {
            KidsBridge.prepareConfiguration(profile, "PG", base, "", { "token" }) { _, _, _ -> throw BridgeFeatureException("KIDSSCREEN_UNAVAILABLE", "Unavailable") }
        }
    }
}
