package com.nuvio.desktop.bridge

import kotlin.test.Test
import kotlin.test.assertEquals

class PlaybackResumePromptTest {
    @Test fun normalPlayerExitClearsTheSavedVideo() {
        var saved: String? = null
        val prompt = PlaybackResumePrompt(entered = { saved = it }, exited = { saved = null })
        prompt.enter("episode-2")
        assertEquals("episode-2", saved)
        prompt.exit()
        assertEquals(null, saved)
    }

    @Test fun shuttingDownKeepsTheVideoThroughReleaseAndRepeatedCleanup() {
        var saved: String? = null
        val prompt = PlaybackResumePrompt(entered = { saved = it }, exited = { saved = null })
        prompt.enter("episode-2")
        prompt.preserveForShutdown()
        prompt.exit()
        prompt.exit()
        assertEquals("episode-2", saved)
    }

    @Test fun aNewPlayerSessionClearsNormallyAfterAnEarlierShutdown() {
        var saved: String? = null
        val first = PlaybackResumePrompt(entered = { saved = it }, exited = { saved = null })
        first.enter("episode-2")
        first.preserveForShutdown()
        first.exit()
        val next = PlaybackResumePrompt(entered = { saved = it }, exited = { saved = null })
        next.enter("episode-3")
        next.exit()
        assertEquals(null, saved)
    }
}
