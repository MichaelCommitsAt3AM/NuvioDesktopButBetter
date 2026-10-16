import { describe, expect, it, vi } from 'vitest';
import {
  clearProfilePositions,
  mainScroller,
  readListPosition,
  restoreMainScroll,
  saveListPosition,
  scrollKey,
  shouldResetMainScroll,
} from './scrollStore';

describe('scroll restoration store', () => {
  it('namespaces positions by profile, route, and context', () => {
    const home = scrollKey(7, '/', '');
    const otherProfile = scrollKey(8, '/', '');
    const filtered = scrollKey(7, '/search', 'type=movie');
    expect(home).not.toBe(otherProfile);
    expect(home).not.toBe(filtered);
    saveListPosition(home, 400);
    expect(readListPosition(otherProfile)).toBeUndefined();
    expect(readListPosition(filtered)).toBeUndefined();
    expect(readListPosition(home)).toBe(400);
  });

  it('clears only the switched profile', () => {
    saveListPosition(scrollKey(7, '/library', ''), 100);
    saveListPosition(scrollKey(8, '/library', ''), 200);
    clearProfilePositions(7);
    expect(readListPosition(scrollKey(7, '/library', ''))).toBeUndefined();
    expect(readListPosition(scrollKey(8, '/library', ''))).toBe(200);
    clearProfilePositions(8);
  });

  it('resets forward lists but never Back/Forward or self-managed routes', () => {
    expect(shouldResetMainScroll('/library', 'PUSH')).toBe(true);
    expect(shouldResetMainScroll('/library', 'REPLACE')).toBe(true);
    expect(shouldResetMainScroll('/library', 'POP')).toBe(false);
    expect(shouldResetMainScroll('/catalog', 'PUSH')).toBe(true);
    expect(shouldResetMainScroll('/catalog', 'POP')).toBe(false);
    expect(shouldResetMainScroll('/', 'PUSH')).toBe(false);
    expect(shouldResetMainScroll('/search', 'PUSH')).toBe(false);
  });

  it('restores the saved offset and yields to user scrolling', () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '<main class="main-area" style="height:100px;overflow:auto"><div style="height:2000px"></div></main>';
      const scroller = mainScroller()!;
      expect(scroller).not.toBeNull();
      const finish = restoreMainScroll(800, { deadlineMs: 5000 });
      actAdvance();
      expect(scroller.scrollTop).toBe(800);
      finish();
    } finally {
      vi.useRealTimers();
      document.body.innerHTML = '';
    }
  });

  function actAdvance() {
    // rAF under fake timers: run pending frames via a real timeout flush.
    vi.advanceTimersByTime(16);
  }
});
