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
private const val NuvioDesktopFlingFrictionMultiplier = 2.6f

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
        if (abs(initialVelocity) <= 1f) return initialVelocity

        var velocityLeft = initialVelocity
        var lastValue = 0f
        AnimationState(initialValue = 0f, initialVelocity = initialVelocity).animateDecay(flingDecay) {
            val delta = value - lastValue
            val consumed = scrollBy(delta)
            lastValue = value
            velocityLeft = velocity
            if (abs(delta - consumed) > 0.5f) cancelAnimation()
        }
        return velocityLeft
    }
}
