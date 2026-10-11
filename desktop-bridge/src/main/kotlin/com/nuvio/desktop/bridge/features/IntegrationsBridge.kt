package com.nuvio.desktop.bridge.features

import com.nuvio.app.core.build.AppFeaturePolicy
import com.nuvio.app.features.debrid.DebridDeviceAuthorization
import com.nuvio.app.features.debrid.DebridDeviceAuthorizationTokenResult
import com.nuvio.app.features.debrid.DebridProviderApi
import com.nuvio.app.features.debrid.DebridProviderApis
import com.nuvio.app.features.debrid.DebridProviders
import com.nuvio.app.features.debrid.DebridSettingsRepository
import com.nuvio.app.features.debrid.DebridStreamCodecFilter
import com.nuvio.app.features.debrid.DebridStreamFeatureFilter
import com.nuvio.app.features.debrid.DebridStreamMinimumQuality
import com.nuvio.app.features.debrid.DebridStreamPreferences
import com.nuvio.app.features.debrid.DebridStreamSortMode
import com.nuvio.app.features.library.LibrarySourceMode
import com.nuvio.app.features.mdblist.MdbListDevicePollResult
import com.nuvio.app.features.mdblist.MdbListSettingsRepository
import com.nuvio.app.features.mdblist.MdbListTracker
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.simkl.SimklAnimeIdPreference
import com.nuvio.app.features.simkl.SimklAuthRepository
import com.nuvio.app.features.simkl.SimklConnectionMode
import com.nuvio.app.features.simkl.SimklSyncRepository
import com.nuvio.app.features.tracking.TrackingProviderId
import com.nuvio.app.features.tracking.TrackingRefreshIntent
import com.nuvio.app.features.watchprogress.WatchProgressSourceCoordinator
import com.nuvio.app.features.tmdb.TmdbConfig
import com.nuvio.app.features.tmdb.TmdbSettingsRepository
import com.nuvio.app.features.tracking.TrackingSettingsRepository
import com.nuvio.app.features.tracking.WatchProgressSource
import com.nuvio.app.features.tracking.effectiveLibrarySourceMode
import com.nuvio.app.features.tracking.effectiveWatchProgressSource
import com.nuvio.app.features.trakt.MoreLikeThisSourcePreference
import com.nuvio.app.features.settings.effectiveTrackingRecommendationsSource
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/** Settings and account authorization adapter backed by the existing provider repositories. */
object IntegrationsBridge {
    private data class DebridPending(val authorization: DebridDeviceAuthorization, var nextPollAtEpochMs: Long)
    private val debridSessions = mutableMapOf<String, DebridPending>()
    private val json = Json { ignoreUnknownKeys = false; encodeDefaults = true }

    /** Clears ephemeral authorization material without disconnecting saved provider accounts. */
    fun reset() {
        debridSessions.clear()
        runCatching {
            MdbListTracker.ensureLoaded()
            if (MdbListTracker.auth.state.value.session != null) MdbListTracker.account.cancel()
        }
        val simkl = runCatching { SimklAuthRepository.snapshot() }.getOrNull()
        if (simkl?.mode == SimklConnectionMode.AWAITING_APPROVAL) {
            // Simkl's existing disconnect request also cancels/clears its pending PIN flow.
            // This branch is pending-only; a connected account and its access token are preserved.
            SimklAuthRepository.onDisconnectRequested()
        }
    }

