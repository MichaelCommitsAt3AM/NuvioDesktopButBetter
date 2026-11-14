import { act, cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_FADE_MS, trailerUiState, useTrailerImmersion } from './useTrailerImmersion';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('trailerUiState', () => {
  it('lets a manual hide win over the idle fade', () => {
    expect(trailerUiState(false, false)).toBe('shown');
    expect(trailerUiState(true, false)).toBe('faded');
    expect(trailerUiState(true, true)).toBe('hidden');
  });
});

describe('useTrailerImmersion', () => {
  it('fades after the idle delay and not before', () => {
    const { result } = renderHook(() => useTrailerImmersion(true));
    act(() => { vi.advanceTimersByTime(IDLE_FADE_MS - 100); });
    expect(result.current.state).toBe('shown');
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.state).toBe('faded');
  });

  it('mouse movement restores the text and the fade starts over', () => {
    const { result } = renderHook(() => useTrailerImmersion(true));
    act(() => { vi.advanceTimersByTime(IDLE_FADE_MS + 10); });
    expect(result.current.faded).toBe(true);
    act(() => { fireEvent.mouseMove(window); });
    expect(result.current.faded).toBe(false);
    act(() => { vi.advanceTimersByTime(IDLE_FADE_MS - 500); });
    expect(result.current.faded).toBe(false);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.faded).toBe(true);
  });

  it('activity during the wait pushes the fade back', () => {
    const { result } = renderHook(() => useTrailerImmersion(true));
    act(() => { vi.advanceTimersByTime(IDLE_FADE_MS - 1000); });
    act(() => { fireEvent.mouseMove(window); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.faded).toBe(false);
    act(() => { vi.advanceTimersByTime(IDLE_FADE_MS); });
    expect(result.current.faded).toBe(true);
  });

  it('scrolling and keys count as activity', () => {
    const { result } = renderHook(() => useTrailerImmersion(true));
    act(() => { vi.advanceTimersByTime(IDLE_FADE_MS + 10); });
    act(() => { fireEvent.wheel(window); });
    expect(result.current.faded).toBe(false);
    act(() => { vi.advanceTimersByTime(IDLE_FADE_MS + 10); });
    act(() => { fireEvent.keyDown(window, { key: 'a' }); });
    expect(result.current.faded).toBe(false);
  });

  it('a manual hide ignores mouse movement but Escape and the toggle restore it', () => {
    const { result } = renderHook(() => useTrailerImmersion(true));
    act(() => { result.current.toggleHidden(); });
    expect(result.current.state).toBe('hidden');
    act(() => { fireEvent.mouseMove(window); });
    expect(result.current.state).toBe('hidden');
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(result.current.state).toBe('shown');
    act(() => { result.current.toggleHidden(); });
    expect(result.current.hidden).toBe(true);
    act(() => { result.current.toggleHidden(); });
    expect(result.current.hidden).toBe(false);
  });

  it('resets both modes when the trailer stops playing, and never fades while it is not playing', () => {
    const { result, rerender } = renderHook(({ playing }) => useTrailerImmersion(playing), { initialProps: { playing: true } });
    act(() => { result.current.toggleHidden(); });
    act(() => { vi.advanceTimersByTime(IDLE_FADE_MS + 10); });
    expect(result.current.state).toBe('hidden');
    rerender({ playing: false });
    expect(result.current.state).toBe('shown');
    act(() => { vi.advanceTimersByTime(IDLE_FADE_MS * 3); });
    expect(result.current.state).toBe('shown');
  });
});
