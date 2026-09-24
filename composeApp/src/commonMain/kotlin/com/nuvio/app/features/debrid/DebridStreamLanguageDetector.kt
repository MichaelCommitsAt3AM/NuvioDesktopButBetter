package com.nuvio.app.features.debrid

/**
 * Audio languages found in a stream's text, plus whether an untagged stream still looks foreign.
 *
 * Most English releases carry no language tag at all, so callers treat an empty [audio] as
 * "probably English" unless [untaggedIsForeign] is set: a bare subtitle marker (`Subbed`,
 * `SubsPlease`) or a language we recognise but don't list both mean the audio isn't English.
 */
internal data class DebridLanguageDetection(
    val audio: List<DebridStreamLanguage>,
    val untaggedIsForeign: Boolean,
)

/**
 * Reads languages out of release filenames, addon descriptions and flag/globe emoji.
 *
 * Words that collide with titles or other tags only count in uppercase ("DE", "HUN", "CHI"),
 * a language directly next to a subtitle marker is a subtitle language rather than audio
 * ("ENG.SUB", "ESub", "Multi-Subs"), and a bare "Dub"/"Dubbed" is taken as an English dub.
 */
internal object DebridStreamLanguageDetector {
    fun detect(sources: List<String>, parsedLanguages: List<String> = emptyList()): DebridLanguageDetection {
        val audio = LinkedHashSet<DebridStreamLanguage>()
        parsedLanguages.mapNotNullTo(audio) { languageFor(it) }

        val tokens = tokenize(sources)
        var bareSubtitles = false
        var unlisted = false
        tokens.forEachIndexed { index, token ->
            val previous = tokens.getOrNull(index - 1)
            val next = tokens.getOrNull(index + 1)
            when (token) {
                is Token.Language ->
                    if (previous != Token.Subtitle && next != Token.Subtitle) audio += token.language
                Token.Multi ->
                    if (next != Token.Subtitle) audio += DebridStreamLanguage.MULTI
                Token.Dub ->
                    if (previous !is Token.Language && next !is Token.Language) audio += DebridStreamLanguage.EN
                Token.Subtitle ->
                    if (previous !is Token.Language && previous != Token.Multi && next !is Token.Language) bareSubtitles = true
                Token.Unlisted ->
                    if (previous != Token.Subtitle && next != Token.Subtitle) unlisted = true
                else -> Unit
            }
        }
        audio -= DebridStreamLanguage.UNKNOWN
        return DebridLanguageDetection(
            audio = audio.toList(),
            untaggedIsForeign = bareSubtitles || unlisted,
        )
    }

    /** Maps a parser-supplied value ("en", "Hungarian", "dual audio") to a language. */
    fun languageFor(value: String): DebridStreamLanguage? {
        val normalized = value.trim().lowercase()
        if (normalized in multiAudioValues) return DebridStreamLanguage.MULTI
        return DebridStreamLanguage.entries.firstOrNull { normalized == it.code || normalized == it.label.lowercase() }
            ?: aliases[normalized]?.takeUnless { it.uppercaseOnly }?.language
    }

    private sealed interface Token {
        data class Language(val language: DebridStreamLanguage) : Token
        object Subtitle : Token
        object Dub : Token
        object Multi : Token
        object Unlisted : Token
        data class Word(val text: String) : Token {
            val isNumber: Boolean get() = text.all { it.isDigit() }
        }
        object Break : Token
    }

    private class Alias(val language: DebridStreamLanguage, val uppercaseOnly: Boolean)

    private val multiAudioValues = setOf("multi", "multi audio", "dual audio")

