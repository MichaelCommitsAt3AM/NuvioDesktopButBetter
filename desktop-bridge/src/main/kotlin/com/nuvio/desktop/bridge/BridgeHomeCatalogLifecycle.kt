package com.nuvio.desktop.bridge

import com.nuvio.app.features.addons.ManagedAddon
import com.nuvio.app.features.addons.enabledAddons
import com.nuvio.app.features.addons.isWaitingForFirstEnabledManifest
import com.nuvio.app.features.collection.Collection
import com.nuvio.app.features.home.buildAddonCatalogRefreshSignature

/** Mirrors MainAppContent and SettingsScreen's catalog/collection effects. */
internal class BridgeHomeCatalogLifecycle(
    private val syncCatalogs: suspend (List<ManagedAddon>) -> Unit,
    private val syncCollections: suspend (List<Collection>, List<ManagedAddon>) -> Unit,
    private val refreshHome: (List<ManagedAddon>) -> Unit,
) {
    private var lastInput: Triple<Long, List<String>, List<Collection>>? = null

    // Called under the runtime RPC mutex, with the current profile's inputs.
    suspend fun update(generation: Long, addons: List<ManagedAddon>, collections: List<Collection>) {
        val enabled = addons.enabledAddons()
        if (enabled.isWaitingForFirstEnabledManifest()) return
        val input = Triple(generation, buildAddonCatalogRefreshSignature(enabled), collections)
        if (input == lastInput) return
        syncCatalogs(enabled)
        syncCollections(collections, enabled)
        refreshHome(enabled)
        lastInput = input
    }
}
