import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useProgressiveCount } from './ProgressiveMount';

afterEach(() => { vi.useRealTimers(); });

describe('useProgressiveCount', () => {
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
