package com.nuvio.app.core.storage

import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.Locale

/**
 * Resolves the OS-appropriate *cache* directory, distinct from [DesktopStorage.rootDir] (which
 * is Roaming/config storage on Windows and gets recursively deleted by [DesktopStorage.wipe]).
 * Image cache data must live here instead: it's disposable, sized in the hundreds of MB, and
 * must never share a directory with a live Coil [coil3.disk.DiskCache] that gets wiped out from
 * under it.
 */
internal object DesktopCachePaths {
    val rootDir: Path by lazy {
        resolveCacheDir().also { Files.createDirectories(it) }
    }

    fun subdirectory(name: String): Path =
        rootDir.resolve(name).also { Files.createDirectories(it) }

    private fun resolveCacheDir(): Path {
        val osName = System.getProperty("os.name").orEmpty().lowercase(Locale.ROOT)
        val userHome = Paths.get(System.getProperty("user.home").orEmpty())
        return when {
            osName.contains("mac") -> userHome.resolve("Library/Caches/Nuvio")
            osName.contains("win") -> {
                val localAppData = System.getenv("LOCALAPPDATA")?.takeIf { it.isNotBlank() }
                (localAppData?.let(Paths::get) ?: userHome.resolve("AppData/Local")).resolve("Nuvio/Cache")
            }
            else -> {
                val xdgCache = System.getenv("XDG_CACHE_HOME")?.takeIf { it.isNotBlank() }
                (xdgCache?.let(Paths::get) ?: userHome.resolve(".cache")).resolve("nuvio")
            }
        }
    }
}
