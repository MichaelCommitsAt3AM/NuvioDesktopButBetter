import { expect, it } from 'vitest';
import { projectLibraryVertical } from './libraryVertical';

const media = (id: string, type: string) => ({ id, type, name: id, poster: null, background: null, logo: null, description: '', releaseInfo: '', rating: null, genres: [] });
const extra = (id: string, type: string, category: string) => ({ id, type, category, savedAt: 0, listKeys: [] as string[] });
const sections = [{ type: 'movies', title: 'Movies', items: ['movie|a', 'series|b'] }];

it('flattens every section for the local source and ignores the list selection', () => {
  const projection = projectLibraryVertical({
    items: [media('a', 'movie'), media('b', 'series')],
    extraItems: [extra('a', 'movie', 'movie'), extra('b', 'series', 'series')],
    orderedKeys: ['series|b', 'movie|a'],
    sections,
    source: 'local',
    selectedSectionType: 'movies',
    selectedType: null,
  });
  expect(projection.availableSections).toEqual([]);
  expect(projection.selectedSection).toBeNull();
  expect(projection.items.map(item => item.id)).toEqual(['b', 'a']);
  expect(projection.availableTypes).toEqual(['movie', 'series']);
});

it('limits a remote source to the selected section and filters by type', () => {
  const projection = projectLibraryVertical({
    items: [media('a', 'movie'), media('b', 'series')],
    extraItems: [extra('a', 'movie', 'movie'), extra('b', 'series', 'series')],
    orderedKeys: [],
    sections,
    source: 'trakt',
    selectedSectionType: 'movies',
    selectedType: 'series',
  });
  expect(projection.availableSections).toHaveLength(1);
  expect(projection.selectedSection?.type).toBe('movies');
  expect(projection.items.map(item => item.id)).toEqual(['b']);
  expect(projection.selectedType).toBe('series');
});

it('falls back to all types when the selection is not available', () => {
  const projection = projectLibraryVertical({
    items: [media('a', 'movie'), media('b', 'series')],
    extraItems: [extra('a', 'movie', 'movie'), extra('b', 'series', 'series')],
    orderedKeys: ['movie|a', 'series|b'],
    sections: [],
    source: 'local',
    selectedSectionType: null,
    selectedType: 'anime',
  });
  expect(projection.selectedType).toBeNull();
  expect(projection.items.map(item => item.id)).toEqual(['a', 'b']);
});
