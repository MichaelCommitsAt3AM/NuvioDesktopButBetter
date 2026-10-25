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
const originalImage = globalThis.Image;
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
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); globalThis.Image = originalImage; });

describe('Continue Watching snapshot loading', () => {
  it('keeps the fullscreen control outside scrolling Home content and hides it on other routes', () => {
    const page = (visible: boolean) => <MemoryRouter><HomeVisibility value={visible}><HomePage /></HomeVisibility></MemoryRouter>;
    const view = render(page(true));
    const control = screen.getByRole('button', { name: 'Enter fullscreen' });
    expect(control.parentElement).toBe(document.body);
    expect(view.container.querySelector('.fullscreen-toggle')).toBeNull();
    view.rerender(page(false));
    expect(screen.queryByRole('button', { name: 'Enter fullscreen' })).not.toBeInTheDocument();
    view.rerender(page(true));
    expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeVisible();
  });

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

  it('keeps a hero shimmer while a profile switch streams shelves before the featured hero', () => {
    bridge.state.home = { loading: true, shelves: [{ key: 'kids', title: 'KidsScreen Family - Movies', items: [{ id: 'movie', type: 'movie', name: 'Movie', genres: [] }] }], hero: [] };
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(document.querySelector('.home-loading-hero')).not.toBeNull();
  });

  it('drops the hero shimmer once loading settles without a featured hero', () => {
    bridge.state.home = { loading: false, shelves: [{ key: 'kids', title: 'KidsScreen Family - Movies', items: [{ id: 'movie', type: 'movie', name: 'Movie', genres: [] }] }], hero: [] };
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(document.querySelector('.home-loading-hero')).toBeNull();
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

  describe('hero pager', () => {
    const heroes = [
      { id: 'one', type: 'movie', name: 'First feature', background: null, logo: null, genres: [], description: '' },
      { id: 'two', type: 'movie', name: 'Second feature', background: null, logo: null, genres: [], description: '' },
    ];
    it('shows the first catalog preview immediately and keeps its title stable as loading settles', () => {
      bridge.state.session.activeProfile = 9201;
      bridge.state.home = { shelves: [], loading: true, hero: [heroes[1]] };
      const view = render(<MemoryRouter><HomePage /></MemoryRouter>);
      expect(screen.getByRole('region', { name: 'Featured titles' })).toHaveTextContent('Second feature');
      expect(document.querySelector('.home-loading-hero')).toBeNull();
      bridge.state.home = { shelves: [], loading: true, hero: [...heroes].reverse() };
      view.rerender(<MemoryRouter><HomePage /></MemoryRouter>);
      expect(screen.getByRole('region', { name: 'Featured titles' })).toHaveTextContent('Second feature');
      expect(document.querySelector('.home-loading-hero')).toBeNull();
      bridge.state.home = { shelves: [], loading: false, hero: heroes };
      view.rerender(<MemoryRouter><HomePage /></MemoryRouter>);
      expect(screen.getByRole('region', { name: 'Featured titles' })).toHaveTextContent('Second feature');
      bridge.state.home = { shelves: [], loading: true, hero: [...heroes].reverse() };
      view.rerender(<MemoryRouter><HomePage /></MemoryRouter>);
      expect(screen.getByRole('region', { name: 'Featured titles' })).toHaveTextContent('Second feature');
    });

    it('enriches the pinned hero while catalogs load and clears it on profile changes', () => {
      bridge.state.session.activeProfile = 9240;
      bridge.state.home = { shelves: [], loading: true, hero: [heroes[0]] };
      const view = render(<MemoryRouter><HomePage /></MemoryRouter>);
      bridge.state.home = { shelves: [], loading: true, hero: [{ ...heroes[0], runtime: '120 min', rating: '8.2', externalRatings: [{ source: 'tmdb', value: 85 }] }] };
      view.rerender(<MemoryRouter><HomePage /></MemoryRouter>);
      const featured = screen.getByRole('region', { name: 'Featured titles' });
      expect(featured).toHaveTextContent('First feature');
      expect(featured).toHaveTextContent('120 min');
      expect(featured).toHaveTextContent('IMDb 8.2');
      expect(featured).toHaveTextContent('tmdb 85');
      bridge.state.session.activeProfile = 9241;
      bridge.state.home = { shelves: [], loading: true, hero: [] };
      view.rerender(<MemoryRouter><HomePage /></MemoryRouter>);
      expect(screen.queryByText('120 min')).toBeNull();
    });

    const pointer = (node: HTMLElement, type: 'pointerdown' | 'pointermove' | 'pointerup', clientX: number) =>
      fireEvent(node, new MouseEvent(type, { bubbles: true, clientX, button: 0 }));

    it('starts each automatic interval after its background loads and decodes', async () => {
      vi.useFakeTimers();
      const images: Array<{ onload?: () => void; src: string; resolveDecode: () => void }> = [];
      vi.stubGlobal('Image', class {
        onload?: () => void;
        src = '';
        resolveDecode!: () => void;
        decode = () => new Promise<void>(resolve => { this.resolveDecode = resolve; });
        constructor() { images.push(this); }
      });
      bridge.state.session.activeProfile = 9201;
      bridge.state.home.hero = heroes.map(hero => ({ ...hero, background: `https://example.invalid/${hero.id}.jpg` }));
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      const currentTitle = () => screen.getByRole('region', { name: 'Featured titles' });
      await act(async () => vi.advanceTimersByTime(20_000));
      expect(currentTitle()).toHaveTextContent('First feature');
      const firstImage = images.find(image => image.onload && image.src.endsWith('/one.jpg'))!;
      act(() => firstImage.onload!());
      await act(async () => vi.advanceTimersByTime(10_000));
      expect(currentTitle()).toHaveTextContent('First feature');
      await act(async () => firstImage.resolveDecode());
      await act(async () => vi.advanceTimersByTime(7_999));
      expect(currentTitle()).toHaveTextContent('First feature');
      await act(async () => vi.advanceTimersByTime(1));
      expect(currentTitle()).toHaveTextContent('Second feature');
      await act(async () => vi.advanceTimersByTime(20_000));
      expect(currentTitle()).toHaveTextContent('Second feature');
      const secondImage = images.find(image => image.onload && image.src.endsWith('/two.jpg'))!;
      act(() => secondImage.onload!());
      await act(async () => secondImage.resolveDecode());
      await act(async () => vi.advanceTimersByTime(8_000));
      expect(currentTitle()).toHaveTextContent('First feature');
    });

    it('gives a replacement title a fresh interval even when the hero count stays the same', async () => {
      vi.useFakeTimers();
      bridge.state.session.activeProfile = 9202;
      bridge.state.home.hero = heroes;
      const view = render(<MemoryRouter><HomePage /></MemoryRouter>);
      await act(async () => vi.advanceTimersByTime(7_000));
      bridge.state.home.hero = [{ ...heroes[0], id: 'replacement', name: 'Replacement feature' }, heroes[1]];
      view.rerender(<MemoryRouter><HomePage /></MemoryRouter>);
      await act(async () => vi.advanceTimersByTime(1_000));
      expect(screen.getByRole('region', { name: 'Featured titles' })).toHaveTextContent('Replacement feature');
      await act(async () => vi.advanceTimersByTime(7_000));
      expect(screen.getByRole('region', { name: 'Featured titles' })).toHaveTextContent('Second feature');
    });

    it('advances on a long drag and snaps back on a short one', () => {
      bridge.state.session.activeProfile = 9101;
      bridge.state.home.hero = heroes;
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      const hero = screen.getByRole('region', { name: 'Featured titles' });
      expect(hero).toHaveTextContent('First feature');
      pointer(hero, 'pointerdown', 300);
      pointer(hero, 'pointermove', 100);
      pointer(hero, 'pointerup', 100);
      expect(screen.getByRole('region', { name: 'Featured titles' })).toHaveTextContent('Second feature');
      const settled = screen.getByRole('region', { name: 'Featured titles' });
      pointer(settled, 'pointerdown', 300);
      pointer(settled, 'pointermove', 290);
      pointer(settled, 'pointerup', 290);
      expect(screen.getByRole('region', { name: 'Featured titles' })).toHaveTextContent('Second feature');
    });

    it('does not open details when a drag settles into a page change', () => {
      bridge.state.session.activeProfile = 9102;
      bridge.state.home.hero = heroes;
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      const hero = screen.getByRole('region', { name: 'Featured titles' });
      const details = screen.getByRole('button', { name: 'View Details' });
      pointer(hero, 'pointerdown', 300);
      pointer(hero, 'pointermove', 100);
      pointer(hero, 'pointerup', 100);
      fireEvent.click(details);
      expect(screen.getByRole('region', { name: 'Featured titles' })).toHaveTextContent('Second feature');
    });

    it('selects a featured title from the indicator dots', () => {
      bridge.state.session.activeProfile = 9103;
      bridge.state.home.hero = heroes;
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      fireEvent.click(screen.getByRole('button', { name: 'Show featured title 2' }));
      expect(screen.getByRole('region', { name: 'Featured titles' })).toHaveTextContent('Second feature');
      fireEvent.click(screen.getByRole('button', { name: 'Show featured title 1' }));
      expect(screen.getByRole('region', { name: 'Featured titles' })).toHaveTextContent('First feature');
    });
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
