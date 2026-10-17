package com.nuvio.app.features.addons

import kotlinx.atomicfu.atomic
import kotlinx.atomicfu.update
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Manifest responses change rarely, so they are cached by manifest URL instead
 * of being re-downloaded on every profile switch. The cached value is the raw
 * response payload: parsing happens lazily on read, which keeps the persisted
 * format stable and independent of the manifest model.
 */
internal const val ADDON_MANIFEST_CACHE_TTL_MS = 12 * 60 * 60 * 1000L
private const val MANIFEST_CACHE_MAX_ENTRIES = 200
private const val MANIFEST_CACHE_PERSIST_DEBOUNCE_MS = 1_500L

internal data class CachedAddonManifest(
    val payload: String,
    val fetchedAtMs: Long,
)

internal fun isAddonManifestCacheFresh(fetchedAtMs: Long?, now: Long): Boolean =
    fetchedAtMs != null && now >= fetchedAtMs && now - fetchedAtMs < ADDON_MANIFEST_CACHE_TTL_MS

/**
 * A manifest is descriptor data (id, name, catalogs, resources) with no
 * profile-scoped state, so one URL-keyed cache is shared by every profile.
 * Only the installed URL list and enabled states are per-profile.
 */
internal object AddonManifestCache {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val entries = atomic<Map<String, CachedAddonManifest>>(emptyMap())
    private val loaded = atomic(false)
    private var persistJob: Job? = null

    fun ensureLoaded() {
        if (loaded.value) return
        loaded.value = true
        val blob = runCatching { AddonStorage.loadCachedManifests() }.getOrNull()
            ?.takeIf { it.isNotBlank() } ?: return
        val stored = runCatching { json.decodeFromString<StoredManifestCache>(blob) }.getOrNull() ?: return
        entries.update { current ->
            // Anything already recorded in memory this session is newer than storage.
            val merged = LinkedHashMap<String, CachedAddonManifest>(stored.entries.size + current.size)
            stored.entries.forEach { entry -> merged[entry.url] = CachedAddonManifest(entry.payload, entry.fetchedAtMs) }
            merged.putAll(current)
            merged
        }
    }

    fun manifest(manifestUrl: String): AddonManifest? {
        ensureLoaded()
        val entry = entries.value[manifestUrl] ?: return null
        return parse(manifestUrl, entry.payload) ?: run {
            entries.update { it - manifestUrl }
            null
        }
    }

    fun isStale(manifestUrl: String, now: Long = nowMs()): Boolean =
        !isAddonManifestCacheFresh(entries.value[manifestUrl]?.fetchedAtMs, now)

    fun record(manifestUrl: String, payload: String, now: Long = nowMs()) {
        if (payload.isBlank()) return
        ensureLoaded()
        // Fetches complete on several threads at once, so the read-modify-write
        // must be atomic or concurrent records would drop each other's entries.
        entries.update { current ->
            val next = LinkedHashMap(current)
            next[manifestUrl] = CachedAddonManifest(payload, now)
            if (next.size > MANIFEST_CACHE_MAX_ENTRIES) {
                next.entries
                    .sortedBy { it.value.fetchedAtMs }
                    .take(next.size - MANIFEST_CACHE_MAX_ENTRIES)
                    .forEach { next.remove(it.key) }
            }
            next
        }
        schedulePersist()
    }

    fun clear() {
        persistJob?.cancel()
        persistJob = null
        entries.value = emptyMap()
        loaded.value = true
        runCatching { AddonStorage.saveCachedManifests("") }
    }

    private fun schedulePersist() {
        persistJob?.cancel()
        persistJob = scope.launch {
            delay(MANIFEST_CACHE_PERSIST_DEBOUNCE_MS)
            persistNow()
        }
    }

    private fun persistNow() {
        val payload = runCatching {
            json.encodeToString(
                StoredManifestCache(
                    entries = entries.value.map { (url, entry) ->
                        StoredManifestEntry(url = url, payload = entry.payload, fetchedAtMs = entry.fetchedAtMs)
                    },
                ),
            )
        }.getOrNull() ?: return
        runCatching { AddonStorage.saveCachedManifests(payload) }
    }

    private fun parse(manifestUrl: String, payload: String): AddonManifest? =
        runCatching { AddonManifestParser.parse(manifestUrl, payload) }.getOrNull()

    private fun nowMs(): Long = kotlin.time.Clock.System.now().toEpochMilliseconds()
}

@Serializable
private data class StoredManifestCache(
    val version: Int = 1,
    val entries: List<StoredManifestEntry> = emptyList(),
)

@Serializable
private data class StoredManifestEntry(
    val url: String,
    val payload: String,
    val fetchedAtMs: Long,
)
