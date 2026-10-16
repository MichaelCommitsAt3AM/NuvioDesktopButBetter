import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { FallbackImage } from '../../components/FallbackImage';
import { HorizontalRail } from '../../components/HorizontalRail';
import { useFeatureSnapshot } from '../../bridge';
import type { AppearanceSnapshot } from '../settings/appearanceStore';
import { depthActive, depthVars } from '../../theme/cardDepth';
import '../../theme/cardDepth.css';
import type { Video } from './DetailsExtras';
import './series-episodes.css';

type SeasonView = 'posters' | 'text';
export type Props = {
  progressByVideoId?: Record<string, number>;
  preferredSeason?: number | null;
  videos: Video[];
  poster: string | null;
  background: string | null;
  seasonPosters: Record<string, string>;
  cardStyle: 'horizontal' | 'list';
  blurUnwatched: boolean;
  showRatings: boolean;
  ratingsVisibility: 'show_all' | 'hide_episodes' | 'hide_unwatched_episodes';
  isWatched: (video: Video) => boolean;
  onEpisodeClick: (video: Video) => void;
  onEpisodeLongPress: (video: Video) => void;
  onToggleSeason: (season: number) => void;
  mutationBusy: boolean;
};

const seasonViewKey = 'nuvio.details.seasonViewMode';

export function SeriesEpisodes({ videos, preferredSeason, poster, background, seasonPosters, cardStyle, blurUnwatched, showRatings, ratingsVisibility, isWatched, onEpisodeClick, onEpisodeLongPress, onToggleSeason, mutationBusy, progressByVideoId }: Props) {
  const grouped = useMemo(() => {
    const groups = new Map<number, Video[]>();
    for (const video of videos.filter((item) => item.season != null || item.episode != null)) {
      const season = video.season != null && video.season > 0 ? video.season : 0;
      const group = groups.get(season) ?? [];
      group.push(video);
      groups.set(season, group);
    }
    return [...groups.entries()]
      .map(([season, episodes]) => [season, episodes.sort((a, b) => (a.episode ?? Number.MAX_SAFE_INTEGER) - (b.episode ?? Number.MAX_SAFE_INTEGER) || (a.released ?? '').localeCompare(b.released ?? '') || a.title.localeCompare(b.title))] as const)
      .sort(([a], [b]) => (a === 0 ? Number.MAX_SAFE_INTEGER : a) - (b === 0 ? Number.MAX_SAFE_INTEGER : b));
  }, [videos]);
  const seasons = grouped.map(([season]) => season);
  // Follow Kotlin's resolved playback episode until the user chooses a season.
  // Progress can arrive after episode metadata without overriding manual browsing.
  const defaultSeason = preferredSeason != null && seasons.includes(preferredSeason)
    ? preferredSeason : seasons.find((season) => season > 0) ?? seasons[0] ?? 0;
  const [chosenSeason, setChosenSeason] = useState<number | null>(null);
  const currentSeason = chosenSeason != null && seasons.includes(chosenSeason) ? chosenSeason : defaultSeason;
  const [seasonView, setSeasonView] = useState<SeasonView>(() => {
    try { return localStorage.getItem(seasonViewKey) === 'text' ? 'text' : 'posters'; } catch { return 'posters'; }
  });
  const [outgoingSeason, setOutgoingSeason] = useState<number | null>(null);
  const [direction, setDirection] = useState(1);
  const transitionTimer = useRef<number | null>(null);
  const seasonButtons = useRef(new Map<number, HTMLButtonElement>());
  const hasSeasonPosters = seasons.some((season) => Boolean(resolveSeasonPoster(season, grouped, seasonPosters)));
  const fallbackImage = background || poster;

  useEffect(() => {
    seasonButtons.current.get(currentSeason)?.scrollIntoView({ behavior: chosenSeason == null ? 'instant' : 'smooth', block: 'nearest', inline: 'center' });
  }, [currentSeason, chosenSeason, seasonView]);
  useEffect(() => () => { if (transitionTimer.current != null) window.clearTimeout(transitionTimer.current); }, []);

  const selectSeason = (season: number) => {
    if (season === currentSeason) return;
    const oldIndex = seasons.indexOf(currentSeason);
    const newIndex = seasons.indexOf(season);
    setDirection(newIndex >= oldIndex ? 1 : -1);
    setOutgoingSeason(currentSeason);
    setChosenSeason(season);
    if (transitionTimer.current != null) window.clearTimeout(transitionTimer.current);
    transitionTimer.current = window.setTimeout(() => setOutgoingSeason(null), 220);
  };

  const setView = (view: SeasonView) => {
    setSeasonView(view);
    try { localStorage.setItem(seasonViewKey, view); } catch { /* Season presentation remains usable without storage. */ }
  };
  const currentEpisodes = grouped.find(([season]) => season === currentSeason)?.[1] ?? [];
  const oldEpisodes = outgoingSeason == null ? [] : (grouped.find(([season]) => season === outgoingSeason)?.[1] ?? []);

  return <section className="series-episodes" id="episodes">
    <div className="series-episodes-heading"><h2>Episodes</h2><span>{videos.length}</span></div>
    {seasons.length > 1 && <div className="series-season-selector">
      <div className="series-season-selector-heading"><h3>Seasons</h3>{hasSeasonPosters && <button type="button" className="series-season-view-toggle" onClick={() => setView(seasonView === 'posters' ? 'text' : 'posters')}>{seasonView === 'posters' ? 'Posters' : 'Text'}</button>}</div>
      <div className={`series-season-options ${hasSeasonPosters && seasonView === 'posters' ? 'poster-mode' : 'text-mode'}`}>
        {seasons.map((season) => {
          const selected = season === currentSeason;
          const image = resolveSeasonPoster(season, grouped, seasonPosters) || poster || background;
          return <button
            ref={(node) => { if (node) seasonButtons.current.set(season, node); else seasonButtons.current.delete(season); }}
            type="button" key={season} className={`series-season-option ${selected ? 'selected' : ''}`}
            aria-pressed={selected} onClick={() => selectSeason(season)}
          >
            {hasSeasonPosters && seasonView === 'posters' && <span className="series-season-poster"><FallbackImage sources={[image]} /></span>}
            <span>{seasonLabel(season)}</span>
          </button>;
        })}
      </div>
    </div>}
    <div className={`series-episode-content ${cardStyle === 'list' ? 'list-style' : 'horizontal-style'}`}>
      {outgoingSeason != null && <div className="series-episode-season outgoing" aria-hidden="true" style={{ '--season-direction': `${direction * -1 * 20}px` } as CSSProperties}><EpisodeCollection progressByVideoId={progressByVideoId} episodes={oldEpisodes} season={outgoingSeason} cardStyle={cardStyle} fallbackImage={fallbackImage} blurUnwatched={blurUnwatched} showRatings={showRatings} ratingsVisibility={ratingsVisibility} isWatched={isWatched} onEpisodeClick={onEpisodeClick} onEpisodeLongPress={onEpisodeLongPress} onToggleSeason={onToggleSeason} mutationBusy={mutationBusy} /></div>}
      <div className="series-episode-season incoming" key={currentSeason} style={{ '--season-direction': `${direction * 20}px` } as CSSProperties}>
        <EpisodeCollection progressByVideoId={progressByVideoId} episodes={currentEpisodes} season={currentSeason} cardStyle={cardStyle} fallbackImage={fallbackImage} blurUnwatched={blurUnwatched} showRatings={showRatings} ratingsVisibility={ratingsVisibility} isWatched={isWatched} onEpisodeClick={onEpisodeClick} onEpisodeLongPress={onEpisodeLongPress} onToggleSeason={onToggleSeason} mutationBusy={mutationBusy} />
      </div>
    </div>
  </section>;
}

