import { expect, it } from 'vitest';
import { releaseNoteItems } from './releaseNotes';

it('removes commit identifiers and authors from older updater notes', () => {
  expect(releaseNoteItems('a1c093deb Restore top bar drag navigation @MichaelCommitsAt3AM  \r\n09d7769f2 Polish settings navigation @Example-User'))
    .toEqual(['Restore top bar drag navigation', 'Polish settings navigation']);
});

it('keeps curated bullet statements without duplicating markers or Markdown links', () => {
  expect(releaseNoteItems('## Release notes\n\n- Fix title artwork loading.\n* Improve [settings](https://example.com/settings).\n• Keep episode browsing steady.'))
    .toEqual(['Fix title artwork loading.', 'Improve settings.', 'Keep episode browsing steady.']);
});

it('does not remove ordinary title text or inline mentions', () => {
  expect(releaseNoteItems('127 Hours artwork fix\nImprove @mention handling in comments\n\n'))
    .toEqual(['127 Hours artwork fix', 'Improve @mention handling in comments']);
  expect(releaseNoteItems('')).toEqual([]);
});
