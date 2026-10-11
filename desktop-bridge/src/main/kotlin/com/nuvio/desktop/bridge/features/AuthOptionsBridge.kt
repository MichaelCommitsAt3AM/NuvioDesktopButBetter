package com.nuvio.desktop.bridge.features

import com.nuvio.app.core.build.AppFeaturePolicy
import com.nuvio.app.core.network.ServerConfiguration
import com.nuvio.app.core.network.ServerConfigurationRepository
import com.nuvio.app.features.auth.ServerConnectionController
import com.nuvio.app.core.auth.DeviceLinkAuthRepository
import com.nuvio.app.core.auth.DeviceLinkAuthState
import kotlinx.serialization.json.*

object AuthOptionsBridge {
    fun dispatch(method: String, params: JsonObject): JsonElement? = when (method) {
        "authOptions.snapshot" -> snapshot()
        "authOptions.discoverServer" -> {
            require(AppFeaturePolicy.customServerConnectionsEnabled)
            ServerConnectionController.discover(params["url"]?.jsonPrimitive?.contentOrNull ?: error("URL required")); snapshot()
        }
        "authOptions.connectServer" -> { require(AppFeaturePolicy.customServerConnectionsEnabled); ServerConnectionController.connectDiscovered(); snapshot() }
        "authOptions.useOfficialServer" -> { require(AppFeaturePolicy.customServerConnectionsEnabled); ServerConnectionController.useOfficial(); snapshot() }
        "authOptions.resetDiscovery" -> { ServerConnectionController.resetDiscovery(); snapshot() }
        "authOptions.deviceStart" -> { require(ServerConfigurationRepository.active.value.capabilities.tvLogin); DeviceLinkAuthRepository.start(); snapshot() }
        "authOptions.deviceCancel" -> { DeviceLinkAuthRepository.cancel(); snapshot() }
        else -> null
    }
    fun snapshot(): JsonObject {
        val state = ServerConnectionController.state.value
        val device = DeviceLinkAuthRepository.state.value
        return buildJsonObject {
            put("customServersEnabled", AppFeaturePolicy.customServerConnectionsEnabled)
            put("active", serverJson(state.activeServer)); put("discovered", state.discoveredServer?.let(::serverJson) ?: JsonNull)
            put("discovering", state.isDiscovering); put("switching", state.isSwitching)
            put("error", (state.failure?.name ?: state.switchFailure?.name)?.let(::JsonPrimitive) ?: JsonNull)
            put("device", buildJsonObject {
                put("status", when(device) { DeviceLinkAuthState.Idle -> "idle"; DeviceLinkAuthState.Starting -> "starting"; is DeviceLinkAuthState.Waiting -> "waiting"; is DeviceLinkAuthState.Failed -> "failed" })
                if (device is DeviceLinkAuthState.Waiting) { put("code", device.code); put("verificationUrl", device.verificationUrl); put("completing", device.isCompleting) }
                if (device is DeviceLinkAuthState.Failed) put("error", device.reason.name)
            })
        }
    }
    private fun serverJson(server: ServerConfiguration) = buildJsonObject {
        put("url", server.backendUrl); put("custom", server.isCustom); put("secure", server.isSecure)
        put("emailPassword", server.capabilities.emailPasswordAuth); put("deviceLogin", server.capabilities.tvLogin)
    }
}
