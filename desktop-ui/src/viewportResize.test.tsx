import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { subscribeViewportResize } from './viewportResize';
import { useViewportSize } from './useViewportSize';
import { initializeDesktopMetrics } from './desktopMetrics';

let frames: Map<number, FrameRequestCallback>, next: number;
const disposers: (() => void)[] = [];
beforeEach(() => {
  frames = new Map(); next = 0;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.set(++next, callback); return next; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)));
});
afterEach(() => { cleanup(); disposers.splice(0).forEach(dispose => dispose()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const resize = (width: number, height = 900) => {
  vi.stubGlobal('innerWidth', width); vi.stubGlobal('innerHeight', height);
  window.dispatchEvent(new Event('resize'));
};
const paint = () => act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); });

it('coalesces a resize burst for all subscribers and reads the latest size', () => {
  const sizes: number[] = [], other = vi.fn();
  disposers.push(subscribeViewportResize(() => sizes.push(window.innerWidth)), subscribeViewportResize(other));
  for (const width of [1000, 1100, 1200]) resize(width);
  expect(frames.size).toBe(1); expect(sizes).toEqual([]);
  paint(); expect(sizes).toEqual([1200]); expect(other).toHaveBeenCalledOnce();
});
it('cancels pending work when the final subscriber leaves', () => {
  const callback = vi.fn(), dispose = subscribeViewportResize(callback);
  resize(1200); dispose(); paint();
  expect(callback).not.toHaveBeenCalled(); expect(frames.size).toBe(0);
});
it('keeps a hidden retained viewport unchanged and catches up on activation', () => {
  resize(1000);
  const view = renderHook(({ active }) => useViewportSize(active), { initialProps: { active: true } });
  view.rerender({ active: false });
  resize(1600); paint(); expect(view.result.current.width).toBe(1000);
  view.rerender({ active: true }); expect(view.result.current.width).toBe(1600);
  const previous = view.result.current;
  resize(1600); paint(); expect(view.result.current).toBe(previous);
});
it('drops a queued Home update when the tab is hidden before paint', () => {
  resize(1000);
  const view = renderHook(({ active }) => useViewportSize(active), { initialProps: { active: true } });
  resize(1500); view.rerender({ active: false }); paint();
  expect(view.result.current.width).toBe(1000);
});
it('retains the density formula while avoiding redundant CSS writes', () => {
  resize(1280, 820);
  const writes = vi.spyOn(document.documentElement.style, 'setProperty');
  disposers.push(initializeDesktopMetrics());
  expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1.0000');
  writes.mockClear(); resize(1280, 820); paint(); expect(writes).not.toHaveBeenCalled();
  resize(1408, 902); resize(1536, 984); paint();
  expect(writes).toHaveBeenCalledExactlyOnceWith('--ui-scale', '1.1800');
});
