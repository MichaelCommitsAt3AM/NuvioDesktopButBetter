package com.nuvio.desktop.bridge

import com.nuvio.app.features.library.*
import com.nuvio.app.features.details.MetaDetailsRepository
import com.nuvio.app.features.tracking.TrackingProviderId
import com.nuvio.app.features.cloud.*
import kotlinx.serialization.json.*

object LibraryExtrasBridge {
    suspend fun dispatch(method: String, params: JsonObject): JsonElement? = when (method) {
        "library.extras" -> snapshot()
        "library.setLayout" -> { LibraryDisplaySettingsRepository.setLayoutMode(LibraryLayoutMode.valueOf(params.str("layout").uppercase())); snapshot() }
        "library.setSort" -> { LibraryDisplaySettingsRepository.setSortOption(LibrarySortOption.valueOf(params.str("sort").uppercase())); snapshot() }
        "library.membership" -> {
            val item = item(params)
            buildJsonObject {
                put("membership", JsonObject(LibraryRepository.getMembershipSnapshot(item).mapValues { JsonPrimitive(it.value) }))
                put("tabs", tabs(item))
            }
        }
        "library.setMembership" -> {
            val membership = params["membership"] as? JsonObject ?: error("Membership is required")
            val confirmed = (params["confirmedProviders"] as? JsonArray).orEmpty().map { value -> TrackingProviderId.entries.first { it.storageId == value.jsonPrimitive.content } }.toSet()
            val result = LibraryRepository.applyMembershipChanges(item(params), membership.mapValues { it.value.jsonPrimitive.boolean }, confirmed)
            buildJsonObject {
                put("requiresConfirmation", result.requiresRemovalConfirmation)
                put("confirmations", JsonArray(result.requiredRemovalConfirmations.map { confirmation -> buildJsonObject {
                    put("provider", confirmation.providerId.storageId); put("name", confirmation.providerId.displayName)
                    put("impacts", JsonArray(confirmation.impacts.map { JsonPrimitive(it.name.lowercase()) }))
                } }))
            }
        }
        "cloud.snapshot" -> { CloudLibraryRepository.ensureLoaded(); cloudSnapshot() }
        "cloud.refresh" -> { CloudLibraryRepository.refresh(); cloudSnapshot() }
        else -> null
    }
    private suspend fun item(params: JsonObject): LibraryItem {
        val id = params.str("id"); val type = params.str("type")
        return LibraryRepository.uiState.value.items.firstOrNull { it.id == id && it.type == type }
            ?: MetaDetailsRepository.fetch(type, id)?.toLibraryItem(System.currentTimeMillis()) ?: error("Title unavailable")
    }
    fun snapshot(): JsonObject {
        LibraryRepository.ensureLoaded(); LibraryDisplaySettingsRepository.ensureLoaded()
        val state = LibraryRepository.uiState.value; val display = LibraryDisplaySettingsRepository.uiState.value
        return buildJsonObject {
            put("source", state.sourceMode.name.lowercase()); put("layout", display.layoutMode.name.lowercase()); put("sort", display.sortOption.name.lowercase())
            put("tabs", tabs(null))
            put("items", JsonArray(state.items.map { item -> buildJsonObject {
                put("id", item.id); put("type", item.type); put("savedAt", item.savedAtEpochMs)
                put("listKeys", JsonArray(item.listKeys.map(::JsonPrimitive))); put("category", item.mediaCategory ?: item.type)
            } }))
            put("sections", JsonArray(state.sections.map { section -> buildJsonObject {
                put("type", section.type); put("title", section.displayTitle)
                put("items", JsonArray(section.items.map { JsonPrimitive("${it.type}|${it.id}") }))
            } }))
        }
    }
    private fun tabs(item: LibraryItem?) = JsonArray(LibraryRepository.libraryListTabs(item).map { tab -> buildJsonObject {
        put("key", tab.key); put("title", tab.title); put("provider", tab.providerId?.storageId?.let(::JsonPrimitive) ?: JsonNull)
        put("membershipDestination", tab.isMembershipDestination)
    } })
    fun cloudSnapshot(): JsonObject {
        val state = CloudLibraryRepository.uiState.value
        return buildJsonObject {
            put("enabled", state.isEnabled); put("loading", state.isRefreshing); put("loaded", state.isLoaded)
            put("providers", JsonArray(state.providers.map { provider -> buildJsonObject {
                put("id", provider.providerId); put("name", provider.providerName); put("error", provider.errorMessage?.let(::JsonPrimitive) ?: JsonNull)
                put("items", JsonArray(provider.items.map { item -> buildJsonObject {
                    put("key", item.stableKey); put("name", item.name); put("type", item.type.name.lowercase()); put("status", item.status ?: "")
                    put("size", item.sizeBytes?.let(::JsonPrimitive) ?: JsonNull); put("progress", item.progressFraction?.let(::JsonPrimitive) ?: JsonNull)
                    put("files", JsonArray(item.files.map { file -> buildJsonObject {
                        put("key", file.stableKey); put("name", file.name); put("size", file.sizeBytes?.let(::JsonPrimitive) ?: JsonNull); put("playable", file.playable)
                    } }))
                } }))
            } }))
        }
    }
    fun target(itemKey: String, fileKey: String): Pair<CloudLibraryItem, CloudLibraryFile> {
        val item = CloudLibraryRepository.uiState.value.items.firstOrNull { it.stableKey == itemKey } ?: error("Cloud item unavailable")
        return item to (item.files.firstOrNull { it.stableKey == fileKey } ?: error("Cloud file unavailable"))
    }
    private fun JsonObject.str(key: String) = this[key]?.jsonPrimitive?.contentOrNull ?: error("$key is required")
}
