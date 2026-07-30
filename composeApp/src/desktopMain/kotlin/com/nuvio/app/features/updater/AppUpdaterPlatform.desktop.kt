package com.nuvio.app.features.updater

import com.nuvio.app.core.build.AppVersionConfig
import com.nuvio.app.core.storage.DesktopStorage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.updates_download_failed_http
import nuvio.composeapp.generated.resources.updates_download_incomplete
import nuvio.composeapp.generated.resources.updates_downloaded_file_missing
import nuvio.composeapp.generated.resources.updates_empty_download_body
import org.jetbrains.compose.resources.getString
import java.io.File
import java.io.FileOutputStream
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.Locale
import kotlin.concurrent.thread
import kotlin.io.path.createDirectories
import kotlin.system.exitProcess

private const val desktopUpdaterPreferencesName = "nuvio_updater"
private const val ignoredTagKey = "ignored_release_tag"

private val desktopUpdaterHttpClient: HttpClient = HttpClient.newBuilder()
    .connectTimeout(Duration.ofSeconds(60))
    .followRedirects(HttpClient.Redirect.NORMAL)
    .build()

actual object AppUpdaterPlatform {
    private val currentOs: DesktopUpdaterOs = DesktopUpdaterOs.current()
    private val store = DesktopStorage.store(desktopUpdaterPreferencesName)
    actual val isDebugBuild: Boolean = false

    actual val isSupported: Boolean = currentOs != DesktopUpdaterOs.UNKNOWN

    actual val releaseSource: AppUpdateReleaseSource = AppUpdateReleaseSource(
        owner = "MichaelCommitsAt3AM",
        repo = "NuvioDesktopButBetter",
        channelBranch = null,
        includePrereleases = true,
        userAgent = "NuvioDesktop",
    )

    actual val assetSelector: AppUpdateAssetSelector
        get() = currentOs.assetSelector

    actual val currentVersionName: String = AppVersionConfig.DESKTOP_VERSION_NAME

    actual fun getIgnoredTag(): String? = store.getString(ignoredTagKey)

    actual fun setIgnoredTag(tag: String?) {
        store.putString(ignoredTagKey, tag)
    }

    actual suspend fun downloadUpdateAsset(
        assetUrl: String,
        assetName: String,
        onProgress: (downloadedBytes: Long, totalBytes: Long?) -> Unit,
    ): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val safeName = assetName.replace(Regex("[^a-zA-Z0-9._-]"), "_")
            val destination = File(updatesDir(), safeName)
            val tempFile = File(updatesDir(), "$safeName.part")
            if (destination.exists()) destination.delete()
            if (tempFile.exists()) tempFile.delete()

            val request = HttpRequest.newBuilder()
                .uri(URI(assetUrl))
                .timeout(Duration.ofSeconds(60))
                .GET()
                .build()
            val response = desktopUpdaterHttpClient.send(request, HttpResponse.BodyHandlers.ofInputStream())
            if (response.statusCode() !in 200..299) {
                error(runBlocking { getString(Res.string.updates_download_failed_http, response.statusCode()) })
            }

            val totalBytes = response.headers().firstValue("Content-Length").orElse(null)
                ?.toLongOrNull()
                ?.takeIf { it > 0L }
            var downloadedBytes = 0L
            response.body()?.use { input ->
                FileOutputStream(tempFile).use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val read = input.read(buffer)
                        if (read <= 0) break
                        output.write(buffer, 0, read)
                        downloadedBytes += read.toLong()
                        onProgress(downloadedBytes, totalBytes)
                    }
                    output.flush()
                }
            } ?: error(runBlocking { getString(Res.string.updates_empty_download_body) })

            if (totalBytes != null && downloadedBytes != totalBytes) {
                tempFile.delete()
                error(runBlocking { getString(Res.string.updates_download_incomplete) })
            }

            if (!tempFile.renameTo(destination)) {
                tempFile.copyTo(destination, overwrite = true)
                tempFile.delete()
            }
            destination.absolutePath
        }
    }

    actual fun canInstallDownloadedUpdate(): Boolean = true

    actual fun openInstallPermissionSettings() = Unit

    actual fun installDownloadedUpdate(path: String): Result<Unit> = runCatching {
        val updateFile = File(path)
        check(updateFile.exists()) { runBlocking { getString(Res.string.updates_downloaded_file_missing) } }

        if (currentOs == DesktopUpdaterOs.WINDOWS && updateFile.extension.equals("msi", ignoreCase = true)) {
            installWindowsMsiSilently(updateFile)
        } else {
            launchInstaller(updateFile)
            scheduleAppExit()
        }
    }

    private fun updatesDir(): File =
        File(DesktopStorage.rootDir.resolve("updates").also { it.createDirectories() }.toUri())

    private fun launchInstaller(updateFile: File) {
        val command = when (currentOs) {
            DesktopUpdaterOs.WINDOWS -> windowsInstallerCommand(updateFile)
            DesktopUpdaterOs.MACOS -> listOf("open", updateFile.absolutePath)
            DesktopUpdaterOs.LINUX -> listOf("xdg-open", updateFile.absolutePath)
            DesktopUpdaterOs.UNKNOWN -> error("Desktop updates are not supported on this operating system.")
        }
        ProcessBuilder(command).start()
    }

    private fun scheduleAppExit() {
        thread(name = "nuvio-updater-exit", isDaemon = true) {
            Thread.sleep(500)
            exitProcess(0)
        }
    }

    // Hands off to a detached script that waits for this process to release its file locks, runs msiexec silently, and relaunches - avoids the interactive wizard getting abandoned after we force-exit.
    private fun installWindowsMsiSilently(updateFile: File) {
        val exePath = ProcessHandle.current().info().command().orElse(null)
        if (exePath == null) {
            // Can't determine what to relaunch - fall back to the old interactive flow.
            launchInstaller(updateFile)
            scheduleAppExit()
            return
        }
        val script = writeWindowsUpdateScript(ProcessHandle.current().pid(), updateFile, File(exePath))
        ProcessBuilder("cmd", "/c", "start", "/min", "", script.absolutePath).start()
        exitProcess(0)
    }

    private fun writeWindowsUpdateScript(pid: Long, msiFile: File, exeFile: File): File {
        val script = File(updatesDir(), "apply-update.bat")
        script.writeText(
            """
            @echo off
            :waitloop
            tasklist /FI "PID eq $pid" 2>NUL | find /I "$pid" >NUL
            if not errorlevel 1 (
              timeout /t 1 /nobreak >NUL
              goto waitloop
            )
            msiexec /i "${msiFile.absolutePath}" /passive /norestart
            if %ERRORLEVEL%==0 start "" "${exeFile.absolutePath}"
            if %ERRORLEVEL%==3010 start "" "${exeFile.absolutePath}"
            del "%~f0"
            """.trimIndent()
        )
        return script
    }
}

