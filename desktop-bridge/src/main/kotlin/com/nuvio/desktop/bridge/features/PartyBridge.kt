package com.nuvio.desktop.bridge.features

import com.nuvio.app.core.storage.DesktopStorage
import com.nuvio.app.features.party.PartyError
import com.nuvio.app.features.party.PartyRepository
import com.nuvio.app.features.party.formatPartyCode
import com.nuvio.app.features.party.isValidPartyCode
import com.nuvio.app.features.party.normalizePartyCode
import kotlinx.serialization.json.*

/**
 * Watch-party entry points that live outside the player: join by code, see the current party,
 * copy its code, leave. The in-player panel keeps its own UI.
 *
 * The party itself lives only in memory, but the seat stays reserved on the server. The last
 * party is remembered on disk so that after a restart this device can say it is still in that
 * party and offer to rejoin, the way the phone does.
 */
object PartyBridge {
    private val saved = DesktopStorage.store("nuvio_party_last_session")
    private var hadParty = false

    suspend fun dispatch(method: String, params: JsonObject): JsonElement? = when (method) {
        "party.snapshot" -> snapshot()
        "party.join" -> {
            val code = normalizePartyCode(params["code"]?.jsonPrimitive?.contentOrNull.orEmpty())
            withError(snapshot = join(code))
        }
        "party.rejoin" -> {
            val code = saved.getString("code").orEmpty()
            withError(snapshot = join(code))
        }
        "party.leave" -> leaveParty(end = false)
        "party.end" -> leaveParty(end = true)
        else -> null
    }

    private suspend fun leaveParty(end: Boolean): JsonObject {
        val code = saved.getString("code")
        when {
            PartyRepository.state.value.party != null -> if (end) PartyRepository.end() else PartyRepository.leave()
            // After a restart there is no live session: rejoin only to give the seat up properly.
            code != null -> if (PartyRepository.join(code) == null) PartyRepository.leave()
        }
        forget()
        return snapshot()
    }

    /** Called whenever the party state changes. */
    fun onState() {
        val party = PartyRepository.state.value.party
        if (party != null) {
            hadParty = true
            saved.putStrings(mapOf("code" to party.code, "title" to party.media.title))
        } else if (hadParty) {
            // Ended, removed or left while running: nothing to come back to.
            hadParty = false
            forget()
        }
    }

    private fun forget() = saved.removeAll(listOf("code", "title"))

    private suspend fun join(code: String): Pair<PartyError?, JsonObject> {
        val error = if (isValidPartyCode(code)) PartyRepository.join(code) else PartyError.NotFound
        if (error == PartyError.NotFound || error == PartyError.Ended || error == PartyError.Removed) {
            if (saved.getString("code") == code) forget()
        }
        return error to snapshot()
    }

    private fun withError(snapshot: Pair<PartyError?, JsonObject>): JsonObject = buildJsonObject {
        snapshot.second.forEach { (key, value) -> put(key, value) }
        put("error", snapshot.first?.name?.let(::JsonPrimitive) ?: JsonNull)
    }

    fun snapshot(): JsonObject {
        val state = PartyRepository.state.value
        val party = state.party
        val savedCode = saved.getString("code")
        return buildJsonObject {
            put("available", PartyRepository.available.value)
            put("canUse", PartyRepository.canUse)
            put("busy", state.busy)
            put("error", JsonNull)
            put("resumable", if (party != null || savedCode == null) JsonNull else buildJsonObject {
                put("code", savedCode)
                put("displayCode", formatPartyCode(savedCode))
                put("title", saved.getString("title").orEmpty())
            })
            put("party", if (party == null) JsonNull else buildJsonObject {
                put("code", party.code)
                put("displayCode", formatPartyCode(party.code))
                put("isHost", party.isHost)
                put("connected", party.connected)
                put("memberCount", party.members.size)
                put("maxMembers", party.maxMembers)
                put("members", buildJsonArray {
                    party.members.forEach { member ->
                        add(buildJsonObject {
                            put("id", member.id)
                            put("name", member.displayName)
                            put("isHost", member.id == party.hostMemberId)
                            put("isSelf", member.id == party.memberId)
                        })
                    }
                })
                put("media", buildJsonObject {
                    put("type", party.media.type)
                    put("metaId", party.media.metaId)
                    put("metaType", party.media.metaType)
                    put("videoId", (party.media.videoId ?: party.media.metaId).let(::JsonPrimitive))
                    put("title", party.media.title)
                    put("episodeTitle", party.media.episodeTitle?.let(::JsonPrimitive) ?: JsonNull)
                    put("season", party.media.season?.let(::JsonPrimitive) ?: JsonNull)
                    put("episode", party.media.episode?.let(::JsonPrimitive) ?: JsonNull)
                    put("poster", party.media.poster?.let(::JsonPrimitive) ?: JsonNull)
                })
            })
        }
    }
}
