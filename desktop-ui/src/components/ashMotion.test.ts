import { expect, it } from 'vitest';
import { ASH_DURATION_MS, ASH_FADE_MS, ashGrainFrame, ashProgress, createAshField } from './ashMotion';

it('uses the Kotlin desktop density, diagonal front and grain distributions', () => {
  const field = createAshField(640, 360, () => .5);
  expect(field.cols).toBe(130);
  expect(field.rows).toBe(73);
  expect(field.grains).toHaveLength(9490);
  const topRight = field.grains[129], bottomLeft = field.grains[130 * 72];
  expect(topRight.delay).toBeLessThan(bottomLeft.delay);
  expect(field.grains[0].shade).toBeCloseTo(.97);
  expect(field.grains[0].speed).toBeCloseTo(1.05);
  expect(createAshField(120, 500, () => .5).grains.length).toBeLessThanOrEqual(26000);
});

it('keeps the original Kotlin timing and FastOutSlowIn easing', () => {
  expect(ASH_DURATION_MS).toBe(1500); expect(ASH_FADE_MS).toBe(300);
  expect(ashProgress(0)).toBeCloseTo(0);
  expect(ashProgress(.5)).toBeCloseTo(.77556, 4);
  expect(ashProgress(1)).toBeCloseTo(1);
});

it('releases grains only after their wave and shrinks, lifts and fades them before expiry', () => {
  const grain = createAshField(640, 360, () => .5).grains[4000];
  expect(ashGrainFrame(grain, grain.delay, 640, 360)).toBeNull();
  const early = ashGrainFrame(grain, grain.delay + .08, 640, 360)!;
  const late = ashGrainFrame(grain, grain.delay + .45, 640, 360)!;
  expect(late.y).toBeLessThan(early.y);
  expect(late.scale).toBeLessThan(early.scale);
  expect(late.alpha).toBeLessThan(early.alpha);
  expect(ashGrainFrame(grain, grain.delay + .5, 640, 360)).toBeNull();
  const reusable = { x: 0, y: 0, scale: 0, alpha: 0 };
  expect(ashGrainFrame(grain, grain.delay + .08, 640, 360, reusable)).toBe(reusable);
});
