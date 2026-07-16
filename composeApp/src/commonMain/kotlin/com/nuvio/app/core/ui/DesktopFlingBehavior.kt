package com.nuvio.app.core.ui

import androidx.compose.animation.core.AnimationState
import androidx.compose.animation.core.DecayAnimationSpec
import androidx.compose.animation.core.animateDecay
import androidx.compose.animation.core.exponentialDecay
import androidx.compose.foundation.gestures.FlingBehavior
import androidx.compose.foundation.gestures.ScrollScope
import androidx.compose.foundation.gestures.ScrollableDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import com.nuvio.app.isDesktop
import kotlin.math.abs

// Compose Desktop's mouse-wheel/trackpad velocity tracking feeds into the same
// FlingBehavior.performFling() path as touch, but the default spline decay is
// tuned for touch-flick velocities, so trackpad releases barely glide. Amplifying
// the velocity before decay (an earlier attempt) fixed that but introduced a
// jarring speed-up right at release, worse the faster you scrolled, since the
// glide no longer started at the speed your fingers were actually moving. Using
// a lower-friction exponential decay instead keeps the real release velocity
// (no jump) and just makes it take longer to coast down to zero.
// Raised from 2.6 -> 3.4: 2.6 made the glide too long/floaty for a plain mouse
// wheel. A single wheel notch can also report a velocity spike (many small
// scroll events in a few ms), which the low-friction decay would stretch into
// a multi-second glide that overshot all the way to the top/bottom of the
// list; clamping the velocity fed into the decay caps how far one notch can fling.
private const val NuvioDesktopFlingFrictionMultiplier = 3.4f
private const val NuvioDesktopMaxFlingVelocity = 7000f

@Composable
fun rememberNuvioFlingBehavior(): FlingBehavior {
    if (!isDesktop) return ScrollableDefaults.flingBehavior()

    val flingDecay = remember { exponentialDecay<Float>(frictionMultiplier = NuvioDesktopFlingFrictionMultiplier) }
    return remember(flingDecay) {
        NuvioDesktopFlingBehavior(flingDecay)
    }
}

private class NuvioDesktopFlingBehavior(
    private val flingDecay: DecayAnimationSpec<Float>,
) : FlingBehavior {
    override suspend fun ScrollScope.performFling(initialVelocity: Float): Float {
        val clampedVelocity = initialVelocity.coerceIn(-NuvioDesktopMaxFlingVelocity, NuvioDesktopMaxFlingVelocity)
        if (abs(clampedVelocity) <= 1f) return clampedVelocity

        var velocityLeft = clampedVelocity
        var lastValue = 0f
        AnimationState(initialValue = 0f, initialVelocity = clampedVelocity).animateDecay(flingDecay) {
            val delta = value - lastValue
            val consumed = scrollBy(delta)
            lastValue = value
            velocityLeft = velocity
            if (abs(delta - consumed) > 0.5f) cancelAnimation()
        }
        return velocityLeft
    }
}
