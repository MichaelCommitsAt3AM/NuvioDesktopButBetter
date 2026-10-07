package com.nuvio.app.features.streams

import com.nuvio.app.features.debrid.DebridProviders
import com.nuvio.app.features.debrid.DebridSettings
import com.nuvio.app.features.debrid.DebridStreamPreferences
import com.nuvio.app.features.debrid.DebridStreamPresentation
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class StreamTitlePreferenceTest {
    private val contentTitle = "The Legend of Korra"
    private fun stream(release: String?, group: String? = null) = StreamItem(
        name = "[TB] StremThru Torz 1080p",
        addonId = "addon:aio", addonName = "AIOStreams",
        url = "https://example.test/${release.orEmpty()}",
        behaviorHints = StreamBehaviorHints(filename = release, bingeGroup = group),
    )

    @Test
    fun `translated outlier follows matches and matching order stays stable`() {
        val outlier = stream("Аватар Легенда о Корре S03E13.mkv")
        val match = stream("The.Legend.Of.Korra.(2012).S03E13.1080p.HEVC-GRP.mkv")
        val next = stream("The Legend of Korra S03 E13 720p.mkv")
        assertEquals(listOf(match, next, outlier), StreamTitlePreference.order(listOf(outlier, match, next), contentTitle, true))
    }

    @Test
    fun `missing titles and partial matches stay neutral`() {
        val unknown = stream(null)
        val partial = stream("Legend of Something Else S03E13")
        val match = stream("The Legend of Korra S03E13")
        val streams = listOf(unknown, partial, match)
        assertEquals(streams, StreamTitlePreference.order(streams, contentTitle, true))
    }

    @Test
    fun `disabled preference missing content title and no matching alternatives preserve order`() {
        val streams = listOf(stream("Аватар Легенда о Корре"), stream("The Legend of Korra"))
        assertEquals(streams, StreamTitlePreference.order(streams, contentTitle, false))
        assertEquals(streams, StreamTitlePreference.order(streams, null, true))
        val translatedOnly = listOf(stream("Аватар Легенда о Корре"), stream("Another translated title"))
        assertEquals(translatedOnly, StreamTitlePreference.order(translatedOnly, contentTitle, true))
    }

    @Test
    fun `folder description works when filename is absent and provider heading is ignored`() {
        val outlier = stream(null).copy(description = "📁 Аватар Легенда о Корре S03 · E13\n1080p BluRay")
        val match = stream(null).copy(description = "📁 The Legend Of Korra (2012) S03 · E13\n1080p BluRay")
        assertEquals(listOf(match, outlier), StreamTitlePreference.order(listOf(outlier, match), contentTitle, true))
    }

    @Test
    fun `list ordering works with link resolution enabled or disabled`() {
        val outlier = stream("Аватар Легенда о Корре S03E13")
        val match = stream("The Legend of Korra S03E13")
        val group = AddonStreamGroup(addonName = "AIOStreams", addonId = "addon:aio", streams = listOf(outlier, match))
        for (enabled in listOf(false, true)) {
            val settings = DebridSettings(enabled = enabled, providerApiKeys = mapOf(DebridProviders.TORBOX_ID to "key"))
            assertEquals(listOf(match, outlier), DebridStreamPresentation.apply(listOf(group), settings, contentTitle).single().streams)
            assertEquals(listOf(outlier, match), DebridStreamPresentation.apply(
                listOf(group), settings.copy(streamPreferences = DebridStreamPreferences(preferMatchingReleaseTitles = false)), contentTitle,
            ).single().streams)
        }
    }

    @Test
    fun `title ranking happens before debrid result limits`() {
        fun direct(release: String) = stream(release).copy(clientResolve = StreamClientResolve(
            type = "debrid", service = DebridProviders.TORBOX_ID, infoHash = "a".repeat(40), fileIdx = 0, isCached = true,
        ))
        val outlier = direct("Аватар Легенда о Корре")
        val match = direct("The Legend of Korra")
        val settings = DebridSettings(streamPreferences = DebridStreamPreferences(maxResults = 1))
        assertEquals(listOf(match), DebridStreamPresentation.applyPreferences(listOf(outlier, match), settings, contentTitle))
    }

    @Test
    fun `automatic selection prefers matching title over a mismatching binge group`() {
        val outlier = stream("Аватар Легенда о Корре S03E13", "previous")
        val match = stream("The Legend of Korra S03E13")
        for (debridEnabled in listOf(false, true)) {
            val evaluation = StreamAutoPlaySelector.evaluateAutoPlayStream(
                streams = listOf(outlier, match), mode = StreamAutoPlayMode.FIRST_STREAM, regexPattern = "",
                source = StreamAutoPlaySource.ALL_SOURCES, installedAddonNames = setOf("AIOStreams"),
                selectedAddons = emptySet(), selectedPlugins = emptySet(),
                preferredBingeGroup = "previous", preferBingeGroupInSelection = true,
                debridEnabled = debridEnabled, contentTitle = contentTitle, preferMatchingReleaseTitles = true,
            )
            assertEquals(match, evaluation.stream)
            assertEquals(listOf(match, outlier), evaluation.readyStreams)
        }
    }

    @Test
    fun `regex selection respects title preference and disabling restores previous behavior`() {
        val outlier = stream("Аватар Легенда о Корре S03E13")
        val match = stream("The Legend of Korra S03E13")
        for (enabled in listOf(false, true)) {
            assertEquals(if (enabled) match else outlier, StreamAutoPlaySelector.selectAutoPlayStream(
                streams = listOf(outlier, match), mode = StreamAutoPlayMode.REGEX_MATCH, regexPattern = "1080p",
                source = StreamAutoPlaySource.ALL_SOURCES, installedAddonNames = setOf("AIOStreams"),
                selectedAddons = emptySet(), selectedPlugins = emptySet(),
                contentTitle = contentTitle, preferMatchingReleaseTitles = enabled,
            ))
        }
    }

    @Test
    fun `early binge selection does not bypass title preference`() {
        val outlier = stream("Аватар Легенда о Корре S03E13", "previous")
        val match = stream("The Legend of Korra S03E13")
        assertNull(StreamAutoPlaySelector.selectAutoPlayStream(
            streams = listOf(outlier, match), mode = StreamAutoPlayMode.FIRST_STREAM, regexPattern = "",
            source = StreamAutoPlaySource.ALL_SOURCES, installedAddonNames = setOf("AIOStreams"),
            selectedAddons = emptySet(), selectedPlugins = emptySet(),
            preferredBingeGroup = "previous", preferBingeGroupInSelection = true, bingeGroupOnly = true,
            contentTitle = contentTitle, preferMatchingReleaseTitles = true,
        ))
    }

    @Test
    fun `punctuation accents and technical words in the content title do not cause penalties`() {
        for ((title, release) in listOf(
            "Spider-Man" to "SpiderMan.2021.1080p.mkv",
            "Amélie" to "Amelie.2001.BluRay.mkv",
            "Season of the Witch" to "Season.of.the.Witch.2011.1080p.mkv",
        )) {
            val outlier = stream("Unrelated Film 1080p")
            val match = stream(release)
            assertEquals(listOf(match, outlier), StreamTitlePreference.order(listOf(outlier, match), title, true))
        }
    }

    @Test
    fun `preference defaults on for new and existing saved settings and can be saved off`() {
        assertTrue(DebridStreamPreferences().preferMatchingReleaseTitles)
        assertTrue(Json.decodeFromString<DebridStreamPreferences>("{}").preferMatchingReleaseTitles)
        assertEquals(false, Json.decodeFromString<DebridStreamPreferences>("{\"preferMatchingReleaseTitles\":false}").preferMatchingReleaseTitles)
    }
}
