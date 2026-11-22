package com.nuvio.desktop.bridge.features

import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.isAnonymous
import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.core.storage.DesktopStorage
import com.nuvio.app.core.sync.putSyncOriginClientId
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.addons.AddonRow
import com.nuvio.app.features.profiles.kidsOwnerSessionToken
import com.nuvio.app.features.profiles.NuvioProfile
import com.nuvio.app.features.profiles.ProfileRepository
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.coroutines.runInterruptible
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
    /** Decided verdicts survive restarts so a kids profile does not re-check every visible title on launch. */
    internal interface VerdictStore { fun getString(key: String): String?; fun putString(key: String, value: String?); fun remove(key: String) }
    /** Replaceable so tests never write into the user's real app data. */
    internal var verdictStore: VerdictStore = object : VerdictStore {
        private val store by lazy { DesktopStorage.store("kidsscreen_verdicts") }
        override fun getString(key: String) = store.getString(key)
        override fun putString(key: String, value: String?) { store.putString(key, value) }
        override fun remove(key: String) { store.remove(key) }
    }
    /** Drops in-memory verdicts, as on a fresh launch. */
    internal fun forgetVerdictsInMemory() { verdicts.clear(); loadedPolicies.clear() }
    /** [unavailable] marks a failed check: it hides the title briefly but is never treated as a rating decision. */
    private data class Verdict(val allowed: Boolean, val expires: Long, val unavailable: Boolean = false)
    private val verdicts = ConcurrentHashMap<String, Verdict>()
    // Ratings rarely change and the server caches decisions for a day; a denial expires sooner so a
    // title that gains a certification appears without a restart.
    internal const val ALLOWED_TTL_MS = 12 * 60 * 60_000L
    internal const val DENIED_TTL_MS = 10 * 60_000L
    internal const val UNAVAILABLE_TTL_MS = 5_000L
    private const val MAX_VERDICTS = 4000
    private fun policyKey(profile: NuvioProfile) = "${profile.userId}|${profile.kidsServiceUrl}|${profile.kidsConfigId}|${profile.kidsMaxRating}"
    private fun verdictKey(profile: NuvioProfile, ref: Ref) = "${policyKey(profile)}|${ref.type}|${ref.id}"
    /** The disk copy is keyed by a hash so the configuration id (a capability) is not written in another file. */
    private fun storedPolicy(profile: NuvioProfile) = java.security.MessageDigest.getInstance("SHA-256")
        .digest(policyKey(profile).toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    private val loadedPolicies = ConcurrentHashMap.newKeySet<String>()

    /** Loads this policy's saved verdicts into memory once per process. */
    private fun restoreVerdicts(profile: NuvioProfile) {
        val policy = policyKey(profile)
        if (!loadedPolicies.add(policy)) return
        val saved = runCatching { verdictStore.getString(storedPolicy(profile))?.let { json.parseToJsonElement(it).jsonObject } }.getOrNull() ?: return
        val now = System.currentTimeMillis()
        saved.forEach { (ref, value) ->
            val entry = value as? JsonArray ?: return@forEach
            val allowed = entry.getOrNull(0)?.jsonPrimitive?.booleanOrNull ?: return@forEach
            val expires = entry.getOrNull(1)?.jsonPrimitive?.longOrNull ?: return@forEach
            if (expires > now) verdicts.putIfAbsent("$policy|$ref", Verdict(allowed, expires))
        }
    }

    private fun saveVerdicts(profile: NuvioProfile) {
        val prefix = policyKey(profile) + "|"
        val now = System.currentTimeMillis()
        val entries = verdicts.entries.filter { (key, verdict) -> key.startsWith(prefix) && !verdict.unavailable && verdict.expires > now }
            .sortedByDescending { it.value.expires }.take(MAX_VERDICTS)
        val payload = buildJsonObject {
            entries.forEach { (key, verdict) -> put(key.removePrefix(prefix), buildJsonArray { add(verdict.allowed); add(verdict.expires) }) }
        }
        runCatching { verdictStore.putString(storedPolicy(profile), payload.toString()) }
    }
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
        val response = try { runInterruptible { client.send(builder.build(), HttpResponse.BodyHandlers.ofString()) } }
        catch (error: CancellationException) { throw error }
        catch (error: Exception) { throw BridgeFeatureException("KIDSSCREEN_UNAVAILABLE", "KidsScreen is unavailable. Start the server and try again") }
        if (response.statusCode() !in 200..299) throw BridgeFeatureException("KIDSSCREEN_REQUEST_FAILED",
            if (path.endsWith("/clone-owned")) "Could not update the saved kids configuration. Check your Nuvio sign-in and connection."
            else "KidsScreen rejected the request. Check the server and TMDB API key")
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
                ownerSessionToken = { kidsOwnerSessionToken(profile, base, SupabaseProvider.client.auth.currentSessionOrNull()?.accessToken) },
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
            loadedPolicies.clear()
            runCatching { verdictStore.remove(storedPolicy(profile)) }
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
        ownerSessionToken: () -> String? = { null },
        provision: suspend (String, JsonObject, String?) -> JsonObject,
    ): JsonObject? {
        val unchanged = profile.kidsEnabled && profile.kidsConfigId != null &&
            profile.kidsMaxRating == rating && profile.kidsServiceUrl == base && apiKey.isBlank()
        if (unchanged) return null
        if (apiKey.isNotBlank()) {
            return provision("/v1/configurations", buildJsonObject { put("apiKey", apiKey); put("maxRating", rating) }, null)
        }
        if (profile.kidsEnabled && profile.kidsConfigId != null && profile.kidsServiceUrl == base) {
            val manager = managementToken()?.takeIf { it.isNotBlank() }
            val token = manager ?: ownerSessionToken()?.takeIf { it.isNotBlank() }
                ?: throw BridgeFeatureException("KIDS_CONFIGURATION_ACCESS_REQUIRED", "This device is missing access to manage the saved KidsScreen configuration. Reconnect it with your TMDB key once")
            val action = if (manager != null) "clone" else "clone-owned"
            return provision("/v1/configurations/${profile.kidsConfigId}/$action", buildJsonObject { put("maxRating", rating) }, token)
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
        val result = checkDetailed(profile, setOf(ref))
        if (ref in result.allowed) return
        if (ref in result.unavailable) throw BridgeFeatureException("KIDSSCREEN_UNAVAILABLE", "KidsScreen could not check this title right now. Try again in a moment")
        throw BridgeFeatureException("KIDS_TITLE_BLOCKED", "This title could not be verified for this kids profile")
    }

    internal data class CheckResult(val allowed: Set<Ref>, val unavailable: Set<Ref>)

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
    internal suspend fun check(profile: NuvioProfile, refs: Set<Ref>): Set<Ref> = checkDetailed(profile, refs).allowed

    /**
     * Fails closed: only titles the service explicitly allowed are returned as allowed. A failed request,
     * or an item the service marks `unavailable`, is kept apart so callers can say "try again" and so it
     * is never remembered as a block.
     */
    internal suspend fun checkDetailed(profile: NuvioProfile, refs: Set<Ref>): CheckResult {
        restoreVerdicts(profile)
        val now = System.currentTimeMillis()
        fun key(ref: Ref) = verdictKey(profile, ref)
        val missing = refs.filter { it.type in setOf("movie", "series") }.filter { verdicts[key(it)]?.expires?.let { expiry -> expiry > now } != true }
        if (missing.isNotEmpty()) {
            // Batches are independent; send them together instead of waiting on each in turn.
            val outcomes = coroutineScope {
                missing.chunked(200).map { batch -> async { batch to requestVerdicts(profile, batch) } }.awaitAll()
            }
            if (verdicts.size > MAX_VERDICTS) verdicts.clear()
            val decidedAt = System.currentTimeMillis()
            var decided = false
            outcomes.forEach { (batch, rows) ->
                batch.forEach { ref ->
                    val verdict = when (rows?.get(ref)) {
                        true -> Verdict(true, decidedAt + ALLOWED_TTL_MS).also { decided = true }
                        false -> Verdict(false, decidedAt + DENIED_TTL_MS).also { decided = true }
                        // No answer for this title, or the whole request failed.
                        null -> Verdict(false, decidedAt + UNAVAILABLE_TTL_MS, unavailable = true)
                    }
                    verdicts[key(ref)] = verdict
                }
            }
            if (decided) saveVerdicts(profile)
        }
        val current = System.currentTimeMillis()
        val live = refs.mapNotNull { ref -> verdicts[key(ref)]?.takeIf { it.expires > current }?.let { ref to it } }
        return CheckResult(
            allowed = live.filter { it.second.allowed }.map { it.first }.toSet(),
            unavailable = live.filter { it.second.unavailable }.map { it.first }.toSet(),
        )
    }

    /** Returns allowed/denied per title, omitting titles the service could not decide; null when the request failed. */
    private suspend fun requestVerdicts(profile: NuvioProfile, batch: List<Ref>): Map<Ref, Boolean>? = try {
        val result = request(profile.kidsServiceUrl!!, "/${profile.kidsConfigId}/check", buildJsonObject {
            put("items", JsonArray(batch.map { buildJsonObject { put("type", it.type); put("id", it.id) } }))
        })
        (result["items"] as? JsonArray).orEmpty().mapNotNull { item ->
            val row = item as? JsonObject ?: return@mapNotNull null
            val ref = mediaRef(row["type"]?.jsonPrimitive?.contentOrNull, row["id"]?.jsonPrimitive?.contentOrNull) ?: return@mapNotNull null
            if (row["unavailable"]?.jsonPrimitive?.booleanOrNull == true) return@mapNotNull null
            ref to (row["allowed"]?.jsonPrimitive?.booleanOrNull == true)
        }.toMap()
    } catch (error: CancellationException) { throw error } catch (_: Exception) { null }

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
    suspend fun publishHome(data: JsonObject, isCurrent: () -> Boolean, publish: suspend (JsonObject) -> Unit) {
        val profile = active
        if (profile == null) { if (isCurrent()) publish(data); return }
        restoreVerdicts(profile)
        val now = System.currentTimeMillis()
        val allowed = verdicts.entries.filter { (key, verdict) -> key.startsWith(policyKey(profile) + "|") && verdict.allowed && verdict.expires > now }
            .mapNotNull { (key, _) -> val parts = key.split('|'); if (parts.size < 2) null else Ref(parts[parts.size - 2], parts.last()) }.toSet()
        progressiveHomeVisibility(data, allowed, { check(profile, it) }, { isCurrent() && active == profile }, publish)
    }
    suspend fun sanitizeReply(method: String, value: JsonElement): JsonElement = when {
        value is JsonObject && method == "home.snapshot" -> cachedHome(value)
        value is JsonObject && method.startsWith("cloud.") -> sanitizeTopic("cloud", value)
        value is JsonObject && method == "search.historySnapshot" -> sanitizeTopic("searchHistory", value)
        else -> sanitize(value)
    }
    /**
     * Details events: publish the title as soon as it is verified, then add related titles once they are.
     * The title's own check usually hits the cache from the details.load authorization.
     */
    suspend fun publishDetails(data: JsonObject, isCurrent: () -> Boolean, publish: suspend (JsonObject) -> Unit) {
        val profile = active
        if (profile == null) { if (isCurrent()) publish(data); return }
        publishDetailsFor(profile, data, { isCurrent() && active == profile }, publish)
    }

    internal suspend fun publishDetailsFor(profile: NuvioProfile, data: JsonObject, isCurrent: () -> Boolean, publish: suspend (JsonObject) -> Unit) {
        val refs = linkedSetOf<Ref>()
        fun collect(node: JsonElement) { when (node) { is JsonObject -> { reference(node)?.let(refs::add); node.values.forEach(::collect) }; is JsonArray -> node.forEach(::collect); else -> Unit } }
        collect(data)
        val main = (data["media"] as? JsonObject)?.let(::reference)
        val allowed = (main?.let { check(profile, setOf(it)) } ?: emptySet()).toMutableSet()
        val now = System.currentTimeMillis()
        refs.filterTo(allowed) { verdicts[verdictKey(profile, it)]?.let { verdict -> verdict.allowed && verdict.expires > now } == true }
        val pending = refs - allowed - setOfNotNull(main)
        fun render() = (sanitizeDetails(filter(data, allowed)) as? JsonObject) ?: JsonObject(emptyMap())
        if (!isCurrent()) return
        publish(render())
        if (pending.isEmpty()) return
        allowed.addAll(check(profile, pending))
        if (isCurrent()) publish(render())
    }

    private fun sanitizeDetails(filtered: JsonElement?): JsonElement {
        val value = filtered ?: JsonNull
        return if (value is JsonObject && value.containsKey("media") && value["media"] == JsonNull) JsonObject(value + mapOf(
            "episodes" to JsonArray(emptyList()), "cast" to JsonArray(emptyList()), "related" to JsonArray(emptyList()),
        )) else value
    }

    private fun cachedHome(data: JsonObject): JsonObject {
        val profile = active ?: return data
        restoreVerdicts(profile)
        val refs = mutableSetOf<Ref>()
        fun collect(node: JsonElement) { when (node) { is JsonObject -> { reference(node)?.let(refs::add); node.values.forEach(::collect) }; is JsonArray -> node.forEach(::collect); else -> Unit } }
        collect(data)
        val now = System.currentTimeMillis()
        val allowed = refs.filter { verdicts[verdictKey(profile, it)]?.let { verdict -> verdict.allowed && verdict.expires > now } == true }.toSet()
        val pending = refs.any { verdicts[verdictKey(profile, it)]?.expires?.let { expiry -> expiry > now } != true }
        val filtered = filter(data, allowed) as? JsonObject ?: JsonObject(emptyMap())
        return JsonObject(filtered + ("loading" to JsonPrimitive(pending || data["loading"]?.jsonPrimitive?.booleanOrNull == true)))
    }
    suspend fun sanitize(value: JsonElement): JsonElement {
        val profile = active ?: return value
        val refs = mutableSetOf<Ref>()
        fun collect(node: JsonElement) { when (node) { is JsonObject -> { reference(node)?.let(refs::add); node.values.forEach(::collect) }; is JsonArray -> node.forEach(::collect); else -> Unit } }
        collect(value)
        return sanitizeDetails(filter(value, check(profile, refs)))
    }
}
