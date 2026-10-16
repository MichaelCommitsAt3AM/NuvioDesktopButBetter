package com.nuvio.desktop.bridge.features

import com.nuvio.app.core.build.AppFeaturePolicy
import com.nuvio.app.core.poster.CustomPosterScreen
import com.nuvio.app.core.poster.CustomPosterUrlRepository
import com.nuvio.app.core.ui.AppTheme
import com.nuvio.app.core.ui.CardDepthStyleRepository
import com.nuvio.app.core.ui.CustomThemeColors
import com.nuvio.app.core.ui.NuvioCardDepthSurface
import com.nuvio.app.core.ui.PosterCardStyleRepository
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.addons.enabledAddons
import com.nuvio.app.features.addons.isWaitingForFirstEnabledManifest
import com.nuvio.app.features.collection.CollectionRepository
import com.nuvio.app.features.addons.ManagedAddon
import com.nuvio.app.features.collection.Collection
import com.nuvio.app.features.home.HomeCatalogSettingsRepository
import com.nuvio.app.features.membership.MemberAccessRepository
import com.nuvio.app.features.settings.DesktopNavigationLayout
import com.nuvio.app.features.settings.AppIconOption
import com.nuvio.app.features.settings.AppIconRepository
import com.nuvio.app.features.settings.NavBarStyle
import com.nuvio.app.features.settings.ThemeSettingsRepository
import com.nuvio.app.features.watchprogress.ContinueWatchingPreferencesRepository
import com.nuvio.app.features.watchprogress.ContinueWatchingSectionStyle
import com.nuvio.app.features.watchprogress.ContinueWatchingSortMode
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

