package com.nuvio.desktop.bridge

import com.nuvio.app.core.network.ServerConfigurationRepository
import com.nuvio.app.features.servers.ServerProviders
import com.nuvio.app.features.servers.ServerRepository
import com.nuvio.desktop.bridge.features.BridgeFeatureException
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.*

/** Credentials stay in Kotlin's profile-scoped server storage, never in snapshots. */
object ServersBridge {
    suspend fun dispatch(method: String, params: JsonObject): JsonElement? {
        if (!method.startsWith("servers.")) return null
        try {
            when (method) {
                "servers.snapshot" -> Unit
                "servers.connect" -> {
                    val provider = ServerProviders.forId(params.str("provider")) ?: error("Unknown provider")
                    ServerRepository.connect(provider, params.str("address"), params.str("username"), params.str("password"))
                }
                "servers.refresh" -> ServerRepository.refreshLibraries(params.str("id"))
                "servers.remove" -> ServerRepository.remove(params.str("id"))
                "servers.setEnabled" -> ServerRepository.setEnabled(params.str("id"), params.bool("enabled"))
                "servers.setMetadata" -> ServerRepository.setCatalogMetadata(params.str("id"), params.bool("enabled"))
                "servers.setWatchState" -> ServerRepository.setImportWatchState(params.str("id"), params.bool("enabled"))
                "servers.setLibrary" -> ServerRepository.setLibrarySelected(params.str("id"), params.str("libraryId"), params.bool("selected"))
                else -> return null
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            // Provider exceptions can include URLs/tokens. Expose only fixed messages.
            throw BridgeFeatureException("SERVER_OPERATION_FAILED", "The server operation failed. Check the server address, connection and sign-in details.")
        }
        return snapshot()
    }

    fun snapshot(): JsonObject {
        if (com.nuvio.desktop.bridge.features.KidsBridge.active != null) return buildJsonObject {
            put("cloudSync", false); put("providers", JsonArray(emptyList())); put("connections", JsonArray(emptyList()))
        }
        ServerRepository.ensureLoaded()
        return buildJsonObject {
            put("cloudSync", ServerConfigurationRepository.active.value.capabilities.mediaServerSync)
            put("providers", JsonArray(ServerProviders.registered.map { provider -> buildJsonObject {
                put("id", provider.id); put("name", provider.displayName)
            } }))
            put("connections", JsonArray(ServerRepository.uiState.value.connections.map { server -> buildJsonObject {
                put("id", server.id); put("provider", server.providerId); put("name", server.name)
                put("address", server.address); put("username", server.userName)
                put("enabled", server.enabled); put("useCatalogMetadata", server.useCatalogMetadata)
                put("importWatchState", server.importWatchState)
                put("libraries", JsonArray(server.libraries.map { library -> buildJsonObject {
                    put("id", library.id); put("name", library.name); put("selected", library.selected)
                } }))
            } }))
        }
    }

    private fun JsonObject.str(key: String) = this[key]?.jsonPrimitive?.contentOrNull ?: error("$key is required")
    private fun JsonObject.bool(key: String) = this[key]?.jsonPrimitive?.booleanOrNull ?: error("$key is required")
}
