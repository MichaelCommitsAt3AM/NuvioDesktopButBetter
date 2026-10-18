import { expect, it } from 'vitest';
import { catalogPosterBaseWidthDp, posterGridColumnCountForViewport, posterGridColumnCountForWidth, ultrawideViewportProgress } from './libraryGrid';

it('mirrors the Kotlin width breakpoints', () => {
  expect(posterGridColumnCountForWidth(1600)).toBe(7);
  expect(posterGridColumnCountForWidth(1400)).toBe(7);
  expect(posterGridColumnCountForWidth(1399)).toBe(6);
  expect(posterGridColumnCountForWidth(1200)).toBe(6);
  expect(posterGridColumnCountForWidth(1000)).toBe(5);
  expect(posterGridColumnCountForWidth(840)).toBe(4);
  expect(posterGridColumnCountForWidth(839)).toBe(3);
});

it('scales the base poster width the way desktop Kotlin does', () => {
  expect(catalogPosterBaseWidthDp(126)).toBe(176);
});

it('only adds ultrawide columns beyond 16:9', () => {
  expect(ultrawideViewportProgress(1600, 900)).toBe(0);
  expect(posterGridColumnCountForViewport(1600, 900, 126)).toBe(posterGridColumnCountForWidth(1600));
  expect(ultrawideViewportProgress(2560, 1080)).toBeGreaterThan(0);
});
