package com.nuvio.app.core.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.DefaultAlpha
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.ContentScale
import coil3.ImageLoader
import coil3.compose.AsyncImagePainter

internal enum class NuvioDesktopImageScaling {
    Auto,
    Disabled,
}

/** Desktop only: how animated GIF / WebP artwork plays. Other platforms already animate. */
enum class NuvioDesktopAnimation {
    /** Show the first frame. */
    Off,

    /** Show the first frame until the pointer is over the image, then play. */
    OnHover,

    /** Play whenever the image is on screen. */
    Always,
}
