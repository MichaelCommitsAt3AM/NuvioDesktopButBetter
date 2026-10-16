import { describe, expect, it, vi } from 'vitest';
import { animateLift, animateReturn, liveSourceRect, rectOf } from './sourceLift';

describe('source lift geometry', () => {
  it('captures element bounds and rejects empty ones', () => {
    const node = document.createElement('div');
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 100, height: 150 } as DOMRect);
    expect(rectOf(node)).toEqual({ x: 10, y: 20, width: 100, height: 150 });
    expect(rectOf(null)).toBeNull();
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 0, height: 0 } as DOMRect);
    expect(rectOf(node)).toBeNull();
    vi.restoreAllMocks();
  });

  it('resolves the live card or falls back when it vanished', () => {
    document.body.innerHTML = '<div data-source-key="movie:a"></div>';
    const node = document.querySelector<HTMLElement>('[data-source-key="movie:a"]')!;
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({ left: 5, top: 5, width: 50, height: 75 } as DOMRect);
    expect(liveSourceRect('movie:a')).toEqual({ x: 5, y: 5, width: 50, height: 75 });
    expect(liveSourceRect('movie:gone')).toBeNull();
    expect(liveSourceRect('')).toBeNull();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('lifts from the source and returns to live bounds', () => {
    const node = document.createElement('div');
    document.body.appendChild(node);
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 100, width: 200, height: 300 } as DOMRect);
    const animations: Animation[] = [];
    (node as unknown as { animate: unknown }).animate = vi.fn(() => {
      const animation = { cancel: vi.fn(), finished: Promise.resolve() } as unknown as Animation;
      animations.push(animation);
      return animation;
    });
    try {
      const open = animateLift(node, { x: 10, y: 20, width: 100, height: 150 });
      expect(open).not.toBeNull();
      const keyframes = (node.animate as ReturnType<typeof vi.fn>).mock.calls[0][0] as Keyframe[];
      expect(String(keyframes[0].transform)).toContain('translate(-90px, -80px)');
      const back = animateReturn(node, { x: 10, y: 20, width: 100, height: 150 });
      expect(back).not.toBeNull();
    } finally {
      node.remove();
      vi.restoreAllMocks();
    }
  });

  it('skips motion under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    try {
      const node = document.createElement('div');
      expect(animateLift(node, { x: 0, y: 0, width: 1, height: 1 })).toBeNull();
      expect(animateReturn(node, { x: 0, y: 0, width: 1, height: 1 })).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
});