    suspend fun dispatch(method: String, params: JsonObject): JsonElement? = when (method) {
        "integrations.snapshot" -> snapshot()
        "tmdb.snapshot" -> tmdbSnapshot()
        "tmdb.set" -> setTmdb(params)
        "mdblist.snapshot" -> mdbSnapshot()
        "mdblist.set" -> setMdb(params)
        "mdblist.setProviderEnabled" -> setMdbProvider(params)
        "mdblist.connect" -> connectMdb()
        "mdblist.cancel" -> cancelMdb()
        "mdblist.disconnect" -> disconnectMdb()
        "mdblist.poll" -> pollMdb()
        "debrid.snapshot" -> debridSnapshot()
        "debrid.set" -> setDebrid(params)
        "debrid.device.start" -> startDebridDevice(params)
        "debrid.device.poll" -> pollDebridDevice(params)
        "debrid.device.cancel" -> cancelDebridDevice(params)
        "debrid.validateKey" -> validateDebridKey(params)
        "simkl.snapshot" -> simklSnapshot()
        "simkl.connect" -> connectSimkl()
        "simkl.disconnect" -> disconnectSimkl()
        "simkl.sync" -> syncSimkl()
        "trackingSettings.snapshot" -> trackingSnapshot()
        "trackingSettings.set" -> setTracking(params)
        else -> null
    }

    fun snapshot(): JsonObject {
        return buildJsonObject {
            put("tmdb", tmdbSnapshot())
            put("mdblist", mdbSnapshot())
            put("debrid", debridSnapshot())
            put("imdb", imdbSnapshot())
            put("simkl", simklSnapshot())
            put("tracking", trackingSnapshot())
        }
    }

    fun tmdbSnapshot(): JsonObject {
        val settings = TmdbSettingsRepository.snapshot()
        return buildJsonObject {
            put("enabled", settings.enabled)
            put("hasApiKey", settings.hasApiKey)
            put("hasEffectiveApiKey", settings.hasApiKey || TmdbConfig.API_KEY.isNotBlank())
            put("language", settings.language)
            put("useTrailers", settings.useTrailers); put("useArtwork", settings.useArtwork)
            put("useBasicInfo", settings.useBasicInfo); put("useDetails", settings.useDetails)
            put("useCredits", settings.useCredits); put("useProductions", settings.useProductions)
            put("useNetworks", settings.useNetworks); put("useEpisodes", settings.useEpisodes)
            put("useSeasonPosters", settings.useSeasonPosters); put("useMoreLikeThis", settings.useMoreLikeThis)
            put("useCollections", settings.useCollections)
        }
    }

    private fun setTmdb(params: JsonObject): JsonObject {
        val key = params.str("key")
        val value = params.value()
        when (key) {
            "enabled" -> TmdbSettingsRepository.setEnabled(value.asBool(key))
            "apiKey" -> {
                val apiKey = value.asString(key)
                if (apiKey.length > 512) invalid(key)
                TmdbSettingsRepository.setApiKey(apiKey)
            }
            "language" -> {
                val language = value.asString(key).trim()
                if (language.length > 35 || language.any { !(it in 'a'..'z' || it in 'A'..'Z' || it in '0'..'9' || it == '-') }) invalid(key)
                TmdbSettingsRepository.setLanguage(language)
            }
            "useTrailers" -> TmdbSettingsRepository.setUseTrailers(value.asBool(key))
            "useArtwork" -> TmdbSettingsRepository.setUseArtwork(value.asBool(key))
            "useBasicInfo" -> TmdbSettingsRepository.setUseBasicInfo(value.asBool(key))
            "useDetails" -> TmdbSettingsRepository.setUseDetails(value.asBool(key))
            "useCredits" -> TmdbSettingsRepository.setUseCredits(value.asBool(key))
            "useProductions" -> TmdbSettingsRepository.setUseProductions(value.asBool(key))
            "useNetworks" -> TmdbSettingsRepository.setUseNetworks(value.asBool(key))
            "useEpisodes" -> TmdbSettingsRepository.setUseEpisodes(value.asBool(key))
            "useSeasonPosters" -> TmdbSettingsRepository.setUseSeasonPosters(value.asBool(key))
            "useMoreLikeThis" -> TmdbSettingsRepository.setUseMoreLikeThis(value.asBool(key))
            "useCollections" -> TmdbSettingsRepository.setUseCollections(value.asBool(key))
            else -> throw BridgeFeatureException("UNKNOWN_SETTING", "Unknown TMDB setting: $key")
        }
        return tmdbSnapshot()
    }

