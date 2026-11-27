package com.nuvio.app.features.downloads

import com.nuvio.app.features.streams.StreamParser
import kotlin.test.Test
import kotlin.test.assertEquals

class DownloadSourceCountTest {

    private fun count(streamsJson: String): Int = DownloadQualityOptionsLoader.countSources(
        StreamParser.parse("""{"streams":[$streamsJson]}""", addonName = "Test", addonId = "test"),
    )

    /** The shape AIOStreams sends its notices and errors in: a card that only links to a web page. */
    private val notice = """
        {"name":"📅 Digital Release Filter","description":"⚠️ no digital release data",
         "externalUrl":"https://github.com/Viren070/AIOStreams","streamData":{"type":"statistic"}}
    """

    @Test
    fun `notices alone count as no streams`() {
        assertEquals(0, count(notice))
        assertEquals(0, count(""))
    }

    @Test
    fun `files and torrents count, beside any notice`() {
        val file = """{"name":"1080p","url":"https://example.com/a.mkv"}"""
        val torrent = """{"name":"720p","infoHash":"0123456789012345678901234567890123456789"}"""
        assertEquals(2, count("$notice,$file,$torrent"))
    }
}
