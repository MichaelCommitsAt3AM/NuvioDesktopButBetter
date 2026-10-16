import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CollectionEditorPage, folderDropIndex } from './CollectionsPages';

afterEach(cleanup);

const bridge = vi.hoisted(() => ({ editor: null as unknown, call: vi.fn(async (..._: unknown[]) => ({})), refresh: vi.fn(async (..._: unknown[]) => ({})) }));
vi.mock('../../bridge', () => ({
  call: (...args: unknown[]) => bridge.call(...args),
  refreshFeature: (...args: unknown[]) => bridge.refresh(...args),
  useFeatureSnapshot: () => bridge.editor,
  useSelector: (select: (state: unknown) => unknown) => select({ session: { activeProfile: 7 } }),
}));

const page = () => <MemoryRouter initialEntries={['/collections/1/edit']}><Routes><Route path="/collections/:collectionId/edit" element={<CollectionEditorPage />} /></Routes></MemoryRouter>;

describe('folderDropIndex', () => {
  it('lands before the first midpoint below the pointer', () => {
    expect(folderDropIndex([100, 200, 300], 50)).toBe(0);
    expect(folderDropIndex([100, 200, 300], 150)).toBe(1);
    expect(folderDropIndex([100, 200, 300], 350)).toBe(3);
  });
});

describe('CollectionEditorPage folder reorder', () => {
  const folders = [
    { id: 'a', title: 'Alpha', sources: [], catalogSources: [] },
    { id: 'b', title: 'Beta', sources: [], catalogSources: [] },
    { id: 'c', title: 'Gamma', sources: [], catalogSources: [] },
  ];

  function pointer(node: HTMLElement, type: 'pointerdown' | 'pointermove' | 'pointerup', clientY: number) {
    act(() => { node.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 0, clientY, button: 0 })); });
  }

  function layoutRows() {
    const rows = [...document.querySelectorAll<HTMLElement>('.editor-folder-row')];
    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ top: index * 60, height: 56, left: 0, width: 300, bottom: 0, right: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    });
  }

  it('commits one move on pointer drop and keeps keyboard reorder', async () => {
    bridge.editor = { isNew: false, collectionId: '1', title: 'C', backdropImageUrl: null, pinToTop: false, viewMode: 'ROWS', showAllTab: false, folders, editingFolder: null, showFolderEditor: false, showCatalogPicker: false, showTmdbSourcePicker: false, showTraktSourcePicker: false, editingTraktSourceIndex: null, genrePickerSourceIndex: null, tmdbBuilderMode: 'PRESETS', tmdbInput: '', tmdbTitleInput: '', tmdbMediaType: 'MOVIE', tmdbMediaBoth: false, tmdbSortBy: 'original', tmdbFilters: {}, tmdbCompanyResults: [], tmdbCollectionResults: [], tmdbSearchError: null, traktInput: '', traktTitleInput: '', traktMediaType: 'MOVIE', traktMediaBoth: false, traktSortBy: 'rank', traktSortHow: 'asc', traktSearchResults: [], traktTrendingResults: [], traktPopularResults: [], traktSearchError: null, availableCatalogs: [] };
    bridge.call.mockClear();
    render(page());
    layoutRows();
    const handle = screen.getByRole('button', { name: 'Drag Alpha to reorder' });
    pointer(handle, 'pointerdown', 10);
    pointer(handle, 'pointermove', 200);
    pointer(handle, 'pointerup', 200);
    await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('collections.editor.moveFolder', { from: 0, to: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Gamma up' }));
    await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('collections.editor.moveFolder', { from: 2, to: 1 }));
    vi.restoreAllMocks();
  });
});
