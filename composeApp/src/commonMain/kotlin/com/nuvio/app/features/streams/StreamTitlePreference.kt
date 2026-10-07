package com.nuvio.app.features.streams

/** A conservative preference, never a filter: unknown titles retain their original position. */
object StreamTitlePreference {
    fun order(streams: List<StreamItem>, contentTitle: String?, enabled: Boolean): List<StreamItem> {
        if (!enabled) return streams
        val expected = tokens(contentTitle.orEmpty(), release = false)
        if (expected.isEmpty() || (expected.size == 1 && expected.first().length < 4)) return streams
        val scores = streams.associateWith { score(it, expected) }
        // A translated title alone is not evidence of a bad result. Require a matching alternative.
        if (scores.values.none { it == Match.MATCH }) return streams
        return streams.sortedBy { if (scores[it] == Match.MISMATCH) 1 else 0 }
    }

    fun isDeprioritized(stream: StreamItem, streams: List<StreamItem>, contentTitle: String?, enabled: Boolean): Boolean {
        if (!enabled) return false
        val expected = tokens(contentTitle.orEmpty(), release = false)
        if (expected.isEmpty() || (expected.size == 1 && expected.first().length < 4)) return false
        return score(stream, expected) == Match.MISMATCH && streams.any { score(it, expected) == Match.MATCH }
    }

    private enum class Match { MATCH, UNKNOWN, MISMATCH }

    private fun score(stream: StreamItem, expected: Set<String>): Match {
        val raw = stream.clientResolve?.stream?.raw
        // Use release metadata, not the source/quality heading or the requested media title.
        val release = raw?.parsed?.parsedTitle?.takeIf { it.isNotBlank() }
            ?: raw?.torrentName?.takeIf { it.isNotBlank() }
            ?: stream.clientResolve?.torrentName?.takeIf { it.isNotBlank() }
            ?: raw?.filename?.takeIf { it.isNotBlank() }
            ?: stream.clientResolve?.filename?.takeIf { it.isNotBlank() }
            ?: stream.behaviorHints.filename?.takeIf { it.isNotBlank() }
            ?: stream.title?.lineSequence()?.firstOrNull { it.isNotBlank() }
            ?: stream.description?.lineSequence()?.firstOrNull { it.trimStart().startsWith("📁") }
            ?: return Match.UNKNOWN
        val actual = tokens(release.substringAfterLast('/').substringAfterLast('\\'))
        if (actual.isEmpty()) return Match.UNKNOWN
        val compactTitle = expected.joinToString("")
        if (compactTitle.length >= 4 && actual.joinToString("").contains(compactTitle)) return Match.MATCH
        val overlap = expected.count { it in actual }.toDouble() / expected.size
        return when {
            overlap >= 0.75 -> Match.MATCH
            overlap <= 0.25 -> Match.MISMATCH
            else -> Match.UNKNOWN
        }
    }

    private val releaseSuffix = Regex(
        "(?i)\\b(?:s\\d{1,3}(?:e\\d{1,3})?|e\\d{1,3}|\\d{1,2}x\\d{1,3}|season\\s+\\d{1,3}|(?:480|576|720|1080|2160)p|4k|bluray|blu[ -]ray|web[ -]?(?:dl|rip)|hdtv|dvdrip|remux|[xh][ .-]?26[45]|hevc|avc|aac)\\b.*",
    )
    private val year = Regex("\\b(?:19|20)\\d{2}\\b")
    private val ignored = setOf("the", "a", "an", "of", "and", "in", "on", "to")

    private fun tokens(value: String, release: Boolean = true): Set<String> {
        val normalized = value.lowercase().map { char ->
            when (char) {
                in "àáâãäåā" -> 'a'
                in "èéêëē" -> 'e'
                in "ìíîïī" -> 'i'
                in "òóôõöō" -> 'o'
                in "ùúûüū" -> 'u'
                'ç' -> 'c'
                'ñ' -> 'n'
                else -> char
            }
        }.joinToString("").replace(Regex("\\p{M}+"), "").replace('.', ' ').replace('_', ' ')
        val cleaned = (if (release) normalized.replace(releaseSuffix, " ") else normalized).replace(year, " ")
        return cleaned.split(Regex("[^\\p{L}\\p{N}]+"))
            .filter { it.isNotBlank() && it !in ignored && it.any(Char::isLetter) }.toSet()
    }
}
