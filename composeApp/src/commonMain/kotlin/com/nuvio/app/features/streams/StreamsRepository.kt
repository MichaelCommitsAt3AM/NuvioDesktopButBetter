package com.nuvio.app.features.streams

import co.touchlab.kermit.Logger
import com.nuvio.app.core.build.AppFeaturePolicy
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.addons.enabledAddons
import com.nuvio.app.features.debrid.DirectDebridStreamPreparer
import com.nuvio.app.features.debrid.DebridSettingsRepository
import com.nuvio.app.features.debrid.DebridStreamPresentation
import com.nuvio.app.features.details.MetaDetailsRepository
import com.nuvio.app.features.player.PlayerSettingsRepository
import com.nuvio.app.features.plugins.PluginRepository
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.plugins.PluginsUiState
import com.nuvio.app.features.servers.ServerStreams
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.time.TimeSource

object StreamsRepository {
    private val log = Logger.withTag("StreamsRepo")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _uiState = MutableStateFlow(StreamsUiState())
    val uiState: StateFlow<StreamsUiState> = _uiState.asStateFlow()

    private var activeJob: Job? = null
    private var activeRequestKey: String? = null

    fun requestToken(
        type: String,
        videoId: String,
        season: Int? = null,
        episode: Int? = null,
        manualSelection: Boolean = false,
    ): String =
        "$type::$videoId::$season::$episode::$manualSelection"

    fun load(type: String, videoId: String, parentMetaId: String? = null, season: Int? = null, episode: Int? = null, manualSelection: Boolean = false, contentTitle: String? = null) {
        PluginRepository.setLocalPluginSearchPaused(false)
        load(
            type = type,
            videoId = videoId,
            parentMetaId = parentMetaId,
            season = season,
            episode = episode,
            manualSelection = manualSelection,
            contentTitle = contentTitle,
            forceRefresh = false,
        )
    }

    fun reload(type: String, videoId: String, parentMetaId: String? = null, season: Int? = null, episode: Int? = null, manualSelection: Boolean = false, contentTitle: String? = null) {
        PluginRepository.setLocalPluginSearchPaused(false)
        load(
            type = type,
            videoId = videoId,
            parentMetaId = parentMetaId,
            season = season,
            episode = episode,
            manualSelection = manualSelection,
            contentTitle = contentTitle,
            forceRefresh = true,
        )
    }

