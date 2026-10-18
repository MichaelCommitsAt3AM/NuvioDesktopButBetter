import { afterEach, describe, expect, it, vi } from 'vitest';
import { animatePosterArtwork, animatePosterMenu, POSTER_COLLAPSE, POSTER_EXPAND, POSTER_MENU } from './posterZoomMotion';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Kotlin poster zoom motion', () => {
  it('uses non-bouncy artwork springs and a faster, slightly bouncy menu', () => {
    expect(POSTER_EXPAND.values.every((value, i, values) => value >= (values[i - 1] ?? 0) && value <= 1)).toBe(true);
    expect(POSTER_COLLAPSE.duration).toBeLessThan(POSTER_EXPAND.duration);
    expect(Math.max(...POSTER_MENU.values)).toBeGreaterThan(1);
    expect(POSTER_MENU.duration).toBeLessThan(POSTER_EXPAND.duration);
    // Critical damping solution at 100ms for Kotlin's stiffness=340.
    expect(POSTER_EXPAND.values[12]).toBeCloseTo(1 - (1 + Math.sqrt(340) * 0.1) * Math.exp(-Math.sqrt(340) * 0.1), 6);
  });

  it('starts at the card bounds, stays opaque, and lands at the measured slot', () => {
    const node = document.createElement('div');
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 200, width: 200, height: 300 } as DOMRect);
    node.animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);
    animatePosterArtwork(node, { x: 20, y: 40, width: 100, height: 150 });
    const [frames, options] = vi.mocked(node.animate).mock.calls[0];
    const keys = frames as Keyframe[];
    expect(keys[0]).toMatchObject({ transformOrigin: 'top left', transform: 'translate(-80px, -160px) scale(0.5, 0.5)', opacity: 1 });
    expect(keys.at(-1)).toMatchObject({ transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1 });
    expect(options).toMatchObject({ duration: POSTER_EXPAND.duration, easing: 'linear' });
  });

  it('delays the menu 60ms, scales from .62 and staggers the rows', () => {
    const menu = document.createElement('div');
    menu.innerHTML = '<button>Details</button><button>Play</button>';
    const copy = document.createElement('div');
    const nodes = [menu, copy, ...Array.from(menu.children)];
    nodes.forEach(node => { node.animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation); });
    expect(animatePosterMenu(copy, menu)).toHaveLength(4);
    const [frames, options] = vi.mocked(menu.animate).mock.calls[0];
    expect((frames as Keyframe[])[0]).toMatchObject({ transform: 'scale(0.62)', opacity: 0 });
    expect(options).toMatchObject({ delay: 60, duration: POSTER_MENU.duration });
    const first = vi.mocked(menu.children[0].animate).mock.calls[0][0] as Keyframe[];
    const second = vi.mocked(menu.children[1].animate).mock.calls[0][0] as Keyframe[];
    expect(Number(second[8].opacity)).toBeLessThan(Number(first[8].opacity));
  });

  it('skips all motion for reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const node = document.createElement('div');
    node.animate = vi.fn();
    expect(animatePosterArtwork(node, null)).toBeNull();
    expect(animatePosterMenu(node, node)).toEqual([]);
    expect(node.animate).not.toHaveBeenCalled();
  });
});
