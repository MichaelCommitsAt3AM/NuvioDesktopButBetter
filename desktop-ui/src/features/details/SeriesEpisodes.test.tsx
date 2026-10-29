import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SeriesEpisodes, type Props as SeriesEpisodesProps } from './SeriesEpisodes';

const episode = {
  id: 'episode-1', title: 'Pilot', released: '2020-08-14', available: true,
  thumbnail: null, season: 1, episode: 1, overview: 'The first episode', runtime: 45, rating: 8.1,
};

function renderEpisodes(overrides: Partial<SeriesEpisodesProps> = {}) {
  const props: SeriesEpisodesProps = {
    videos: [episode], poster: null, background: null, seasonPosters: {}, cardStyle: 'horizontal',
    blurUnwatched: false, showRatings: true, ratingsVisibility: 'show_all', isWatched: () => false,
    onEpisodeClick: vi.fn(), onEpisodeLongPress: vi.fn(), onToggleSeason: vi.fn(), mutationBusy: false,
    ...overrides,
  };
  render(<SeriesEpisodes {...props} />);
  return props;
}

beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('resume season selection', () => {
  it('only scrolls overflowing seasons and never scrolls the page to a season button', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    const scrollIntoView = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    scrollIntoView.mockClear();
    renderEpisodes({ videos: [1, 2].map(season => ({ ...episode, id: `ep-${season}`, season })) });
    const first = screen.getByRole('button', { name: 'Season 1' });
    const second = screen.getByRole('button', { name: 'Season 2' });
    const track = first.parentElement!;
    const scrollTo = vi.fn();
    track.scrollTo = scrollTo;
    Object.defineProperties(track, { clientWidth: { value: 600, configurable: true }, scrollWidth: { value: 400, configurable: true } });
    fireEvent.click(second);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    Object.defineProperties(track, { clientWidth: { value: 200 }, scrollWidth: { value: 400 } });
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 200 } as DOMRect);
    vi.spyOn(first, 'getBoundingClientRect').mockReturnValue({ left: -150, right: -50, width: 100 } as DOMRect);
    fireEvent.click(first);
    expect(scrollTo).toHaveBeenCalledWith({ left: -200, behavior: 'smooth' });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
  it('pages horizontal episodes with the shared Home arrows and disables them at the edges', () => {
    const props = renderEpisodes();
    const right = screen.getByRole('button', { name: 'Scroll Season 1 episodes right' });
    const left = screen.getByRole('button', { name: 'Scroll Season 1 episodes left' });
    const track = right.parentElement!.querySelector<HTMLElement>('.series-episode-cards')!;
    Object.defineProperties(track, { clientWidth: { value: 1000 }, scrollWidth: { value: 3000 }, scrollLeft: { value: 0, writable: true } });
    const scrollBy = vi.fn();
    track.scrollBy = scrollBy;
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    fireEvent.scroll(track);
    expect(left).toBeDisabled();
    expect(right).toBeEnabled();
    fireEvent.click(right);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 850, behavior: 'smooth' });
    expect(props.onEpisodeClick).not.toHaveBeenCalled();
    track.scrollLeft = 2000;
    fireEvent.scroll(track);
    expect(right).toBeDisabled();
    expect(left).toBeEnabled();
    fireEvent.click(left);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -850, behavior: 'smooth' });
  });

  it('keeps list episodes free of horizontal scroll controls', () => {
    renderEpisodes({ cardStyle: 'list' });
    expect(screen.queryByRole('button', { name: /Scroll .* episodes/ })).toBeNull();
  });
  const videos = [1, 2, 3].map(season => ({ ...episode, id: `episode-${season}`, title: `Season ${season} episode`, season }));

  it('opens the resume season instead of season one', () => {
    renderEpisodes({ videos, preferredSeason: 3 });
    expect(screen.getByRole('button', { name: 'Season 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Season 3 episode')).toBeInTheDocument();
    expect(screen.queryByText('Season 1 episode')).not.toBeInTheDocument();
  });

  it('uses late progress but preserves a manual season choice on later updates', () => {
    const props = { videos, poster: null, background: null, seasonPosters: {}, cardStyle: 'horizontal', blurUnwatched: false, showRatings: true, ratingsVisibility: 'show_all', isWatched: () => false, onEpisodeClick: vi.fn(), onEpisodeLongPress: vi.fn(), onToggleSeason: vi.fn(), mutationBusy: false } satisfies SeriesEpisodesProps;
    const view = render(<SeriesEpisodes {...props} />);
    view.rerender(<SeriesEpisodes {...props} preferredSeason={3} />);
    expect(screen.getByRole('button', { name: 'Season 3' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Season 2' }));
    view.rerender(<SeriesEpisodes {...props} preferredSeason={1} />);
    expect(screen.getByRole('button', { name: 'Season 2' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('falls back safely when the resume season is missing', () => {
    renderEpisodes({ videos, preferredSeason: 8 });
    expect(screen.getByRole('button', { name: 'Season 1' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('can resume a Specials episode', () => {
    renderEpisodes({ videos: [...videos, { ...episode, id: 'special', title: 'Special episode', season: 0 }], preferredSeason: 0 });
    expect(screen.getByRole('button', { name: 'Specials' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Special episode')).toBeInTheDocument();
  });
});

describe('episode card actions', () => {
  it('shows the saved fraction for unfinished episodes in either card layout', () => {
    const props = renderEpisodes({ progressByVideoId: { 'episode-1': .625 }, cardStyle: 'list' });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '63');
    expect(screen.getByRole('progressbar').firstElementChild).toHaveStyle({ width: '62.5%' });
    cleanup(); renderEpisodes({ ...props, cardStyle: 'horizontal' });
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
  it('omits progress for watched, completed, unstarted and invalid entries', () => {
    for (const [progress, watched] of [[.5, true], [1, false], [0, false], [NaN, false]] as const) {
      renderEpisodes({ progressByVideoId: { 'episode-1': progress }, isWatched: () => watched });
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument(); cleanup();
    }
  });
  it('opens the action menu callback on right-click without playing the episode', () => {
    const props = renderEpisodes();
    const card = document.querySelector('.series-episode-card')!;

    fireEvent.contextMenu(card);

    expect(props.onEpisodeLongPress).toHaveBeenCalledWith(episode);
    expect(props.onEpisodeClick).not.toHaveBeenCalled();
  });

  it('opens the action menu on a long press and suppresses the follow-up click', () => {
    vi.useFakeTimers();
    const props = renderEpisodes();
    const card = document.querySelector('.series-episode-card')!;

    fireEvent.pointerDown(card, { button: 0 });
    vi.advanceTimersByTime(520);
    fireEvent.pointerUp(card, { button: 0 });
    fireEvent.click(card);

    expect(props.onEpisodeLongPress).toHaveBeenCalledWith(episode);
    expect(props.onEpisodeClick).not.toHaveBeenCalled();
  });

  it('keeps a normal click as the play/streams action', () => {
    const props = renderEpisodes();
    fireEvent.click(document.querySelector('.series-episode-card')!);

    expect(props.onEpisodeClick).toHaveBeenCalledWith(episode);
    expect(props.onEpisodeLongPress).not.toHaveBeenCalled();
  });

  it('falls back to series artwork and then hides when the episode thumbnail fails', () => {
    renderEpisodes({
      videos: [{ ...episode, thumbnail: 'https://example.invalid/ep.jpg' }],
      background: 'https://example.invalid/bg.jpg',
    });
    const art = document.querySelector('.series-episode-art img')!;
    expect(art).toHaveAttribute('src', 'https://example.invalid/ep.jpg');
    fireEvent.error(art);
    expect(document.querySelector('.series-episode-art img')).toHaveAttribute('src', 'https://example.invalid/bg.jpg');
    fireEvent.error(document.querySelector('.series-episode-art img')!);
    expect(document.querySelector('.series-episode-art img')).toBeNull();
  });
});
