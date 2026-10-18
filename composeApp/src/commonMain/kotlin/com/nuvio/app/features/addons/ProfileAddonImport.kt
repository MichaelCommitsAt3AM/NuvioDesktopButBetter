package com.nuvio.app.features.addons

/** Keep target order/settings; append only new URLs in source order. */
internal fun mergeProfileAddonImport(existing: List<AddonRow>, imported: List<AddonRow>): List<AddonRow> =
    (existing.sortedBy { it.sortOrder } + imported.sortedBy { it.sortOrder })
        .map { it.copy(url = ensureManifestSuffix(it.url)) }
        .distinctBy { it.url }
        .mapIndexed { index, row -> row.copy(sortOrder = index) }