object AppearanceBridge {
    suspend fun dispatch(method: String, params: JsonObject): JsonElement? = when (method) {
        "appearance.snapshot" -> { synchronizeHomeCatalogs(); snapshot() }
        "appearance.setTheme" -> {
            ThemeSettingsRepository.setTheme(enumValue<AppTheme>(params.str("theme")))
            snapshot()
        }
        "appearance.setCustomTheme" -> {
            val colors = params.array("colors").map(::parseColor)
            if (colors.size != 3) throw BridgeFeatureException("INVALID_ARGUMENT", "colors must contain three hexadecimal colors")
            ThemeSettingsRepository.setCustomTheme(CustomThemeColors(colors[0], colors[1], colors[2]))
            snapshot()
        }
        "appearance.setAmoled" -> {
            ThemeSettingsRepository.setAmoled(params.bool("enabled")); snapshot()
        }
        "appearance.setNavigationLayout" -> {
            ThemeSettingsRepository.setDesktopNavigationLayout(enumValue<DesktopNavigationLayout>(params.str("layout"))); snapshot()
        }
        "appearance.setNavBarStyle" -> {
            val style = NavBarStyle.entries.firstOrNull { it.key.equals(params.str("style"), true) }
                ?: throw BridgeFeatureException("INVALID_ARGUMENT", "Unknown navigation bar style")
            ThemeSettingsRepository.setNavBarStyle(style); snapshot()
        }
        "appearance.setNavBarGlow" -> {
            ThemeSettingsRepository.setNavBarGlowEnabled(params.bool("enabled")); snapshot()
        }
        "appearance.setAppIcon" -> {
            AppIconRepository.ensureLoaded()
            val icon = AppIconOption.entries.firstOrNull { it.key.equals(params.str("icon"), true) }
                ?: throw BridgeFeatureException("INVALID_ARGUMENT", "Unknown app icon")
            AppIconRepository.select(icon)
            snapshot()
        }
        "posters.snapshot" -> posterSnapshot()
        "posters.setPattern" -> { CustomPosterUrlRepository.setPattern(params.str("pattern")); posterSnapshot() }
        "posters.clearPattern" -> { CustomPosterUrlRepository.clearPattern(); posterSnapshot() }
        "posters.setScreenEnabled" -> {
            CustomPosterUrlRepository.setScreenEnabled(screen(params.str("screen")), params.bool("enabled")); posterSnapshot()
        }
        "posters.setCardStyle" -> posterStyle(params)
        "posters.setCardDepth" -> cardDepth(params)
        "homePreferences.snapshot" -> { synchronizeHomeCatalogs(); homePreferencesSnapshot() }
        "homePreferences.setHeroEnabled" -> { HomeCatalogSettingsRepository.setHeroEnabled(params.bool("enabled")); homePreferencesSnapshot() }
        "homePreferences.setShowCatalogType" -> { HomeCatalogSettingsRepository.setShowCatalogType(params.bool("enabled")); homePreferencesSnapshot() }
        "homePreferences.setHideUnreleasedContent" -> { HomeCatalogSettingsRepository.setHideUnreleasedContent(params.bool("enabled")); homePreferencesSnapshot() }
        "homePreferences.setHeroSourceEnabled" -> { HomeCatalogSettingsRepository.setHeroSourceEnabled(params.str("key"), params.bool("enabled")); homePreferencesSnapshot() }
        "homePreferences.setEnabled" -> { HomeCatalogSettingsRepository.setEnabled(params.str("key"), params.bool("enabled")); homePreferencesSnapshot() }
        "homePreferences.setCustomTitle" -> { HomeCatalogSettingsRepository.setCustomTitle(params.str("key"), params.str("title")); homePreferencesSnapshot() }
        "homePreferences.reset" -> { HomeCatalogSettingsRepository.resetToDefaults(); homePreferencesSnapshot() }
        "homePreferences.move" -> {
            val targetKey = params["targetKey"]?.jsonPrimitive?.contentOrNull
            if (targetKey != null) {
                val items = HomeCatalogSettingsRepository.uiState.value.items
                val from = items.indexOfFirst { it.key == params.str("key") }
                val to = items.indexOfFirst { it.key == targetKey }
                if (from < 0 || to < 0) throw BridgeFeatureException("INVALID_ARGUMENT", "Unknown Home catalog")
                if (items[from].isPinnedToTop || items[to].isPinnedToTop) {
                    throw BridgeFeatureException("INVALID_ARGUMENT", "Remove pin to top from collection to move")
                }
                HomeCatalogSettingsRepository.moveByIndex(from, to)
            } else when (params.str("direction").lowercase()) {
                "up" -> HomeCatalogSettingsRepository.moveUp(params.str("key"))
                "down" -> HomeCatalogSettingsRepository.moveDown(params.str("key"))
                else -> throw BridgeFeatureException("INVALID_ARGUMENT", "direction must be up or down")
            }
            homePreferencesSnapshot()
        }
        "continueWatching.snapshot" -> continueWatchingSnapshot()
        "continueWatching.setVisible" -> { ContinueWatchingPreferencesRepository.setVisible(params.bool("enabled")); continueWatchingSnapshot() }
        "continueWatching.setStyle" -> { ContinueWatchingPreferencesRepository.setStyle(enumValue<ContinueWatchingSectionStyle>(params.str("style"))); continueWatchingSnapshot() }
        "continueWatching.setUpNextFromFurthestEpisode" -> { ContinueWatchingPreferencesRepository.setUpNextFromFurthestEpisode(params.bool("enabled")); continueWatchingSnapshot() }
        "continueWatching.setUseEpisodeThumbnails" -> { ContinueWatchingPreferencesRepository.setUseEpisodeThumbnails(params.bool("enabled")); continueWatchingSnapshot() }
        "continueWatching.setShowUnairedNextUp" -> { ContinueWatchingPreferencesRepository.setShowUnairedNextUp(params.bool("enabled")); continueWatchingSnapshot() }
        "continueWatching.setBlurNextUp" -> { ContinueWatchingPreferencesRepository.setBlurNextUp(params.bool("enabled")); continueWatchingSnapshot() }
        "continueWatching.setShowResumePromptOnLaunch" -> { ContinueWatchingPreferencesRepository.setShowResumePromptOnLaunch(params.bool("enabled")); continueWatchingSnapshot() }
        "continueWatching.setSortMode" -> { ContinueWatchingPreferencesRepository.setSortMode(enumValue<ContinueWatchingSortMode>(params.str("sortMode"))); continueWatchingSnapshot() }
        "continueWatching.dismissNextUp" -> { ContinueWatchingPreferencesRepository.addDismissedNextUpKey(params.str("key")); continueWatchingSnapshot() }
        "continueWatching.removeDismissedForContent" -> { ContinueWatchingPreferencesRepository.removeDismissedNextUpKeysForContent(params.str("contentId")); continueWatchingSnapshot() }
        else -> null
    }

