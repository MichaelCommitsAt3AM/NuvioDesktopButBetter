package com.nuvio.app.core.storage

import java.net.JarURLConnection
import java.net.URL
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.security.MessageDigest

internal object DesktopCache {
    fun installVersionedFiles(namespace: String, files: Map<String, ByteArray>): Path {
        require(files.isNotEmpty())
        val directory = versionedDirectory(namespace, files)
        files.forEach { (relativePath, bytes) ->
            writeIfChanged(resolveTarget(directory, relativePath), bytes)
        }
        return directory
    }

    fun installVersionedResources(namespace: String, resources: Map<String, URL>): Path {
        require(resources.isNotEmpty())
        val directory = versionedDirectory(
            namespace,
            resources.mapValues { (_, url) -> resourceStamp(url).toByteArray(Charsets.UTF_8) },
        )
        resources.forEach { (relativePath, url) ->
            val target = resolveTarget(directory, relativePath)
            if (!Files.exists(target)) {
                url.openConnection().apply { useCaches = false }.getInputStream().use { input ->
                    writeAtomically(target) { pending -> Files.copy(input, pending, StandardCopyOption.REPLACE_EXISTING) }
                }
            }
        }
        return directory
    }

    private fun versionedDirectory(namespace: String, versionInputs: Map<String, ByteArray>): Path {
        require(namespace.isNotBlank())
        val digest = MessageDigest.getInstance("SHA-256")
        versionInputs.toSortedMap().forEach { (path, bytes) ->
            digest.update(path.toByteArray(Charsets.UTF_8))
            digest.update(0)
            digest.update(bytes)
        }
        val version = digest.digest().joinToString("") { byte -> "%02x".format(byte) }.take(24)
        val directory = DesktopStorage.cacheDir.resolve(namespace).resolve(version).normalize()
        require(directory.startsWith(DesktopStorage.cacheDir))
        return directory
    }

    private fun resolveTarget(directory: Path, relativePath: String): Path {
        val target = directory.resolve(relativePath).normalize()
        require(target.startsWith(directory))
        return target
    }

    private fun resourceStamp(url: URL): String {
        // FileURLConnection metadata access can open a stream on Windows. Read
        // filesystem attributes directly, and never retain cached JarFiles.
        if (url.protocol == "file") {
            val path = Path.of(url.toURI())
            return "${Files.size(path)}:${Files.getLastModifiedTime(path).toMillis()}"
        }
        val connection = url.openConnection().apply { useCaches = false }
        return if (connection is JarURLConnection) {
            connection.jarFile.use { jar ->
                val entry = requireNotNull(jar.getJarEntry(connection.entryName))
                "${entry.size}:${entry.crc}"
            }
        } else {
            connection.getInputStream().use { "${connection.contentLengthLong}:${connection.lastModified}" }
        }
    }

    private fun writeIfChanged(target: Path, bytes: ByteArray) {
        if (Files.exists(target) && Files.readAllBytes(target).contentEquals(bytes)) return
        writeAtomically(target) { pending -> Files.write(pending, bytes) }
    }

    private fun writeAtomically(target: Path, write: (Path) -> Unit) {
        Files.createDirectories(target.parent)
        val pending = Files.createTempFile(target.parent, target.fileName.toString(), ".part")
        try {
            write(pending)
            runCatching {
                Files.move(
                    pending,
                    target,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING,
                )
            }.getOrElse {
                Files.move(pending, target, StandardCopyOption.REPLACE_EXISTING)
            }
        } finally {
            Files.deleteIfExists(pending)
        }
    }
}
