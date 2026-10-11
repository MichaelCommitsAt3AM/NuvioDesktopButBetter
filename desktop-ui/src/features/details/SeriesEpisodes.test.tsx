import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('episode card actions', () => {
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
});