    fun mdbSnapshot(): JsonObject {
        MdbListSettingsRepository.ensureLoaded()
        MdbListTracker.ensureLoaded()
        val settings = MdbListSettingsRepository.snapshot()
        val auth = MdbListTracker.auth.state.value
        val status = MdbListTracker.account.status.value
        return buildJsonObject {
            put("enabled", settings.enabled); put("hasApiKey", settings.hasApiKey)
            put("hasAccount", auth.isAuthenticated); put("hasCredentials", settings.hasCredentials); put("isActive", settings.isActive)
            put("useImdb", settings.useImdb); put("useTmdb", settings.useTmdb); put("useTomatoes", settings.useTomatoes)
            put("useMetacritic", settings.useMetacritic); put("useTrakt", settings.useTrakt); put("useLetterboxd", settings.useLetterboxd)
            put("useAudience", settings.useAudience); put("useMal", settings.useMal)
            put("account", buildJsonObject {
                put("connected", auth.isAuthenticated)
                putNullable("username", auth.user?.username)
                putNullable("userId", auth.user?.id?.toString())
                put("isSupporter", auth.user?.isSupporter ?: false)
                putNullable("mode", if (auth.isAuthenticated) "connected" else if (auth.session != null) "awaiting_approval" else "disconnected")
                putNullable("userCode", auth.session?.userCode)
                putNullable("verificationUrl", auth.session?.verificationUri)
                putNullable("verificationUrlComplete", auth.session?.verificationUriComplete)
                putNullable("expiresAtEpochMs", auth.session?.expiresAtEpochMs)
                put("pollIntervalSeconds", auth.session?.intervalSeconds ?: 0)
                put("isBusy", status.isBusy)
                putNullable("error", status.authError?.name ?: status.error?.name)
                put("revokeFailed", status.revokeFailed)
            })
        }
    }

    private fun setMdb(params: JsonObject): JsonObject {
        val key = params.str("key")
        val value = params.value()
        when (key) {
            "enabled" -> MdbListSettingsRepository.setEnabled(value.asBool(key))
            "apiKey" -> {
                val apiKey = value.asString(key)
                if (apiKey.length > 2_048) invalid(key)
                MdbListSettingsRepository.setApiKey(apiKey)
            }
            else -> throw BridgeFeatureException("UNKNOWN_SETTING", "Unknown MDBList setting: $key")
        }
        return mdbSnapshot()
    }

    private fun setMdbProvider(params: JsonObject): JsonObject {
        val providerId = params.str("providerId")
        if (providerId !in MDB_PROVIDER_IDS) invalid("providerId")
        MdbListSettingsRepository.setProviderEnabled(providerId, params.bool("enabled"))
        return mdbSnapshot()
    }

    private suspend fun connectMdb(): JsonObject {
        MdbListTracker.ensureLoaded()
        MdbListSettingsRepository.ensureLoaded()
        val verificationUrl = MdbListTracker.account.connect()
        val state = MdbListTracker.auth.state.value
        val status = MdbListTracker.account.status.value
        if (verificationUrl.isNullOrBlank() && !state.isAuthenticated && state.session == null) {
            throw BridgeFeatureException(status.authError?.name ?: "MDBLIST_AUTH_FAILED", "MDBList device authorization could not be started")
        }
        return buildJsonObject {
            put("snapshot", mdbSnapshot())
            putNullable("verificationUrl", verificationUrl)
        }
    }

    private fun cancelMdb(): JsonObject {
        MdbListTracker.ensureLoaded()
        MdbListTracker.account.cancel()
        return mdbSnapshot()
    }

    private suspend fun disconnectMdb(): JsonObject {
        MdbListTracker.ensureLoaded()
        MdbListTracker.account.disconnect()
        val status = MdbListTracker.account.status.value
        return buildJsonObject {
            put("snapshot", mdbSnapshot())
            put("revokeFailed", status.revokeFailed)
        }
    }

    private fun pollMdb(): JsonObject {
        MdbListTracker.ensureLoaded()
        MdbListTracker.account.resumePolling()
        return mdbSnapshot()
    }

