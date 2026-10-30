import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DetailsRatings } from './DetailsRatings';
afterEach(cleanup);

it('renders one labeled IMDb score without a duplicate percentage', () => {
  render(<DetailsRatings rating="7.8" externalRatings={[{ source: 'imdb', value: 7.8 }]} />);
  expect(screen.getAllByText('7.8')).toHaveLength(1);
  expect(screen.getAllByAltText('IMDb')).toHaveLength(1);
  expect(screen.queryByText('7.8%')).not.toBeInTheDocument();
});

it('uses the Kotlin provider scales and labels instead of applying percent to everything', () => {
  render(<DetailsRatings externalRatings={[{ source: 'tmdb', value: 78 }, { source: 'tomatoes', value: 94, certified: true }, { source: 'letterboxd', value: 3.8 }, { source: 'metacritic', value: 81 }, { source: 'mal', value: 8.2 }]} />);
  expect(screen.getByText('94%')).toBeInTheDocument();
  for (const value of ['78', '3.8', '81', '8.2']) expect(screen.getByText(value)).toBeInTheDocument();
  for (const source of ['TMDB', 'Rotten Tomatoes', 'Letterboxd', 'Metacritic', 'MyAnimeList']) expect(screen.getByAltText(source)).toBeInTheDocument();
});
