import { expect, it } from 'vitest';
import { posterMetrics } from './posterMetrics';

it('keeps Home dimensions for standard and landscape cards, including user presets', () => {
  expect(posterMetrics()).toEqual({ width: 190.08, radius: 12.96, ratio: '126/189' });
  expect(posterMetrics({ catalogLandscapeModeEnabled: true }).width).toBeCloseTo(190.08 * 180 / 110);
  expect(posterMetrics({ widthDp: 104, heightDp: 156, cornerRadiusDp: 4 })).toEqual({ width: 157.68, radius: 4.32, ratio: '104/156' });
});