    fun debridSnapshot(): JsonObject {
        val settings = DebridSettingsRepository.snapshot()
        return buildJsonObject {
            put("enabled", settings.enabled); put("cloudLibraryEnabled", settings.cloudLibraryEnabled)
            put("hasAnyApiKey", settings.hasAnyApiKey); put("hasResolverProvider", settings.hasResolverProvider)
            put("canResolvePlayableLinks", settings.canResolvePlayableLinks); put("hasCloudLibraryProvider", settings.hasCloudLibraryProvider)
            put("preferredResolverProviderId", settings.preferredResolverProviderId)
            put("instantPlaybackPreparationLimit", settings.instantPlaybackPreparationLimit)
            put("streamMaxResults", settings.streamMaxResults)
            put("streamSortMode", settings.streamSortMode.name); put("streamMinimumQuality", settings.streamMinimumQuality.name)
            put("streamDolbyVisionFilter", settings.streamDolbyVisionFilter.name); put("streamHdrFilter", settings.streamHdrFilter.name)
            put("streamCodecFilter", settings.streamCodecFilter.name)
            put("streamNameTemplate", settings.streamNameTemplate); put("streamDescriptionTemplate", settings.streamDescriptionTemplate)
            put("providers", JsonArray(DebridProviders.visible().map { provider -> buildJsonObject {
                put("id", provider.id); put("displayName", provider.displayName); put("shortName", provider.shortName)
                put("authMethod", provider.authMethod.name); put("hasApiKey", settings.apiKeyFor(provider.id).isNotBlank())
                put("configured", settings.apiKeyFor(provider.id).isNotBlank())
                put("supportsCloudLibrary", provider.capabilities.any { it.name == "CloudLibrary" })
            } }))
            put("streamPreferences", json.encodeToJsonElement(DebridStreamPreferences.serializer(), settings.streamPreferences))
            put("limits", buildJsonObject {
                put("instantPlaybackMin", 0); put("instantPlaybackMax", 5)
                put("streamMaxResultsMin", 0); put("streamMaxResultsMax", 100)
            })
        }
    }

    private fun setDebrid(params: JsonObject): JsonObject {
        val key = params.str("key")
        val value = params.value()
        when (key) {
            "enabled" -> {
                val enabled = value.asBool(key)
                DebridSettingsRepository.setEnabled(enabled)
                if (DebridSettingsRepository.snapshot().enabled != enabled) throw BridgeFeatureException("DEBRID_PROVIDER_REQUIRED", "Configure a resolver provider before enabling debrid playback")
            }
            "cloudLibraryEnabled" -> {
                val enabled = value.asBool(key)
                DebridSettingsRepository.setCloudLibraryEnabled(enabled)
                if (DebridSettingsRepository.snapshot().cloudLibraryEnabled != enabled) throw BridgeFeatureException("DEBRID_PROVIDER_REQUIRED", "Configure a cloud-library provider before enabling this setting")
            }
            "providerApiKey" -> {
                val providerId = params.str("providerId")
                visibleDebridProvider(providerId)
                val apiKey = value.asString(key)
                if (apiKey.length > 4_096) invalid(key)
                DebridSettingsRepository.setProviderApiKey(providerId, apiKey)
            }
            "preferredResolverProviderId" -> {
                val providerId = value.asString(key)
                visibleDebridProvider(providerId)
                DebridSettingsRepository.setPreferredResolverProviderId(providerId)
                if (DebridSettingsRepository.snapshot().preferredResolverProviderId != providerId) invalid(key)
            }
            "instantPlaybackPreparationLimit" -> {
                val limit = value.asInt(key)
                if (limit !in 0..5) invalid(key)
                DebridSettingsRepository.setInstantPlaybackPreparationLimit(limit)
            }
            "streamMaxResults" -> {
                val max = value.asInt(key)
                if (max !in 0..100) invalid(key)
                DebridSettingsRepository.setStreamMaxResults(max)
            }
            "streamSortMode" -> DebridSettingsRepository.setStreamSortMode(enumValue(value.asString(key)))
            "streamMinimumQuality" -> DebridSettingsRepository.setStreamMinimumQuality(enumValue(value.asString(key)))
            "streamDolbyVisionFilter" -> DebridSettingsRepository.setStreamDolbyVisionFilter(enumValue(value.asString(key)))
            "streamHdrFilter" -> DebridSettingsRepository.setStreamHdrFilter(enumValue(value.asString(key)))
            "streamCodecFilter" -> DebridSettingsRepository.setStreamCodecFilter(enumValue<DebridStreamCodecFilter>(value.asString(key)))
            "streamPreferences" -> {
                val preferences = try { json.decodeFromJsonElement<DebridStreamPreferences>(value) } catch (_: Exception) { invalid(key) }
                DebridSettingsRepository.setStreamPreferences(preferences)
            }
            "streamNameTemplate" -> DebridSettingsRepository.setStreamNameTemplate(value.asString(key))
            "streamDescriptionTemplate" -> DebridSettingsRepository.setStreamDescriptionTemplate(value.asString(key))
            "resetStreamTemplates" -> {
                if (value.asBool(key)) DebridSettingsRepository.resetStreamTemplates()
            }
            else -> throw BridgeFeatureException("UNKNOWN_SETTING", "Unknown debrid setting: $key")
        }
        return debridSnapshot()
    }

