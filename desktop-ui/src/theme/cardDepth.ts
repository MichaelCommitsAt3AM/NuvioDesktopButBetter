import type { CSSProperties } from 'react';
import type { AppearanceSnapshot } from '../features/settings/appearanceStore';

export type CardDepthState = AppearanceSnapshot['cardDepth'];
export type CardDepthSurface = 'posters' | 'continueWatching' | 'episodeCards' | 'cast' | 'trailers';

/**
 * Map Kotlin `CardDepthStyleRepository` state to CSS variables.
 * Mirrors `CardDepthEffect.kt`: top-weighted edge gradient (alpha scaled by
 * edgeStrength, falloff by edgeCoverage) plus a top-22% sheen rect, both
 * clipped to the card shape. Colors are precomputed here because the bridge
 * projects opaque magnitudes, not alpha strings. Gradient-only, no blur, so
 * per-card cost stays at one composited layer.
 */
export function depthVars(depth?: CardDepthState | null): CSSProperties {
  const edge = clamp(depth?.edgeStrength ?? 28);
  const sheen = clamp(depth?.sheenStrength ?? 10);
  const coverage = clamp(depth?.edgeCoverage ?? 0);
  const alpha = (value: number, scale: number) => (clamp(value) / 100 * scale).toFixed(3);
  return {
    '--depth-edge-hi': `rgba(255, 255, 255, ${alpha(edge, 1)})`,
    '--depth-edge-mid': `rgba(255, 255, 255, ${alpha(edge, 0.33 + 0.67 * coverage / 100)})`,
    '--depth-edge-bottom': `rgba(255, 255, 255, ${alpha(edge, coverage / 100)})`,
    '--depth-sheen': `rgba(255, 255, 255, ${alpha(sheen, 1)})`,
  } as CSSProperties;
}

/** Kotlin `isEnabledFor()`: global flag AND per-surface toggle. */
export function depthActive(depth: CardDepthState | null | undefined, surface: CardDepthSurface): boolean {
  if (!depth?.enabled) return false;
  switch (surface) {
    case 'posters': return depth.postersEnabled;
    case 'continueWatching': return depth.continueWatchingEnabled;
    case 'episodeCards': return depth.episodeCardsEnabled;
    case 'cast': return depth.castEnabled;
    case 'trailers': return depth.trailersEnabled;
  }
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