    internal suspend fun synchronizeHomeCatalogs(
        addons: List<ManagedAddon> = AddonRepository.uiState.value.addons,
        collections: List<Collection> = CollectionRepository.collections.value,
    ) {
        val enabled = addons.enabledAddons()
        if (enabled.isWaitingForFirstEnabledManifest()) return
        // Like entering SettingsScreen: rebuild definitions even when installed
        // addons are unchanged after ProfileRepository reset this repository.
        HomeCatalogSettingsRepository.syncCatalogs(enabled)
        HomeCatalogSettingsRepository.syncCollections(collections, enabled)
    }

    fun snapshot(): JsonObject = buildJsonObject {
        put("theme", ThemeSettingsRepository.selectedTheme.value.name.lowercase())
        put("customThemeColors", JsonArray(ThemeSettingsRepository.customThemeColors.value.colors.map { JsonPrimitive(colorHex(it)) }))
        put("customThemeGradientEnabled", MemberAccessRepository.access.value.tier != null)
        put("trailerPlaybackMode", AppFeaturePolicy.trailerPlaybackMode.name.lowercase())
        put("amoledEnabled", ThemeSettingsRepository.amoledEnabled.value)
        put("navigationLayout", ThemeSettingsRepository.desktopNavigationLayout.value.name.lowercase())
        put("navBarStyle", ThemeSettingsRepository.navBarStyle.value.key)
        put("navBarGlowEnabled", ThemeSettingsRepository.navBarGlowEnabled.value)
        put("posters", posterSnapshot())
        put("home", homePreferencesSnapshot())
        put("continueWatching", continueWatchingSnapshot())
        put("cardStyle", posterStyleSnapshot())
        put("cardDepth", cardDepthSnapshot())
        AppIconRepository.ensureLoaded()
        put("appIcon", buildJsonObject {
            put("selected", AppIconRepository.state.value.selected.key)
            put("changeFailed", AppIconRepository.state.value.changeFailed)
            put("options", JsonArray(AppIconOption.entries.map { JsonPrimitive(it.key) }))
        })
    }

    fun posterSnapshot(): JsonObject {
        CustomPosterUrlRepository.ensureLoaded()
        return buildJsonObject {
            put("pattern", CustomPosterUrlRepository.pattern.value)
            put("enabledScreens", JsonArray(CustomPosterScreen.entries.map { JsonPrimitive(it.key) }))
            put("activeScreens", JsonArray(CustomPosterUrlRepository.enabledScreens.value.map { JsonPrimitive(it.key) }.sortedBy { it.content }))
        }
    }

    fun homePreferencesSnapshot(): JsonObject {
        // SettingsScreen initializes saved preferences even before manifests arrive.
        HomeCatalogSettingsRepository.snapshot()
        val state = HomeCatalogSettingsRepository.uiState.value
        return buildJsonObject {
            put("heroEnabled", state.heroEnabled); put("showCatalogType", state.showCatalogType); put("hideUnreleasedContent", state.hideUnreleasedContent)
            val addons = AddonRepository.uiState.value.addons.filter { it.enabled }
            put("isCatalogLoading", addons.any { it.isRefreshing })
            putNullable("catalogErrorMessage", addons.firstOrNull { it.manifest == null && !it.errorMessage.isNullOrBlank() }?.errorMessage)
            put("heroSourceSelectionLimit", HomeCatalogSettingsRepository.HERO_SOURCE_SELECTION_LIMIT)
            put("items", JsonArray(state.items.map { item -> buildJsonObject {
                put("key", item.key); put("title", item.displayTitle); put("defaultTitle", item.defaultTitle)
                put("addonName", item.addonName); put("isPinnedToTop", item.isPinnedToTop)
                put("customTitle", item.customTitle); put("enabled", item.enabled); put("heroSourceEnabled", item.heroSourceEnabled)
                put("order", item.order); put("isCollection", item.isCollection); putNullable("collectionId", item.collectionId)
            } }))
        }
    }

