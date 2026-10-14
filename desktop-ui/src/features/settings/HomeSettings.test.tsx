import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomeSettings } from './HomeSettings';
const state = vi.hoisted(() => ({ home: {} as any, update: vi.fn(), refresh: vi.fn(), call: vi.fn() }));
vi.mock('./appearanceStore', () => ({ useAppearance: () => ({ snapshot: { home: state.home }, loading: false, error: '', refresh: state.refresh, update: state.update }) }));
vi.mock('../../bridge', () => ({ call: (...args: unknown[]) => state.call(...args) }));
function page() { return render(<MemoryRouter><HomeSettings /></MemoryRouter>); }
function item(key: string, extra = {}) { return { key, title: key, defaultTitle: key, customTitle: '', addonName: 'Cinemeta', enabled: true, heroSourceEnabled: false, order: 0, isCollection: false, isPinnedToTop: false, collectionId: null, ...extra }; }
beforeEach(() => {
  state.home = { heroEnabled: true, showCatalogType: true, hideUnreleasedContent: false, heroSourceSelectionLimit: 2, items: [item('Pinned collection', { isCollection: true, isPinnedToTop: true, addonName: '3 catalogs', order: 99 }), item('Popular movies', { heroSourceEnabled: true }), item('Popular series', { heroSourceEnabled: true }), item('New releases')] };
  state.update.mockReset().mockResolvedValue({}); state.refresh.mockReset().mockResolvedValue({}); state.call.mockReset().mockResolvedValue({});
});
afterEach(cleanup);
describe('Kotlin Home Layout parity', () => {
  it('writes individual catalog visibility and Home switches through Kotlin preferences', async () => {
    page();
    fireEvent.click(screen.getByLabelText('Show New releases'));
    await waitFor(() => expect(state.update).toHaveBeenCalledWith('homePreferences.setEnabled', { key: 'New releases', enabled: false }));
    await waitFor(() => expect(screen.getByLabelText('Show Catalog Type')).toBeEnabled());
    fireEvent.click(screen.getByLabelText('Show Catalog Type'));
    await waitFor(() => expect(state.update).toHaveBeenCalledWith('homePreferences.setShowCatalogType', { enabled: false }));
    await waitFor(() => expect(screen.getByLabelText('Hide Unreleased Content')).toBeEnabled());
    fireEvent.click(screen.getByLabelText('Hide Unreleased Content'));
    await waitFor(() => expect(state.update).toHaveBeenCalledWith('homePreferences.setHideUnreleasedContent', { enabled: true }));
    await waitFor(() => expect(screen.getByLabelText('Show Hero Section')).toBeEnabled());
    fireEvent.click(screen.getByLabelText('Show Hero Section'));
    await waitFor(() => expect(state.update).toHaveBeenCalledWith('homePreferences.setHeroEnabled', { enabled: false }));
  });
  it('resets through the Kotlin repository instead of changing local preference state', async () => {
    page(); fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(state.update).toHaveBeenCalledWith('homePreferences.reset', {}));
  });
  it('allows a new hero source below the Kotlin selection limit', async () => {
    state.home.items[2].heroSourceEnabled = false;
    page(); fireEvent.click(screen.getByRole('button', { name: /1 of 2 selected/ }));
    fireEvent.click(screen.getByLabelText('New releases'));
    await waitFor(() => expect(state.update).toHaveBeenCalledWith('homePreferences.setHeroSourceEnabled', { key: 'New releases', enabled: true }));
  });

  it('uses native labels, addon subtitles, and pinned-first repository ordering', () => {
    page();
    expect(screen.getByText('4 of 4 catalogs visible • 2 hero sources selected')).toBeInTheDocument();
    expect(screen.getByLabelText('Show Catalog Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Hide Unreleased Content')).toBeInTheDocument();
    expect(screen.getByText('Collection • 3 catalogs')).toBeInTheDocument();
    expect(screen.getByText('Visible • Pinned to top')).toBeInTheDocument();
    expect(document.querySelector('.home-catalog-info strong')?.textContent).toBe('Pinned collection');
    expect(screen.queryByLabelText('Move Popular movies up')).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to Layout' })).toHaveAttribute('href', '/settings/appearance');
  });
  it('enforces hero selection limits while allowing selected sources to be removed', async () => {
    page(); fireEvent.click(screen.getByRole('button', { name: /2 of 2 selected/ }));
    expect(screen.getByLabelText('New releases')).toBeDisabled();
    expect(screen.getByText('Cinemeta • Limit reached (max 2)')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Popular movies'));
    await waitFor(() => expect(state.update).toHaveBeenCalledWith('homePreferences.setHeroSourceEnabled', { key: 'Popular movies', enabled: false }));
  });
  it('moves by stable keys and blocks movement into pinned collections', async () => {
    page(); fireEvent.keyDown(screen.getByLabelText('Reorder Popular movies'), { key: 'ArrowUp' });
    expect(state.update).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText('Reorder Popular movies'), { key: 'ArrowDown' });
    await waitFor(() => expect(state.update).toHaveBeenCalledWith('homePreferences.move', { key: 'Popular movies', targetKey: 'Popular series' }));
  });
  it('drops dragged catalogs through Kotlin without exposing internal keys', async () => {
    page();
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(screen.getByLabelText('Reorder Popular movies'), { dataTransfer });
    const target = screen.getByRole('button', { name: /New releases Cinemeta/ }).closest('article')!;
    fireEvent.dragOver(target); fireEvent.drop(target);
    await waitFor(() => expect(state.update).toHaveBeenCalledWith('homePreferences.move', { key: 'Popular movies', targetKey: 'New releases' }));
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'Popular movies');
  });
  it('shows the native pinned explanation and keeps collection names read-only', () => {
    page(); fireEvent.click(screen.getByLabelText('Pinned Pinned collection'));
    expect(screen.getByRole('status')).toHaveTextContent('Remove pin to top from collection to move');
    fireEvent.click(screen.getByRole('button', { name: /Pinned collection Collection/ }));
    expect(screen.queryByLabelText('Display Name for Pinned collection')).toBeNull();
  });
  it('keeps one catalog expanded and saves successive text edits in order', async () => {
    page(); fireEvent.click(screen.getByRole('button', { name: /Popular movies Cinemeta/ }));
    const input = screen.getByLabelText('Display Name for Popular movies');
    fireEvent.change(input, { target: { value: 'M' } }); fireEvent.change(input, { target: { value: 'Movies' } });
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(2));
    expect(state.update.mock.calls.map(args => args[1].title)).toEqual(['M', 'Movies']);
    fireEvent.click(screen.getByRole('button', { name: /Popular series Cinemeta/ }));
    expect(screen.queryByLabelText('Display Name for Popular movies')).toBeNull();
    expect(screen.getByLabelText('Display Name for Popular series')).toBeInTheDocument();
  });
  it('omits catalog controls when empty and retries failed manifests', async () => {
    state.home.items = []; state.home.catalogErrorMessage = 'Manifest unavailable'; page();
    expect(screen.getByText('Couldn’t load Home catalogs')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(state.call).toHaveBeenCalledWith('addons.refreshAll'));
  });
  it('shows pending catalog loading and hides hero sources when the hero is off', () => {
    state.home.items = []; state.home.isCatalogLoading = true; state.home.heroEnabled = false; page();
    expect(screen.getByRole('status', { name: 'Loading Home catalogs' })).toBeInTheDocument();
    expect(screen.queryByText('No home catalogs')).toBeNull();
    expect(screen.queryByText('HERO CATALOGS')).toBeNull();
  });
});
