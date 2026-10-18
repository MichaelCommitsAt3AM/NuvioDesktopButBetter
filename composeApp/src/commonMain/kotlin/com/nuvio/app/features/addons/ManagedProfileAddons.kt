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