    private suspend fun startDebridDevice(params: JsonObject): JsonObject {
        val provider = visibleDebridProvider(params.str("providerId"))
        if (provider.authMethod.name != "DeviceCode") throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", "This provider uses an API key")
        if (DebridSettingsRepository.snapshot().apiKeyFor(provider.id).isNotBlank()) throw BridgeFeatureException("ALREADY_CONNECTED", "Disconnect this provider before starting device authorization")
        val api = DebridProviderApis.apiFor(provider.id) ?: throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", "This provider is unavailable")
        val authorization = try { api.startDeviceAuthorization("Nuvio") } catch (error: CancellationException) { throw error } catch (error: Exception) {
            throw BridgeFeatureException("DEVICE_AUTH_START_FAILED", "Could not start provider authorization")
        } ?: throw BridgeFeatureException("DEVICE_AUTH_START_FAILED", "Provider did not return a device authorization code")
        if (authorization.providerId != provider.id || authorization.deviceCode.isBlank() || authorization.userCode.isBlank()) {
            throw BridgeFeatureException("DEVICE_AUTH_INVALID_RESPONSE", "Provider returned an invalid device authorization response")
        }
        val now = kotlin.time.Clock.System.now().toEpochMilliseconds()
        debridSessions[provider.id] = DebridPending(authorization, now + authorization.intervalSeconds * 1_000L)
        return safeDebridAuthorization(authorization, now + authorization.intervalSeconds * 1_000L)
    }

    private suspend fun pollDebridDevice(params: JsonObject): JsonObject {
        val provider = visibleDebridProvider(params.str("providerId"))
        val pending = debridSessions[provider.id] ?: throw BridgeFeatureException("DEVICE_AUTH_NOT_FOUND", "No pending device authorization exists for this provider")
        val now = kotlin.time.Clock.System.now().toEpochMilliseconds()
        if (now < pending.nextPollAtEpochMs) return devicePollResult("pending", provider.id, pending.nextPollAtEpochMs)
        val api = DebridProviderApis.apiFor(provider.id) ?: throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", "This provider is unavailable")
        val result = try { api.redeemDeviceAuthorization(pending.authorization.deviceCode) } catch (error: CancellationException) { throw error } catch (error: Exception) {
            throw BridgeFeatureException("DEVICE_AUTH_POLL_FAILED", "Provider authorization check failed")
        }
        return when (result) {
            is DebridDeviceAuthorizationTokenResult.Authorized -> {
                if (result.accessToken.isBlank()) throw BridgeFeatureException("DEVICE_AUTH_INVALID_RESPONSE", "Provider returned an empty credential")
                DebridSettingsRepository.setProviderApiKey(provider.id, result.accessToken)
                debridSessions.remove(provider.id)
                buildJsonObject { put("status", "authorized"); put("providerId", provider.id); put("snapshot", debridSnapshot()) }
            }
            DebridDeviceAuthorizationTokenResult.Pending -> {
                pending.nextPollAtEpochMs = now + pending.authorization.intervalSeconds * 1_000L
                devicePollResult("pending", provider.id, pending.nextPollAtEpochMs)
            }
            DebridDeviceAuthorizationTokenResult.Expired -> {
                debridSessions.remove(provider.id)
                devicePollResult("expired", provider.id, null)
            }
            DebridDeviceAuthorizationTokenResult.Unsupported -> throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", "This provider does not support device authorization")
            is DebridDeviceAuthorizationTokenResult.Failed -> throw BridgeFeatureException("DEVICE_AUTH_FAILED", "Provider authorization was denied")
        }
    }

