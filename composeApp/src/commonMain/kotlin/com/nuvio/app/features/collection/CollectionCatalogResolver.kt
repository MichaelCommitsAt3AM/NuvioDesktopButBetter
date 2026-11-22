package com.nuvio.app.features.collection

import com.nuvio.app.features.addons.AddonCatalog
import com.nuvio.app.features.addons.ManagedAddon
import com.nuvio.app.features.addons.enabledAddons

internal data class ResolvedCollectionCatalog(
    val addon: ManagedAddon,
    val catalog: AddonCatalog,
)

internal fun List<ManagedAddon>.findCollectionCatalog(
    source: CollectionCatalogSource,
): ResolvedCollectionCatalog? {
    val activeAddons = enabledAddons()
    val declaredAddon = activeAddons.firstOrNull { it.manifest?.id == source.addonId }
    val declaredCatalog = declaredAddon?.manifest?.catalogs?.findSourceCatalog(source)
    if (declaredAddon != null && declaredCatalog != null) {
        return ResolvedCollectionCatalog(addon = declaredAddon, catalog = declaredCatalog)
    }

    return activeAddons.firstNotNullOfOrNull { addon ->
        val catalog = addon.manifest?.catalogs?.find {
            it.id == source.catalogId && it.type == source.type
        } ?: return@firstNotNullOfOrNull null
        ResolvedCollectionCatalog(addon = addon, catalog = catalog)
    } ?: declaredAddon?.let { addon ->
        // The declared addon is installed but its manifest doesn't list this catalog. Addons such
        // as AIOMetadata still serve catalogs left out of a user's manifest (collections shared
        // from another config point at them), so request it from the declared addon directly.
        ResolvedCollectionCatalog(
            addon = addon,
            catalog = AddonCatalog(type = source.type, id = source.catalogId, name = readableCatalogName(source.catalogId)),
        )
    }
}

/** Streaming-service codes used by AIOMetadata's `streaming.<code>` catalogs. */
private val streamingServiceNames = mapOf(
    "nfx" to "Netflix",
    "nfk" to "Netflix Kids",
    "hbm" to "HBO Max",
    "dnp" to "Disney+",
    "amp" to "Prime Video",
    "atp" to "Apple TV+",
    "pmp" to "Paramount+",
    "pcp" to "Peacock",
    "hlu" to "Hulu",
    "cru" to "Crunchyroll",
    "cts" to "Curiosity Stream",
    "mgl" to "MagellanTV",
    "hay" to "hayu",
    "clv" to "Claro Video",
    "gop" to "Globoplay",
    "hst" to "Hotstar",
    "zee" to "ZEE5",
    "nlz" to "NLZIET",
    "vil" to "Videoland",
    "sst" to "SkyShowtime",
    "blv" to "BluTV",
    "cpd" to "Canal+",
    "dpe" to "Discovery+",
    "mbi" to "MUBI",
    "stz" to "Starz",
)

private val catalogIdNoiseTokens = setOf("discover", "movie", "movies", "series", "tv", "show", "shows", "anime")
private val catalogIdProviderTokens = setOf("tmdb", "tvdb", "mal", "imdb", "trakt", "tvmaze", "aiom")
private val catalogIdWordCasing = mapOf("flixpatrol" to "FlixPatrol", "tv" to "TV", "us" to "US", "uk" to "UK")

/**
 * A display name for a catalog the add-on's manifest doesn't name (and so only its ID is known),
 * e.g. `streaming.nfx` → "Netflix", `tmdb.discover.movie.action_movies.28` → "Action Movies",
 * `flixpatrol.netflix.world.movie` → "FlixPatrol Netflix World",
 * `tmdb.discover.movie.dreamworks.mp42jyh6` → "Dreamworks". Type, numeric, provider and generated-code
 * segments are dropped while something else remains; the ID itself is the last resort.
 */
internal fun readableCatalogName(catalogId: String): String {
    val segments = catalogId.substringBefore(",").split('.').map { it.trim() }.filter { it.isNotEmpty() }
    if (segments.isEmpty()) return catalogId
    if (segments.size == 2 && segments[0].equals("streaming", ignoreCase = true)) {
        streamingServiceNames[segments[1].lowercase()]?.let { return it }
    }
    val meaningful = segments.filterNot { segment ->
        segment.all(Char::isDigit) || segment.lowercase() in catalogIdNoiseTokens || segment.isGeneratedIdCode()
    }.ifEmpty { return catalogId }
    val withoutProvider = meaningful.filterNot { it.lowercase() in catalogIdProviderTokens }.ifEmpty { meaningful }
    return withoutProvider
        .flatMap { it.split('_', '-') }
        .filter { it.isNotBlank() }
        .joinToString(" ") { word ->
            catalogIdWordCasing[word.lowercase()] ?: word.replaceFirstChar { it.uppercase() }
        }
        .ifBlank { catalogId }
}

/**
 * AIOMetadata suffixes custom discover catalogs with a random code (`dreamworks.mp42jyh6`). Such codes mix
 * letters and digits back and forth; words like `top250` or `4k` switch at most once and are kept.
 */
private fun String.isGeneratedIdCode(): Boolean {
    if (length < 6 || none(Char::isLetter) || none(Char::isDigit) || !all(Char::isLetterOrDigit)) return false
    // AIOMetadata's codes are 8 lowercase characters (mp42jyh6, mlyccp2c, mp44ukea); a code can switch only once.
    if (length == 8 && all { it.isDigit() || it in 'a'..'z' }) return true
    return zipWithNext().count { (a, b) -> a.isDigit() != b.isDigit() } >= 2
}

internal fun List<AvailableCatalog>.findAvailableCatalog(
    source: CollectionCatalogSource,
): AvailableCatalog? {
    val declaredCatalogs = filter { it.addonId == source.addonId }
    return declaredCatalogs.findSourceCatalog(source)
        ?: firstOrNull { it.catalogId == source.catalogId && it.type == source.type }
}

private fun List<AddonCatalog>.findSourceCatalog(source: CollectionCatalogSource): AddonCatalog? =
    find { it.id == source.catalogId && it.type == source.type }
        ?: find { it.id == source.catalogId.substringBefore(",") && it.type == source.type }

private fun List<AvailableCatalog>.findSourceCatalog(source: CollectionCatalogSource): AvailableCatalog? =
    find { it.catalogId == source.catalogId && it.type == source.type }
        ?: find { it.catalogId == source.catalogId.substringBefore(",") && it.type == source.type }
