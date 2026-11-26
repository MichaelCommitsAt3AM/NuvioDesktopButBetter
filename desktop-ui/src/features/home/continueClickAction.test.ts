import { describe, expect, it, vi } from 'vitest';

vi.mock('../../bridge', () => ({}));
vi.mock('../collections/CollectionsPages', () => ({ HomeCollections: () => null }));

describe('Kotlin ContinueWatchingClickAction.opensDetails', async () => {
  const { continueClickOpensDetails } = await import('./HomePage');
  const now = Date.parse('2026-11-26T12:00:00Z');
  const upcoming = { isNextUp: true, released: '2026-12-01' };
  const aired = { isNextUp: true, released: '2026-11-20' };
  const inProgress = { isNextUp: false, released: '2026-12-01' };

  it('opens the stream by default', () => {
    expect(continueClickOpensDetails(undefined, upcoming, now)).toBe(false);
    expect(continueClickOpensDetails('STREAM', upcoming, now)).toBe(false);
  });
  it('always opens details for DETAILS', () => {
    expect(continueClickOpensDetails('DETAILS', inProgress, now)).toBe(true);
  });
  it('opens details only for unaired Next Up items for DETAILS_FOR_UPCOMING', () => {
    expect(continueClickOpensDetails('DETAILS_FOR_UPCOMING', upcoming, now)).toBe(true);
    expect(continueClickOpensDetails('DETAILS_FOR_UPCOMING', aired, now)).toBe(false);
    expect(continueClickOpensDetails('DETAILS_FOR_UPCOMING', inProgress, now)).toBe(false);
    expect(continueClickOpensDetails('DETAILS_FOR_UPCOMING', { isNextUp: true, released: null }, now)).toBe(false);
  });
});
