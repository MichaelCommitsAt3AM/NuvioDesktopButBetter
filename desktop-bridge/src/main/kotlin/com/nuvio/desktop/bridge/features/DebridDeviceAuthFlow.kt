package com.nuvio.desktop.bridge.features

import com.nuvio.app.features.debrid.*
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/** Keeps device codes in Kotlin and shares the Compose dialog's pending-session storage. */
internal class DebridDeviceAuthFlow(
    private val apiFor: (String) -> DebridProviderApi? = DebridProviderApis::apiFor,
    private val load: (String) -> String? = DebridSettingsStorage::loadPendingDeviceAuthorization,
    private val save: (String, String) -> Unit = DebridSettingsStorage::savePendingDeviceAuthorization,
    private val clear: (String) -> Unit = DebridSettingsStorage::clearPendingDeviceAuthorization,
    private val connect: (String, String) -> Unit = DebridSettingsRepository::setProviderApiKey,
    private val profileId: () -> Int = { com.nuvio.app.features.profiles.ProfileRepository.activeProfileId },
    private val now: () -> Long = { kotlin.time.Clock.System.now().toEpochMilliseconds() },
) {
    private data class Pending(val authorization: DebridDeviceAuthorization, var nextPoll: Long, val deadline: Long)
    private val sessions = mutableMapOf<String, Pending>()
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private var sessionProfileId = profileId()
    private fun requireProfile(expected: Int) {
        if (profileId() != expected) throw CancellationException("Sign-in profile changed")
    }
    private fun selectScope() {
        if (sessionProfileId != profileId()) { reset(); sessionProfileId = profileId() }
    }
    fun reset() { sessions.clear() }
    fun cancel(providerId: String) { selectScope(); sessions.remove(providerId); clear(providerId) }
    fun nextPoll(providerId: String): Long? { selectScope(); return sessions[providerId]?.nextPoll }

    suspend fun start(providerId: String, restart: Boolean = false): DebridDeviceAuthorization {
        selectScope()
        val expectedProfile = sessionProfileId
        if (restart) cancel(providerId)
        sessions[providerId]?.let { return it.authorization }
        val cached = load(providerId)?.let { runCatching { json.decodeFromString<DebridDeviceAuthorization>(it) }.getOrNull() }
            ?.takeIf { it.providerId == providerId && it.deviceCode.isNotBlank() && it.userCode.isNotBlank() }
        val authorization = cached ?: try { apiFor(providerId)?.startDeviceAuthorization("Nuvio") }
        catch (error: CancellationException) { throw error }
        catch (error: Exception) {
            val code = if (error.message?.contains("PREMIUMIZE_CLIENT_ID") == true) "DEVICE_AUTH_NOT_CONFIGURED" else "DEVICE_AUTH_START_FAILED"
            throw BridgeFeatureException(code, "Could not start sign-in.")
        } ?: throw BridgeFeatureException("DEVICE_AUTH_START_FAILED", "Could not start sign-in.")
        if (authorization.providerId != providerId || authorization.deviceCode.isBlank() || authorization.userCode.isBlank()) {
            throw BridgeFeatureException("DEVICE_AUTH_INVALID_RESPONSE", "Invalid authorization response")
        }
        requireProfile(expectedProfile)
        save(providerId, json.encodeToString(authorization))
        val time = now()
        sessions[providerId] = Pending(authorization, time + authorization.intervalSeconds.coerceAtLeast(1) * 1000L, time + 15 * 60_000L)
        return authorization
    }

    suspend fun poll(providerId: String): String {
        selectScope()
        val expectedProfile = sessionProfileId
        val pending = sessions[providerId] ?: throw BridgeFeatureException("DEVICE_AUTH_NOT_FOUND", "No pending sign-in")
        val time = now()
        if (time < pending.nextPoll) return "pending"
        pending.nextPoll = time + pending.authorization.intervalSeconds.coerceAtLeast(1) * 1000L
        val result = try { apiFor(providerId)?.redeemDeviceAuthorization(pending.authorization.deviceCode) ?: DebridDeviceAuthorizationTokenResult.Unsupported }
        catch (error: CancellationException) { throw error }
        catch (_: Exception) {
            requireProfile(expectedProfile)
            if (time < pending.deadline) return "pending"
            cancel(providerId)
            return "failed"
        }
        requireProfile(expectedProfile)
        return when (result) {
            is DebridDeviceAuthorizationTokenResult.Authorized -> {
                if (result.accessToken.isBlank()) { cancel(providerId); return "failed" }
                connect(providerId, result.accessToken)
                cancel(providerId)
                "authorized"
            }
            DebridDeviceAuthorizationTokenResult.Pending -> "pending"
            DebridDeviceAuthorizationTokenResult.Expired -> { cancel(providerId); "expired" }
            else -> { cancel(providerId); "failed" }
        }
    }
}
