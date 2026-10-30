package com.nuvio.desktop.bridge.features

import kotlinx.serialization.json.*

/** Publish verified visible titles first; never expose an unchecked title. */
internal suspend fun progressiveHomeVisibility(
    data: JsonObject,
    cachedAllowed: Set<KidsBridge.Ref>,
    check: suspend (Set<KidsBridge.Ref>) -> Set<KidsBridge.Ref>,
    isCurrent: () -> Boolean,
    publish: suspend (JsonObject) -> Unit,
) {
    val refs = linkedSetOf<KidsBridge.Ref>()
    fun collect(node: JsonElement) { when (node) {
        is JsonObject -> { KidsBridge.reference(node)?.let(refs::add); node.values.forEach(::collect) }
        is JsonArray -> node.forEach(::collect)
        else -> Unit
    } }
    collect(data)
    val missing = (refs - cachedAllowed).toList()
    val allowed = cachedAllowed.toMutableSet()
    val originallyLoading = data["loading"]?.jsonPrimitive?.booleanOrNull == true
    suspend fun send(pending: Boolean) {
        if (!isCurrent()) return
        val filtered = KidsBridge.filter(data, allowed) as? JsonObject ?: JsonObject(emptyMap())
        publish(JsonObject(filtered + ("loading" to JsonPrimitive(originallyLoading || pending))))
    }
    send(missing.isNotEmpty())
    val batches = listOf(missing.take(24)).filter { it.isNotEmpty() } + missing.drop(24).chunked(200)
    for ((index, batch) in batches.withIndex()) {
        if (!isCurrent()) return
        allowed.addAll(check(batch.toSet()))
        send(index < batches.lastIndex)
    }
}
