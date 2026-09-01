package com.nuvio.app.core.ui

import coil3.ComponentRegistry
import coil3.ImageLoader
import coil3.disk.DiskCache
import coil3.disk.directory
import coil3.memory.MemoryCache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.asCoroutineDispatcher
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.CoroutineContext

// Coil defaults both fetching and decoding to Dispatchers.IO, which is 64 threads on the JVM.
// Compose Desktop draws from a single thread, so a shelf scrolling into view would hand ~18
// full Skia decodes to 18 cores at once and the render thread would lose its frame budget
// until the memory cache went warm — the "laggy until every poster has loaded" symptom.
// Bounded pools keep image work off the frame budget: loading is still as parallel as the
// network can usefully feed it, just never at the UI's expense.
private const val FetchParallelism = 6
private val DecodeParallelism = (Runtime.getRuntime().availableProcessors() - 2).coerceIn(1, 3)

// Decoding is pure CPU burn, so it also runs below normal priority: when the pool and the
// render thread do compete for a core, the scheduler resolves it in the UI's favour.
private val ImageDecodeContext: CoroutineContext = run {
    val threadIndex = AtomicInteger()
    Executors.newFixedThreadPool(DecodeParallelism) { runnable ->
        Thread(runnable, "nuvio-image-decode-${threadIndex.incrementAndGet()}").apply {
            isDaemon = true
            priority = Thread.MIN_PRIORITY
        }
    }.asCoroutineDispatcher()
}

// Fetching is mostly suspended on the network, so it stays on the elastic IO pool; the cap is
// there to keep launch from opening dozens of TLS connections at once.
private val ImageFetchContext: CoroutineContext = Dispatchers.IO.limitedParallelism(FetchParallelism)

internal actual fun ImageLoader.Builder.configurePlatformImageLoader(): ImageLoader.Builder = this
    .fetcherCoroutineContext(ImageFetchContext)
    .decoderCoroutineContext(ImageDecodeContext)
    .eventListenerFactory(NuvioImageEventListener.factory)
    // Decoded bitmaps are Skia-native allocations sized off physical RAM (see
    // DesktopImageCacheConfig) — Coil's non-Android default is 15% of a hardcoded 512MB
    // assumption, which bears no relation to the machine this actually runs on.
    .memoryCache {
        MemoryCache.Builder()
            .maxSizeBytes(DesktopImageCacheConfig.memoryCacheMaxSizeBytes)
            .build()
    }
    // Coil's non-Android disk cache default lives under the OS temp directory, which Storage
    // Sense and cleaner tools purge — making a "warm" start regularly turn into a cold one.
    // This is a real, app-owned directory with an explicit cap instead of a percent-of-disk one.
    .diskCache {
        DiskCache.Builder()
            .directory(DesktopImageCacheConfig.diskCacheDirectory().toFile())
            .maxSizeBytes(DesktopImageCacheConfig.DiskCacheMaxSizeBytes)
            .build()
    }

internal actual fun ComponentRegistry.Builder.addPlatformImageComponents(): ComponentRegistry.Builder =
    // Decoder factories are tried in registration order. SkiaGifDecoder only claims GIFs
    // (returns null otherwise), so it must come before NuvioSkiaImageDecoder — which claims
    // everything — for animated GIFs to reach it; every other format falls through to the
    // layout-sized decoder as before.
    add(SkiaGifDecoder.Factory())
        .add(NuvioSkiaImageDecoder.Factory())
