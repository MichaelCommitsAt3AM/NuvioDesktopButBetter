import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PosterHoverPreview } from './PosterHoverPreview';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('PosterHoverPreview', () => {
  it.each([
    [{ deltaX: 0, deltaY: 37.5 }, null, { left: 0, top: 37.5, behavior: 'instant' }],
    [{ deltaX: -24.5, deltaY: 0 }, { left: -24.5, top: 0, behavior: 'instant' }, null],
    [{ deltaX: 12, deltaY: 18 }, { left: 12, top: 0, behavior: 'instant' }, { left: 0, top: 18, behavior: 'instant' }],
    [{ deltaX: 0, deltaY: 40, shiftKey: true }, { left: 40, top: 0, behavior: 'instant' }, null],
    [{ deltaX: 0, deltaY: 2, deltaMode: 1 }, null, { left: 0, top: 40, behavior: 'instant' }],
    [{ deltaX: 1, deltaY: 0, deltaMode: 2 }, { left: 600, top: 0, behavior: 'instant' }, null],
    [{ deltaX: 0, deltaY: 40, ctrlKey: true }, null, null],
  ])('forwards wheel input from the expanded card to its source row and page (%j)', (input, horizontal, vertical) => {
    const main = document.createElement('main');
    main.style.overflowY = 'auto';
    main.style.lineHeight = '20px';
    const row = document.createElement('div');
    row.style.overflowX = 'auto';
    const anchor = document.createElement('button');
    row.appendChild(anchor); main.appendChild(row); document.body.appendChild(main);
    Object.defineProperties(main, { clientHeight: { value: 600 }, scrollHeight: { value: 2400 }, scrollTop: { value: 100 } });
    Object.defineProperties(row, { clientWidth: { value: 600 }, scrollWidth: { value: 1800 }, scrollLeft: { value: 100 } });
    main.scrollBy = vi.fn(); row.scrollBy = vi.fn();
    const onMouseLeave = vi.fn();
    try {
      render(<PosterHoverPreview
        anchorRef={{ current: anchor }}
        item={{ id: 'wheel', type: 'movie', name: 'Wheel Movie', poster: null, background: null, logo: null, description: '', releaseInfo: '2026', rating: null, genres: [] }}
        rect={{ left: 100, top: 80 } as DOMRect} saved={false} watched={false}
        onOpen={() => {}} onToggleWatched={() => {}} onToggleSaved={() => {}} onMouseEnter={() => {}} onMouseLeave={onMouseLeave}
      />);
      const allowed = fireEvent.wheel(document.querySelector('.poster-preview')!, input);
      if (horizontal) expect(row.scrollBy).toHaveBeenCalledExactlyOnceWith(horizontal);
      else expect(row.scrollBy).not.toHaveBeenCalled();
      if (vertical) expect(main.scrollBy).toHaveBeenCalledExactlyOnceWith(vertical);
      else expect(main.scrollBy).not.toHaveBeenCalled();
      const zoom = 'ctrlKey' in input && input.ctrlKey;
      expect(allowed).toBe(Boolean(zoom));
      expect(onMouseLeave).toHaveBeenCalledTimes(zoom ? 0 : 1);
    } finally { main.remove(); }
  });
  it('retains the closing card for its exit and cancels dismissal when reopened', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const props = {
      item: { id: 'movie', type: 'movie', name: 'Movie', poster: null, background: null, logo: null, description: '', releaseInfo: '2026', rating: null, genres: [] },
      rect: { left: 100, top: 80 } as DOMRect, saved: false, watched: false,
      onOpen: vi.fn(), onToggleWatched: vi.fn(), onToggleSaved: vi.fn(), onMouseEnter: vi.fn(), onMouseLeave: vi.fn(),
    };
    const view = render(<PosterHoverPreview {...props} visible />);
    view.rerender(<PosterHoverPreview {...props} visible={false} />);
    expect(document.querySelector('.poster-preview')).toHaveClass('is-closing');
    expect(document.querySelector('.poster-preview')).toHaveAttribute('inert');
    act(() => vi.advanceTimersByTime(80));
    view.rerender(<PosterHoverPreview {...props} visible />);
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole('button', { name: /view details/i })).toBeInTheDocument();
    expect(document.querySelector('.poster-preview')).not.toHaveClass('is-closing');
    view.rerender(<PosterHoverPreview {...props} visible={false} />);
    act(() => vi.advanceTimersByTime(170));
    expect(document.querySelector('.poster-preview')).toBeNull();
  });
  it('renders the shared expanded card actions without bubbling to its card', () => {
    const onOpen = vi.fn();
    const onCardClick = vi.fn();
    render(<div onClick={onCardClick}><PosterHoverPreview
      item={{ id: 'love', type: 'movie', name: 'The Love Hypothesis', poster: null, background: 'https://example.test/backdrop.jpg', logo: null, description: 'A romance.', releaseInfo: '2026', rating: '7.1', genres: ['Comedy', 'Romance'] }}
      rect={{ left: 100, top: 80 } as DOMRect}
      saved={false}
      watched={false}
      onOpen={onOpen}
      onToggleWatched={() => {}}
      onToggleSaved={() => {}}
      onMouseEnter={() => {}}
      onMouseLeave={() => {}}
    /></div>);

    expect(screen.getByRole('button', { name: /view details/i })).toBeInTheDocument();
    expect(screen.getByText('Comedy · Romance')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'IMDb' })).toHaveAttribute('src', '/images/ratings/imdb.png');
    expect(screen.getByText('7.1')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /view details/i }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onCardClick).not.toHaveBeenCalled();
  });
  it('dismisses on wheel over the card like the Kotlin preview', () => {
    const onMouseLeave = vi.fn();
    render(<PosterHoverPreview
      item={{ id: 'wheel', type: 'movie', name: 'Wheel Movie', poster: null, background: null, logo: null, description: '', releaseInfo: '2026', rating: null, genres: [] }}
      rect={{ left: 100, top: 80 } as DOMRect}
      saved={false}
      watched={false}
      onOpen={() => {}}
      onToggleWatched={() => {}}
      onToggleSaved={() => {}}
      onMouseEnter={() => {}}
      onMouseLeave={onMouseLeave}
    />);
    fireEvent.wheel(document.querySelector('.poster-preview')!, { deltaY: 100, deltaX: 0 });
    expect(onMouseLeave).toHaveBeenCalledTimes(1);
  });
  it('mounts artwork only after it fully decodes and drops dead URLs', async () => {
    type Probe = { src: string; onload: (() => void) | null; onerror: (() => void) | null; decode: () => Promise<void>; decoding: string };
    const probes: Probe[] = [];
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decoding = 'auto';
      src = '';
      constructor() { probes.push(this as unknown as Probe); }
      decode() { return Promise.resolve(); }
    }
    vi.stubGlobal('Image', FakeImage);
    const props = {
      item: { id: 'art', type: 'movie', name: 'Art Movie', poster: null, background: 'https://example.test/backdrop.jpg', logo: 'https://example.test/logo.png', description: '', releaseInfo: '2026', rating: null, genres: [] },
      rect: { left: 100, top: 80 } as DOMRect, saved: false, watched: false,
      onOpen: vi.fn(), onToggleWatched: vi.fn(), onToggleSaved: vi.fn(), onMouseEnter: vi.fn(), onMouseLeave: vi.fn(),
    };
    render(<PosterHoverPreview {...props} visible />);
    // Art reserves its space but no <img> exists until the bitmap is decoded.
    expect(document.querySelector('.home-preview-art')).not.toBeNull();
    expect(document.querySelector('.home-preview-backdrop')).toBeNull();
    expect(document.querySelector('.home-preview-logo')).toBeNull();
    expect(probes).toHaveLength(2);
    await act(async () => { probes.forEach((probe) => probe.onload?.()); });
    expect(document.querySelector<HTMLImageElement>('.home-preview-backdrop')?.src).toBe('https://example.test/backdrop.jpg');
    expect(document.querySelector<HTMLImageElement>('.home-preview-logo')?.src).toBe('https://example.test/logo.png');

    cleanup();
    probes.length = 0;
    render(<PosterHoverPreview {...props} visible />);
    await act(async () => { probes.forEach((probe) => probe.onerror?.()); });
    expect(document.querySelector('.home-preview-backdrop')).toBeNull();
    expect(document.querySelector('.home-preview-logo')).toBeNull();
  });
});
