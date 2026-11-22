package com.nuvio.desktop.bridge

import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.servers.ServerFailure
import com.nuvio.app.features.servers.ServerProviders
import com.nuvio.app.features.servers.plex.PlexProvider
import com.nuvio.app.features.servers.plex.PlexReach
import com.nuvio.app.features.servers.silo.SiloProvider
import com.nuvio.app.features.settings.PlexCodeMode
import com.nuvio.app.features.settings.PlexSignInFlow
import com.nuvio.app.features.settings.SiloSignInFlow
import com.nuvio.app.features.settings.SiloSignInStep
import com.nuvio.desktop.bridge.features.BridgeFeatureException
import com.nuvio.desktop.bridge.features.KidsBridge
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.net.URI

/**
 * Hosts upstream's Plex and Silo sign-in state machines (the Compose sheets' logic) for the React shell.
 * The snapshot carries only what the user sees: link codes, names and steps. Account/server tokens, Plex PIN ids,
 * Silo device codes and sign-in page URLs stay in Kotlin; [openPage] opens the current page itself.
 */
internal object ServerSignInBridge {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lock = Any()
    @Volatile private var plex: PlexSignInFlow? = null
    @Volatile private var silo: SiloSignInFlow? = null
    private var watcher: Job? = null
    @Volatile private var profileId: Int? = null
    @Volatile private var connectedName: String? = null

    private val mutableRevision = MutableStateFlow(0L)
    /** Bumps whenever the visible sign-in state changes, so the runtime re-emits the servers snapshot. */
    val revision: StateFlow<Long> = mutableRevision.asStateFlow()

    fun handles(method: String) = method.startsWith("servers.signIn.")

    fun dispatch(method: String, params: JsonObject) {
        if (KidsBridge.active != null) throw BridgeFeatureException("KIDS_BLOCKED", "Media servers are not available in kids mode.")
        when (method) {
            "servers.signIn.start" -> start(params.str("provider"))
            "servers.signIn.cancel" -> cancel()
            "servers.signIn.acknowledge" -> acknowledge()
            "servers.signIn.openPage" -> openPage()
            "servers.signIn.plexMode" -> plexFlow().newCode(if (params.str("mode") == "LINK") PlexCodeMode.LINK else PlexCodeMode.BROWSER)
            "servers.signIn.plexServer" -> plexFlow().let { flow ->
                val id = params.str("id")
                flow.state.value.servers.firstOrNull { it.machineId == id }?.let(flow::pickServer)
            }
            "servers.signIn.plexUser" -> plexFlow().let { flow ->
                val id = params.str("id")
                flow.state.value.users.firstOrNull { it.id == id }?.let(flow::pickUser)
            }
            "servers.signIn.back" -> {
                plex?.let { if (!it.back()) cancel() }
                silo?.let { flow ->
                    val state = flow.state.value
                    when {
                        state.busy -> Unit
                        state.step == SiloSignInStep.ADDRESS -> cancel()
                        state.step == SiloSignInStep.PIN && state.profiles.size > 1 -> flow.backToProfiles()
                        state.step == SiloSignInStep.PASSWORD && state.server?.codeSignIn == true -> flow.useCode()
                        // Signed in but no profile saved yet: close() ends that sign-in on the server.
                        state.step == SiloSignInStep.PROFILES || state.step == SiloSignInStep.PIN -> start(SiloProvider.ID)
                        else -> flow.backToAddress()
                    }
                }
            }
            "servers.signIn.pin" -> {
                val pin = params.str("pin")
                plex?.submitPin(pin) ?: silo?.submitPin(pin) ?: error("No sign-in in progress")
            }
            "servers.signIn.siloAddress" -> siloFlow().find(params.str("address"))
            "servers.signIn.siloNewCode" -> siloFlow().newCode()
            "servers.signIn.siloUseCode" -> siloFlow().useCode()
            "servers.signIn.siloUsePassword" -> siloFlow().usePassword()
            "servers.signIn.siloPassword" -> siloFlow().signInWithPassword(params.str("username"), params.str("password"))
            "servers.signIn.siloProfile" -> siloFlow().let { flow ->
                val id = params.str("id")
                flow.state.value.profiles.firstOrNull { it.id == id }?.let(flow::pickProfile)
            }
            else -> error("Unknown sign-in method")
        }
        bump()
    }

    private fun start(providerId: String) {
        cancel()
        val provider = ServerProviders.forId(providerId)
        synchronized(lock) {
            profileId = ProfileRepository.activeProfileId
            connectedName = null
            when (provider) {
                is PlexProvider -> {
                    val flow = PlexSignInFlow(provider, scope, onConnected = { connection -> connected(connection.name) })
                    plex = flow
                    watcher = scope.launch { flow.state.collect { bump() } }
                    flow.start()
                }
                is SiloProvider -> {
                    val flow = SiloSignInFlow(provider, scope, onConnected = { connection -> connected(connection.name) })
                    silo = flow
                    watcher = scope.launch { flow.state.collect { bump() } }
                    flow.start()
                }
                else -> error("Provider has no guided sign-in")
            }
        }
    }

    /** The user left the sign-in: Plex stops polling, Silo withdraws a waiting code and ends an unsaved sign-in. */
    fun cancel() {
        synchronized(lock) {
            watcher?.cancel(); watcher = null
            plex?.close(); plex = null
            silo?.close(); silo = null
            profileId = null
            connectedName = null
        }
        bump()
    }

    private fun connected(name: String) {
        synchronized(lock) {
            watcher?.cancel(); watcher = null
            plex = null; silo = null
            profileId = null
            connectedName = name
        }
        bump()
    }

