package com.nuvio.desktop.bridge.features

import com.nuvio.app.core.build.AppFeaturePolicy
import com.nuvio.app.features.plugins.AddPluginRepositoryResult
import com.nuvio.app.features.plugins.PluginRepository
import com.nuvio.app.features.plugins.PluginStorage
import com.nuvio.app.features.plugins.runtime.PluginRuntime
import kotlinx.serialization.json.*

object PluginsBridge {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun dispatch(method: String, params: JsonObject): JsonElement? {
        if (!method.startsWith("plugins.")) return null
        if (!AppFeaturePolicy.pluginsEnabled) throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", "Plugins are unavailable in this build")
        when (method) {
            "plugins.snapshot" -> Unit
            "plugins.addRepository" -> when (val result = PluginRepository.addRepository(params.str("url"))) {
                is AddPluginRepositoryResult.Success -> Unit
                is AddPluginRepositoryResult.Error -> throw BridgeFeatureException("INVALID_ARGUMENT", result.message)
            }
            "plugins.removeRepository" -> PluginRepository.removeRepository(params.str("url"))
            "plugins.refresh" -> PluginRepository.refreshAll()
            "plugins.refreshRepository" -> PluginRepository.refreshRepository(params.str("url"))
            "plugins.setEnabled" -> PluginRepository.setPluginsEnabled(params.bool("enabled"))
            "plugins.setGrouped" -> PluginRepository.setGroupStreamsByRepository(params.bool("enabled"))
            "plugins.toggleScraper" -> PluginRepository.toggleScraper(params.str("id"), params.bool("enabled"))
            "plugins.scraperSettings" -> return scraperSettings(params.str("id"))
            "plugins.saveScraperSettings" -> return saveScraperSettings(params)
            "plugins.testScraper" -> {
                val result = PluginRepository.testScraper(params.str("id")).getOrThrow()
                return buildJsonObject {
                    put("resultCount", result.size)
                    put(
                        "results",
                        JsonArray(
                            result.take(8).map { item ->
                                buildJsonObject {
                                    put("title", item.title)
                                    put("name", item.name ?: "")
                                    put("url", item.url)
                                    put("quality", item.quality ?: "")
                                    put("size", item.size ?: "")
                                    put("language", item.language ?: "")
                                    put("provider", item.provider ?: "")
                                    put("type", item.type ?: "")
                                    item.seeders?.let { put("seeders", it) }
                                    item.peers?.let { put("peers", it) }
                                }
                            },
                        ),
                    )
                }
            }
            else -> return null
        }
        return snapshot()
    }

    fun snapshot(): JsonObject {
        val state = PluginRepository.uiState.value
        return buildJsonObject {
            put("available", AppFeaturePolicy.pluginsEnabled); put("enabled", state.pluginsEnabled); put("grouped", state.groupStreamsByRepository)
            put("repositories", JsonArray(state.repositories.map { repository -> buildJsonObject {
                put("url", repository.manifestUrl); put("name", repository.name); put("description", repository.description ?: "")
                put("version", repository.version ?: ""); put("scraperCount", repository.scraperCount)
                put("refreshing", repository.isRefreshing); put("error", repository.errorMessage?.let(::JsonPrimitive) ?: JsonNull)
            } }))
            put("scrapers", JsonArray(state.scrapers.map { scraper -> buildJsonObject {
                put("id", scraper.id); put("repositoryUrl", scraper.repositoryUrl); put("name", scraper.name); put("description", scraper.description)
                put("version", scraper.version); put("enabled", scraper.enabled); put("manifestEnabled", scraper.manifestEnabled)
                put("hasSettings", scraper.hasSettings); put("logo", scraper.logo ?: "")
                put("contentLanguage", JsonArray(scraper.contentLanguage.map(::JsonPrimitive)))
                put("formats", JsonArray((scraper.formats ?: emptyList()).map(::JsonPrimitive)))
                put("types", JsonArray(scraper.supportedTypes.map(::JsonPrimitive)))
            } }))
        }
    }

    private suspend fun scraperSettings(id: String): JsonObject {
        PluginRepository.initialize()
        val scraper = PluginRepository.uiState.value.scrapers.find { it.id == id }
            ?: throw BridgeFeatureException("PLUGIN_NOT_FOUND", "Plugin provider was not found")
        if (!scraper.hasSettings) throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", "This provider has no configurable settings")
        val layoutJson = PluginRuntime.getPluginSettingsLayout(scraper.code, scraper.id)
            ?: throw BridgeFeatureException("PLUGIN_SETTINGS_UNAVAILABLE", "Could not load this provider's settings")
        if (layoutJson.length > MAX_SETTINGS_LAYOUT_CHARS) throw BridgeFeatureException("PAYLOAD_TOO_LARGE", "Provider settings layout is too large")
        val layout = runCatching { json.parseToJsonElement(layoutJson).jsonArray }
            .getOrElse { throw BridgeFeatureException("PLUGIN_SETTINGS_INVALID", "Provider returned an invalid settings layout") }
        val settings = PluginStorage.loadScraperSettings(id)?.let { stored ->
            runCatching { json.parseToJsonElement(stored).jsonObject }.getOrNull()
        } ?: JsonObject(emptyMap())
        return buildJsonObject {
            put("id", scraper.id); put("name", scraper.name); put("layout", layout); put("settings", settings)
        }
    }

    private fun saveScraperSettings(params: JsonObject): JsonObject {
        val id = params.str("id")
        PluginRepository.initialize()
        val scraper = PluginRepository.uiState.value.scrapers.find { it.id == id }
            ?: throw BridgeFeatureException("PLUGIN_NOT_FOUND", "Plugin provider was not found")
        if (!scraper.hasSettings) throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", "This provider has no configurable settings")
        val settings = params["settings"] as? JsonObject
            ?: throw BridgeFeatureException("INVALID_ARGUMENT", "settings must be a JSON object")
        val encoded = settings.toString()
        if (encoded.length > MAX_SCRAPER_SETTINGS_CHARS) throw BridgeFeatureException("PAYLOAD_TOO_LARGE", "Provider settings are too large")
        PluginStorage.saveScraperSettings(id, encoded)
        return buildJsonObject { put("id", id); put("settings", settings); put("saved", true) }
    }
    private fun JsonObject.str(key: String) = this[key]?.jsonPrimitive?.contentOrNull ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key is required")
    private fun JsonObject.bool(key: String) = this[key]?.jsonPrimitive?.booleanOrNull ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be a boolean")

    private const val MAX_SETTINGS_LAYOUT_CHARS = 256 * 1024
    private const val MAX_SCRAPER_SETTINGS_CHARS = 64 * 1024
}