    private fun cancelDebridDevice(params: JsonObject): JsonObject {
        val provider = visibleDebridProvider(params.str("providerId"))
        debridSessions.remove(provider.id)
        return buildJsonObject { put("status", "cancelled"); put("providerId", provider.id) }
    }

    private suspend fun validateDebridKey(params: JsonObject): JsonObject {
        val provider = visibleDebridProvider(params.str("providerId"))
        val apiKey = params.str("apiKey").trim()
        if (apiKey.isBlank() || apiKey.length > 4_096) invalid("apiKey")
        val api = DebridProviderApis.apiFor(provider.id) ?: throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", "This provider is unavailable")
        val valid = try { api.validateApiKey(apiKey) } catch (error: CancellationException) { throw error } catch (error: Exception) {
            throw BridgeFeatureException("CREDENTIAL_VALIDATION_FAILED", "Provider credential could not be validated")
        }
        return buildJsonObject { put("providerId", provider.id); put("valid", valid) }
    }

    fun simklSnapshot(): JsonObject {
        val state = SimklAuthRepository.snapshot()
        return buildJsonObject {
            put("mode", state.mode.name.lowercase()); put("connected", state.mode == SimklConnectionMode.CONNECTED)
            put("credentialsConfigured", state.credentialsConfigured); put("isLoading", state.isLoading); put("usesPinFlow", state.usesPinFlow)
            putNullable("username", state.username); putNullable("accountId", state.accountId?.toString())
            putNullable("tokenExpiresAtEpochMs", state.tokenExpiresAtEpochMs)
            putNullable("pendingAuthorizationStartedAtEpochMs", state.pendingAuthorizationStartedAtEpochMs)
            putNullable("pendingPinUserCode", state.pendingPinUserCode); putNullable("pendingPinVerificationUrl", state.pendingPinVerificationUrl)
            putNullable("pendingPinExpiresAtEpochMs", state.pendingPinExpiresAtEpochMs)
            putNullable("error", state.error?.name)
        }
    }

    private fun connectSimkl(): JsonObject {
        SimklAuthRepository.ensureLoaded()
        if (SimklAuthRepository.isAuthenticated.value) throw BridgeFeatureException("ALREADY_CONNECTED", "Simkl is already connected")
        val url = SimklAuthRepository.onConnectRequested()
        val state = simklSnapshot()
        if (url == null && !state["connected"].let { it?.jsonPrimitive?.booleanOrNull == true } && state["isLoading"]?.jsonPrimitive?.booleanOrNull != true) {
            throw BridgeFeatureException("SIMKL_AUTH_START_FAILED", state["error"]?.jsonPrimitive?.contentOrNull ?: "Simkl authorization could not be started")
        }
        return buildJsonObject { put("snapshot", state); putNullable("authorizationUrl", url) }
    }

