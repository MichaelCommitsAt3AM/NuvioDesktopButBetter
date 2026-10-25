import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PosterHoverPreview } from './PosterHoverPreview';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('PosterHoverPreview', () => {
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
