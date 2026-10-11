import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PosterHoverPreview } from './PosterHoverPreview';

describe('PosterHoverPreview', () => {
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
});