    private fun load(type: String, videoId: String, parentMetaId: String?, season: Int?, episode: Int?, manualSelection: Boolean, contentTitle: String?, forceRefresh: Boolean) {
        val pluginUiState = if (AppFeaturePolicy.pluginsEnabled) {
            PluginRepository.initialize()
            PluginRepository.uiState.value
        } else {
            PluginsUiState(pluginsEnabled = false)
        }
        val requestToken = requestToken(
            type = type,
            videoId = videoId,
            season = season,
            episode = episode,
            manualSelection = manualSelection,
        )
        val requestKey = "$requestToken::pluginsGrouped=${pluginUiState.groupStreamsByRepository}::title=$contentTitle::titlePreference=${DebridSettingsRepository.snapshot().streamPreferences.preferMatchingReleaseTitles}"
        val currentState = _uiState.value
        if (
            !forceRefresh &&
            activeRequestKey == requestKey &&
            (currentState.groups.isNotEmpty() || currentState.emptyStateReason != null || currentState.isAnyLoading)
        ) {
            log.d { "Skipping stream reload for unchanged request type=$type id=$videoId" }
            return
        }

        activeRequestKey = requestKey
        activeJob?.cancel()
        _uiState.value = StreamsUiState(requestToken = requestToken, contentVideoId = videoId)

        PlayerSettingsRepository.ensureLoaded()
        val playerSettings = PlayerSettingsRepository.uiState.value
        val debridSettings = DebridSettingsRepository.snapshot()
        val streamBadgeRules = StreamBadgeSettingsRepository.snapshot()
        val autoPlayMode = playerSettings.streamAutoPlayMode
        val isAutoPlayEnabled = !manualSelection && autoPlayMode != StreamAutoPlayMode.MANUAL &&
            !(autoPlayMode == StreamAutoPlayMode.REGEX_MATCH &&
                !StreamAutoPlayPolicy.isRegexSelectionConfigured(playerSettings.streamAutoPlayRegex))

        // Look up persisted binge group when both settings are enabled
        val persistedBingeGroup = if (
            playerSettings.streamAutoPlayPreferBingeGroup &&
            playerSettings.streamAutoPlayReuseBingeGroup
        ) {
            parentMetaId?.let { BingeGroupCacheRepository.get(it) }
        } else null
        val persistedFilename = if (persistedBingeGroup != null) {
            parentMetaId?.let { BingeGroupCacheRepository.getFilename(it) }
        } else null
        val persistedInfoHash = if (persistedBingeGroup != null) {
            parentMetaId?.let { BingeGroupCacheRepository.getInfoHash(it) }
        } else null

        // Enable direct auto-play flow if normal auto-play is enabled,
        // OR if we have a persisted binge group in MANUAL mode
        val bingeGroupDirectFlow = !manualSelection &&
            persistedBingeGroup != null &&
            autoPlayMode == StreamAutoPlayMode.MANUAL
        val isDirectAutoPlayFlow = isAutoPlayEnabled || bingeGroupDirectFlow

        if (isDirectAutoPlayFlow) {
            _uiState.value = StreamsUiState(
                requestToken = requestToken,
                isDirectAutoPlayFlow = true,
                autoPlayDecided = true,
                showDirectAutoPlayOverlay = true,
            )
        }

        val embeddedStreams = MetaDetailsRepository.findEmbeddedStreams(videoId)
        if (embeddedStreams.isNotEmpty()) {
            log.d { "Using ${embeddedStreams.size} embedded streams for type=$type id=$videoId" }
            val group = AddonStreamGroup(
                addonName = embeddedStreams.first().addonName,
                addonId = "embedded",
                streams = com.nuvio.app.features.streams.StreamTitlePreference.order(
                    embeddedStreams, contentTitle, debridSettings.streamPreferences.preferMatchingReleaseTitles,
                ),
                isLoading = false,
            )
            val presentedGroup = StreamBadgePresentation.apply(
                groups = listOf(group),
                rules = streamBadgeRules,
            ).firstOrNull() ?: group
            _uiState.value = StreamsUiState(
                requestToken = requestToken,
                groups = listOf(presentedGroup),
                autoPlayDecided = true,
                activeAddonIds = setOf("embedded"),
                isAnyLoading = false,
            )
            return
        }

        val isNativeServerRequest = ServerStreams.isNativeRequest(videoId)
        val serverSources = ServerStreams.sources(type, videoId, season, episode, forceRefresh)
        val preferredGroupIds = serverSources.filter { it.preferred }.mapTo(mutableSetOf()) { it.addonId }
        val installedAddons = if (isNativeServerRequest) emptyList() else AddonRepository.uiState.value.addons.enabledAddons()
        val pluginScrapers = if (AppFeaturePolicy.pluginsEnabled && !isNativeServerRequest) {
            PluginRepository.getEnabledScrapersForType(type)
        } else {
            emptyList()
        }
        val pluginProviderGroups = pluginScrapers.toPluginProviderGroups(
            repositories = pluginUiState.repositories,
            groupByRepository = pluginUiState.groupStreamsByRepository,
        )

        if (installedAddons.isEmpty() && pluginProviderGroups.isEmpty() && serverSources.isEmpty()) {
            _uiState.value = StreamsUiState(
                requestToken = requestToken,
                isAnyLoading = false,
                emptyStateReason = StreamsEmptyStateReason.NoAddonsInstalled,
                autoPlayDecided = true,
            )
            return
        }

        val streamAddons = installedAddons
            .mapNotNull { addon ->
                val manifest = addon.manifest ?: return@mapNotNull null
                if (!manifest.supportsStream(type, videoId)) return@mapNotNull null

                InstalledStreamAddonTarget(
                    addonName = addon.displayTitle.ifBlank { manifest.name },
                    addonId = addon.streamAddonInstanceId(manifest.id),
                    manifest = manifest,
                )
            }

        log.d { "Found ${streamAddons.size} addons for stream type=$type id=$videoId" }

        if (streamAddons.isEmpty() && pluginProviderGroups.isEmpty() && serverSources.isEmpty()) {
            _uiState.value = StreamsUiState(
                requestToken = requestToken,
                isAnyLoading = false,
                emptyStateReason = StreamsEmptyStateReason.NoCompatibleAddons,
                autoPlayDecided = true,
            )
            return
        }

        // Initialise loading placeholders
        val searchTargets = StreamSearchTargets(
            type = type,
            videoId = videoId,
            season = season,
            episode = episode,
            streamAddons = streamAddons,
            serverSources = serverSources,
            pluginProviderGroups = pluginProviderGroups,
        )
        val installedAddonOrder = streamAddons.map { it.addonName }
        val initialGroups = StreamAutoPlaySelector.orderAddonStreams(streamAddons.map { addon ->
            AddonStreamGroup(
                addonName = addon.addonName,
                addonId = addon.addonId,
                streams = emptyList(),
                isLoading = true,
            )
        } + pluginProviderGroups.map { providerGroup ->
            AddonStreamGroup(
                addonName = providerGroup.addonName,
                addonId = providerGroup.addonId,
                streams = emptyList(),
                isLoading = true,
            )
        } + serverSources.map { it.loadingGroup() }, installedAddonOrder, preferredGroupIds)
        val isInitiallyLoading = initialGroups.any { it.isLoading }
        _uiState.value = StreamsUiState(
            requestToken = requestToken,
            groups = initialGroups,
            activeAddonIds = initialGroups.map { it.addonId }.toSet(),
            isAnyLoading = isInitiallyLoading,
            emptyStateReason = null,
            isDirectAutoPlayFlow = isDirectAutoPlayFlow,
            autoPlayDecided = true,
            showDirectAutoPlayOverlay = isDirectAutoPlayFlow,
        )

        val searchStarted = TimeSource.Monotonic.markNow()
        log.i { "Stream search started: type=$type video=$videoId sources=${initialGroups.size} fresh=$forceRefresh" }
        val searchJob = scope.launch {
            val pluginRemainingByAddonId = pluginProviderGroups
                .associate { it.addonId to it.scrapers.size }
                .toMutableMap()
            val pluginFirstErrorByAddonId = mutableMapOf<String, String>()

            val installedAddonNames = installedAddonOrder.toSet()
            // Data Saver turns file sizes into bitrates with the runtime, from the details already loaded.
            val autoPlayRuntimeSeconds = MetaDetailsRepository.peek(type, parentMetaId ?: videoId)
                ?.let { meta -> com.nuvio.app.features.downloads.DownloadRuntimeResolver.runtimeSeconds(meta, videoId) }
            val installedAddonIds = streamAddons.map { it.addonId }.toSet()
            var autoSelectTriggered = false
            var timeoutElapsed = false
            // Started once some add-on has a playable stream while another is still loading (see below).
            var stragglerJob: Job? = null
            fun evaluateAutoPlay(bingeGroupOnly: Boolean = false): StreamAutoPlayEvaluation =
                StreamAutoPlaySelector.evaluateAutoPlayStream(
                    streams = _uiState.value.groups.flatMap { it.streams },
                    mode = autoPlayMode,
                    regexPattern = playerSettings.streamAutoPlayRegex,
                    source = playerSettings.streamAutoPlaySource,
                    installedAddonNames = installedAddonNames,
                    selectedAddons = playerSettings.streamAutoPlaySelectedAddons,
                    selectedPlugins = playerSettings.streamAutoPlaySelectedPlugins,
                    preferredBingeGroup = persistedBingeGroup,
                    preferBingeGroupInSelection = persistedBingeGroup != null,
                    bingeGroupOnly = bingeGroupOnly,
                    debridEnabled = debridSettings.canResolvePlayableLinks,
                    activeResolverProviderId = debridSettings.activeResolverProviderId,
                    contentTitle = contentTitle,
                    preferMatchingReleaseTitles = debridSettings.streamPreferences.preferMatchingReleaseTitles,
                    runtimeSeconds = autoPlayRuntimeSeconds,
                )

            fun settleAutoPlay(evaluation: StreamAutoPlayEvaluation) {
                if (autoSelectTriggered) return
                autoSelectTriggered = true
                _uiState.update { current ->
                    if (evaluation.stream == null) {
                        current.copy(
                            autoPlayStream = null,
                            autoPlayCandidates = emptyList(),
                            isDirectAutoPlayFlow = false,
                            showDirectAutoPlayOverlay = false,
                        )
                    } else {
                        current.copy(
                            autoPlayStream = evaluation.stream,
                            autoPlayCandidates = evaluation.readyStreams,
                        )
                    }
                }
            }

            fun updateAutoPlayAfterStreamsChanged() {
                if (!isDirectAutoPlayFlow || autoSelectTriggered) return

                // Try binge group + filename first (most precise), then infoHash
                if (persistedBingeGroup != null && !timeoutElapsed) {
                    val allStreams = _uiState.value.groups.flatMap { it.streams }
                    // Filename match
                    if (persistedFilename != null) {
                        val nextFilename = run {
                            val extracted = FilenameEpisodeMatcher.extractSeasonEpisode(persistedFilename)
                            if (extracted != null) {
                                FilenameEpisodeMatcher.buildNextFilename(
                                    persistedFilename, extracted.first, extracted.second, season, episode ?: 0
                                ) ?: persistedFilename
                            } else persistedFilename
                        }
                        val bingeAndFilename = allStreams.firstOrNull { stream ->
                            stream.behaviorHints.bingeGroup == persistedBingeGroup &&
                                FilenameEpisodeMatcher.matches(stream.behaviorHints.filename, nextFilename)
                        }
                        if (bingeAndFilename != null) {
                            settleAutoPlay(StreamAutoPlayEvaluation(bingeAndFilename, allStreams))
                            return
                        }
                    }
                    // InfoHash match (fallback when filename didn't match or was null)
                    if (persistedInfoHash != null) {
                        val bingeAndInfoHash = allStreams.firstOrNull { stream ->
                            stream.behaviorHints.bingeGroup == persistedBingeGroup &&
                                stream.infoHash?.equals(persistedInfoHash, ignoreCase = true) == true
                        }
                        if (bingeAndInfoHash != null) {
                            settleAutoPlay(StreamAutoPlayEvaluation(bingeAndInfoHash, allStreams))
                            return
                        }
                    }
                }

                val earlyEvaluation = when {
                    timeoutElapsed -> evaluateAutoPlay()
                    persistedBingeGroup != null -> evaluateAutoPlay(bingeGroupOnly = true)
                    else -> null
                }
                if (earlyEvaluation?.stream != null) {
                    settleAutoPlay(earlyEvaluation)
                    return
                }

                if (
                    _uiState.value.groups.areAutoPlaySourcesLoaded(
                        source = playerSettings.streamAutoPlaySource,
                        installedAddonIds = installedAddonIds,
                    )
                ) {
                    settleAutoPlay(evaluateAutoPlay())
                    return
                }

                // An add-on that hangs (or answers very slowly) must not hold auto-play when another has
                // already returned a playable stream: give the rest a grace period, then go with the best
                // stream available. This applies whatever the auto-play timeout is, including unlimited.
                if (stragglerJob == null && _uiState.value.groups.any { !it.isLoading && it.streams.isNotEmpty() }) {
                    stragglerJob = launch {
                        delay(AUTO_PLAY_STRAGGLER_GRACE_MS)
                        if (autoSelectTriggered || _uiState.value.groups.none { it.isLoading }) return@launch
                        val evaluation = evaluateAutoPlay()
                        if (evaluation.stream != null) {
                            log.i { "Auto-play continuing without slow add-ons: video=$videoId waiting=${_uiState.value.groups.filter { it.isLoading }.joinToString { it.addonName }}" }
                            settleAutoPlay(evaluation)
                        }
                    }
                }
            }

            fun presentStreamGroup(group: AddonStreamGroup): AddonStreamGroup {
                log.i { "Stream presentation started: video=$videoId source=${group.addonName} count=${group.streams.size}" }
                val badgeGroup = StreamBadgePresentation.apply(
                    groups = listOf(group),
                    rules = streamBadgeRules,
                ).firstOrNull() ?: group
                return DebridStreamPresentation.apply(
                    groups = listOf(badgeGroup),
                    settings = debridSettings,
                    contentTitle = contentTitle,
                ).firstOrNull() ?: badgeGroup
            }

            fun publishAddonGroup(group: AddonStreamGroup) {
                log.i { "Stream results published: video=$videoId source=${group.addonName} count=${group.streams.size} loading=${group.isLoading} failed=${group.error != null} elapsedMs=${searchStarted.elapsedNow().inWholeMilliseconds}" }
                _uiState.update { current ->
                    val updated = StreamAutoPlaySelector.orderAddonStreams(
                        groups = current.groups.map { currentGroup ->
                            if (currentGroup.addonId == group.addonId) group else currentGroup
                        },
                        installedOrder = installedAddonOrder,
                        preferredGroupIds = preferredGroupIds,
                    )
                    val anyLoading = updated.any { it.isLoading }
                    current.copy(
                        groups = updated,
                        isAnyLoading = anyLoading,
                        emptyStateReason = updated.toEmptyStateReason(anyLoading),
                    )
                }
                updateAutoPlayAfterStreamsChanged()
            }

            updateAutoPlayAfterStreamsChanged()

            val timeoutJob = if (isDirectAutoPlayFlow) {
                val timeoutSeconds = playerSettings.streamAutoPlayTimeoutSeconds
                val isUnlimitedTimeout = timeoutSeconds == Int.MAX_VALUE
                // Timeout semantics:
                // - 0 (instant): timeoutElapsed immediately, full select on each response
                // - 1-30 (bounded): wait the configured delay, then full select
                // - unlimited (Int.MAX_VALUE): timeoutElapsed immediately, full select on each response,
                //   with 60s hard fallback to stream picker
                if (timeoutSeconds <= 0 || isUnlimitedTimeout) {
                    timeoutElapsed = true
                    // For unlimited: launch a hard 60s fallback to dismiss overlay
                    if (isUnlimitedTimeout) {
                        launch {
                            delay(60_000L)
                            if (!autoSelectTriggered) {
                                settleAutoPlay(evaluateAutoPlay())
                            }
                        }
                    } else {
                        null
                    }
                } else {
                    // Bounded timeout (1-30s)
                    launch {
                        delay(timeoutSeconds * 1_000L)
                        timeoutElapsed = true
                        if (!autoSelectTriggered) {
                            val allStreams = _uiState.value.groups.flatMap { it.streams }
                            if (allStreams.isNotEmpty()) {
                                val evaluation = evaluateAutoPlay()
                                if (evaluation.stream != null || !evaluation.hasPendingDebridCandidate) {
                                    settleAutoPlay(evaluation)
                                }
                            }
                        }
                    }
                }
            } else {
                null
            }

            StreamSearchSessions.search(
                profileId = ProfileRepository.activeProfileId,
                targets = searchTargets,
                forceRefresh = forceRefresh,
            ).collect { completion ->
                when (completion) {
                    is StreamLoadCompletion.Addon -> {
                        val result = completion.group
                        publishAddonGroup(presentStreamGroup(result))
                    }

                    is StreamLoadCompletion.PluginScraper -> {
                        val remaining = (pluginRemainingByAddonId[completion.addonId] ?: 1) - 1
                        pluginRemainingByAddonId[completion.addonId] = remaining.coerceAtLeast(0)
                        if (!completion.error.isNullOrBlank() && pluginFirstErrorByAddonId[completion.addonId].isNullOrBlank()) {
                            pluginFirstErrorByAddonId[completion.addonId] = completion.error
                        }

                        _uiState.update { current ->
                            val updated = StreamAutoPlaySelector.orderAddonStreams(
                                groups = current.groups.map { group ->
                                    if (group.addonId != completion.addonId) {
                                        group
                                    } else {
                                        val mergedStreams = if (completion.streams.isEmpty()) {
                                            group.streams
                                        } else {
                                            (group.streams + completion.streams).sortedForGroupedDisplay()
                                        }
                                        val stillLoading = remaining > 0
                                        val finalError = if (mergedStreams.isEmpty() && !stillLoading) {
                                            pluginFirstErrorByAddonId[completion.addonId]
                                        } else {
                                            null
                                        }
                                        presentStreamGroup(
                                            group.copy(
                                                streams = mergedStreams,
                                                isLoading = stillLoading,
                                                error = finalError,
                                            ),
                                        )
                                    }
                                },
                                installedOrder = installedAddonOrder,
                                preferredGroupIds = preferredGroupIds,
                            )
                            val anyLoading = updated.any { it.isLoading }
                            current.copy(
                                groups = updated,
                                isAnyLoading = anyLoading,
                                emptyStateReason = updated.toEmptyStateReason(anyLoading),
                            )
                        }
                        updateAutoPlayAfterStreamsChanged()
                    }

                }
            }

            // A search dropped before it finished leaves its remaining sources without a result.
            _uiState.update { it.withoutPendingGroups() }

            launch {
                DirectDebridStreamPreparer.prepare(
                    streams = _uiState.value.groups
                        .filter { it.addonId in installedAddonIds }
                        .flatMap { it.streams },
                    season = season,
                    episode = episode,
                    playerSettings = playerSettings,
                    installedAddonNames = installedAddonNames,
                ) { original, prepared ->
                    _uiState.update { current ->
                        current.copy(
                            groups = DirectDebridStreamPreparer.replacePreparedStream(
                                groups = current.groups,
                                original = original,
                                prepared = prepared,
                                eligibleGroupIds = installedAddonIds,
                            ),
                        )
                    }
                    updateAutoPlayAfterStreamsChanged()
                }
            }

            if (isDirectAutoPlayFlow && !autoSelectTriggered) {
                settleAutoPlay(evaluateAutoPlay())
            }
            timeoutJob?.cancel()
            stragglerJob?.cancel()
        }
        activeJob = searchJob
        searchJob.invokeOnCompletion { failure ->
            log.i { "Stream search finished: video=$videoId kind=${failure?.let { it::class.simpleName } ?: "success"} elapsedMs=${searchStarted.elapsedNow().inWholeMilliseconds}" }
            // An exception in parsing/presentation/enrichment must not strand the UI.
            // A cancelled older search must never settle a replacement request.
            if (failure != null && failure !is kotlinx.coroutines.CancellationException && activeJob === searchJob) {
                _uiState.update { current ->
                    val groups = current.groups.map { group ->
                        if (group.isLoading) group.copy(isLoading = false, error = "Could not process streams. Please try again.") else group
                    }
                    current.copy(groups = groups, isAnyLoading = false,
                        emptyStateReason = groups.toEmptyStateReason(false),
                        showDirectAutoPlayOverlay = false, isDirectAutoPlayFlow = false)
                }
            }
        }
    }

