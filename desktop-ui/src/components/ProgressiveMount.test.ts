import { act, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useProgressiveCount } from './ProgressiveMount';
import { flushSync } from 'react-dom';
import { createElement, memo, type ReactNode } from 'react';
import { TabActivity } from '../navigation/tabActivity';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('useProgressiveCount', () => {
  it('does not rerender a fully populated shelf when tab visibility changes', () => {
    const renders = vi.fn();
    const Shelf = memo(function Shelf() {
      const count = useProgressiveCount(100, 'complete', 10, 100);
      renders();
      return createElement('span', null, count);
    });
    const page = (active: boolean) => createElement(TabActivity.Provider, { value: active }, createElement(Shelf));
    const view = render(page(true));
    renders.mockClear();
    view.rerender(page(false));
    view.rerender(page(true));
    expect(renders).not.toHaveBeenCalled();
  });
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

  it('pauses hidden tabs, cancels their pending frame, and resumes without losing progress', async () => {
    vi.useFakeTimers();
    let active = false;
    const wrapper = ({ children }: { children: ReactNode }) => createElement(TabActivity.Provider, { value: active }, children);
    const { result, rerender } = renderHook(({ total }) => useProgressiveCount(total, 'retained', 10), {
      wrapper, initialProps: { total: 30 },
    });
    await advanceFrames(2);
    expect(result.current).toBe(0);

    active = true; rerender({ total: 30 });
    await advanceFrames(1);
    expect(result.current).toBe(10);
    active = false; rerender({ total: 50 });
    expect(vi.getTimerCount()).toBe(0);
    await advanceFrames(3);
    expect(result.current).toBe(10);

    active = true; rerender({ total: 50 });
    await advanceFrames(1);
    expect(result.current).toBe(20);
    await advanceFrames(4);
    expect(result.current).toBe(50);
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
