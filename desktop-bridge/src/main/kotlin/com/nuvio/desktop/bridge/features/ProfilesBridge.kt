package com.nuvio.desktop.bridge.features

import com.nuvio.app.core.build.AppFeaturePolicy
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.isAnonymous
import com.nuvio.app.features.membership.ProfileBackgroundRepository
import com.nuvio.app.features.membership.CosmeticEntitlement
import com.nuvio.app.features.membership.MemberAccessRepository
import com.nuvio.app.features.profiles.AvatarRepository
import com.nuvio.app.features.profiles.MAX_PROFILES
import com.nuvio.app.features.profiles.NuvioProfile
import com.nuvio.app.features.profiles.ProfilePushPayload
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.profiles.normalizedAvatarUrl
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** A feature-level failure which the runtime can preserve as a stable RPC error code. */
class BridgeFeatureException(val code: String, message: String) : IllegalStateException(message)

object ProfilesBridge {
    suspend fun dispatch(method: String, params: JsonObject): JsonElement? = when (method) {
        "profiles.snapshot" -> {
            MemberAccessRepository.ensureStarted()
            AvatarRepository.fetchAvatars()
            ProfileBackgroundRepository.ensureLoaded()
            snapshot()
        }
        "profiles.create" -> create(params)
        "profiles.update" -> update(params)
        "profiles.delete" -> delete(params)
        "profiles.pin.verify" -> pin(params, "verify")
        "profiles.pin.set" -> pin(params, "set")
        "profiles.pin.clear" -> pin(params, "clear")
        "profiles.pin.clearWithPassword" -> pin(params, "clearWithPassword")
        "profiles.rememberLast.set" -> {
            ProfileRepository.setRememberLastProfileEnabled(params.bool("enabled"))
            snapshot()
        }
        "profiles.avatars.refresh" -> {
            AvatarRepository.refreshAvatars(force = true)
            snapshot()
        }
        else -> null
    }

    fun snapshot(): JsonObject {
        val state = ProfileRepository.state.value
        return buildJsonObject {
            put("items", JsonArray(state.profiles.map(::profileJson)))
            put("activeProfile", state.activeProfile?.profileIndex?.let(::JsonPrimitive) ?: JsonNull)
            put("rememberLastProfileEnabled", state.rememberLastProfileEnabled)
            put("maxProfiles", MAX_PROFILES)
            put("avatars", JsonArray(AvatarRepository.avatars.value.map { avatar -> buildJsonObject {
                put("id", avatar.id); put("name", avatar.displayName); put("category", avatar.category)
                putNullable("color", avatar.bgColor); putNullable("url", avatar.localImageUrl ?: avatar.storagePath.takeIf { it.startsWith("http") })
                put("memberOnly", avatar.memberOnly)
            } }))
            put("backgrounds", JsonArray(ProfileBackgroundRepository.catalog.value.map { background -> buildJsonObject {
                put("id", background.id); put("name", background.displayName)
            } }))
        }
    }

    suspend fun authorizeSelection(profileIndex: Int, pin: String?) {
        val profile = requireProfile(profileIndex)
        if (!profile.pinEnabled) return
        if (pin.isNullOrBlank()) throw BridgeFeatureException("PROFILE_PIN_REQUIRED", "This profile requires a PIN")
        val result = ProfileRepository.verifyPin(profileIndex, pin)
        if (!result.unlocked) {
            throw BridgeFeatureException("PROFILE_PIN_REJECTED", result.message ?: "The profile PIN is incorrect")
        }
    }

