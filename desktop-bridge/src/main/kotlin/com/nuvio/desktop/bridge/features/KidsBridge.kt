package com.nuvio.desktop.bridge.features

import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.isAnonymous
import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.core.storage.DesktopStorage
import com.nuvio.app.core.sync.putSyncOriginClientId
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.addons.AddonRow
import com.nuvio.app.features.profiles.NuvioProfile
import com.nuvio.app.features.profiles.ProfileRepository
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap

/** The bridge enforces this policy on replies, events, direct links and playback. */
object KidsBridge {
    private val client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build()
    private val json = Json { ignoreUnknownKeys = true }
    private val management = DesktopStorage.store("kidsscreen_management")
    private data class Verdict(val allowed: Boolean, val expires: Long)
    private val verdicts = ConcurrentHashMap<String, Verdict>()
    val active: NuvioProfile? get() = ProfileRepository.state.value.activeProfile?.takeIf { it.kidsEnabled }
    internal fun normalizeService(raw: String): String {
        val uri = runCatching { URI(raw.trim().trimEnd('/')) }.getOrElse { throw BridgeFeatureException("INVALID_KIDS_SERVER", "Enter a valid KidsScreen server address") }
        val local = uri.host in setOf("localhost", "127.0.0.1", "[::1]", "::1")
        require(uri.host != null && uri.userInfo == null && uri.query == null && uri.fragment == null && (uri.scheme == "https" || (uri.scheme == "http" && local))) { "KidsScreen needs HTTPS, or localhost for development" }
        require(uri.path.orEmpty().isEmpty()) { "Use the KidsScreen server address without a path" }
        return uri.toString()
    }

