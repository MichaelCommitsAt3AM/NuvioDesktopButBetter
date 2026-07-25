package com.nuvio.app.core.ui

import coil3.ComponentRegistry
import coil3.ImageLoader

internal expect fun ImageLoader.Builder.configurePlatformImageLoader(): ImageLoader.Builder

/**
 * Platform-specific fetchers/decoders.
 *
 * This is a [ComponentRegistry.Builder] hook rather than another [ImageLoader.Builder] one
 * because `ImageLoader.Builder.components { }` *replaces* the registry rather than adding to
 * it — registering components from a second call site silently drops everything the first one
 * registered.
 */
internal expect fun ComponentRegistry.Builder.addPlatformImageComponents(): ComponentRegistry.Builder