    private suspend fun create(params: JsonObject): JsonElement {
        val name = params.str("name").trim().requireValidName()
        val indexBefore = ProfileRepository.state.value.profiles.map { it.profileIndex }.toSet()
        val color = params.optionalStr("avatarColorHex") ?: "#1E88E5"
        validateCosmetics(params.optionalStr("avatarId"), params.optionalStr("avatarUrl"), params.optionalStr("backgroundId"), params.optionalStr("backgroundUrl"))
        val primaryAddons = params.optionalBool("usesPrimaryAddons") ?: false
        val allowlist = params.optionalStringList("primaryAddonsAllowlist")
        ProfileRepository.createProfile(
            name = name,
            avatarColorHex = color,
            avatarId = params.optionalStr("avatarId"),
            avatarUrl = params.optionalStr("avatarUrl"),
            usesPrimaryAddons = primaryAddons,
            primaryAddonsAllowlist = allowlist,
        )
        val created = ProfileRepository.state.value.profiles.firstOrNull { it.profileIndex !in indexBefore }
            ?: throw BridgeFeatureException("PROFILE_CREATE_FAILED", "Profile could not be created (limit reached or server operation failed)")
        val needsFollowup = params.optionalBool("usesPrimaryPlugins") == true || params.has("backgroundId") || params.has("backgroundUrl")
        if (needsFollowup) {
            ensurePluginsAllowed(params.optionalBool("usesPrimaryPlugins") ?: false)
            ProfileRepository.updateProfile(
                profileIndex = created.profileIndex,
                name = created.name,
                avatarColorHex = created.avatarColorHex,
                avatarId = created.avatarId,
                avatarUrl = created.avatarUrl,
                profileBackgroundId = params.optionalStr("backgroundId"),
                profileBackgroundUrl = params.optionalStr("backgroundUrl"),
                usesPrimaryAddons = created.usesPrimaryAddons,
                usesPrimaryPlugins = params.optionalBool("usesPrimaryPlugins") ?: false,
                primaryAddonsAllowlist = created.primaryAddonsAllowlist,
            )
            val updatedCreated = ProfileRepository.state.value.profiles.firstOrNull { it.profileIndex == created.profileIndex }
            if (updatedCreated == null || updatedCreated.profileBackgroundId != params.optionalStr("backgroundId") ||
                updatedCreated.profileBackgroundUrl != params.optionalStr("backgroundUrl") ||
                updatedCreated.usesPrimaryPlugins != (params.optionalBool("usesPrimaryPlugins") ?: false)
            ) {
                throw BridgeFeatureException("PROFILE_UPDATE_FAILED", "Profile was created, but some requested settings were not saved")
            }
        }
        return snapshot()
    }

