package com.nuvio.app.features.addons

import com.nuvio.app.features.profiles.NuvioProfile
import com.nuvio.app.features.profiles.kidsManifestUrl

/** Kids browsing is configured by profile policy, independently of copied stream providers. */
internal fun reconcileManagedProfileAddons(rows: List<AddonRow>, profile: NuvioProfile?): List<AddonRow> {
    val required = profile?.kidsManifestUrl() ?: return rows
    val existing = rows.indexOfFirst { ensureManifestSuffix(it.url) == required }
    return if (existing < 0) {
        rows + AddonRow(required, "KidsScreen · ${profile.kidsMaxRating}", enabled = true, sortOrder = (rows.maxOfOrNull { it.sortOrder } ?: -1) + 1)
    } else rows.mapIndexed { index, row -> if (index == existing) row.copy(enabled = true) else row }
}

internal const val RECOMMENDED_SUBTITLES_URL = "https://opensubtitlesv3-pro.dexter21767.com/manifest.json"
private const val LEGACY_SUBTITLES_URL = "https://opensubtitles-v3.strem.io/manifest.json"

/**
 * Every profile carries OpenSubtitles Pro. A missing row means a fresh default; an
 * explicitly disabled row is always preserved. The former OpenSubtitles v3 row is
 * replaced in place, keeping its position and enabled state.
 */
internal fun withRecommendedSubtitles(rows: List<AddonRow>): List<AddonRow> {
    val hasPro = rows.any { ensureManifestSuffix(it.url) == RECOMMENDED_SUBTITLES_URL }
    val migrated = rows.mapNotNull { row ->
        if (ensureManifestSuffix(row.url) != LEGACY_SUBTITLES_URL) row
        else if (hasPro) null
        else row.copy(url = RECOMMENDED_SUBTITLES_URL, name = "OpenSubtitles Pro")
    }
    return if (migrated.any { ensureManifestSuffix(it.url) == RECOMMENDED_SUBTITLES_URL }) migrated else
        migrated + AddonRow(RECOMMENDED_SUBTITLES_URL, "OpenSubtitles Pro", sortOrder = (migrated.maxOfOrNull { it.sortOrder } ?: -1) + 1)
}

internal fun isKidsConflictingAddon(row: AddonRow): Boolean {
    val identity = "${row.name.orEmpty()} ${row.url}".lowercase()
    return "cinemeta" in identity || "aiometadata" in identity || "catalog.nuvio.tv" in identity
}

internal fun reconcileProfileAddons(rows: List<AddonRow>, profile: NuvioProfile?): List<AddonRow> =
    withRecommendedSubtitles(reconcileManagedProfileAddons(rows, profile))
