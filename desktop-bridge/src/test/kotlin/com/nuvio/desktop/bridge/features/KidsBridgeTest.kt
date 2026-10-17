package com.nuvio.desktop.bridge.features

import com.nuvio.app.features.profiles.NuvioProfile
import com.nuvio.app.features.profiles.forKidsCatalogs
import com.nuvio.app.features.addons.ManagedAddon
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class KidsBridgeTest {
    @Test
    fun kidsCatalogInputsExcludeOtherAddonsAndMissingConfiguration() {
        val managed = ManagedAddon(manifestUrl = "http://127.0.0.1:7879/config/manifest.json")
        val other = ManagedAddon(manifestUrl = "https://other.example/manifest.json")
        val addons = listOf(managed, other)
        val profile = NuvioProfile(kidsEnabled = true, kidsServiceUrl = "http://127.0.0.1:7879", kidsConfigId = "config")
        assertEquals(listOf(managed), addons.forKidsCatalogs(profile))
        assertEquals(emptyList(), addons.forKidsCatalogs(profile.copy(kidsConfigId = null)))
        assertEquals(addons, addons.forKidsCatalogs(profile.copy(kidsEnabled = false)))
    }

    @Test
    fun filtersHeroShelvesRelatedAndContinueWatchingBeforeSerialization() {
        val source = Json.parseToJsonElement("""{
          "hero":[{"type":"movie","id":"tt1","name":"Allowed","poster":null},{"type":"movie","id":"tt2","name":"Blocked","poster":null}],
          "shelves":[{"items":[{"type":"movie","id":"tt2","name":"Blocked","poster":null}]}],
          "related":[{"type":"series","id":"tt3","name":"Unrated","poster":null}],
          "continueWatching":[{"parentMetaType":"movie","parentMetaId":"tt2","title":"Blocked"}]
        }""")
        val filtered = KidsBridge.filter(source, setOf(KidsBridge.Ref("movie", "tt1")))!!.jsonObject
        assertEquals(1, filtered["hero"]!!.jsonArray.size)
        assertFalse(filtered.toString().contains("Blocked"))
        assertFalse(filtered.toString().contains("Unrated"))
    }

    @Test
    fun serviceAddressRequiresHttpsExceptOnLoopback() {
        assertEquals("http://127.0.0.1:7879", KidsBridge.normalizeService("http://127.0.0.1:7879/"))
        assertEquals("https://kids.example", KidsBridge.normalizeService("https://kids.example"))
        for (url in listOf("http://kids.example", "file:///etc/passwd", "https://key@kids.example", "https://kids.example?key=secret")) {
            assertFailsWith<IllegalArgumentException> { KidsBridge.normalizeService(url) }
        }
    }

    @Test
    fun checksLocalAddonAndFailsClosedOnMissingOrFailedVerdicts() = runBlocking {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            val request = Json.parseToJsonElement(exchange.requestBody.bufferedReader().readText()).jsonObject
            assertTrue(request["items"]!!.jsonArray.isNotEmpty())
            val response = """{"items":[{"type":"movie","id":"tmdb:1","allowed":true},{"type":"movie","id":"tmdb:2","allowed":false}]}""".toByteArray()
            exchange.sendResponseHeaders(200, response.size.toLong()); exchange.responseBody.use { it.write(response) }
        }
        server.start()
        try {
            val profile = NuvioProfile(kidsEnabled = true, kidsServiceUrl = "http://127.0.0.1:${server.address.port}", kidsConfigId = "a".repeat(43))
            val refs = setOf(KidsBridge.Ref("movie", "tmdb:1"), KidsBridge.Ref("movie", "tmdb:2"), KidsBridge.Ref("movie", "tmdb:3"))
            assertEquals(setOf(KidsBridge.Ref("movie", "tmdb:1")), KidsBridge.check(profile, refs))
            server.stop(0)
            assertEquals(emptySet(), KidsBridge.check(profile.copy(kidsConfigId = "b".repeat(43)), refs))
        } finally { server.stop(0) }
    }
}