    fun continueWatchingSnapshot(): JsonObject {
        ContinueWatchingPreferencesRepository.ensureLoaded()
        val state = ContinueWatchingPreferencesRepository.uiState.value
        return buildJsonObject {
            put("visible", state.isVisible); put("style", state.style.name.lowercase())
            put("upNextFromFurthestEpisode", state.upNextFromFurthestEpisode)
            put("useEpisodeThumbnails", state.useEpisodeThumbnails); put("showUnairedNextUp", state.showUnairedNextUp)
            put("blurNextUp", state.blurNextUp); put("showResumePromptOnLaunch", state.showResumePromptOnLaunch)
            put("sortMode", state.sortMode.name.lowercase())
            put("dismissedNextUpKeys", JsonArray(state.dismissedNextUpKeys.sorted().map(::JsonPrimitive)))
        }
    }

    private fun posterStyleSnapshot(): JsonObject {
        PosterCardStyleRepository.ensureLoaded()
        val state = PosterCardStyleRepository.uiState.value
        return buildJsonObject {
            put("widthDp", state.widthDp); put("heightDp", state.heightDp); put("cornerRadiusDp", state.cornerRadiusDp)
            put("catalogLandscapeModeEnabled", state.catalogLandscapeModeEnabled); put("hideLabelsEnabled", state.hideLabelsEnabled)
            put("hoverPreviewEnabled", state.hoverPreviewEnabled); put("hoverPreviewOpenDelayMillis", state.hoverPreviewOpenDelayMillis)
            put("hoverPreviewTrailerEnabled", state.hoverPreviewTrailerEnabled); put("hoverPreviewTrailerSoundEnabled", state.hoverPreviewTrailerSoundEnabled)
            put("hoverPreviewTrailerStartSeconds", state.hoverPreviewTrailerStartSeconds); put("alwaysShowLandscapeClearlogo", state.alwaysShowLandscapeClearlogo)
        }
    }

    private fun cardDepthSnapshot(): JsonObject {
        CardDepthStyleRepository.ensureLoaded()
        val state = CardDepthStyleRepository.uiState.value
        return buildJsonObject {
            put("enabled", state.enabled); put("edgeStrength", state.edgeStrength); put("sheenStrength", state.sheenStrength); put("edgeCoverage", state.edgeCoverage)
            put("postersEnabled", state.postersEnabled); put("continueWatchingEnabled", state.continueWatchingEnabled)
            put("episodeCardsEnabled", state.episodeCardsEnabled); put("castEnabled", state.castEnabled); put("trailersEnabled", state.trailersEnabled)
        }
    }

    private fun posterStyle(params: JsonObject): JsonElement {
        PosterCardStyleRepository.ensureLoaded()
        params.optionalInt("widthDp")?.let(PosterCardStyleRepository::setWidthDp)
        params.optionalInt("cornerRadiusDp")?.let(PosterCardStyleRepository::setCornerRadiusDp)
        params.optionalBool("catalogLandscapeModeEnabled")?.let(PosterCardStyleRepository::setCatalogLandscapeModeEnabled)
        params.optionalBool("hideLabelsEnabled")?.let(PosterCardStyleRepository::setHideLabelsEnabled)
        params.optionalBool("hoverPreviewEnabled")?.let(PosterCardStyleRepository::setHoverPreviewEnabled)
        params.optionalInt("hoverPreviewOpenDelayMillis")?.let(PosterCardStyleRepository::setHoverPreviewOpenDelayMillis)
        params.optionalBool("hoverPreviewTrailerEnabled")?.let(PosterCardStyleRepository::setHoverPreviewTrailerEnabled)
        params.optionalBool("hoverPreviewTrailerSoundEnabled")?.let(PosterCardStyleRepository::setHoverPreviewTrailerSoundEnabled)
        params.optionalInt("hoverPreviewTrailerStartSeconds")?.let(PosterCardStyleRepository::setHoverPreviewTrailerStartSeconds)
        params.optionalBool("alwaysShowLandscapeClearlogo")?.let(PosterCardStyleRepository::setAlwaysShowLandscapeClearlogo)
        return posterStyleSnapshot()
    }

