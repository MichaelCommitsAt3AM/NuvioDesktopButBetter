import { describe, expect, it, vi } from 'vitest';
import { cachedDominantColor, fetchDominantColor, toHex } from './dominantColor';

describe('dominant artwork color', () => {
  it('formats averaged channels as uppercase hex', () => {
    expect(toHex(255, 179, 122)).toBe('#FFB37A');
    expect(toHex(300, -4, 17.4)).toBe('#FF0011');
  });

  it('returns null without loading for empty artwork', async () => {
    expect(await fetchDominantColor('')).toBeNull();
    expect(cachedDominantColor('')).toBeNull();
    expect(cachedDominantColor('https://example.test/unseen.jpg')).toBeUndefined();
  });

  it('falls back when the artwork cannot be read (missing canvas/CORS)', async () => {
    vi.useFakeTimers();
    try {
      const pending = fetchDominantColor('https://example.test/blocked.jpg');
      vi.advanceTimersByTime(8000);
      expect(await pending).toBeNull();
      // Negative results cache so every title does not retry forever.
      expect(cachedDominantColor('https://example.test/blocked.jpg')).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('discards stale results without poisoning the cache', async () => {
    vi.useFakeTimers();
    try {
      const token = { cancelled: true };
      const pending = fetchDominantColor('https://example.test/stale.jpg', token);
      vi.advanceTimersByTime(8000);
      expect(await pending).toBeNull();
      expect(cachedDominantColor('https://example.test/stale.jpg')).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });
});
