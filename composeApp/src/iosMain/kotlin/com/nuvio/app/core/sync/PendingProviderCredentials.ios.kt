package com.nuvio.app.core.sync

internal actual object PendingProviderCredentials {
    actual fun get(profileId: Int, provider: String): String? = null
    actual fun put(profileId: Int, provider: String, value: String) = Unit
    actual fun clearIfMatches(profileId: Int, provider: String, value: String) = Unit
}
