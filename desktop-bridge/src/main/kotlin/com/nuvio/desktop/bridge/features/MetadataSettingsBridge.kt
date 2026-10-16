package com.nuvio.desktop.bridge.features

import com.nuvio.app.features.details.EpisodeRatingsVisibility
import com.nuvio.app.features.details.MetaEpisodeCardStyle
import com.nuvio.app.features.details.MetaScreenBackgroundMode
import com.nuvio.app.features.details.MetaScreenSectionKey
import com.nuvio.app.features.details.MetaScreenSettingsRepository
import com.nuvio.app.features.details.desktopHeroOwnedMetaSectionKeys
import com.nuvio.app.features.shuffle.EpisodeShuffleRepository
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

/** Desktop metadata/details screen preferences adapter. */
object MetadataSettingsBridge {
    suspend fun dispatch(method: String, params: JsonObject): JsonElement? = when (method) {
        "metadataSettings.snapshot" -> snapshot()
        "metadataSettings.set" -> set(params)
        "metadataSettings.setSectionEnabled" -> setSectionEnabled(params)
        "metadataSettings.setTabGroup" -> setTabGroup(params)
        "metadataSettings.move" -> move(params)
        "metadataSettings.reset" -> { MetaScreenSettingsRepository.resetToDefaults(); snapshot() }
        else -> null
    }

    fun snapshot(): JsonObject {
        MetaScreenSettingsRepository.ensureLoaded()
        EpisodeShuffleRepository.ensureLoaded()
        val state = MetaScreenSettingsRepository.uiState.value
        return buildJsonObject {
            put("items", JsonArray(state.items.filterNot { it.key in desktopHeroOwnedMetaSectionKeys }.map { item -> buildJsonObject {
                put("key", item.key.name); put("title", item.title); put("description", item.description)
                put("enabled", item.enabled); put("order", item.order); put("canBeTabbed", item.key.canBeTabbed)
                put("tabGroup", item.tabGroup?.let(::JsonPrimitive) ?: JsonNull)
            } }))
            put("backgroundMode", MetaScreenBackgroundMode.persist(state.backgroundMode))
            // The React detail hero has no trailer renderer yet, including on
            // platforms where the original Compose hero supports trailers.
            put("heroTrailerPlaybackSupported", false)
            put("heroTrailerPlayback", false)
            put("tabLayout", state.tabLayout)
            put("episodeCardStyle", MetaEpisodeCardStyle.persist(state.episodeCardStyle))
            put("blurUnwatchedEpisodes", state.blurUnwatchedEpisodes)
            put("posterTransitionEnabled", state.posterTransitionEnabled)
            put("showOverallRatings", state.showOverallRatings)
            put("episodeRatingsVisibility", state.episodeRatingsVisibility.name.lowercase())
            put("episodeShuffleAvailable", EpisodeShuffleRepository.uiState.value.available)
        }
    }

    private fun set(params: JsonObject): JsonObject {
        MetaScreenSettingsRepository.ensureLoaded()
        val key = params.str("key")
        val value = params["value"] ?: throw BridgeFeatureException("INVALID_ARGUMENT", "value is required")
        when (key) {
            "backgroundMode" -> MetaScreenSettingsRepository.setBackgroundMode(when (value.asString(key).lowercase()) {
                "normal" -> MetaScreenBackgroundMode.Normal
                "cinematic" -> MetaScreenBackgroundMode.Cinematic
                "dominant_color" -> MetaScreenBackgroundMode.DominantColor
                else -> invalid(key)
            })
            "heroTrailerPlayback" -> {
                val enabled = value.asBool(key)
                if (enabled) unavailable(key)
                MetaScreenSettingsRepository.setHeroTrailerPlayback(enabled)
            }
            "tabLayout" -> MetaScreenSettingsRepository.setTabLayout(value.asBool(key))
            "episodeCardStyle" -> MetaScreenSettingsRepository.setEpisodeCardStyle(when (value.asString(key).lowercase()) {
                "horizontal" -> MetaEpisodeCardStyle.Horizontal
                "list" -> MetaEpisodeCardStyle.List
                else -> invalid(key)
            })
            "blurUnwatchedEpisodes" -> MetaScreenSettingsRepository.setBlurUnwatchedEpisodes(value.asBool(key))
            "posterTransitionEnabled" -> {
                if (value.asBool(key)) unavailable(key)
                MetaScreenSettingsRepository.setPosterTransitionEnabled(false)
            }
            "showOverallRatings" -> MetaScreenSettingsRepository.setShowOverallRatings(value.asBool(key))
            "episodeRatingsVisibility" -> MetaScreenSettingsRepository.setEpisodeRatingsVisibility(
                enumValue<EpisodeRatingsVisibility>(value.asString(key)),
            )
            "episodeShuffleAvailable" -> {
                val success = EpisodeShuffleRepository.setAvailable(value.asBool(key))
                if (!success) throw BridgeFeatureException("PERSISTENCE_FAILED", "Episode shuffle preference was not saved")
            }
            else -> throw BridgeFeatureException("UNKNOWN_SETTING", "Unknown metadata setting: $key")
        }
        return snapshot()
    }