    private suspend fun syncSimkl(): JsonObject {
        SimklAuthRepository.ensureLoaded()
        if (!SimklAuthRepository.isAuthenticated.value) {
            throw BridgeFeatureException("ACCOUNT_REQUIRED", "Connect Simkl before syncing your library")
        }
        SimklSyncRepository.ensureLoaded()
        val success = WatchProgressSourceCoordinator.refreshProviderAndActiveSource(
            profileId = ProfileRepository.activeProfileId,
            providerId = TrackingProviderId.SIMKL,
            refreshProvider = { SimklSyncRepository.refresh(TrackingRefreshIntent.USER_INITIATED) },
        )
        return buildJsonObject { put("success", success); put("simkl", simklSnapshot()) }
    }
    private fun disconnectSimkl(): JsonObject {
        SimklAuthRepository.onDisconnectRequested()
        return simklSnapshot()
    }

    fun trackingSnapshot(): JsonObject {
        TrackingSettingsRepository.ensureLoaded()
        val state = TrackingSettingsRepository.uiState.value
        MdbListTracker.ensureLoaded()
        SimklAuthRepository.ensureLoaded()
        val simklConnected = SimklAuthRepository.isAuthenticated.value
        val mdbConnected = MdbListTracker.isAuthenticated.value
        val effectiveLibrary = effectiveLibrarySourceMode(state.librarySourceMode) { id ->
            when (id.name) { "SIMKL" -> simklConnected; "MDBLIST" -> mdbConnected; else -> false }
        }
        val effectiveProgress = effectiveWatchProgressSource(state.watchProgressSource) { id ->
            when (id.name) { "SIMKL" -> simklConnected; "MDBLIST" -> mdbConnected; else -> false }
        }
        val effectiveMoreLikeThis = effectiveTrackingRecommendationsSource(state.moreLikeThisSource, traktConnected = false)
        return buildJsonObject {
            put("librarySourceMode", state.librarySourceMode.name); put("effectiveLibrarySourceMode", effectiveLibrary.name)
            put("watchProgressSource", state.watchProgressSource.name); put("effectiveWatchProgressSource", effectiveProgress.name)
            put("moreLikeThisSource", state.moreLikeThisSource.name); put("effectiveMoreLikeThisSource", effectiveMoreLikeThis.name)
            put("simklAnimeIdPreference", state.simklAnimeIdPreference.name)
            put("simklConnected", simklConnected); put("mdblistConnected", mdbConnected); put("traktAvailable", false)
        }
    }

    private fun setTracking(params: JsonObject): JsonObject {
        TrackingSettingsRepository.ensureLoaded()
        val key = params.str("key")
        val value = params.value()
        val simklConnected = SimklAuthRepository.snapshot().mode == SimklConnectionMode.CONNECTED
        val mdbConnected = MdbListTracker.isAuthenticated.value
        when (key) {
            "librarySourceMode" -> {
                val source = enumValue<LibrarySourceMode>(value.asString(key))
                requireTrackingProvider(source.name, source != LibrarySourceMode.LOCAL, simklConnected, mdbConnected)
                if (source == LibrarySourceMode.TRAKT) unsupported("Trakt tracking is disabled in this app build")
                TrackingSettingsRepository.setLibrarySourceMode(source)
            }
            "watchProgressSource" -> {
                val source = enumValue<WatchProgressSource>(value.asString(key))
                requireTrackingProvider(source.name, source != WatchProgressSource.NUVIO_SYNC, simklConnected, mdbConnected)
                if (source == WatchProgressSource.TRAKT) unsupported("Trakt tracking is disabled in this app build")
                TrackingSettingsRepository.setWatchProgressSource(source, ProfileRepository.activeProfileId)
            }
            "moreLikeThisSource" -> {
                val source = enumValue<MoreLikeThisSourcePreference>(value.asString(key))
                if (source == MoreLikeThisSourcePreference.TRAKT) unsupported("Trakt recommendations are disabled in this app build")
                if (source == MoreLikeThisSourcePreference.SIMKL && !simklConnected) throw BridgeFeatureException("ACCOUNT_REQUIRED", "Connect Simkl before choosing it as a recommendation source")
                TrackingSettingsRepository.setMoreLikeThisSource(source)
            }
            "simklAnimeIdPreference" -> {
                if (!simklConnected) throw BridgeFeatureException("ACCOUNT_REQUIRED", "Connect Simkl before changing anime ID preference")
                TrackingSettingsRepository.setSimklAnimeIdPreference(enumValue(value.asString(key)))
            }
            else -> throw BridgeFeatureException("UNKNOWN_SETTING", "Unknown tracking setting: $key")
        }
        return trackingSnapshot()
    }

