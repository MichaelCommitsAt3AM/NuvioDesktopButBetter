package com.nuvio.app.core.ui

import okio.BufferedSource

internal const val MaxEncodedImageBytes = 20 * 1024 * 1024

// Read at most the budget plus one sentinel byte, rather than allocating the
// entire response before checking its size.
internal fun BufferedSource.readBoundedImageBytes(): ByteArray {
    request(MaxEncodedImageBytes.toLong() + 1L)
    check(buffer.size <= MaxEncodedImageBytes) {
        "Image payload too large (max $MaxEncodedImageBytes bytes)"
    }
    return readByteArray()
}
