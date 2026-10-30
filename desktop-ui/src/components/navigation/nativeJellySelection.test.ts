import { afterEach, expect, it, vi } from 'vitest';
import { JellyMotion, jellyPillBounds } from './jellyMotion';
import { playNativeJellySelection } from './nativeJellySelection';

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

it('samples the original spring without accelerating it or advancing the live model', async () => {
  const nav = document.createElement('nav');
  document.body.append(nav);
  const nodes = { nav, pill: document.createElement('div'), content: document.createElement('div'), track: document.createElement('div'), distortion: document.createElement('div'), panel: document.createElement('div') };
  const animations: Array<{ currentTime: number; cancel: ReturnType<typeof vi.fn> }> = [];
  const calls: Array<{ node: HTMLElement; frames: Keyframe[]; options: KeyframeAnimationOptions }> = [];
  let resolve!: () => void;
  for (const node of Object.values(nodes)) node.animate = (frames, options) => {
    calls.push({ node, frames: frames as Keyframe[], options: options as KeyframeAnimationOptions });
    const animation = { currentTime: 0, cancel: vi.fn(), finished: new Promise<void>(done => { if (!animations.length) resolve = done; }) };
    animations.push(animation);
    return animation as unknown as Animation;
  };
  const motion = new JellyMotion(0, 4);
  motion.resize(456, 48, 4); motion.select(1);
  const initial = motion.frame;
  const finish = vi.fn();
  const playing = playNativeJellySelection(motion, { width: 456, height: 48, density: 1 }, 4, nodes, finish);
  expect(motion.frame).toEqual(initial);
  expect(calls[0].options.duration).toBeGreaterThan(250);
  animations[0].currentTime = 100;
  const expected = motion.copy();
  for (let i = 0; i < 12; i++) expected.advance(1 / 120);
  expect(playing.sample().frame.position).toBeCloseTo(expected.frame.position, 10);
  const bounds = jellyPillBounds(expected.frame, 456, 48, 4);
  expect(calls[0].frames[12].transform).toContain(`translate(${bounds.x}px, ${bounds.y}px)`);
  expect(nav.dataset.nativeSelection).toBe('true');
  playing.cancel(); resolve(); await Promise.resolve();
  expect(finish).not.toHaveBeenCalled();
  expect(nav.dataset.nativeSelection).toBeUndefined();
  expect(animations.every(animation => animation.cancel.mock.calls.length === 1)).toBe(true);
});
