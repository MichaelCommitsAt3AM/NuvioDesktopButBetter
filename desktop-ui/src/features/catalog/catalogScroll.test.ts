import { expect, it, vi } from 'vitest';
import { captureCatalogAnchor, catalogAnchorTarget } from './catalogScroll';

it('restores an actual item across column changes, including header and row gaps', () => {
  const scroller = document.createElement('main');
  const grid = document.createElement('div');
  const keys = Array.from({ length: 12 }, (_, index) => `movie:${index}`);
  let columns = 3;
  scroller.scrollTop = 590;
  vi.spyOn(scroller, 'getBoundingClientRect').mockImplementation(() => ({ top: 20 } as DOMRect));
  keys.forEach((_, index) => {
    const card = document.createElement('div'); grid.appendChild(card);
    vi.spyOn(card, 'getBoundingClientRect').mockImplementation(() => {
      const top = 20 + 280 + Math.floor(index / columns) * 118 - scroller.scrollTop;
      return { top, bottom: top + 100, height: 100 } as DOMRect;
    });
  });
  const anchor = captureCatalogAnchor(scroller, grid, keys);
  expect(anchor.itemKey).toBe('movie:6');
  expect(anchor.offset).toBe(74);
  columns = 2;
  expect(catalogAnchorTarget(scroller, grid, keys, anchor)).toBe(708);
  expect(catalogAnchorTarget(scroller, grid, keys, { itemKey: null, index: 0, offset: 0 })).toBe(0);
});
