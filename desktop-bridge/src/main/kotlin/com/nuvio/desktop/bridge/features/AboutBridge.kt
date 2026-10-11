package com.nuvio.desktop.bridge.features

import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.core.build.AppVersionPolicy
import com.nuvio.app.core.build.AppFeaturePolicy
import com.nuvio.app.features.membership.MembershipOverviewRepository
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.settings.AppLanguage
import com.nuvio.app.features.settings.CommunityConfig
import com.nuvio.app.features.settings.DiscordRichPresenceRepository
import com.nuvio.app.features.settings.DesktopRendererSettings
import com.nuvio.app.features.settings.SentrySettingsRepository
import com.nuvio.app.features.settings.SupportersContributorsRepository
import com.nuvio.app.features.settings.ThemeSettingsRepository
import com.nuvio.app.features.updater.AppUpdaterPlatform
import com.nuvio.app.features.updater.AppUpdaterRepository
import com.nuvio.app.features.updater.UpdateChannel
import com.nuvio.app.features.updater.VersionUtils
import com.nuvio.app.features.watchprogress.ContinueWatchingEnrichmentCache
import com.nuvio.app.features.watchprogress.WatchProgressRepository
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.jetbrains.compose.resources.getString

/** Thin bridge over existing settings and account repositories. Update calls intentionally preview only. */
object AboutBridge {
    suspend fun dispatch(method: String, params: JsonObject): JsonElement? = when (method) {
        "about.snapshot" -> snapshot()
        "about.refreshCommunity" -> refreshCommunity(params.string("kind"))
        "about.refreshMembership" -> refreshMembership()
        "about.setLanguage" -> setLanguage(params.string("language"))
        "about.checkUpdates" -> checkUpdates()
        "advanced.snapshot" -> advancedSnapshot()
        "advanced.clearContinueWatchingCache" -> clearContinueWatchingCache()
        "advanced.setSentry" -> setSentry(params.boolean("enabled"))
        "advanced.setDiscordPresence" -> setDiscordPresence(params.boolean("enabled"))
        "advanced.setOpenGlRenderer" -> setOpenGlRenderer(params.boolean("enabled"))
        else -> null
    }

    suspend fun snapshot(): JsonObject {
        ThemeSettingsRepository.ensureLoaded()
        MembershipOverviewRepository.ensureStarted()
        val auth = AuthRepository.state.value
        val membership = MembershipOverviewRepository.state.value
        val updaterChannel = updateChannel()
        val languages = AppLanguage.entries.map { language -> language.code to getString(language.labelRes) }
        return buildJsonObject {
            put("versionCode", AppVersionPolicy.displayVersionCode)
            putNullable("basedOnVersion", AppVersionPolicy.basedOnVersionName)
            put("account", buildJsonObject {
                when (auth) {
                    is AuthState.Authenticated -> {
                        put("status", if (auth.isAnonymous) "guest" else "signedIn")
                        putNullable("email", auth.email)
                        put("anonymous", auth.isAnonymous)
                    }
                    AuthState.Loading -> { put("status", "loading"); put("anonymous", false); put("email", JsonNull) }
                    AuthState.Unauthenticated -> { put("status", "signedOut"); put("anonymous", false); put("email", JsonNull) }
                }
            })
            put("language", ThemeSettingsRepository.selectedAppLanguage.value.code)
            putJsonArray("languages") {
                languages.forEach { (code, label) ->
                    add(buildJsonObject {
                        put("code", code)
                        put("label", label)
                    })
                }
            }
            put("membership", buildJsonObject {
                put("loading", membership.isLoading)
                put("refreshing", membership.isRefreshing)
                putNullable("error", membership.errorMessage)
                membership.overview?.let { overview ->
                    put("status", overview.status); putNullable("tier", overview.tier?.name)
                    put("active", overview.active); put("providerConnected", overview.providerConnected)
                    put("hasSubscription", overview.hasSubscription); put("subscriptionActive", overview.subscriptionActive)
                    putNullable("subscriptionStatus", overview.subscriptionStatus); putNullable("billingProvider", overview.billingProvider)
                    putNullable("supporterSince", overview.supporterSince); putNullable("currentPeriodEnd", overview.currentPeriodEnd)
                    put("cancelsAtPeriodEnd", overview.cancelsAtPeriodEnd); put("hasActiveGrant", overview.hasActiveGrant)
                    put("grantIsLifetime", overview.grantIsLifetime); putNullable("grantExpiresAt", overview.grantExpiresAt)
                    putNullable("grantKind", overview.grantKind); putNullable("grantTier", overview.grantTier?.name)
                    putNullable("grantSource", overview.grantSource)
                }
            })
            put("community", buildJsonObject {
                put("supportersEnabled", AppFeaturePolicy.supportersContributorsPageEnabled)
                put("donationActionsEnabled", AppFeaturePolicy.donationActionsEnabled)
                put("donationProgressEnabled", AppFeaturePolicy.donationProgressEnabled)
                put("donateUrl", CommunityConfig.DONATIONS_DONATE_URL.trim().removeSuffix("/"))
                put("membershipUrl", "https://www.patreon.com/settings/memberships")
                put("donationsConfigured", CommunityConfig.DONATIONS_BASE_URL.trim().isNotBlank())
            })
            put("updater", updaterSnapshot(updaterChannel))
        }
    }

