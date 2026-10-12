package com.nuvio.app.features.profiles

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class ProfileAddonLinksTest {
    private val profiles = listOf(NuvioProfile(profileIndex = 1), NuvioProfile(profileIndex = 2, addonSyncProfileId = 1), NuvioProfile(profileIndex = 3, addonSyncProfileId = 2), NuvioProfile(profileIndex = 4))

    @Test fun changesFromEitherSideReachTheWholeGroup() {
        assertEquals(listOf(1, 2, 3), addonGroupMembers(profiles, 1))
        assertEquals(listOf(1, 2, 3), addonGroupMembers(profiles, 3))
        assertEquals(listOf(4), addonGroupMembers(profiles, 4))
    }
    @Test fun unlinkKeepsDescendantsTogetherButSeparatesFromOriginal() {
        val unlinked = profiles.map { if (it.profileIndex == 2) it.copy(addonSyncProfileId = null) else it }
        assertEquals(listOf(1), addonGroupMembers(unlinked, 1))
        assertEquals(listOf(2, 3), addonGroupMembers(unlinked, 2))
    }
    @Test fun rejectsSelfMissingSourceAndCycles() {
        assertFailsWith<IllegalArgumentException> { validateAddonProfileLink(profiles, 2, 2) }
        assertFailsWith<IllegalArgumentException> { validateAddonProfileLink(profiles, 1, 3) }
        assertFailsWith<IllegalArgumentException> { validateAddonProfileLink(profiles, 2, 3) }
        assertFailsWith<IllegalArgumentException> { validateAddonProfileLink(profiles, null, 6) }
        validateAddonProfileLink(profiles, null, 3)
        validateAddonProfileLink(profiles, 4, 2)
    }
    @Test fun deletedSourceBecomesAnIndependentGroup() {
        assertEquals(listOf(2, 3), addonGroupMembers(profiles.filter { it.profileIndex != 1 }, 2))
    }
    @Test fun oldProfileCachesDecodeWithoutALink() {
        val decoded = kotlinx.serialization.json.Json.decodeFromString<NuvioProfile>("{\"profile_index\":2}")
        assertEquals(null, decoded.addonSyncProfileId)
    }
}