    private suspend fun request(base: String, path: String, data: JsonObject? = null, token: String? = null, delete: Boolean = false): JsonObject = withContext(Dispatchers.IO) {
        val builder = HttpRequest.newBuilder(URI(normalizeService(base) + path)).timeout(Duration.ofSeconds(50))
        token?.let { builder.header("Authorization", "Bearer $it") }
        when { delete -> builder.DELETE(); data != null -> builder.header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(data.toString())); else -> builder.GET() }
        val response = try { client.send(builder.build(), HttpResponse.BodyHandlers.ofString()) }
        catch (error: Exception) { throw BridgeFeatureException("KIDSSCREEN_UNAVAILABLE", "KidsScreen is unavailable. Start the server and try again") }
        if (response.statusCode() !in 200..299) throw BridgeFeatureException("KIDSSCREEN_REQUEST_FAILED", "KidsScreen rejected the request. Check the server and TMDB API key")
        json.parseToJsonElement(response.body()).jsonObject
    }

    suspend fun configure(params: JsonObject): JsonObject {
        if (AuthRepository.state.value.isAnonymous) throw BridgeFeatureException("SIGN_IN_REQUIRED", "Sign in to set up a kids profile")
        val id = params["id"]?.jsonPrimitive?.intOrNull ?: error("Profile is required")
        val profile = ProfileRepository.state.value.profiles.firstOrNull { it.profileIndex == id } ?: error("Profile not found")
        if (id == 1) throw BridgeFeatureException("KIDS_SETUP_INVALID", "Keep the main profile as the parent profile")
        val enabled = params["enabled"]?.jsonPrimitive?.booleanOrNull ?: error("Enabled is required")
        val rating = params["maxRating"]?.jsonPrimitive?.content ?: "G"
        if (rating !in setOf("G", "PG", "PG-13")) throw BridgeFeatureException("KIDS_SETUP_INVALID", "Choose G, PG or PG-13")
        val base = normalizeService(params["serviceUrl"]?.jsonPrimitive?.content ?: "https://kids-screen.vercel.app")
        val apiKey = params["apiKey"]?.jsonPrimitive?.content.orEmpty().trim()
        var configId = profile.kidsConfigId
        var created: JsonObject? = null
        if (enabled) {
            if (ProfileRepository.state.value.profiles.any { it.addonSyncProfileId == id }) throw BridgeFeatureException("KIDS_ADDON_DEPENDENTS", "Unlink profiles sharing this profile's add-ons first")
            created = prepareConfiguration(profile, rating, base, apiKey,
                managementToken = { profile.kidsConfigId?.let(management::getString) },
                provision = { path, data, token -> request(base, path, data, token) },
            )
            if (created != null) {
                configId = created["id"]?.jsonPrimitive?.content
                if (configId?.matches(Regex("[A-Za-z0-9_-]{43}")) != true ||
                    created["managementToken"]?.jsonPrimitive?.content?.matches(Regex("[A-Za-z0-9_-]{43}")) != true) throw BridgeFeatureException("KIDSSCREEN_REQUEST_FAILED", "KidsScreen returned an invalid configuration")
            }
        }
        var policySaved = false
        var originalRows: List<AddonRow>? = null
        try {
            if (enabled) {
                originalRows = AddonRepository.readProfileAddonSnapshot(id)
                // Detach first so the managed catalog cannot alter the source profile.
                ProfileRepository.setAddonProfileLink(id, null)
                val rows = AddonRepository.readProfileAddonSnapshot(id).filterNot { row ->
                    com.nuvio.app.features.addons.isKidsConflictingAddon(row) ||
                    profile.kidsConfigId != null && row.url == "${profile.kidsServiceUrl}/${profile.kidsConfigId}/manifest.json"
                }
                AddonRepository.saveIndependentProfileAddons(id, rows + AddonRow("$base/$configId/manifest.json", "KidsScreen · $rating"))
            } else if (profile.kidsEnabled) {
                originalRows = AddonRepository.readProfileAddonSnapshot(id)
                AddonRepository.saveIndependentProfileAddons(id, originalRows.filterNot {
                    it.url == "${profile.kidsServiceUrl}/${profile.kidsConfigId}/manifest.json"
                })
            }
            val verdict = try { SupabaseProvider.client.postgrest.rpc("sync_set_kids_profile", buildJsonObject {
                put("p_profile_id", id); put("p_enabled", enabled); put("p_max_rating", rating)
                put("p_service_url", if (enabled) JsonPrimitive(base) else JsonNull)
                put("p_config_id", if (enabled) JsonPrimitive(configId!!) else JsonNull)
                put("p_guardian_pin", JsonNull); putSyncOriginClientId()
            }).decodeAs<JsonObject>() } catch (error: CancellationException) { throw error } catch (error: Exception) { throw BridgeFeatureException("KIDS_POLICY_SAVE_FAILED", "Kids profile settings could not be saved") }
            if (verdict["unlocked"]?.jsonPrimitive?.booleanOrNull != true) throw BridgeFeatureException("KIDS_POLICY_SAVE_FAILED", "Kids profile settings were not saved")
            policySaved = true
            created?.get("managementToken")?.jsonPrimitive?.content?.let { management.putString(configId!!, it) }
            ProfileRepository.pullProfiles()
            if (ProfileRepository.state.value.profiles.first { it.profileIndex == id }.kidsEnabled != enabled) throw BridgeFeatureException("KIDS_POLICY_SAVE_FAILED", "Kids profile settings were not saved")
            if (enabled && apiKey.isNotBlank()) {
                com.nuvio.app.features.tmdb.TmdbSettingsRepository.configureKidsProfile(id, apiKey, enableByDefault = !profile.kidsEnabled)
                try {
                    com.nuvio.app.core.sync.ProfileSettingsSync.syncKidsTmdbSettings(id)
                } catch (error: CancellationException) { throw error } catch (_: Exception) {
                    error("Kids profile saved, but TMDB enrichment setup could not be synced. Re-enter the key and save again to finish setup.")
                }
            }
            if (profile.kidsConfigId != null && profile.kidsConfigId != configId) revoke(profile)
            if (!enabled) revoke(profile)
            verdicts.clear()
            return ProfilesBridge.snapshot()
        } catch (error: Exception) {
            if (!policySaved) {
                originalRows?.let { rows -> runCatching { AddonRepository.saveIndependentProfileAddons(id, rows) } }
                if (profile.addonSyncProfileId != null) runCatching { ProfileRepository.setAddonProfileLink(id, profile.addonSyncProfileId) }
                if (created != null) runCatching { request(base, "/v1/configurations/$configId", token = created["managementToken"]?.jsonPrimitive?.content, delete = true) }
            }
            throw error
        }
    }

    /** Reuse the server-held key without downloading it or changing the live policy before commit. */
    internal suspend fun prepareConfiguration(
        profile: NuvioProfile,
        rating: String,
        base: String,
        apiKey: String,
        managementToken: () -> String?,
        provision: suspend (String, JsonObject, String?) -> JsonObject,
    ): JsonObject? {
        val unchanged = profile.kidsEnabled && profile.kidsConfigId != null &&
            profile.kidsMaxRating == rating && profile.kidsServiceUrl == base && apiKey.isBlank()
        if (unchanged) return null
        if (apiKey.isNotBlank()) {
            return provision("/v1/configurations", buildJsonObject { put("apiKey", apiKey); put("maxRating", rating) }, null)
        }
        if (profile.kidsEnabled && profile.kidsConfigId != null && profile.kidsServiceUrl == base) {
            val token = managementToken()?.takeIf { it.isNotBlank() }
                ?: throw BridgeFeatureException("KIDS_CONFIGURATION_ACCESS_REQUIRED", "This device is missing access to manage the saved KidsScreen configuration. Reconnect it with your TMDB key once")
            return provision("/v1/configurations/${profile.kidsConfigId}/clone", buildJsonObject { put("maxRating", rating) }, token)
        }
        throw BridgeFeatureException("TMDB_KEY_REQUIRED", "Enter your TMDB API key to set up this kids profile")
    }

    private suspend fun revoke(profile: NuvioProfile) {
        val id = profile.kidsConfigId ?: return
        val token = management.getString(id) ?: return
        runCatching { request(profile.kidsServiceUrl!!, "/v1/configurations/$id", token = token, delete = true); management.remove(id) }
    }

    suspend fun authorize(method: String, params: JsonObject) {
        if (active == null) return
        authorizeContent(method, params, ::requireMedia)
    }

    /** Feature access is unrestricted; title operations retain their rating check. */
    internal suspend fun authorizeContent(method: String, params: JsonObject, requireTitle: suspend (String?, String?) -> Unit) {
        if (method == "streams.load") { requireTitle(params["type"]?.jsonPrimitive?.content, params["parentMetaId"]?.jsonPrimitive?.contentOrNull ?: params["videoId"]?.jsonPrimitive?.contentOrNull); return }
        if (method.startsWith("details.") && method !in setOf("details.person", "details.entity", "details.entity.page", "details.comments.page")) {
            requireTitle(params["type"]?.jsonPrimitive?.content, params["id"]?.jsonPrimitive?.content); return
        }
        if (method in setOf("library.add", "library.remove", "library.membership", "library.setMembership")) {
            requireTitle(params["type"]?.jsonPrimitive?.content, params["id"]?.jsonPrimitive?.content); return
        }
    }

    suspend fun requireMedia(type: String?, id: String?) {
        val profile = active ?: return
        val ref = mediaRef(type, id) ?: throw BridgeFeatureException("KIDS_TITLE_BLOCKED", "This title is unavailable in this kids profile")
        if (!check(profile, setOf(ref)).contains(ref)) throw BridgeFeatureException("KIDS_TITLE_BLOCKED", "This title could not be verified for this kids profile")
    }

    internal data class Ref(val type: String, val id: String)
    private fun mediaRef(type: String?, id: String?): Ref? = if (type in setOf("movie", "series") && !id.isNullOrBlank()) Ref(type!!, id) else null
    internal fun reference(value: JsonObject): Ref? {
        val parentId = (value["parentMetaId"] as? JsonPrimitive)?.contentOrNull
        val parentType = (value["parentMetaType"] as? JsonPrimitive)?.contentOrNull
        if (parentId != null && parentType != null) return Ref(parentType, parentId)
        if (!value.containsKey("poster") && !value.containsKey("background") && !value.containsKey("genres")) return null
        val id = (value["id"] as? JsonPrimitive)?.contentOrNull ?: return null
        val type = (value["type"] as? JsonPrimitive)?.contentOrNull ?: return null
        return Ref(type, id)
    }
    internal suspend fun check(profile: NuvioProfile, refs: Set<Ref>): Set<Ref> {
        val now = System.currentTimeMillis()
        fun key(ref: Ref) = "${profile.userId}|${profile.kidsServiceUrl}|${profile.kidsConfigId}|${profile.kidsMaxRating}|${ref.type}|${ref.id}"
        val missing = refs.filter { it.type in setOf("movie", "series") }.filter { verdicts[key(it)]?.expires?.let { expiry -> expiry > now } != true }
        for (batch in missing.chunked(200)) {
            val allowed = try {
                val result = request(profile.kidsServiceUrl!!, "/${profile.kidsConfigId}/check", buildJsonObject {
                    put("items", JsonArray(batch.map { buildJsonObject { put("type", it.type); put("id", it.id) } }))
                })
                (result["items"] as? JsonArray).orEmpty().mapNotNull { item ->
                    val row = item.jsonObject
                    if (row["allowed"]?.jsonPrimitive?.booleanOrNull == true) mediaRef(row["type"]?.jsonPrimitive?.content, row["id"]?.jsonPrimitive?.content) else null
                }.toSet()
            } catch (error: CancellationException) { throw error } catch (_: Exception) { emptySet() }
            if (verdicts.size > 4000) verdicts.clear()
            batch.forEach { ref -> verdicts[key(ref)] = Verdict(ref in allowed, now + if (ref in allowed) 300_000 else 15_000) }
        }
        return refs.filter { verdicts[key(it)]?.let { verdict -> verdict.allowed && verdict.expires > System.currentTimeMillis() } == true }.toSet()
    }

    /** A blocked root becomes null; blocked list entries disappear without placeholders. */
    internal fun filter(value: JsonElement, allowed: Set<Ref>): JsonElement? = when (value) {
        is JsonArray -> JsonArray(value.mapNotNull { filter(it, allowed) })
        is JsonObject -> {
            val ref = reference(value)
            if (ref != null && ref !in allowed) null else JsonObject(value.mapValues { (_, child) -> filter(child, allowed) ?: JsonNull })
        }
        else -> value
    }
    suspend fun sanitizeTopic(topic: String, data: JsonObject): JsonObject {
        if (active == null) return data
        val source = if (topic in setOf("cloud", "searchHistory")) JsonObject(data.mapValues { (_, value) -> if (value is JsonArray) JsonArray(emptyList()) else value }) else data
        return sanitize(source) as? JsonObject ?: JsonObject(emptyMap())
    }
    suspend fun sanitizeReply(method: String, value: JsonElement): JsonElement = when {
        value is JsonObject && method.startsWith("cloud.") -> sanitizeTopic("cloud", value)
        value is JsonObject && method == "search.historySnapshot" -> sanitizeTopic("searchHistory", value)
        else -> sanitize(value)
    }
    suspend fun sanitize(value: JsonElement): JsonElement {
        val profile = active ?: return value
        val refs = mutableSetOf<Ref>()
        fun collect(node: JsonElement) { when (node) { is JsonObject -> { reference(node)?.let(refs::add); node.values.forEach(::collect) }; is JsonArray -> node.forEach(::collect); else -> Unit } }
        collect(value)
        val filtered = filter(value, check(profile, refs)) ?: JsonNull
        return if (filtered is JsonObject && filtered.containsKey("media") && filtered["media"] == JsonNull) JsonObject(filtered + mapOf(
            "episodes" to JsonArray(emptyList()), "cast" to JsonArray(emptyList()), "related" to JsonArray(emptyList()),
        )) else filtered
    }
}