    suspend fun refreshCommunity(kind: String): JsonObject = when (kind) {
        "contributors" -> {
            val contributors = SupportersContributorsRepository.getContributors().getOrThrow()
            buildJsonObject {
                put("kind", kind)
                putJsonArray("items") { contributors.forEach { item -> add(buildJsonObject {
                    put("login", item.login); putNullable("avatarUrl", item.avatarUrl); putNullable("profileUrl", item.profileUrl); put("totalContributions", item.totalContributions)
                }) } }
            }
        }
        "supporters" -> {
            val result = SupportersContributorsRepository.getSupporters().getOrThrow()
            buildJsonObject {
                put("kind", kind)
                putJsonArray("items") { result.supporters.forEach { item -> add(buildJsonObject {
                    put("key", item.key); put("name", item.name); putNullable("avatarUrl", item.avatarUrl); put("membershipLevel", item.membershipLevel); putNullable("supporterSince", item.supporterSince)
                }) } }
                put("donationProgress", result.progress?.let { progress -> buildJsonObject { put("progressPercent", progress.progressPercent) } } ?: JsonNull)
            }
        }
        else -> throw BridgeFeatureException("INVALID_ARGUMENT", "kind must be contributors or supporters")
    }

    fun refreshMembership(): JsonObject {
        MembershipOverviewRepository.refresh()
        return buildJsonObject { put("accepted", true) }
    }

    fun setLanguage(language: String): JsonObject {
        val selected = AppLanguage.fromCode(language)
        if (!AppLanguage.entries.any { it == selected && it.code.equals(language, ignoreCase = true) }) {
            throw BridgeFeatureException("INVALID_ARGUMENT", "Unknown language")
        }
        ThemeSettingsRepository.setAppLanguage(selected)
        return buildJsonObject { put("language", selected.code) }
    }