    private val markers: Map<String, Token> = buildMap {
        listOf("sub", "subs", "subbed", "subtitle", "subtitles", "subtitled", "hardsub", "hardsubs", "softsub", "softsubs")
            .forEach { put(it, Token.Subtitle) }
        listOf("dub", "dubs", "dubbed", "dubbing").forEach { put(it, Token.Dub) }
        listOf("multi", "dual", "multiaudio", "dualaudio", "multilang").forEach { put(it, Token.Multi) }
        listOf(
            "bulgarian", "serbian", "croatian", "slovenian", "slovak", "estonian", "latvian", "lithuanian",
            "persian", "farsi", "urdu", "bengali", "punjabi", "marathi", "gujarati", "malay", "filipino", "tagalog",
        ).forEach { put(it, Token.Unlisted) }
    }

    private val aliases: Map<String, Alias> = buildMap {
        fun anyCase(language: DebridStreamLanguage, vararg words: String) =
            words.forEach { put(it, Alias(language, uppercaseOnly = false)) }
        fun upper(language: DebridStreamLanguage, vararg words: String) =
            words.forEach { put(it, Alias(language, uppercaseOnly = true)) }

        anyCase(DebridStreamLanguage.EN, "english", "eng")
        upper(DebridStreamLanguage.EN, "en", "gb", "uk", "us")
        anyCase(DebridStreamLanguage.HI, "hindi", "hin")
        anyCase(DebridStreamLanguage.IT, "italian", "italiano", "ita")
        anyCase(DebridStreamLanguage.ES, "spanish", "espanol", "español", "castellano", "castilian", "esp")
        upper(DebridStreamLanguage.ES, "es", "spa")
        anyCase(DebridStreamLanguage.LA, "latino", "latinoamericano", "latam")
        upper(DebridStreamLanguage.LA, "lat")
        anyCase(DebridStreamLanguage.FR, "french", "francais", "français", "truefrench", "vff", "vfq", "vfi", "fre")
        upper(DebridStreamLanguage.FR, "fr", "vf", "fra")
        anyCase(DebridStreamLanguage.DE, "german", "deutsch", "ger", "deu")
        upper(DebridStreamLanguage.DE, "de")
        anyCase(DebridStreamLanguage.PT, "portuguese", "portugues", "português", "dublado", "ptbr")
        upper(DebridStreamLanguage.PT, "pt", "por")
        anyCase(DebridStreamLanguage.PL, "polish", "polski", "lektor")
        upper(DebridStreamLanguage.PL, "pl", "pol")
        anyCase(DebridStreamLanguage.CS, "czech", "cesky", "ces")
        upper(DebridStreamLanguage.CS, "cz", "cze")
        anyCase(DebridStreamLanguage.JA, "japanese", "jpn")
        upper(DebridStreamLanguage.JA, "jp", "ja", "jap")
        anyCase(DebridStreamLanguage.KO, "korean")
        upper(DebridStreamLanguage.KO, "kr", "ko", "kor")
        anyCase(DebridStreamLanguage.ZH, "chinese", "mandarin", "cantonese", "chs", "cht", "zho")
        upper(DebridStreamLanguage.ZH, "cn", "zh", "chi")
        anyCase(DebridStreamLanguage.HU, "hungarian", "magyar")
        upper(DebridStreamLanguage.HU, "hu", "hun")
        anyCase(DebridStreamLanguage.HE, "hebrew", "heb")
        anyCase(DebridStreamLanguage.RU, "russian", "rus")
        upper(DebridStreamLanguage.RU, "ru")
        anyCase(DebridStreamLanguage.UK, "ukrainian", "ukr")
        upper(DebridStreamLanguage.UK, "ua")
        anyCase(DebridStreamLanguage.AR, "arabic")
        upper(DebridStreamLanguage.AR, "ara")
        anyCase(DebridStreamLanguage.TR, "turkish")
        upper(DebridStreamLanguage.TR, "tr", "tur")
        anyCase(DebridStreamLanguage.TA, "tamil")
        upper(DebridStreamLanguage.TA, "tam")
        anyCase(DebridStreamLanguage.TE, "telugu")
        upper(DebridStreamLanguage.TE, "tel")
        anyCase(DebridStreamLanguage.ML, "malayalam")
        upper(DebridStreamLanguage.ML, "mal")
        anyCase(DebridStreamLanguage.KN, "kannada")
        upper(DebridStreamLanguage.KN, "kan")
        anyCase(DebridStreamLanguage.NL, "dutch", "flemish", "nld")
        upper(DebridStreamLanguage.NL, "nl", "dut")
        anyCase(DebridStreamLanguage.SV, "swedish", "svenska", "swe")
        anyCase(DebridStreamLanguage.NO, "norwegian", "norsk")
        upper(DebridStreamLanguage.NO, "nor")
        anyCase(DebridStreamLanguage.DA, "danish", "dansk")
        upper(DebridStreamLanguage.DA, "dan")
        anyCase(DebridStreamLanguage.FI, "finnish", "suomi")
        upper(DebridStreamLanguage.FI, "fin")
        anyCase(DebridStreamLanguage.EL, "greek")
        upper(DebridStreamLanguage.EL, "gr", "gre", "ell")
        anyCase(DebridStreamLanguage.RO, "romanian")
        upper(DebridStreamLanguage.RO, "ro", "rum", "ron")
        anyCase(DebridStreamLanguage.TH, "thai")
        upper(DebridStreamLanguage.TH, "tha")
        anyCase(DebridStreamLanguage.VI, "vietnamese")
        upper(DebridStreamLanguage.VI, "vie")
        anyCase(DebridStreamLanguage.ID, "indonesian")
        upper(DebridStreamLanguage.ID, "ind")
    }

