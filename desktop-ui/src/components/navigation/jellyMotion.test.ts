import { describe, expect, it } from 'vitest';
import { JellyMotion, JellySpring, desktopNavigationLabels, jellyPanelOffset, jellyPillBounds, jellyRubberBand } from './jellyMotion';
describe('Kotlin jelly navigation physics', () => {
  it('copies all spring state without advancing the live gesture during browser sampling', () => {
    const original = new JellyMotion(0, 4);
    original.resize(456, 48, 4); original.begin(60, 24); original.drag(200, 30); original.advance(.032); original.finish();
    const frame = original.frame;
    const copy = original.copy();
    expect(copy.frame).toEqual(frame);
    copy.advance(.032);
    expect(original.frame).toEqual(frame);
    original.advance(.032);
    expect(copy.frame).toEqual(original.frame);
  });
  it('keeps critically damped selection independent of frame rate', () => {
    const full = new JellySpring(0, 1000, 1), halves = new JellySpring(0, 1000, 1);
    full.advance(3, .032); halves.advance(3, .016); halves.advance(3, .016);
    expect(full.value).toBeCloseTo(halves.value, 10); expect(full.velocity).toBeCloseTo(halves.velocity, 10);
  });
  it('settles at the selected slot without leaving press or distortion behind', () => {
    const motion = new JellyMotion(0, 4); motion.resize(456, 48, 4); motion.select(3);
    for (let i = 0; i < 240; i++) motion.advance(1 / 60);
    expect(motion.frame.position).toBeCloseTo(3, 5); expect(motion.frame.pillScaleX).toBe(1); expect(motion.frame.trackScale).toBe(1); expect(motion.running).toBe(false);
    expect(jellyPillBounds(motion.frame, 456, 48, 4)).toEqual({ x: 340, y: 4, width: 112, height: 40, rx: 20, ry: 20 });
  });
  it('stretches the pill and glows during dragging, then selects the closest slot', () => {
    const motion = new JellyMotion(0, 4); motion.resize(456, 48, 4); motion.begin(60, 24); motion.drag(170, 30);
    for (let i = 0; i < 20; i++) motion.advance(1 / 60);
    expect(motion.frame.pillScaleX).toBeGreaterThan(1); expect(motion.frame.contentScale).toBeGreaterThan(1); expect(motion.frame.glowOpacity).toBeGreaterThan(0); expect(motion.frame.trackOffsetY).toBeGreaterThan(0);
    expect(motion.finish()).toBe(2);
    for (let i = 0; i < 240; i++) motion.advance(1 / 60);
    expect(motion.frame.position).toBeCloseTo(2, 5); expect(motion.frame.glowOpacity).toBe(0); expect(motion.frame.trackOffsetY).toBe(0);
  });
  it('cancels back to the current route and can settle without motion', () => {
    const motion = new JellyMotion(1, 4); motion.resize(456, 48, 4); motion.begin(400, 24); motion.drag(-200, 10); motion.cancel(1);
    for (let i = 0; i < 240; i++) motion.advance(1 / 60);
    expect(motion.frame.position).toBeCloseTo(1, 5); expect(motion.dragging).toBe(false);
    motion.begin(20, 10); motion.settle(3); expect(motion.frame.position).toBe(3); expect(motion.running).toBe(false); expect(motion.frame.contentScale).toBe(1);
  });
  it('bounds rubber banding and panel displacement for extreme drags', () => {
    expect(jellyRubberBand(10000, 48)).toBeLessThan(48); expect(jellyRubberBand(-10000, 48)).toBeGreaterThan(-48); expect(jellyRubberBand(30, 0)).toBe(0);
    expect(jellyPanelOffset(10000, 456)).toBeLessThanOrEqual(4); expect(jellyPanelOffset(-10000, 456)).toBeGreaterThanOrEqual(-4);
  });
  it('matches Kotlin adaptive, compact and expanded label rules', () => {
    expect(desktopNavigationLabels('adaptive', true, true, false, false, false)).toBe(false);
    expect(desktopNavigationLabels('adaptive', true, true, true, false, false)).toBe(true);
    expect(desktopNavigationLabels('adaptive', true, true, false, true, false)).toBe(true);
    expect(desktopNavigationLabels('adaptive', true, false, false, false, true)).toBe(false);
    expect(desktopNavigationLabels('adaptive', false, true, false, false, true)).toBe(true);
    expect(desktopNavigationLabels('compact', true, true, true, true, true)).toBe(false);
    expect(desktopNavigationLabels('expanded', true, true, false, false, true)).toBe(true);
  });
});