    suspend fun checkUpdates(): JsonObject {
        val channel = updateChannel()
        if (!AppFeaturePolicy.inAppUpdaterEnabled || !AppUpdaterPlatform.isSupported) {
            return buildJsonObject { put("supported", false); put("currentVersion", AppUpdaterPlatform.currentVersionName); put("channel", channel.storedValue) }
        }
        return try {
            val update = AppUpdaterRepository.getLatestChannelUpdate(channel).getOrThrow()
            buildJsonObject {
                put("supported", true); put("checked", true); put("currentVersion", AppUpdaterPlatform.currentVersionName)
                put("tag", update.tag); put("title", update.title); put("notes", update.notes)
                putNullable("releaseUrl", update.releaseUrl)
                put("assetName", update.assetName); putNullable("assetSizeBytes", update.assetSizeBytes)
                put("newerAvailable", VersionUtils.isRemoteNewer(update.tag, AppUpdaterPlatform.currentVersionName))
                put("channel", channel.storedValue)
                put("installSupportedInThisUI", false)
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            buildJsonObject { put("supported", true); put("checked", false); put("currentVersion", AppUpdaterPlatform.currentVersionName); put("channel", channel.storedValue); put("error", error.message ?: "Could not check releases") }
        }
    }

    fun advancedSnapshot(): JsonObject {
        SentrySettingsRepository.ensureLoaded()
        DiscordRichPresenceRepository.ensureLoaded()
        return buildJsonObject {
            put("sentrySupported", SentrySettingsRepository.isSupported)
            put("sentryEnabled", SentrySettingsRepository.enabled.value)
            put("discordSupported", DiscordRichPresenceRepository.isSupported)
            put("discordPresenceEnabled", DiscordRichPresenceRepository.enabled.value)
            put("continueWatchingCacheClearSupported", true)
            put("rendererPreferenceSupportedInThisUi", DesktopRendererSettings.isSupported)
            put("rendererPreferenceEnabled", DesktopRendererSettings.useOpenGl)
            put("rendererExternallyControlled", DesktopRendererSettings.isExternallyControlled)
        }
    }

    suspend fun clearContinueWatchingCache(): JsonObject {
        val profileId = ProfileRepository.activeProfileId
        ContinueWatchingEnrichmentCache.clearAll(profileId)
        WatchProgressRepository.clearLocalAndForceSnapshotRefreshFromServer(profileId)
        return buildJsonObject { put("cleared", true); put("profileId", profileId) }
    }

    fun setSentry(enabled: Boolean): JsonObject {
        if (!SentrySettingsRepository.isSupported) throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", "Crash reporting is unavailable")
        SentrySettingsRepository.setEnabled(enabled)
        return advancedSnapshot()
    }

    fun setDiscordPresence(enabled: Boolean): JsonObject {
        if (!DiscordRichPresenceRepository.isSupported) throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", "Discord Rich Presence is unavailable")
        DiscordRichPresenceRepository.setEnabled(enabled)
        return advancedSnapshot()
    }

    fun setOpenGlRenderer(enabled: Boolean): JsonObject {
        if (!DesktopRendererSettings.isSupported) throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", "OpenGL renderer selection is only available on supported Windows devices")
        if (DesktopRendererSettings.isExternallyControlled) throw BridgeFeatureException("SETTING_EXTERNALLY_CONTROLLED", "The renderer is controlled by SKIKO_RENDER_API or skiko.renderApi")
        DesktopRendererSettings.setUseOpenGl(enabled)
        return advancedSnapshot()
    }

    private fun updateChannel(): UpdateChannel = if (AppUpdaterPlatform.hasSingleUpdateChannel) {
        UpdateChannel.ALL_RELEASES
    } else {
        UpdateChannel.fromStoredValue(AppUpdaterPlatform.getUpdateChannel()) ?: UpdateChannel.defaultForVersion(AppUpdaterPlatform.currentVersionName)
    }

    private fun updaterSnapshot(channel: UpdateChannel) = buildJsonObject {
        put("supported", AppFeaturePolicy.inAppUpdaterEnabled && AppUpdaterPlatform.isSupported)
        put("currentVersion", AppUpdaterPlatform.currentVersionName)
        put("channel", channel.storedValue)
        put("singleChannel", AppUpdaterPlatform.hasSingleUpdateChannel)
        put("releaseUrl", "https://github.com/${AppUpdaterPlatform.releaseSource.owner}/${AppUpdaterPlatform.releaseSource.repo}/releases")
        put("installSupportedInThisUi", false)
    }

    private fun JsonObjectBuilder.putNullable(key: String, value: String?) {
        put(key, value?.let(::JsonPrimitive) ?: JsonNull)
    }
    private fun JsonObjectBuilder.putNullable(key: String, value: Long?) {
        put(key, value?.let(::JsonPrimitive) ?: JsonNull)
    }

    private fun JsonObject.string(key: String): String = this[key]?.let { (it as? JsonPrimitive)?.content }
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key is required")
    private fun JsonObject.boolean(key: String): Boolean = this[key]?.let { (it as? JsonPrimitive)?.booleanOrNull }
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be a boolean")
}