    private val flagLanguages: Map<String, DebridStreamLanguage> = buildMap {
        fun flags(language: DebridStreamLanguage, vararg countries: String) = countries.forEach { put(it, language) }
        flags(DebridStreamLanguage.EN, "GB", "US", "AU", "NZ", "IE")
        flags(DebridStreamLanguage.HI, "IN")
        flags(DebridStreamLanguage.IT, "IT")
        flags(DebridStreamLanguage.ES, "ES")
        flags(DebridStreamLanguage.LA, "MX", "AR", "CO", "CL", "PE", "VE")
        flags(DebridStreamLanguage.FR, "FR")
        flags(DebridStreamLanguage.DE, "DE", "AT")
        flags(DebridStreamLanguage.PT, "PT", "BR")
        flags(DebridStreamLanguage.PL, "PL")
        flags(DebridStreamLanguage.CS, "CZ")
        flags(DebridStreamLanguage.JA, "JP")
        flags(DebridStreamLanguage.KO, "KR")
        flags(DebridStreamLanguage.ZH, "CN", "TW", "HK")
        flags(DebridStreamLanguage.HU, "HU")
        flags(DebridStreamLanguage.HE, "IL")
        flags(DebridStreamLanguage.RU, "RU")
        flags(DebridStreamLanguage.UK, "UA")
        flags(DebridStreamLanguage.AR, "SA", "AE", "EG")
        flags(DebridStreamLanguage.TR, "TR")
        flags(DebridStreamLanguage.NL, "NL")
        flags(DebridStreamLanguage.SV, "SE")
        flags(DebridStreamLanguage.NO, "NO")
        flags(DebridStreamLanguage.DA, "DK")
        flags(DebridStreamLanguage.FI, "FI")
        flags(DebridStreamLanguage.EL, "GR")
        flags(DebridStreamLanguage.RO, "RO")
        flags(DebridStreamLanguage.TH, "TH")
        flags(DebridStreamLanguage.VI, "VN")
        flags(DebridStreamLanguage.ID, "ID")
    }

    /** Longest first, so "subbed" wins over "sub". */
    private val compoundSuffixes = listOf("subbed", "dubbed", "subs", "sub", "dub")

