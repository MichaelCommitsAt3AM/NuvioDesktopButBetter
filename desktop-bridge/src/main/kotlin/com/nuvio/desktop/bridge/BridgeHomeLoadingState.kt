package com.nuvio.desktop.bridge

import com.nuvio.app.features.addons.AddonsUiState
import com.nuvio.app.features.addons.hasPendingEnabledManifests
import com.nuvio.app.features.addons.firstEnabledManifestError
import com.nuvio.app.features.profiles.forKidsCatalogs

/** An empty catalog snapshot is provisional while profile sources are unresolved. */
internal fun isHomeContentLoading(catalogsLoading: Boolean, addons: AddonsUiState): Boolean =
    catalogsLoading || addons.profileLoadPending || addons.addons.forKidsCatalogs().hasPendingEnabledManifests()

internal fun homeContentError(catalogError: String?, addons: AddonsUiState, hasContent: Boolean): String? =
    catalogError ?: addons.profileLoadError ?: if (!hasContent) addons.addons.forKidsCatalogs().firstEnabledManifestError() else null
