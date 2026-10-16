package com.nuvio.desktop.bridge

import com.nuvio.app.features.watchprogress.ResumePromptRepository

/** An app shutdown releases the player just like Back, but must retain its launch marker. */
internal class PlaybackResumePrompt(
    private val entered: (String) -> Unit = ResumePromptRepository::markPlayerEntered,
    private val exited: () -> Unit = ResumePromptRepository::markPlayerExitedNormally,
) {
    private var preserveOnExit = false

    fun enter(videoId: String) = entered(videoId)
    fun preserveForShutdown() { preserveOnExit = true }
    fun exit() { if (!preserveOnExit) exited() }
}
