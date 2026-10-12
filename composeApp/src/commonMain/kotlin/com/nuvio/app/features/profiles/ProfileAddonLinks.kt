package com.nuvio.app.features.profiles

/** Linked profiles share one list; missing/deleted sources leave an independent list. */
fun addonGroupRoot(profiles: List<NuvioProfile>, profileIndex: Int): Int {
    var current = profileIndex
    val visited = mutableSetOf<Int>()
    while (visited.add(current)) {
        val source = profiles.find { it.profileIndex == current }?.addonSyncProfileId ?: return current
        if (profiles.none { it.profileIndex == source }) return current
        current = source
    }
    error("Add-on profile links cannot form a cycle")
}

fun addonGroupMembers(profiles: List<NuvioProfile>, profileIndex: Int): List<Int> {
    val root = addonGroupRoot(profiles, profileIndex)
    return profiles.filter { addonGroupRoot(profiles, it.profileIndex) == root }
        .map { it.profileIndex }.ifEmpty { listOf(profileIndex) }
}

fun validateAddonProfileLink(profiles: List<NuvioProfile>, target: Int?, source: Int?) {
    if (source == null) return
    require(profiles.any { it.profileIndex == source }) { "Select an available profile to sync add-ons with" }
    var current: Int? = source
    val visited = mutableSetOf<Int>()
    while (current != null && visited.add(current)) {
        require(current != target) {
        "A profile cannot sync add-ons with itself or one of its linked profiles"
        }
        current = profiles.find { it.profileIndex == current }?.addonSyncProfileId
    }
}
