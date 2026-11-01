package com.nuvio.app.core.sync

import com.nuvio.app.core.storage.DesktopStorage
import com.nuvio.app.core.storage.ProfileScopedKey

internal actual object PendingProviderCredentials {
    private val store = DesktopStorage.store("nuvio_pending_provider_credentials")
    private fun key(profileId: Int, provider: String) = ProfileScopedKey.of("pending_$provider", profileId)
    actual fun get(profileId: Int, provider: String): String? = store.getString(key(profileId, provider))
    actual fun put(profileId: Int, provider: String, value: String) = store.putString(key(profileId, provider), value)
    actual fun clearIfMatches(profileId: Int, provider: String, value: String) = store.update {
        val key = key(profileId, provider)
        if (store.getString(key) == value) store.remove(key)
    }
}
