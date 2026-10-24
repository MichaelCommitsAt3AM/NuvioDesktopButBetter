package com.nuvio.app.features.profiles

import com.nuvio.app.features.tmdb.kidsTmdbProxyUrl

/** Session credentials are only sent to the same trusted service used for enrichment. */
internal fun kidsOwnerSessionToken(profile: NuvioProfile, serviceUrl: String, sessionToken: String?): String? =
    sessionToken?.takeIf {
        it.isNotBlank() && kidsTmdbProxyUrl(profile) != null &&
            profile.kidsServiceUrl?.trimEnd('/') == serviceUrl.trimEnd('/')
    }
