package com.nuvio.app.features.debrid

import com.nuvio.app.features.debrid.DebridStreamLanguage.EN
import com.nuvio.app.features.debrid.DebridStreamLanguage.FR
import com.nuvio.app.features.debrid.DebridStreamLanguage.HE
import com.nuvio.app.features.debrid.DebridStreamLanguage.HI
import com.nuvio.app.features.debrid.DebridStreamLanguage.HU
import com.nuvio.app.features.debrid.DebridStreamLanguage.IT
import com.nuvio.app.features.debrid.DebridStreamLanguage.KO
import com.nuvio.app.features.debrid.DebridStreamLanguage.MULTI
import com.nuvio.app.features.debrid.DebridStreamLanguage.PL
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DebridStreamLanguageDetectorTest {
    private fun audio(vararg sources: String) = DebridStreamLanguageDetector.detect(sources.toList()).audio

    @Test
    fun `untagged releases have no language and are not flagged foreign`() {
        val detection = DebridStreamLanguageDetector.detect(
            listOf(
                "72.Hours.2026.2160p.NF.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX.mkv",
                "hevc • DV • HDR | Atmos • Dolby Digital Plus • 5.1\n💾 14.4 GB 🔎 Comet|StremThru",
            ),
        )
        assertEquals(emptyList(), detection.audio)
        assertFalse(detection.untaggedIsForeign)
    }

    @Test
    fun `reads dub and scene language tags`() {
        assertEquals(listOf(HE), audio("Avatar.The.Last.Airbender.S03E07.720p.WEB-DL.h264-HebDub-TZIPORA.mkv"))
        assertEquals(listOf(HU), audio("72.HOURS.2026.2160p.NF.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265.HUN-GS88.mkv"))
        assertEquals(listOf(IT, EN), audio("Movie.2024.1080p.WEB-DL.iTA.ENG.AC3-GRP.mkv"))
        assertEquals(listOf(FR), audio("Movie.2024.TRUEFRENCH.1080p.WEB.x264-GRP"))
        assertEquals(listOf(PL), audio("Movie.2024.PLDUB.1080p.WEB-DL.x264"))
        assertEquals(listOf(EN), audio("Movie 2024 1080p [EN]"))
    }

    @Test
    fun `ignores title words that look like language codes`() {
        assertEquals(emptyList(), audio("It.2017.1080p.BluRay.x264-GRP.mkv"))
        assertEquals(emptyList(), audio("La.La.Land.2016.2160p.UHD.BluRay.x265-GRP.mkv"))
        assertEquals(emptyList(), audio("La.Casa.de.Papel.S01E01.1080p.WEB.x264"))
        assertEquals(emptyList(), audio("The.Chi.S01E01.1080p.WEB.h264"))
    }

    @Test
    fun `sizes and audio formats are not languages`() {
        assertEquals(emptyList(), audio("💾 2.35 GB", "SIZE 2.2 GB"))
        assertEquals(emptyList(), audio("Movie.1080p.BluRay.DTS-ES.6.1.x264"))
        assertEquals(listOf(EN), audio("🟣 GB"))
    }

    @Test
    fun `subtitle languages are not audio languages`() {
        assertEquals(listOf(KO), audio("Drama.S01E01.Korean.1080p.WEB.ENG.SUB"))
        assertEquals(listOf(HI, EN), audio("Movie.2023.1080p.WEB-DL.Dual.Audio.Hindi.English.ESub.mkv").filter { it != MULTI })
        val multiSubs = DebridStreamLanguageDetector.detect(listOf("Movie.2024.1080p.BluRay.x264.Multi-Subs"))
        assertEquals(emptyList(), multiSubs.audio)
        assertFalse(multiSubs.untaggedIsForeign)
    }

    @Test
    fun `bare subtitle markers flag untagged anime as foreign`() {
        val detection = DebridStreamLanguageDetector.detect(listOf("[SubsPlease] Frieren - 01 (1080p) [ABC123].mkv"))
        assertEquals(emptyList(), detection.audio)
        assertTrue(detection.untaggedIsForeign)
    }

    @Test
    fun `dual audio multi and bare dubs`() {
        assertEquals(listOf(MULTI), audio("[Group] Frieren S01 1080p Dual Audio"))
        assertEquals(listOf(MULTI), audio("Movie.2024.MULTi.1080p.WEB"))
        assertEquals(listOf(EN), audio("Frieren S01E01 English Dub 1080p"))
        assertEquals(listOf(EN), audio("Frieren S01E01 Dubbed 1080p"))
    }

    @Test
    fun `reads flag and globe emoji`() {
        assertEquals(listOf(EN, IT), audio("🇬🇧 / 🇮🇹"))
        assertEquals(listOf(MULTI), audio("🌍 Multi"))
        val unlisted = DebridStreamLanguageDetector.detect(listOf("🇧🇬"))
        assertEquals(emptyList(), unlisted.audio)
        assertTrue(unlisted.untaggedIsForeign)
    }

    @Test
    fun `maps parser supplied languages`() {
        assertEquals(listOf(HU), DebridStreamLanguageDetector.detect(emptyList(), listOf("hu")).audio)
        assertEquals(listOf(MULTI), DebridStreamLanguageDetector.detect(emptyList(), listOf("dual audio")).audio)
        assertEquals(emptyList(), DebridStreamLanguageDetector.detect(emptyList(), listOf("multi subs")).audio)
    }
}
