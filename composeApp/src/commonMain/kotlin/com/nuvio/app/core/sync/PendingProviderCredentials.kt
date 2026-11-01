package com.nuvio.app.core.sync

internal expect object PendingProviderCredentials {
    fun get(profileId: Int, provider: String): String?
    fun put(profileId: Int, provider: String, value: String)
    fun clearIfMatches(profileId: Int, provider: String, value: String)
}
