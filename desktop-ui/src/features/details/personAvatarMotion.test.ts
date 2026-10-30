import { afterEach, expect, it, vi } from 'vitest';
import { animatePersonAvatar, returnPersonAvatar, isReturningPersonAvatar } from './personAvatarMotion';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('navigates before returning and lands on stable live cast bounds instead of the old screenshot coordinates', async () => {
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.push(callback); return callbacks.length; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const source = document.createElement('div');
  source.className = 'person-avatar';
  document.body.appendChild(source);
  vi.spyOn(source, 'getBoundingClientRect').mockReturnValue({ left: 40, top: 100, width: 148, height: 148 } as DOMRect);
  let complete!: () => void;
  const animation = { finished: new Promise<void>(resolve => { complete = resolve; }), cancel: vi.fn() };
  const animate = vi.fn().mockReturnValue(animation);
  source.animate = animate;
  const target = document.createElement('span');
  target.dataset.personAvatarKey = 'profile:movie:actor';
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ left: 500, top: 300, width: 83, height: 83, bottom: 383 } as DOMRect);
  const navigate = vi.fn(() => { source.remove(); document.body.appendChild(target); });
  returnPersonAvatar(source, 'profile:movie:actor', navigate);
  expect(navigate).toHaveBeenCalledOnce();
  expect(animate).not.toHaveBeenCalled();
  expect(isReturningPersonAvatar('profile:movie:actor')).toBe(true);
  for (let frame = 0; frame < 4; frame++) callbacks.shift()?.(frame * 16);
  expect(animate).toHaveBeenCalledOnce();
  expect(animate.mock.calls[0][0].at(-1).transform).toContain('translate(460px, 200px)');
  complete();
  await Promise.resolve();
  expect(document.querySelector('[aria-hidden="true"].person-avatar')).toBeNull();
  expect(isReturningPersonAvatar('profile:movie:actor')).toBe(false);
  target.remove();
});

it('moves circular artwork from the source bounds to its final bounds without fading', () => {
  const node = document.createElement('div');
  vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({ left: 47, top: 113, width: 148, height: 148 } as DOMRect);
  const animate = vi.fn();
  node.animate = animate;
  animatePersonAvatar(node, { x: 240, y: 600, width: 83, height: 83 });
  const [frames, options] = animate.mock.calls[0];
  expect(frames[0].transform).toContain('translate(193px, 487px)');
  expect(frames.at(-1).transform).toBe('translate(0px, 0px) scale(1, 1)');
  expect(frames.every((frame: Keyframe) => frame.opacity === undefined)).toBe(true);
  expect(options.easing).toBe('linear');
});

it('returns artwork to the cast bounds and retains the final frame until navigation', () => {
  const node = document.createElement('div');
  vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({ left: 47, top: 113, width: 148, height: 148 } as DOMRect);
  const animate = vi.fn();
  node.animate = animate;
  animatePersonAvatar(node, { x: 240, y: 600, width: 83, height: 83 }, true);
  const [frames, options] = animate.mock.calls[0];
  expect(frames[0].transform).toBe('translate(0px, 0px) scale(1, 1)');
  expect(frames.at(-1).transform).toContain('translate(193px, 487px)');
  expect(options.fill).toBe('forwards');
});

it('skips motion for reduced-motion preferences and elements without measurable bounds', () => {
  const node = document.createElement('div');
  node.animate = vi.fn();
  expect(animatePersonAvatar(node, { x: 0, y: 0, width: 83, height: 83 })).toBeNull();
  vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({ left: 47, top: 113, width: 148, height: 148 } as DOMRect);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
  expect(animatePersonAvatar(node, { x: 0, y: 0, width: 83, height: 83 })).toBeNull();
  expect(node.animate).not.toHaveBeenCalled();
});