    private fun setSectionEnabled(params: JsonObject): JsonObject {
        val key = section(params.str("section"))
        MetaScreenSettingsRepository.setEnabled(key, params.bool("enabled"))
        if (MetaScreenSettingsRepository.uiState.value.items.firstOrNull { it.key == key }?.enabled != params.bool("enabled")) {
            throw BridgeFeatureException("SETTING_UPDATE_FAILED", "Metadata section preference was not updated")
        }
        return snapshot()
    }

    private fun setTabGroup(params: JsonObject): JsonObject {
        val key = section(params.str("section"))
        val groupElement = params["groupId"]
        val groupId = if (groupElement == null || groupElement == JsonNull) null else groupElement.jsonPrimitive.intOrNull
            ?: throw BridgeFeatureException("INVALID_ARGUMENT", "groupId must be null or an integer")
        if (groupId != null && groupId !in 1..3) throw BridgeFeatureException("INVALID_ARGUMENT", "groupId must be between 1 and 3")
        if (!key.canBeTabbed) throw BridgeFeatureException("SETTING_NOT_SUPPORTED", "This metadata section cannot be placed in a tab group")
        MetaScreenSettingsRepository.setTabGroup(key, groupId)
        val saved = MetaScreenSettingsRepository.uiState.value.items.firstOrNull { it.key == key }?.tabGroup
        if (saved != groupId) throw BridgeFeatureException("TAB_GROUP_LIMIT_REACHED", "A tab group can contain at most three metadata sections")
        return snapshot()
    }

    private fun move(params: JsonObject): JsonObject {
        val from = section(params.str("fromSection"))
        val to = section(params.str("toSection"))
        if (from == to) return snapshot()
        val before = MetaScreenSettingsRepository.uiState.value.items.filterNot { it.key in desktopHeroOwnedMetaSectionKeys }.map { it.key }
        MetaScreenSettingsRepository.moveByKey(from, to)
        val after = MetaScreenSettingsRepository.uiState.value.items.filterNot { it.key in desktopHeroOwnedMetaSectionKeys }.map { it.key }
        if (before == after) throw BridgeFeatureException("SETTING_UPDATE_FAILED", "Metadata section order was not updated")
        return snapshot()
    }

    private fun section(value: String): MetaScreenSectionKey {
        MetaScreenSettingsRepository.ensureLoaded()
        val key = enumValue<MetaScreenSectionKey>(value)
        if (key in desktopHeroOwnedMetaSectionKeys || MetaScreenSettingsRepository.uiState.value.items.none { it.key == key }) {
            throw BridgeFeatureException("SETTING_NOT_SUPPORTED", "This metadata section is not configurable on desktop")
        }
        return key
    }

    private inline fun <reified T : Enum<T>> enumValue(value: String): T = enumValues<T>().firstOrNull { it.name.equals(value, true) }
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "Unknown ${T::class.simpleName}: $value")
    private fun invalid(key: String): Nothing = throw BridgeFeatureException("INVALID_ARGUMENT", "Invalid value for $key")
    private fun unavailable(key: String): Nothing = throw BridgeFeatureException("CAPABILITY_UNAVAILABLE", "$key is unavailable in this app build")
    private fun JsonObject.str(key: String): String = this[key]?.jsonPrimitive?.contentOrNull ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key is required")
    private fun JsonObject.bool(key: String): Boolean = this[key]?.jsonPrimitive?.booleanOrNull ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be a boolean")
    private fun JsonElement.asString(key: String): String = jsonPrimitive.contentOrNull ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be a string")
    private fun JsonElement.asBool(key: String): Boolean = jsonPrimitive.booleanOrNull ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be a boolean")
}
