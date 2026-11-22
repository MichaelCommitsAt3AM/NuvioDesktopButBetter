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
    fun kidsProfilesCanUseFeaturesWithoutAParentProfileGate() = runBlocking {
        val allowed = listOf(
            "settings.setTheme", "appearance.setAmoled", "appearance.setAppIcon", "posters.setPattern",
            "homePreferences.setEnabled", "home.preferences.setStyle", "continueWatching.setStyle",
            "search.historyEnabled", "metadataSettings.set", "playbackSettings.set", "p2p.setEnabled",
            "about.setLanguage", "advanced.setSentry", "downloads.filter.setMaxResolution",
            "streams.badges.setPlacement", "streams.filter.set", "tmdb.set", "mdblist.set", "debrid.set",
            "simkl.connect", "trackingSettings.set", "plugins.addRepository", "addons.install",
            "profiles.rememberLast.set", "session.signOut", "app.openExternal",
        )
        val management = listOf(
            "profiles.create", "profiles.delete", "profiles.kids.configure", "profiles.pin.set",
            "downloads.snapshot", "downloads.enqueue", "cloud.refresh", "collections.editor.save",
        )
        for (method in allowed + management) {
            KidsBridge.authorizeContent(method, JsonObject(emptyMap())) { _, _ -> error("Feature $method should not require a title") }
        }
    }

    @Test
    fun titleOperationsStillRequireTheRatingCheck() = runBlocking {
        val params = buildJsonObject { put("type", "movie"); put("id", "tt1234567"); put("parentMetaId", "tt1234567") }
        for (method in listOf("details.load", "details.watched.toggle", "streams.load", "library.add", "library.membership")) {
            var checked = false
            val failure = assertFailsWith<BridgeFeatureException> {
                KidsBridge.authorizeContent(method, params) { type, id ->
                    checked = true
                    assertEquals("movie", type)
                    assertEquals("tt1234567", id)
                    throw BridgeFeatureException("KIDS_TITLE_BLOCKED", "Blocked")
                }
            }
            assertTrue(checked, method)
            assertEquals("KIDS_TITLE_BLOCKED", failure.code)
        }
    }

    @Test
    fun downloadSnapshotsOnlyExposeVerifiedTitles() {
        val source = Json.parseToJsonElement("""{"items":[
            {"id":"download-1","parentMetaType":"movie","parentMetaId":"tt1","title":"Allowed"},
            {"id":"download-2","parentMetaType":"movie","parentMetaId":"tt2","title":"Blocked"}
        ]}""")
        val filtered = KidsBridge.filter(source, setOf(KidsBridge.Ref("movie", "tt1")))!!.jsonObject
        assertEquals(1, filtered["items"]!!.jsonArray.size)
        assertFalse(filtered.toString().contains("Blocked"))
    }

    @Test
    fun serviceAddressRequiresHttpsExceptOnLoopback() {
        assertEquals("http://127.0.0.1:7879", KidsBridge.normalizeService("http://127.0.0.1:7879/"))
        assertEquals("https://kids.example", KidsBridge.normalizeService("https://kids.example"))
        for (url in listOf("http://kids.example", "file:///etc/passwd", "https://key@kids.example", "https://kids.example?key=secret")) {
            assertFailsWith<IllegalArgumentException> { KidsBridge.normalizeService(url) }
        }
    }

    private class MemoryVerdicts : KidsBridge.VerdictStore {
        val values = mutableMapOf<String, String>()
        override fun getString(key: String) = values[key]
        override fun putString(key: String, value: String?) { if (value == null) values.remove(key) else values[key] = value }
        override fun remove(key: String) { values.remove(key) }
    }

    private fun kidsServer(handler: (List<KidsBridge.Ref>) -> String): HttpServer {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            val items = Json.parseToJsonElement(exchange.requestBody.bufferedReader().readText()).jsonObject["items"]!!.jsonArray
            val response = handler(items.map { KidsBridge.Ref(it.jsonObject["type"]!!.jsonPrimitive.content, it.jsonObject["id"]!!.jsonPrimitive.content) }).toByteArray()
            exchange.sendResponseHeaders(200, response.size.toLong()); exchange.responseBody.use { it.write(response) }
        }
        server.start()
        return server
    }

    @Test
    fun decidedVerdictsSurviveARestartWithoutAnotherRequest() = runBlocking {
        val saved = MemoryVerdicts()
        KidsBridge.verdictStore = saved
        var requests = 0
        val server = kidsServer { requests++; """{"items":[{"type":"movie","id":"tmdb:11","allowed":true},{"type":"movie","id":"tmdb:12","allowed":false}]}""" }
        try {
            val profile = NuvioProfile(kidsEnabled = true, kidsServiceUrl = "http://127.0.0.1:${server.address.port}", kidsConfigId = "c".repeat(43))
            val refs = setOf(KidsBridge.Ref("movie", "tmdb:11"), KidsBridge.Ref("movie", "tmdb:12"))
            assertEquals(setOf(KidsBridge.Ref("movie", "tmdb:11")), KidsBridge.check(profile, refs))
            assertFalse(saved.values.values.single().contains("c".repeat(43)), "the configuration id is not written into the verdict cache")
            KidsBridge.forgetVerdictsInMemory()
            assertEquals(setOf(KidsBridge.Ref("movie", "tmdb:11")), KidsBridge.check(profile, refs))
            assertEquals(1, requests)
        } finally { server.stop(0); KidsBridge.forgetVerdictsInMemory() }
    }

    @Test
    fun serviceOutagesAreReportedApartFromBlocksAndNeverSaved() = runBlocking {
        val saved = MemoryVerdicts()
        KidsBridge.verdictStore = saved
        val server = kidsServer { """{"items":[{"type":"movie","id":"tmdb:21","allowed":false,"unavailable":true},{"type":"movie","id":"tmdb:22","allowed":false}]}""" }
        try {
            val profile = NuvioProfile(kidsEnabled = true, kidsServiceUrl = "http://127.0.0.1:${server.address.port}", kidsConfigId = "d".repeat(43))
            val result = KidsBridge.checkDetailed(profile, setOf(KidsBridge.Ref("movie", "tmdb:21"), KidsBridge.Ref("movie", "tmdb:22")))
            assertEquals(emptySet(), result.allowed)
            assertEquals(setOf(KidsBridge.Ref("movie", "tmdb:21")), result.unavailable)
            val stored = saved.values.values.single()
            assertTrue(stored.contains("tmdb:22")); assertFalse(stored.contains("tmdb:21"))
        } finally { server.stop(0); KidsBridge.forgetVerdictsInMemory() }
    }

    @Test
    fun detailsShowTheVerifiedTitleBeforeRelatedTitlesAreChecked() = runBlocking {
        KidsBridge.verdictStore = MemoryVerdicts()
        val release = java.util.concurrent.CountDownLatch(1)
        val server = kidsServer { refs ->
            if (refs.any { it.id == "tmdb:32" }) release.await(5, java.util.concurrent.TimeUnit.SECONDS)
            JsonObject(mapOf("items" to JsonArray(refs.map { buildJsonObject { put("type", it.type); put("id", it.id); put("allowed", true) } }))).toString()
        }
        try {
            val profile = NuvioProfile(kidsEnabled = true, kidsServiceUrl = "http://127.0.0.1:${server.address.port}", kidsConfigId = "e".repeat(43))
            KidsBridge.check(profile, setOf(KidsBridge.Ref("movie", "tmdb:31")))
            val details = Json.parseToJsonElement("""{"media":{"type":"movie","id":"tmdb:31","name":"Main","poster":null},
                "related":[{"type":"movie","id":"tmdb:32","name":"Related","poster":null}]}""").jsonObject
            val published = mutableListOf<JsonObject>()
            KidsBridge.publishDetailsFor(profile, details, { true }) { published += it; if (published.size == 1) release.countDown() }
            assertEquals(2, published.size)
            assertEquals("Main", published[0]["media"]!!.jsonObject["name"]!!.jsonPrimitive.content)
            assertEquals(0, published[0]["related"]!!.jsonArray.size, "an unchecked related title is never shown")
            assertEquals(1, published[1]["related"]!!.jsonArray.size)
        } finally { release.countDown(); server.stop(0); KidsBridge.forgetVerdictsInMemory() }
    }

    @Test
    fun checksLocalAddonAndFailsClosedOnMissingOrFailedVerdicts() = runBlocking {
        KidsBridge.verdictStore = MemoryVerdicts()
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
