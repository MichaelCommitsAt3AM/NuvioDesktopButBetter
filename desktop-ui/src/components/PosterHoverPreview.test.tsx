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
    act(() => vi.advanceTimersByTime(160));
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
    fireEvent.click(screen.getByRole('button', { name: /view details/i }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onCardClick).not.toHaveBeenCalled();
  });
  it('forwards wheel over the card to the page scroller', () => {
    document.body.innerHTML = '<div class="main-area"></div>';
    const original = window.HTMLElement.prototype.scrollBy;
    const scrollBy = vi.fn();
    (window.HTMLElement.prototype as unknown as { scrollBy: unknown }).scrollBy = scrollBy;
    try {
      render(<PosterHoverPreview
        item={{ id: 'wheel', type: 'movie', name: 'Wheel Movie', poster: null, background: null, logo: null, description: '', releaseInfo: '2026', rating: null, genres: [] }}
        rect={{ left: 100, top: 80 } as DOMRect}
        saved={false}
        watched={false}
        onOpen={() => {}}
        onToggleWatched={() => {}}
        onToggleSaved={() => {}}
        onMouseEnter={() => {}}
        onMouseLeave={() => {}}
      />);
      const card = document.querySelector('.poster-preview')!;
      fireEvent.wheel(card, { deltaY: 100, deltaX: 0 });
      expect(scrollBy).toHaveBeenCalledWith({ left: 0, top: 100 });
      fireEvent.wheel(card, { deltaY: 3, deltaX: 0, deltaMode: 1 });
      expect(scrollBy).toHaveBeenCalledWith({ left: 0, top: 48 });
    } finally {
      (window.HTMLElement.prototype as unknown as { scrollBy: unknown }).scrollBy = original;
    }
  });
});
