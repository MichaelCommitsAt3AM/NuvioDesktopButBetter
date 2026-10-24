package com.nuvio.app.features.tmdb

import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.core.network.createApiHttpClient
import com.nuvio.app.features.addons.httpGetText
import com.nuvio.app.features.profiles.NuvioProfile
import com.nuvio.app.features.profiles.ProfileRepository
import io.github.jan.supabase.auth.auth
import io.ktor.client.request.*
import io.ktor.client.statement.bodyAsText
import io.ktor.http.*
import kotlinx.serialization.json.*

/** Never forward a Nuvio session token to an arbitrary synced/custom add-on URL. */
internal fun kidsTmdbProxyUrl(profile: NuvioProfile?): String? = runCatching {
    if (profile?.kidsEnabled != true) return null
    val id = profile.kidsConfigId?.takeIf { it.matches(Regex("[A-Za-z0-9_-]{43}")) } ?: return null
    val service = Url(profile.kidsServiceUrl ?: return null)
    if (service.protocol != URLProtocol.HTTPS || service.host != "kids-screen.vercel.app" || service.port != 443 ||
        !service.user.isNullOrEmpty() || !service.password.isNullOrEmpty() || service.parameters.names().isNotEmpty() ||
        service.fragment.isNotEmpty() || service.encodedPath !in setOf("", "/")) return null
    "https://kids-screen.vercel.app/v1/configurations/$id/tmdb"
}.getOrNull()

internal object TmdbTransport {
    private val client by lazy { createApiHttpClient().config { followRedirects = false } }
    fun hasProxyAccess(): Boolean = kidsTmdbProxyUrl(ProfileRepository.state.value.activeProfile) != null
    fun hasAccess(): Boolean = hasProxyAccess() || TmdbSettingsRepository.effectiveApiKey().isNotBlank()

    suspend fun get(endpoint: String, query: Map<String, String>, apiKey: String = TmdbSettingsRepository.effectiveApiKey()): String {
        val profile = ProfileRepository.state.value.activeProfile
        val proxy = kidsTmdbProxyUrl(profile)
        if (proxy == null) {
            check(apiKey.isNotBlank()) { "Configure a TMDB API key to use enrichment." }
            return httpGetText(buildTmdbUrl(endpoint, apiKey, query))
        }
        // The proxy may only be used by the profile that supplied its configuration.
        // Snapshot it before the request so a profile switch cannot redirect the session token.
        val owner = profile ?: error("Sign in to use KidsScreen enrichment.")
        val token = SupabaseProvider.client.auth.currentSessionOrNull()?.accessToken
            ?: error("Sign in to use KidsScreen enrichment.")
        val response = client.post(proxy) {
            header(HttpHeaders.Authorization, "Bearer $token")
            header(HttpHeaders.Accept, ContentType.Application.Json.toString())
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject {
                put("endpoint", endpoint)
                put("query", buildJsonObject { query.forEach { (key, value) -> put(key, value) } })
            }.toString())
        }
        check(response.status.value in 200..299) {
            when (response.status.value) {
                401, 403 -> "Sign in to Nuvio to use KidsScreen enrichment."
                404 -> "This title is unavailable for the kids profile."
                else -> "KidsScreen enrichment is unavailable. Check your connection and sign-in."
            }
        }
        check(ProfileRepository.state.value.activeProfile?.let {
            it.userId == owner.userId && it.profileIndex == owner.profileIndex && it.kidsConfigId == owner.kidsConfigId
        } == true) { "Profile changed during enrichment." }
        return response.bodyAsText()
    }
}