    private fun tokenize(sources: List<String>): List<Token> {
        val tokens = mutableListOf<Token>()
        val word = StringBuilder()
        fun flush() {
            if (word.isEmpty()) return
            tokens += wordTokens(word.toString(), tokens.lastOrNull())
            word.clear()
        }
        for (text in sources) {
            tokens += Token.Break
            var index = 0
            while (index < text.length) {
                val char = text[index]
                if (char.isLetterOrDigit()) {
                    word.append(char)
                    index++
                    continue
                }
                flush()
                val emoji = emojiAt(text, index)
                if (emoji != null) {
                    tokens += emoji.first
                    index += emoji.second
                } else {
                    index++
                }
            }
            flush()
        }
        return tokens
    }

    private fun wordTokens(word: String, previous: Token?): List<Token> {
        classify(word, previous, allowShortCodes = true)?.let { return listOf(it) }
        compound(word)?.let { return it }
        // "SubsPlease", "ITAEng": only trust the longer pieces of a camel-cased word.
        val parts = camelParts(word)
        if (parts.size > 1) {
            val classified = parts.map { part -> classify(part, previous = null, allowShortCodes = false) }
            if (classified.any { it != null }) {
                return classified.mapIndexed { index, token -> token ?: Token.Word(parts[index]) }
            }
        }
        return listOf(Token.Word(word))
    }

    private fun classify(word: String, previous: Token?, allowShortCodes: Boolean): Token? {
        val lower = word.lowercase()
        markers[lower]?.let { return it }
        val alias = aliases[lower] ?: return null
        if (alias.uppercaseOnly && word != word.uppercase()) return null
        if (lower.length <= 2 && !allowShortCodes) return null
        val previousWord = previous as? Token.Word
        // "14.4 GB" is a size, "DTS-ES" an audio format.
        if (lower == "gb" && previousWord?.isNumber == true) return null
        if (lower == "es" && previousWord?.text.equals("dts", ignoreCase = true)) return null
        return Token.Language(alias.language)
    }

    /** "HebDub", "ESub", "PLDUB", "MultiSubs": a language glued to a dub/sub marker. */
    private fun compound(word: String): List<Token>? {
        val lower = word.lowercase()
        val suffix = compoundSuffixes.firstOrNull { lower.length > it.length && lower.endsWith(it) } ?: return null
        val head = when (val prefix = lower.dropLast(suffix.length)) {
            "e" -> Token.Language(DebridStreamLanguage.EN)
            else -> markers[prefix]?.takeIf { it == Token.Multi }
                ?: aliases[prefix]?.let { Token.Language(it.language) }
        } ?: return null
        return listOf(head, markers.getValue(suffix))
    }

    private fun camelParts(word: String): List<String> {
        val parts = mutableListOf<String>()
        var start = 0
        for (index in 1 until word.length) {
            val previous = word[index - 1]
            val current = word[index]
            val next = word.getOrNull(index + 1)
            val boundary = (previous.isLowerCase() && current.isUpperCase()) ||
                (previous.isUpperCase() && current.isUpperCase() && next?.isLowerCase() == true) ||
                previous.isDigit() != current.isDigit()
            if (boundary) {
                parts += word.substring(start, index)
                start = index
            }
        }
        parts += word.substring(start)
        return parts
    }

    /** Flag emoji are two regional-indicator surrogate pairs; globes mark multi-audio. */
    private fun emojiAt(text: String, index: Int): Pair<Token, Int>? {
        if (text[index] != '\uD83C') return null
        val second = text.getOrNull(index + 1) ?: return null
        if (second in globeLowSurrogates) return Token.Multi to 2
        if (second !in regionalIndicators) return null
        val fourth = text.getOrNull(index + 3)
        if (text.getOrNull(index + 2) != '\uD83C' || fourth == null || fourth !in regionalIndicators) return null
        val country = "${'A' + (second - '\uDDE6')}${'A' + (fourth - '\uDDE6')}"
        val token = flagLanguages[country]?.let { Token.Language(it) } ?: Token.Unlisted
        return token to 4
    }

    private val regionalIndicators = '\uDDE6'..'\uDDFF'

    /** 🌍 🌎 🌏 🌐 */
    private val globeLowSurrogates = setOf('\uDF0D', '\uDF0E', '\uDF0F', '\uDF10')
}
