package com.nuvio.desktop.bridge

import com.nuvio.app.features.addons.ManagedAddon
import com.nuvio.app.features.addons.enabledAddons
import com.nuvio.app.features.profiles.forKidsCatalogs
import com.nuvio.app.features.addons.isWaitingForFirstEnabledManifest
import com.nuvio.app.features.collection.Collection
import com.nuvio.app.features.home.buildAddonCatalogRefreshSignature

/** Mirrors MainAppContent and SettingsScreen's catalog/collection effects. */
internal class BridgeHomeCatalogLifecycle(
    private val syncCatalogs: suspend (List<ManagedAddon>) -> Unit,
    private val syncCollections: suspend (List<Collection>, List<ManagedAddon>) -> Unit,
    private val refreshHome: (List<ManagedAddon>) -> Unit,
) {
    private data class Input(val generation: Long, val addons: List<String>, val collections: List<Collection>, val serverRevision: Int)
    private var lastInput: Input? = null

    // Called under the runtime RPC mutex, with the current profile's inputs.
    suspend fun update(generation: Long, addons: List<ManagedAddon>, collections: List<Collection>, serverRevision: Int = 0) {
        val enabled = addons.enabledAddons().forKidsCatalogs()
        if (enabled.isWaitingForFirstEnabledManifest()) return
        val input = Input(generation, buildAddonCatalogRefreshSignature(enabled), collections, serverRevision)
        if (input == lastInput) return
        syncCatalogs(enabled)
        syncCollections(collections, enabled)
        refreshHome(enabled)
        lastInput = input
    }
}
