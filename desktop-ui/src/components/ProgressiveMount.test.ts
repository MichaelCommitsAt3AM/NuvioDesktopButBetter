import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useProgressiveCount } from './ProgressiveMount';
import { flushSync } from 'react-dom';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('useProgressiveCount', () => {
  it('does not include poster filling in an urgent input commit', () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const { result } = renderHook(() => useProgressiveCount(30, 'catalog', 10));
    act(() => {
      flushSync(() => frame!(16));
      expect(result.current).toBe(0);
    });
    expect(result.current).toBe(10);
  });
  async function advanceFrames(frames: number) {
    for (let frame = 0; frame < frames; frame += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(16); });
    }
  }

  it('starts empty and fills to the total over frames', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(({ total, resetKey }) => useProgressiveCount(total, resetKey, 10), {
      initialProps: { total: 35, resetKey: 'a' },
    });
    expect(result.current).toBe(0);
    await advanceFrames(1);
    expect(result.current).toBe(10);
    await advanceFrames(1);
    expect(result.current).toBe(20);
    await advanceFrames(5);
    expect(result.current).toBe(35);
    await advanceFrames(10);
    expect(result.current).toBe(35);
  });

  it('mounts the saved poster count immediately on return, then continues filling below it', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useProgressiveCount(100, 'discover', 10, 72));
    expect(result.current).toBe(72);
    await advanceFrames(1);
    expect(result.current).toBe(82);
  });

  it('clamps a saved count to the available catalog and resets a new catalog to skeletons', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ key, initial }) => useProgressiveCount(30, key, 10, initial), {
      initialProps: { key: 'saved', initial: 72 },
    });
    expect(result.current).toBe(30);
    rerender({ key: 'fresh', initial: 0 });
    expect(result.current).toBe(0);
  });

  it('restarts from skeletons when the list identity changes', async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ total, resetKey }) => useProgressiveCount(total, resetKey, 10), {
      initialProps: { total: 30, resetKey: 'a' },
    });
    await advanceFrames(2);
    expect(result.current).toBe(20);
    rerender({ total: 30, resetKey: 'b' });
    expect(result.current).toBe(0);
    await advanceFrames(1);
    expect(result.current).toBe(10);
  });

  it('keeps filling when pagination appends without resetting', async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ total, resetKey }) => useProgressiveCount(total, resetKey, 10), {
      initialProps: { total: 15, resetKey: 'a' },
    });
    await advanceFrames(1);
    expect(result.current).toBe(10);
    rerender({ total: 25, resetKey: 'a' });
    expect(result.current).toBe(10);
    await advanceFrames(2);
    expect(result.current).toBe(25);
  });
});
