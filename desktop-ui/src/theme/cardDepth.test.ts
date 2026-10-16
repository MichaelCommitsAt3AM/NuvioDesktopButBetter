import { describe, expect, it } from 'vitest';
import { depthActive, depthVars } from './cardDepth';

const base = {
  enabled: true,
  edgeStrength: 28,
  sheenStrength: 10,
  edgeCoverage: 0,
  postersEnabled: true,
  continueWatchingEnabled: true,
  episodeCardsEnabled: true,
  castEnabled: true,
  trailersEnabled: true,
};

describe('card depth mapping', () => {
  it('gates per surface like Kotlin isEnabledFor', () => {
    expect(depthActive(base, 'posters')).toBe(true);
    expect(depthActive({ ...base, enabled: false }, 'posters')).toBe(false);
    expect(depthActive({ ...base, postersEnabled: false }, 'posters')).toBe(false);
    expect(depthActive({ ...base, castEnabled: false }, 'cast')).toBe(false);
    expect(depthActive({ ...base, trailersEnabled: false }, 'trailers')).toBe(false);
    expect(depthActive({ ...base, continueWatchingEnabled: false }, 'continueWatching')).toBe(false);
    expect(depthActive({ ...base, episodeCardsEnabled: false }, 'episodeCards')).toBe(false);
    expect(depthActive(undefined, 'posters')).toBe(false);
  });

  it('scales edge alpha by strength and stops by coverage', () => {
    const vars = depthVars(base) as Record<string, string>;
    expect(vars['--depth-edge-hi']).toBe('rgba(255, 255, 255, 0.280)');
    expect(vars['--depth-sheen']).toBe('rgba(255, 255, 255, 0.100)');
    expect(vars['--depth-edge-mid']).toBe('rgba(255, 255, 255, 0.092)');
    expect(vars['--depth-edge-bottom']).toBe('rgba(255, 255, 255, 0.000)');
    const full = depthVars({ ...base, edgeCoverage: 100 }) as Record<string, string>;
    expect(full['--depth-edge-mid']).toBe('rgba(255, 255, 255, 0.280)');
    expect(full['--depth-edge-bottom']).toBe('rgba(255, 255, 255, 0.280)');
  });

  it('clamps out-of-range magnitudes', () => {
    const vars = depthVars({ ...base, edgeStrength: 500, sheenStrength: -20 }) as Record<string, string>;
    expect(vars['--depth-edge-hi']).toBe('rgba(255, 255, 255, 1.000)');
    expect(vars['--depth-sheen']).toBe('rgba(255, 255, 255, 0.000)');
  });
});
