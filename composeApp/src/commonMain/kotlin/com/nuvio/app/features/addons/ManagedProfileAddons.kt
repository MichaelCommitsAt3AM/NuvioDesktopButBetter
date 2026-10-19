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

internal const val RECOMMENDED_SUBTITLES_URL = "https://opensubtitles-v3.strem.io/manifest.json"

/** Missing means a fresh default; an explicitly disabled row is always preserved. */
internal fun withRecommendedSubtitles(rows: List<AddonRow>): List<AddonRow> =
    if (rows.any { ensureManifestSuffix(it.url) == RECOMMENDED_SUBTITLES_URL }) rows else
        rows + AddonRow(RECOMMENDED_SUBTITLES_URL, "OpenSubtitles v3", sortOrder = (rows.maxOfOrNull { it.sortOrder } ?: -1) + 1)

internal fun isKidsConflictingAddon(row: AddonRow): Boolean {
    val identity = "${row.name.orEmpty()} ${row.url}".lowercase()
    return "cinemeta" in identity || "aiometadata" in identity
}

internal fun reconcileProfileAddons(rows: List<AddonRow>, profile: NuvioProfile?): List<AddonRow> =
    withRecommendedSubtitles(reconcileManagedProfileAddons(rows, profile))