function EpisodeCollection({ episodes, season, cardStyle, fallbackImage, blurUnwatched, showRatings, ratingsVisibility, isWatched, onEpisodeClick, onEpisodeLongPress, onToggleSeason, mutationBusy, progressByVideoId }: {
  progressByVideoId?: Record<string, number>;
  episodes: Video[]; season: number; cardStyle: Props['cardStyle']; fallbackImage: string | null; blurUnwatched: boolean; showRatings: boolean; ratingsVisibility: Props['ratingsVisibility']; isWatched: Props['isWatched']; onEpisodeClick: Props['onEpisodeClick']; onEpisodeLongPress: Props['onEpisodeLongPress']; onToggleSeason: Props['onToggleSeason']; mutationBusy: boolean;
}) {
  const episodeLongPressTimer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);
  const appearance = useFeatureSnapshot<AppearanceSnapshot>('appearance');
  const depthOn = depthActive(appearance?.cardDepth, 'episodeCards');
  const depthStyle = depthOn ? depthVars(appearance?.cardDepth) : undefined;
  useEffect(() => () => { if (episodeLongPressTimer.current != null) window.clearTimeout(episodeLongPressTimer.current); }, []);
  return <>
    {cardStyle === 'horizontal' && <h3 className="series-episode-season-heading">{seasonLabel(season)}</h3>}
    {season > 0 && <button type="button" className="series-season-watch" disabled={mutationBusy} onClick={() => onToggleSeason(season)}>Mark season {episodes.length > 0 && episodes.every(isWatched) ? 'unwatched' : 'watched'}</button>}
    <EpisodeTrack horizontal={cardStyle === 'horizontal'} label={`${seasonLabel(season)} episodes`}>
      {episodes.map((video) => {
        const watched = isWatched(video);
        const progress = progressByVideoId?.[video.id] ?? 0;
        const showRating = showRatings && (ratingsVisibility === 'show_all' || (ratingsVisibility === 'hide_unwatched_episodes' && watched));
        const click = () => video.available && onEpisodeClick(video);
        return <button type="button" key={video.id} className={`series-episode-card ${video.available ? '' : 'unavailable'} ${depthOn?'has-card-depth':''}`} style={depthStyle} aria-disabled={!video.available} onPointerDown={(event) => {
          if (event.button != null && event.button !== 0) return;
          if (episodeLongPressTimer.current != null) window.clearTimeout(episodeLongPressTimer.current);
          longPressTriggered.current = false;
          episodeLongPressTimer.current = window.setTimeout(() => {
            longPressTriggered.current = true;
            onEpisodeLongPress(video);
          }, 520);
        }} onPointerUp={() => { if (episodeLongPressTimer.current != null) window.clearTimeout(episodeLongPressTimer.current); episodeLongPressTimer.current = null; }} onPointerLeave={() => { if (episodeLongPressTimer.current != null) window.clearTimeout(episodeLongPressTimer.current); episodeLongPressTimer.current = null; }} onPointerCancel={() => { if (episodeLongPressTimer.current != null) window.clearTimeout(episodeLongPressTimer.current); episodeLongPressTimer.current = null; longPressTriggered.current = false; }} onClick={(event) => {
          if (longPressTriggered.current) { event.preventDefault(); event.stopPropagation(); longPressTriggered.current = false; return; }
          click();
        }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (episodeLongPressTimer.current != null) window.clearTimeout(episodeLongPressTimer.current); episodeLongPressTimer.current = null; longPressTriggered.current = true; onEpisodeLongPress(video); }} title={video.available ? 'Click to find streams · Right-click or hold for episode actions' : 'Right-click or hold for episode actions'}>
          <span className={`series-episode-art ${depthOn?'depth-frame':''}`}><FallbackImage sources={[video.thumbnail, fallbackImage]} style={{ filter: blurUnwatched && !watched ? 'blur(18px)' : undefined }} /><span className="series-episode-code">{episodeCode(video)}</span>{watched && <span className="series-episode-watched"><Check size={14} /></span>}{!watched && Number.isFinite(progress) && progress > 0 && progress < 1 && <span className="series-episode-progress" role="progressbar" aria-label={`${video.title} playback progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><span style={{ width: `${progress * 100}%` }} /></span>}</span>
          <span className="series-episode-copy"><strong>{video.title}</strong><small>{formatReleaseDate(video.released)}{showRating && video.rating != null && video.rating > 0 && <span className="series-episode-rating"><span aria-hidden="true"> · </span><ImdbLogo /><span><span className="sr-only">IMDb </span>{video.rating.toFixed(1)}</span></span>}{video.runtime && cardStyle === 'horizontal' ? ` · ${video.runtime} min` : ''}</small>{video.overview && <span className="series-episode-overview">{video.overview}</span>}</span>
        </button>;
      })}
    </EpisodeTrack>
  </>;
}

function EpisodeTrack({ horizontal, label, children }: { horizontal: boolean; label: string; children: ReactNode }) {
  return horizontal
    ? <HorizontalRail label={label} className="series-episode-cards">{children}</HorizontalRail>
    : <div className="series-episode-cards">{children}</div>;
}

/** IMDb badge matching the reference logo (desktop uses the logo label rather than a star). */
function ImdbLogo() {
  return <svg className="imdb-logo" viewBox="0 0 512 512" aria-hidden="true" focusable="false"><rect width="512" height="512" rx="15%" fill="#f5c518" /><path d="M104 328V184H64v144zM189 184l-9 67-5-36-5-31h-50v144h34v-95l14 95h25l13-97v97h34V184zM256 328V184h62c15 0 26 11 26 25v94c0 14-11 25-26 25zm47-118l-9-1v94c5 0 9-1 10-3 2-2 2-8 2-18v-56-12l-3-4zM419 220h3c14 0 26 11 26 25v58c0 14-12 25-26 25h-3c-8 0-16-4-21-11l-2 9h-36V184h38v46c5-6 13-10 21-10zm-8 70v-34l-1-11c-1-2-4-3-6-3s-5 1-6 3v57c1 2 4 3 6 3s6-1 6-3l1-12z" /></svg>;
}

function resolveSeasonPoster(season: number, grouped: ReadonlyArray<readonly [number, Video[]]>, seasonPosters: Record<string, string>) {
  return grouped.find(([number]) => number === season)?.[1].find((video) => video.seasonPoster?.trim())?.seasonPoster || seasonPosters[String(season)] || null;
}

function seasonLabel(season: number) { return season <= 0 ? 'Specials' : `Season ${season}`; }
function episodeCode(video: Video) {
  if (video.episode == null && video.season == null) return 'Episode';
  const season = video.season ?? 0;
  const episode = video.episode;
  return episode == null ? `Season ${season}` : `S${String(season).padStart(2, '0')} E${String(episode).padStart(2, '0')}`;
}
function formatReleaseDate(raw: string | null) {
  if (!raw) return '';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}