    fun selectFilter(addonId: String?) {
        _uiState.update { it.copy(selectedFilter = addonId) }
    }

    fun setDownloadFilterMode(mode: com.nuvio.app.features.downloads.DownloadStreamFilterMode) {
        _uiState.update { it.copy(downloadFilterMode = mode) }
    }

    fun consumeAutoPlay() {
        activeRequestKey = null
        _uiState.update {
            it.copy(
                autoPlayStream = null,
                autoPlayCandidates = emptyList(),
                isDirectAutoPlayFlow = false,
                showDirectAutoPlayOverlay = false,
            )
        }
    }

    fun skipAutoPlayStream(stream: StreamItem): Boolean {
        var hasNext = false
        _uiState.update { current ->
            val failedIndex = current.autoPlayCandidates.indexOf(stream)
            val remaining = if (failedIndex >= 0) {
                current.autoPlayCandidates.drop(failedIndex + 1)
            } else {
                current.autoPlayCandidates.drop(1)
            }
            hasNext = remaining.isNotEmpty()
            current.copy(
                autoPlayStream = remaining.firstOrNull(),
                autoPlayCandidates = remaining,
                isDirectAutoPlayFlow = remaining.isNotEmpty(),
                showDirectAutoPlayOverlay = remaining.isNotEmpty(),
                overlayMessage = null,
            )
        }
        return hasNext
    }

    fun cancelLoading() {
        PluginRepository.setLocalPluginSearchPaused(true)
        activeJob?.cancel()
        activeJob = null
        _uiState.update { current ->
            if (!current.isAnyLoading && current.groups.none { it.isLoading }) {
                current
            } else {
                val updatedGroups = current.groups.map { group ->
                    if (group.isLoading) group.copy(isLoading = false) else group
                }
                current.copy(
                    groups = updatedGroups,
                    isAnyLoading = false,
                    emptyStateReason = if (updatedGroups.isEmpty()) {
                        current.emptyStateReason
                    } else {
                        updatedGroups.toEmptyStateReason(anyLoading = false)
                    },
                )
            }
        }
    }

    fun clear() {
        PluginRepository.setLocalPluginSearchPaused(true)
        activeJob?.cancel()
        activeJob = null
        activeRequestKey = null
        _uiState.value = StreamsUiState()
    }

    fun setOverlayVisible(visible: Boolean, message: String? = null) {
        _uiState.update { it.copy(showDirectAutoPlayOverlay = visible, overlayMessage = message) }
    }
}

/** How long auto-play waits for slower add-ons once another has returned a playable stream. */
internal const val AUTO_PLAY_STRAGGLER_GRACE_MS = 10_000L
