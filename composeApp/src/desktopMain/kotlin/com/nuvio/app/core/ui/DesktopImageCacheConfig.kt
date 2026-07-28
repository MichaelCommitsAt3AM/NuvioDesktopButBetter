package com.nuvio.app.core.ui

import com.nuvio.app.core.storage.DesktopCachePaths
import java.lang.management.ManagementFactory

/**
 * Sizing for the desktop Coil caches. Bitmaps decoded by [NuvioSkiaImageDecoder] are Skia-native
 * allocations, off the JVM heap — so budgets are derived from physical RAM, not
 * Runtime.maxMemory(), which has almost no relationship to how much native image memory is safe
 * to hold onto.
 */
internal object DesktopImageCacheConfig {
    private const val MemoryBudgetFraction = 0.02
    private const val MinMemoryBudgetBytes = 128L * 1024 * 1024
    private const val MaxMemoryBudgetBytes = 320L * 1024 * 1024
    private const val FallbackMemoryBudgetBytes = 192L * 1024 * 1024

    const val DiskCacheMaxSizeBytes = 300L * 1024 * 1024

    val memoryCacheMaxSizeBytes: Long by lazy {
        val totalPhysicalMemoryBytes = totalPhysicalMemoryBytesOrNull()
        if (totalPhysicalMemoryBytes == null || totalPhysicalMemoryBytes <= 0L) {
            FallbackMemoryBudgetBytes
        } else {
            (totalPhysicalMemoryBytes * MemoryBudgetFraction).toLong()
                .coerceIn(MinMemoryBudgetBytes, MaxMemoryBudgetBytes)
        }
    }

    fun diskCacheDirectory() = DesktopCachePaths.subdirectory("image_cache")

    @Suppress("DEPRECATION")
    private fun totalPhysicalMemoryBytesOrNull(): Long? = try {
        // getTotalPhysicalMemorySize() is deprecated in favour of getTotalMemorySize() (JDK 14+)
        // but is available on every JDK version back to 5, which getTotalMemorySize() is not —
        // preferring it here avoids a NoSuchMethodError on older runtimes.
        val osBean = ManagementFactory.getOperatingSystemMXBean()
        (osBean as? com.sun.management.OperatingSystemMXBean)?.totalPhysicalMemorySize
    } catch (_: Throwable) {
        null
    }
}