    private fun cardDepth(params: JsonObject): JsonElement {
        CardDepthStyleRepository.ensureLoaded()
        params.optionalBool("enabled")?.let(CardDepthStyleRepository::setEnabled)
        params.optionalInt("edgeStrength")?.let(CardDepthStyleRepository::setEdgeStrength)
        params.optionalInt("sheenStrength")?.let(CardDepthStyleRepository::setSheenStrength)
        params.optionalInt("edgeCoverage")?.let(CardDepthStyleRepository::setEdgeCoverage)
        val surface = params.optionalStr("surface")
        val surfaceEnabled = params.optionalBool("surfaceEnabled")
        if (surface != null && surfaceEnabled != null) {
            val parsed = NuvioCardDepthSurface.entries.firstOrNull { it.name.equals(surface, true) }
                ?: throw BridgeFeatureException("INVALID_ARGUMENT", "Unknown card depth surface")
            CardDepthStyleRepository.setSurfaceEnabled(parsed, surfaceEnabled)
        } else if (surface != null || surfaceEnabled != null) {
            throw BridgeFeatureException("INVALID_ARGUMENT", "surface and surfaceEnabled must be supplied together")
        }
        return cardDepthSnapshot()
    }

    private fun screen(value: String): CustomPosterScreen = CustomPosterScreen.entries.firstOrNull { it.key.equals(value, true) }
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "Unknown poster screen")

    private inline fun <reified T : Enum<T>> enumValue(value: String): T = enumValues<T>().firstOrNull { it.name.equals(value, true) }
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "Unknown ${T::class.simpleName}: $value")

    private fun parseColor(value: JsonElement): Int {
        val hex = value.jsonPrimitive.contentOrNull?.removePrefix("#")
            ?: throw BridgeFeatureException("INVALID_ARGUMENT", "Color must be a hexadecimal string")
        if (hex.length != 6 || hex.any { it.digitToIntOrNull(16) == null }) throw BridgeFeatureException("INVALID_ARGUMENT", "Color must be a six digit hexadecimal string")
        return hex.toInt(16)
    }
    private fun colorHex(value: Int) = "#" + value.toString(16).padStart(6, '0').uppercase()

    private fun JsonObject.str(key: String) = optionalStr(key) ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key is required")
    private fun JsonObject.optionalStr(key: String): String? = this[key]?.takeUnless { it == JsonNull }?.jsonPrimitive?.contentOrNull
    private fun JsonObject.bool(key: String) = optionalBool(key) ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be a boolean")
    private fun JsonObject.optionalBool(key: String): Boolean? = this[key]?.takeUnless { it == JsonNull }?.jsonPrimitive?.booleanOrNull
    private fun JsonObject.optionalInt(key: String): Int? = this[key]?.takeUnless { it == JsonNull }?.jsonPrimitive?.intOrNull
    private fun JsonObject.array(key: String): List<JsonElement> = (this[key] as? JsonArray)?.toList()
        ?: throw BridgeFeatureException("INVALID_ARGUMENT", "$key must be an array")
    private fun kotlinx.serialization.json.JsonObjectBuilder.putNullable(key: String, value: String?) { put(key, value?.let(::JsonPrimitive) ?: JsonNull) }
}