    private fun openPageUrl(): String? {
        plex?.state?.value?.let { return it.authPage ?: if (it.pin != null) PLEX_LINK_PAGE else null }
        silo?.state?.value?.code?.let { return it.linkWithCode }
        return null
    }

    private fun openPage() {
        val url = openPageUrl() ?: error("No sign-in page")
        val uri = URI(url)
        require(uri.scheme?.lowercase() in setOf("http", "https") && !uri.host.isNullOrBlank() && uri.userInfo == null) { "Expected a web URL" }
        // Opening the browser can block; keep it off the RPC thread (requests are serialized behind it).
        scope.launch(Dispatchers.IO) { runCatching { java.awt.Desktop.getDesktop().browse(uri) } }
    }

    private fun plexFlow() = plex ?: error("No Plex sign-in")
    private fun siloFlow() = silo ?: error("No Silo sign-in")

    private fun bump() = mutableRevision.update { it + 1 }

    /** Sign-in state for the servers snapshot; tokens, device codes and page URLs are never included. */
    fun snapshot(): JsonElement {
        if (KidsBridge.active != null) return JsonNull
        val started = profileId
        if (started != null && started != ProfileRepository.activeProfileId) {
            // A sign-in finishing after a profile switch would land in the wrong profile's servers.
            scope.launch { cancel() }
            return JsonNull
        }
        plex?.state?.value?.let { state ->
            return buildJsonObject {
                put("provider", PlexProvider.ID)
                put("step", state.step.name)
                put("mode", state.mode.name)
                put("codePhase", state.codePhase.name)
                put("code", state.pin?.code.takeIf { state.mode == PlexCodeMode.LINK })
                put("linkHost", "plex.tv/link")
                put("canOpenPage", state.authPage != null || (state.pin != null && state.mode == PlexCodeMode.LINK))
                put("accountName", state.accountName)
                put("serversLoading", state.serversLoading)
                put("servers", buildJsonArray {
                    state.servers.forEach { server -> add(buildJsonObject {
                        put("id", server.machineId); put("name", server.name); put("owned", server.owned)
                        put("reach", server.reach.name); put("selectable", server.reach != PlexReach.OFFLINE)
                    }) }
                })
                put("server", state.server?.name)
                put("users", buildJsonArray {
                    state.users.forEach { user -> add(buildJsonObject {
                        put("id", user.id); put("name", user.name); put("hasPin", user.hasPin)
                        put("admin", user.admin); put("restricted", user.restricted)
                    }) }
                })
                put("pinFor", state.pinFor?.name)
                put("pinWrong", state.pinWrong)
                put("busy", state.busy)
                put("error", state.error?.let(::failureMessage))
            }
        }
        silo?.state?.value?.let { state ->
            return buildJsonObject {
                put("provider", SiloProvider.ID)
                put("step", state.step.name)
                put("codePhase", state.codePhase.name)
                put("code", state.code?.userCode)
                put("linkHost", state.code?.link?.let(::displayLink))
                put("canOpenPage", state.code != null)
                put("serverName", state.server?.name)
                put("passwordSignIn", state.server?.passwordSignIn == true)
                put("codeSignIn", state.server?.codeSignIn == true)
                put("profiles", buildJsonArray {
                    state.profiles.forEach { profile -> add(buildJsonObject {
                        put("id", profile.id); put("name", profile.name); put("hasPin", profile.hasPin); put("kids", profile.isChild)
                    }) }
                })
                put("pinFor", state.pinFor?.name)
                put("pinWrong", state.pinWrong)
                put("busy", state.busy)
                put("error", (state.problem?.name?.let(::siloProblemMessage) ?: state.error?.let(::failureMessage)))
            }
        }
        connectedName?.let { name -> return buildJsonObject { put("step", "CONNECTED"); put("serverName", name) } }
        return JsonNull
    }

    /** Clears the "connected" result once React has shown it. */
    fun acknowledge() {
        synchronized(lock) { connectedName = null }
        bump()
    }

    private fun displayLink(link: String): String = runCatching {
        val uri = URI(link)
        listOfNotNull(uri.host, uri.rawPath?.takeIf { it.isNotBlank() && it != "/" }).joinToString("")
    }.getOrNull() ?: ""

    private fun failureMessage(failure: ServerFailure): String = when (failure) {
        ServerFailure.AUTH_REQUIRED, ServerFailure.FORBIDDEN -> "Sign-in was refused. Check the account and try again."
        ServerFailure.UNREACHABLE -> "The server is unavailable."
        ServerFailure.UNSUPPORTED -> "This server isn't supported."
        ServerFailure.NOT_FOUND -> "The server could not be found."
        ServerFailure.INCOMPLETE -> "Still checking this server. Try again in a moment."
        ServerFailure.REMOTE_PLAYBACK_BLOCKED -> "Plex only allows playback from this server away from its home network with Plex Pass or a Remote Watch Pass."
        ServerFailure.FAILED -> "The sign-in could not be completed. Try again."
    }

    private fun siloProblemMessage(problem: String): String? = when (problem) {
        "NOT_SILO" -> "No Silo server answered at this address."
        "TEMPORARY_PASSWORD" -> "Change your temporary password in Silo's web app first, then sign in again."
        "PASSWORD_SIGN_IN_OFF" -> "This server has password sign-in turned off. Use a code instead."
        "TOO_MANY_TRIES" -> "Too many attempts. Wait a moment and try again."
        else -> null
    }

    private fun JsonObject.str(key: String) = this[key]?.jsonPrimitive?.contentOrNull ?: error("$key is required")

    private const val PLEX_LINK_PAGE = "https://plex.tv/link"
}