private enum class DesktopUpdaterOs {
    WINDOWS,
    MACOS,
    LINUX,
    UNKNOWN;

    val assetSelector: AppUpdateAssetSelector
        get() {
            val archFragments = desktopArchitectureFragments()
            return when (this) {
                WINDOWS -> AppUpdateAssetSelector(
                    fileExtensions = listOf(".msi", ".exe"),
                    preferredNameFragments = archFragments + listOf("windows", "win"),
                    fallbackNameFragments = listOf("universal", "all"),
                )
                MACOS -> AppUpdateAssetSelector(
                    fileExtensions = listOf(".dmg", ".pkg"),
                    preferredNameFragments = archFragments + listOf("macos", "mac", "darwin"),
                    fallbackNameFragments = listOf("universal", "all"),
                )
                LINUX -> AppUpdateAssetSelector(
                    fileExtensions = listOf(".deb", ".AppImage"),
                    preferredNameFragments = archFragments + listOf("linux"),
                    fallbackNameFragments = listOf("universal", "all"),
                )
                UNKNOWN -> AppUpdateAssetSelector(fileExtensions = emptyList())
            }
        }

    companion object {
        fun current(): DesktopUpdaterOs {
            val osName = System.getProperty("os.name").orEmpty().lowercase(Locale.ROOT)
            return when {
                osName.contains("win") -> WINDOWS
                osName.contains("mac") -> MACOS
                osName.contains("linux") -> LINUX
                else -> UNKNOWN
            }
        }
    }
}

private fun desktopArchitectureFragments(): List<String> {
    val arch = System.getProperty("os.arch").orEmpty().lowercase(Locale.ROOT)
    return when {
        arch == "aarch64" || arch == "arm64" -> listOf("arm64", "aarch64")
        arch == "x86" || arch == "i386" || arch == "i686" -> listOf("x86", "i386", "i686")
        arch.contains("64") -> listOf("x64", "x86_64", "amd64")
        else -> emptyList()
    }
}

internal fun windowsInstallerCommand(updateFile: File): List<String> {
    if (!updateFile.extension.equals("msi", ignoreCase = true)) {
        return listOf(updateFile.absolutePath)
    }

    return listOf("msiexec", "/i", updateFile.absolutePath)
}
