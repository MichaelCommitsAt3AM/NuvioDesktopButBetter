package com.nuvio.app.features.player.desktop

import com.nuvio.app.core.storage.DesktopStorage
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/**
 * Downloads remote subtitle files (addon-provided .srt/.vtt/.ass) to local disk so mpv's
 * `sub-add` never has to perform a blocking network fetch on its own core/demuxer thread.
 *
 * Handing mpv a remote URL makes `sub-add` synchronously open an HTTP connection *inside*
 * the mpv command call — that stalls the whole player (shows as the loading spinner) for the
 * length of the round-trip. Resolving to a local file here happens on a background thread,
 * fully overlapped with video buffering/playback, so by the time we call into mpv it's just a
 * fast local file open.
 */
internal object DesktopSubtitleFileCache {
    private val cacheDir: File by lazy {
        DesktopStorage.cacheDir.resolve("subtitle-files").toFile().apply { mkdirs() }
    }

    /** True for values that are already usable by mpv without a network fetch. */
    fun isLocalPath(value: String): Boolean =
        !value.startsWith("http://", ignoreCase = true) && !value.startsWith("https://", ignoreCase = true)

    /**
     * Returns a local absolute path for [url], downloading and caching it first if needed.
     * Safe to call from a background thread only — this blocks on network I/O.
     */
    fun resolve(url: String): String {
        if (isLocalPath(url)) return url

        val target = File(cacheDir, "${sha256(url)}.${extensionFor(url)}")
        if (target.isFile && target.length() > 0L) return target.absolutePath

        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 10_000
            readTimeout = 15_000
            requestMethod = "GET"
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", "Nuvio/1.0")
        }
        try {
            val status = connection.responseCode
            require(status in 200..299) { "HTTP $status fetching subtitle" }
            val pending = Files.createTempFile(cacheDir.toPath(), "subtitle-", ".part")
            try {
                connection.inputStream.use { input ->
                    Files.newOutputStream(pending).use { output -> input.copyTo(output) }
                }
                runCatching {
                    Files.move(pending, target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
                }.getOrElse {
                    Files.move(pending, target.toPath(), StandardCopyOption.REPLACE_EXISTING)
                }
            } finally {
                Files.deleteIfExists(pending)
            }
        } finally {
            connection.disconnect()
        }
        return target.absolutePath
    }

    private fun extensionFor(url: String): String {
        val path = url.substringBefore('?').substringBefore('#')
        val ext = path.substringAfterLast('.', "")
        return if (ext.isNotBlank() && ext.length <= 5 && ext.all(Char::isLetterOrDigit)) ext else "srt"
    }

    private fun sha256(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { byte -> "%02x".format(byte) }
    }
}