    private suspend fun update(params: JsonObject): JsonElement {
        val index = params.int("id")
        val profile = requireProfile(index)
        val name = params.optionalStr("name")?.trim()?.requireValidName() ?: profile.name
        val addons = params.optionalBool("usesPrimaryAddons") ?: profile.usesPrimaryAddons
        val plugins = params.optionalBool("usesPrimaryPlugins") ?: profile.usesPrimaryPlugins
        if (plugins != profile.usesPrimaryPlugins) ensurePluginsAllowed(plugins)
        validateCosmetics(
            if (params.has("avatarId")) params.optionalStr("avatarId") else profile.avatarId,
            if (params.has("avatarUrl")) params.optionalStr("avatarUrl") else profile.avatarUrl,
            if (params.has("backgroundId")) params.optionalStr("backgroundId") else profile.profileBackgroundId,
            if (params.has("backgroundUrl")) params.optionalStr("backgroundUrl") else profile.profileBackgroundUrl,
        )
        ProfileRepository.updateProfile(
            profileIndex = index,
            name = name,
            avatarColorHex = params.optionalStr("avatarColorHex") ?: profile.avatarColorHex,
            avatarId = if (params.has("avatarId")) params.optionalStr("avatarId") else profile.avatarId,
            avatarUrl = if (params.has("avatarUrl")) params.optionalStr("avatarUrl") else profile.avatarUrl,
            profileBackgroundId = if (params.has("backgroundId")) params.optionalStr("backgroundId") else profile.profileBackgroundId,
            profileBackgroundUrl = if (params.has("backgroundUrl")) params.optionalStr("backgroundUrl") else profile.profileBackgroundUrl,
            usesPrimaryAddons = addons,
            usesPrimaryPlugins = plugins,
            primaryAddonsAllowlist = if (params.has("primaryAddonsAllowlist")) params.optionalStringList("primaryAddonsAllowlist") else profile.primaryAddonsAllowlist,
        )
        val updated = ProfileRepository.state.value.profiles.firstOrNull { it.profileIndex == index }
        if (
            updated == null || updated.name != name ||
            updated.avatarColorHex != (params.optionalStr("avatarColorHex") ?: profile.avatarColorHex) ||
            updated.avatarId != (if (params.has("avatarId")) params.optionalStr("avatarId") else profile.avatarId) ||
            updated.avatarUrl != (if (params.has("avatarUrl")) params.optionalStr("avatarUrl") else profile.avatarUrl) ||
            updated.profileBackgroundId != (if (params.has("backgroundId")) params.optionalStr("backgroundId") else profile.profileBackgroundId) ||
            updated.profileBackgroundUrl != (if (params.has("backgroundUrl")) params.optionalStr("backgroundUrl") else profile.profileBackgroundUrl) ||
            updated.usesPrimaryAddons != addons || updated.usesPrimaryPlugins != plugins ||
            updated.primaryAddonsAllowlist != (if (params.has("primaryAddonsAllowlist")) params.optionalStringList("primaryAddonsAllowlist") else profile.primaryAddonsAllowlist)
        ) {
            throw BridgeFeatureException("PROFILE_UPDATE_FAILED", "Profile changes were not saved")
        }
        return snapshot()
    }

    private suspend fun delete(params: JsonObject): JsonElement {
        val index = params.int("id")
        requireProfile(index)
        ProfileRepository.deleteProfile(index)
        if (ProfileRepository.state.value.profiles.any { it.profileIndex == index }) {
            throw BridgeFeatureException("PROFILE_DELETE_FAILED", "Profile could not be deleted")
        }
        return snapshot()
    }

    private suspend fun pin(params: JsonObject, operation: String): JsonElement {
        val index = params.int("id")
        requireProfile(index)
        val result = when (operation) {
            "verify" -> ProfileRepository.verifyPin(index, params.str("pin"))
            "set" -> ProfileRepository.setPin(index, params.str("pin"), params.optionalStr("currentPin"))
            "clear" -> ProfileRepository.clearPin(index, params.optionalStr("currentPin"))
            else -> {
                val authenticated = AuthRepository.state.value
                if (authenticated !is com.nuvio.app.core.auth.AuthState.Authenticated || authenticated.isAnonymous) {
                    throw BridgeFeatureException("PROFILE_PIN_PASSWORD_UNAVAILABLE", "Account password verification requires a signed-in account")
                }
                ProfileRepository.clearPinWithPassword(index, params.str("accountPassword"))
                val stillEnabled = ProfileRepository.state.value.profiles.firstOrNull { it.profileIndex == index }?.pinEnabled == true
                if (stillEnabled) throw BridgeFeatureException("PROFILE_PIN_CLEAR_FAILED", "The profile PIN could not be cleared")
                return snapshot()
            }
        }
        return buildJsonObject {
            put("unlocked", result.unlocked); put("retryAfterSeconds", result.retryAfterSeconds)
            putNullable("message", result.message)
            put("snapshot", snapshot())
        }
    }

    private fun requireProfile(index: Int): NuvioProfile = ProfileRepository.state.value.profiles
        .firstOrNull { it.profileIndex == index }
        ?: throw BridgeFeatureException("PROFILE_NOT_FOUND", "Profile does not exist")

    private fun ensurePluginsAllowed(enabled: Boolean) {
        if (enabled && !AppFeaturePolicy.pluginsEnabled) {
            throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", "Plugins are unavailable in this app build")
        }
    }

