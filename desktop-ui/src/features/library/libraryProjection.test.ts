import { expect, it } from 'vitest';
import { projectLibraryItems } from './libraryProjection';

it('uses provider section order instead of global library order', () => {
  const items = [{ id: 'first', type: 'movie' }, { id: 'second', type: 'movie' }];
  expect(projectLibraryItems(items, ['movie|second', 'movie|first'])).toEqual([items[1], items[0]]);
});

it('limits a selected list to its own typed members and ignores obsolete keys', () => {
  const items = [{ id: 'same', type: 'movie' }, { id: 'same', type: 'series' }, { id: 'other', type: 'movie' }];
  expect(projectLibraryItems(items, ['series|same', 'movie|removed'])).toEqual([items[1]]);
  expect(projectLibraryItems(items, [])).toEqual([]);
});
