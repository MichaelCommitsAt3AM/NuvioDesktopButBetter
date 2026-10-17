package com.nuvio.app.features.profiles

import com.nuvio.app.features.addons.ManagedAddon

fun NuvioProfile.kidsManifestUrl(): String? =
    if (kidsEnabled && kidsServiceUrl != null && kidsConfigId != null) "${kidsServiceUrl.trimEnd('/')}/$kidsConfigId/manifest.json" else null

/** Catalog selection only; stream providers remain available after the parental check. */
fun List<ManagedAddon>.forKidsCatalogs(profile: NuvioProfile? = ProfileRepository.state.value.activeProfile): List<ManagedAddon> {
    profile ?: return this
    if (!profile.kidsEnabled) return this
    val manifest = profile.kidsManifestUrl() ?: return emptyList()
    return filter { it.manifestUrl == manifest }
}