    private fun validateCosmetics(avatarId: String?, avatarUrl: String?, backgroundId: String?, backgroundUrl: String?) {
        val access = MemberAccessRepository.access.value
        if (!avatarUrl.isNullOrBlank() && normalizedAvatarUrl(avatarUrl) == null) {
            throw BridgeFeatureException("INVALID_AVATAR_URL", "Avatar URL must be a valid HTTP or HTTPS URL")
        }
        if (avatarId != null) {
            val avatar = AvatarRepository.avatars.value.firstOrNull { it.id == avatarId }
                ?: throw BridgeFeatureException("AVATAR_NOT_AVAILABLE", "Selected avatar is not available")
            if (avatar.memberOnly && !access.entitlements.includes(CosmeticEntitlement.PROFILE_AVATARS)) {
                throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", "This avatar requires profile avatar access")
            }
        }
        if (backgroundId != null || !backgroundUrl.isNullOrBlank()) {
            if (!access.entitlements.includes(CosmeticEntitlement.PROFILE_BACKGROUNDS)) {
                throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", "Profile backgrounds require profile background access")
            }
            if (backgroundId != null && ProfileBackgroundRepository.catalog.value.none { it.id == backgroundId }) {
                throw BridgeFeatureException("BACKGROUND_NOT_AVAILABLE", "Selected profile background is not available")
            }
            if (!backgroundUrl.isNullOrBlank() && normalizedAvatarUrl(backgroundUrl) == null) {
                throw BridgeFeatureException("INVALID_BACKGROUND_URL", "Background URL must be a valid HTTP or HTTPS URL")
            }
        }
    }

    private fun String.requireValidName(): String {
        if (isBlank()) throw BridgeFeatureException("INVALID_PROFILE_NAME", "Profile name cannot be empty")
        if (length > 40) throw BridgeFeatureException("INVALID_PROFILE_NAME", "Profile name is too long")
        return this
    }

    private fun profileJson(profile: NuvioProfile) = buildJsonObject {
        put("id", profile.profileIndex); put("name", profile.name); put("avatarColorHex", profile.avatarColorHex)
        putNullable("avatarId", profile.avatarId); putNullable("avatarUrl", profile.avatarUrl)
        putNullable("backgroundId", profile.profileBackgroundId); putNullable("backgroundUrl", profile.profileBackgroundUrl)
        put("locked", profile.pinEnabled); putNullable("pinLockedUntil", profile.pinLockedUntil)
        put("usesPrimaryAddons", profile.usesPrimaryAddons); put("usesPrimaryPlugins", profile.usesPrimaryPlugins)
        put("primaryAddonsAllowlist", profile.primaryAddonsAllowlist?.let { JsonArray(it.map(::JsonPrimitive)) } ?: JsonNull)
    }

    private fun JsonObject.has(key: String) = containsKey(key)
    private fun JsonObject.str(key: String): String = optionalStr(key) ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key is required")
    private fun JsonObject.int(key: String): Int = this[key]?.jsonPrimitive?.intOrNull ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be an integer")
    private fun JsonObject.bool(key: String): Boolean = optionalBool(key) ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be a boolean")
    private fun JsonObject.optionalBool(key: String): Boolean? = this[key]?.takeUnless { it == JsonNull }?.jsonPrimitive?.booleanOrNull
    private fun JsonObject.optionalStr(key: String): String? = this[key]?.takeUnless { it == JsonNull }?.jsonPrimitive?.contentOrNull
    private fun JsonObject.optionalStringList(key: String): List<String>? = when (val value = this[key]) {
        null, JsonNull -> null
        is JsonArray -> value.map { it.jsonPrimitive.content }
        else -> throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be an array of strings")
    }
    private fun kotlinx.serialization.json.JsonObjectBuilder.putNullable(key: String, value: String?) { put(key, value?.let(::JsonPrimitive) ?: JsonNull) }
}