    private fun requireTrackingProvider(name: String, external: Boolean, simklConnected: Boolean, mdbConnected: Boolean) {
        if (!external) return
        when (name) {
            "SIMKL" -> if (!simklConnected) throw BridgeFeatureException("ACCOUNT_REQUIRED", "Connect Simkl before selecting it as a data source")
            "MDBLIST" -> if (!mdbConnected) throw BridgeFeatureException("ACCOUNT_REQUIRED", "Connect an MDBList account before selecting it as a data source")
            "TRAKT" -> unsupported("Trakt tracking is disabled in this app build")
        }
    }

    private fun imdbSnapshot(): JsonObject = buildJsonObject {
        // IMDb episode ratings are fetched through the built-in public ratings APIs; there is no user API key or account repository.
        put("available", true); put("requiresAuthentication", false); put("requiresApiKey", false)
        put("features", JsonArray(listOf(JsonPrimitive("episodeRatings"), JsonPrimitive("parentalGuide"))))
    }

    private fun safeDebridAuthorization(auth: DebridDeviceAuthorization, nextPollAt: Long) = buildJsonObject {
        put("providerId", auth.providerId); put("userCode", auth.userCode)
        put("verificationUrl", auth.verificationUrl); put("friendlyVerificationUrl", auth.friendlyVerificationUrl)
        put("intervalSeconds", auth.intervalSeconds); putNullable("expiresAt", auth.expiresAt)
        put("nextPollAtEpochMs", nextPollAt)
    }

    private fun devicePollResult(status: String, providerId: String, nextPollAt: Long?) = buildJsonObject {
        put("status", status); put("providerId", providerId); putNullable("nextPollAtEpochMs", nextPollAt)
    }

    private fun visibleDebridProvider(value: String) = DebridProviders.byId(value)
        ?.takeIf { it.visibleInUi }
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "Unknown or unavailable debrid provider")

    private inline fun <reified T : Enum<T>> enumValue(value: String): T = enumValues<T>().firstOrNull { it.name.equals(value, true) }
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "Unknown ${T::class.simpleName}: $value")
    private fun unsupported(message: String): Nothing = throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", message)
    private fun invalid(key: String): Nothing = throw BridgeFeatureException("INVALID_ARGUMENT", "Invalid value for $key")
    private fun JsonObject.str(key: String): String = this[key]?.takeUnless { it == JsonNull }?.jsonPrimitive?.contentOrNull
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key is required")
    private fun JsonObject.value(): JsonElement = this["value"] ?: throw BridgeFeatureException("INVALID_ARGUMENT", "value is required")
    private fun JsonObject.bool(key: String): Boolean = this[key]?.jsonPrimitive?.booleanOrNull
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be a boolean")
    private fun JsonElement.asString(key: String): String = jsonPrimitive.contentOrNull
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be a string")
    private fun JsonElement.asBool(key: String): Boolean = jsonPrimitive.booleanOrNull
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be a boolean")
    private fun JsonElement.asInt(key: String): Int = jsonPrimitive.intOrNull
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be an integer")
    private fun kotlinx.serialization.json.JsonObjectBuilder.putNullable(key: String, value: String?) { put(key, value?.let(::JsonPrimitive) ?: JsonNull) }
    private fun kotlinx.serialization.json.JsonObjectBuilder.putNullable(key: String, value: Long?) { put(key, value?.let(::JsonPrimitive) ?: JsonNull) }

    private val MDB_PROVIDER_IDS = setOf("imdb", "tmdb", "tomatoes", "metacritic", "trakt", "letterboxd", "audience", "mal")
}
