import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './HomePage';
import { HomeVisibility } from './homeVisibility';

const bridge = vi.hoisted(() => ({
  state: { session: { activeProfile: 1 }, home: { shelves: [] as any[], hero: [] as any[], loading: false } },
  extras: undefined as unknown,
  refresh: vi.fn(),
}));
vi.mock('../../bridge', () => ({
  useSelector: (select: (state: unknown) => unknown) => select(bridge.state),
  useFeatureSnapshot: (topic: string) => topic === 'homeExtras' ? bridge.extras : undefined,
  refreshFeature: (...args: unknown[]) => bridge.refresh(...args),
  actions: {}, call: vi.fn(),
}));
vi.mock('../collections/CollectionsPages', () => ({ HomeCollections: () => null }));

const item = {
  parentMetaId: 'movie-1', parentMetaType: 'movie', videoId: 'movie-1',
  title: 'Saved movie', subtitle: '', resumePositionMs: 10_000, durationMs: 100_000,
  progressFraction: .1,
};
function snapshot(items: typeof item[], loading = false) {
  return { loading, continueWatching: items, upcoming: [], preferences: { isVisible: true, style: 'LANDSCAPE', sortMode: 'LAST_WATCHED' } };
}
let resolveSnapshot: (value: unknown) => void;
let rejectSnapshot: (reason: Error) => void;
beforeEach(() => {
  bridge.extras = undefined;
  bridge.state.home = { shelves: [], hero: [], loading: false };
  bridge.state.session.activeProfile = 1;
  const pending = new Promise((resolve, reject) => { resolveSnapshot = resolve; rejectSnapshot = reject; });
  bridge.refresh.mockImplementation((_: string, method: string) => {
    if (method === 'home.extras.snapshot') return pending;
    // Next Up can still be fetching when local progress becomes displayable.
    if (method === 'home.extras.refresh') return new Promise(() => {});
    return Promise.resolve();
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Continue Watching snapshot loading', () => {
  it('restores the saved Home scroll without recording another screen or restarting requests', () => {
    bridge.state.session.activeProfile = 7915;
    const page = (visible: boolean) => <MemoryRouter><main className="main-area"><HomeVisibility value={visible}><div style={{ display: visible ? 'contents' : 'none' }}><HomePage /></div></HomeVisibility></main></MemoryRouter>;
    const view = render(page(true));
    const main = view.container.querySelector<HTMLElement>('.main-area')!;
    main.scrollTop = 740;
    fireEvent.scroll(main);
    view.rerender(page(false));
    main.scrollTop = 25;
    fireEvent.scroll(main);
    view.rerender(page(true));
    expect(main.scrollTop).toBe(740);
    expect(bridge.refresh.mock.calls.filter(([,method]) => method === 'home.extras.snapshot')).toHaveLength(1);
    bridge.state.session.activeProfile = 7916;
    view.rerender(page(true));
    expect(main.scrollTop).toBe(0);
  });
  it('does not substitute unselected shelf titles for an empty Kotlin hero', () => {
    bridge.state.home.shelves = [{ key: 'unselected', items: [{ id: 'movie', type: 'movie', name: 'Unselected title', genres: [] }] }];
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.queryByRole('region', { name: 'Featured titles' })).toBeNull();
  });

  it('uses the selected Kotlin hero even when it belongs to a hidden catalog', () => {
    bridge.state.home.hero = [{ id: 'movie', type: 'movie', name: 'Selected title', genres: [] }];
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.getByRole('region', { name: 'Featured titles' })).toHaveTextContent('Selected title');
  });
  it('shows shared shimmer cards, then displays local progress without waiting for remote readiness or Next Up', async () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.getByText('Continue Watching').closest('section')).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelectorAll('.home-cw-skeleton .poster-loading-art.poster-loading-shimmer')).toHaveLength(5);

    await act(async () => {
      bridge.extras = snapshot([item], true);
      resolveSnapshot(bridge.extras);
    });
    expect(screen.getByRole('button', { name: 'Resume Saved movie' })).toBeInTheDocument();
    expect(document.querySelector('.home-cw-skeleton')).toBeNull();
  });

  it('collapses after an empty local snapshot even if remote synchronization has not completed', async () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    await act(async () => {
      bridge.extras = snapshot([], true);
      resolveSnapshot(bridge.extras);
    });
    expect(screen.queryByText('Continue Watching')).toBeNull();
  });

  it('does not leave perpetual placeholders if the snapshot request fails', async () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    await act(async () => { rejectSnapshot(new Error('Bridge unavailable')); });
    expect(document.querySelector('.home-cw-skeleton')).toBeNull();
  });

  it('closes the continue watching actions dialog when an option is chosen', async () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    await act(async () => {
      bridge.extras = snapshot([item]);
      resolveSnapshot(bridge.extras);
    });
    const menuButton = screen.getByRole('button', { name: 'More continue watching actions' });
    fireEvent.click(menuButton);
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');
    expect(await screen.findByRole('button', { name: 'Go to details' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to details' }));
    expect(screen.queryByRole('button', { name: 'Go to details' })).toBeNull();
  });

  it('hides the previous profile progress behind placeholders until the new snapshot settles', async () => {
    const view = render(<MemoryRouter><HomePage /></MemoryRouter>);
    await act(async () => {
      bridge.extras = snapshot([item]);
      resolveSnapshot(bridge.extras);
    });
    const nextSnapshot = new Promise(resolve => { resolveSnapshot = resolve; });
    bridge.refresh.mockImplementation(() => nextSnapshot);
    bridge.state.session.activeProfile = 2;
    view.rerender(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Resume Saved movie' })).toBeNull();
    expect(document.querySelectorAll('.home-cw-skeleton')).toHaveLength(5);
    await act(async () => {
      bridge.extras = snapshot([]);
      resolveSnapshot(bridge.extras);
    });
    expect(screen.queryByText('Continue Watching')).toBeNull();
  });
});
