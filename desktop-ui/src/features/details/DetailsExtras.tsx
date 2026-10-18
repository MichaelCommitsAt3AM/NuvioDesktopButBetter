import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Building2, CheckCircle, ChevronLeft, ChevronRight, CircleCheck, LoaderCircle, ListChecks, Play, RotateCw } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';
import type { Media } from '../../generated/contract';
import { InlineError } from '../../components/Status';
import { Dialog } from '../../components/Dialog';
import { BottomSheetPresence } from '../../components/BottomSheetPresence';
import { Poster } from '../../components/Poster';
import { SeriesEpisodes } from './SeriesEpisodes';
import { mediaKey, stableKeys } from '../../components/keys';
import type { AppearanceSnapshot } from '../settings/appearanceStore';
import { depthActive, depthVars } from '../../theme/cardDepth';
import '../../theme/cardDepth.css';
import './details-extras.css';

type Person = { name: string; role: string | null; photo: string | null; tmdbId: number | null };
type Company = { name: string; logo: string | null; tmdbId: number | null };
type Trailer = { id: string; key: string; name: string; displayName: string | null; site: string; type: string; official: boolean; seasonNumber: number | null; youtubeUrl: string };
export type Video = { id: string; title: string; released: string | null; available: boolean; thumbnail: string | null; season: number | null; seasonPoster?: string | null; episode: number | null; overview: string | null; runtime: number | null; rating: number | null };
export type ExtrasMeta = {
  primaryAction?: DetailsPrimaryAction;
  id: string; type: string; name: string; poster: string | null; background: string | null; logo: string | null; description: string | null; releaseInfo: string | null; lastAirDate: string | null; status: string | null;
  imdbId: string | null; rating: string | null; ageRating: string | null; runtime: string | null; country: string | null; awards: string | null; language: string | null; website: string | null;
  externalRatings: Array<{ source: string; value: number; certified: boolean }>;
  genres: string[]; director: string[]; writer: string[]; cast: Person[]; productionCompanies: Company[]; networks: Company[];
  moreLikeThis: Media[]; moreLikeThisSource: string | null; collectionName: string | null; collectionItems: Media[]; trailers: Trailer[]; links: Array<{ name: string; category: string; url: string }>;
  seasonPosters: Record<string, string>; videos: Video[];
};
export type DetailsPrimaryAction = { label: string; videoId: string; seasonNumber: number | null; episodeNumber: number | null; episodeTitle: string | null; episodeThumbnail: string | null; resumePositionMs: number | null };
type WatchedSnapshot = { loaded: boolean; episodeProgress?: Record<string, number>; watchedKeys: string[]; watched?: boolean; fullyWatched?: boolean; episodes?: Array<{ season: number | null; episode: number | null; videoId: string | null; key: string }> };
type DetailComment = { id: number; authorDisplayName: string; authorUsername: string | null; comment: string; spoiler: boolean; containsInlineSpoilers: boolean; review: boolean; likes: number; rating: number | null; createdAt: string | null; updatedAt: string | null };
type CommentsPage = { enabled: boolean; items: DetailComment[]; currentPage: number; pageCount: number; itemCount: number };
type MetadataSettings = {
  items: Array<{ key: string; title: string; enabled: boolean; order: number; tabGroup: number | null }>;
  tabLayout: boolean; episodeCardStyle: 'horizontal' | 'list'; blurUnwatchedEpisodes: boolean;
  showOverallRatings: boolean; episodeRatingsVisibility: 'show_all' | 'hide_episodes' | 'hide_unwatched_episodes';
};

const sectionStyle = { marginTop: 28 } as const;
const headingStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 } as const;

export function DetailsExtras({ type, id, primaryAction, onMetaLoaded }: { type: string; id: string; primaryAction?: DetailsPrimaryAction | null; onMetaLoaded?: (meta: ExtrasMeta) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const settings = useFeatureSnapshot<MetadataSettings>('metadataSettings');
  const appearance = useFeatureSnapshot<AppearanceSnapshot>('appearance');
  const castDepthOn = depthActive(appearance?.cardDepth, 'cast');
  const trailersDepthOn = depthActive(appearance?.cardDepth, 'trailers');
  const depthStyle = appearance?.cardDepth ? depthVars(appearance.cardDepth) : undefined;
  const progressUpdates = useFeatureSnapshot('homeExtras');
  const loadGeneration = useRef(0);
  const [meta, setMeta] = useState<ExtrasMeta | null>(null);
  const [watched, setWatched] = useState<WatchedSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trailerError, setTrailerError] = useState<string | null>(null);
  const [comments, setComments] = useState<DetailComment[]>([]);
  const [commentsPage, setCommentsPage] = useState(0);
  const [commentsPageCount, setCommentsPageCount] = useState(0);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<number>>(new Set());
  const [selectedComment, setSelectedComment] = useState<number | null>(null);
  const [selectedTrailerCategory, setSelectedTrailerCategory] = useState('Trailer');
  const [selectedEpisode, setSelectedEpisode] = useState<Video | null>(null);
  const afterSheetExit = useRef<(() => void) | null>(null);

  const commentsSettingEnabled = !!settings?.items.some((item) => item.key === 'COMMENTS' && item.enabled);
  useEffect(() => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError(null);
    setMeta(null);
    setWatched(null);
    void call<ExtrasMeta>('details.extras', { type, id }).then((result) => {
      if (loadGeneration.current !== generation) return;
      if (!result) {
        setLoading(false);
        setError('No additional title details were returned.');
        return;
      }
      setMeta(result);
      onMetaLoaded?.(result);
      setSelectedTrailerCategory(result.trailers[0]?.type || 'Trailer');
      setLoading(false);
    }).catch((cause) => {
      if (loadGeneration.current !== generation) return;
      setLoading(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { loadGeneration.current += 1; };
  }, [type, id]);
  useEffect(() => {
    if (!meta || meta.id !== id || meta.type !== type) return;
    let active = true;
    void call<WatchedSnapshot>('details.watched.snapshot', { type, id }).then(snapshot => {
      if (active) setWatched(snapshot);
    }).catch(() => {});
    return () => { active = false; };
  }, [type, id, meta, progressUpdates]);
  useEffect(() => { if (!settings) void refreshFeature<MetadataSettings>('metadataSettings', 'metadataSettings.snapshot').catch(() => {}); }, [settings]);
  useEffect(() => {
    const generation = loadGeneration.current;
    setComments([]); setCommentsPage(0); setCommentsPageCount(0); setCommentsError(null);
    if (!meta || !commentsSettingEnabled) return;
    setCommentsLoading(true);
    void call<CommentsPage>('details.comments.page', { type: meta.type, id: meta.id, page: 1 }).then((page) => {
      if (loadGeneration.current !== generation) return;
      setComments(page.enabled ? page.items : []); setCommentsPage(page.currentPage); setCommentsPageCount(page.pageCount);
    }).catch((cause) => {
      if (loadGeneration.current === generation) setCommentsError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (loadGeneration.current === generation) setCommentsLoading(false); });
  }, [meta, commentsSettingEnabled]);

  const groupedVideos = useMemo(() => {
    const groups = new Map<number, Video[]>();
    meta?.videos.forEach((video) => {
      const season = video.season ?? 0;
      const existing = groups.get(season) ?? [];
      existing.push(video);
      groups.set(season, existing);
    });
    return [...groups.entries()].map(([season, videos]) => [season, [...videos].sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0))] as [number, Video[]]).sort(([a], [b]) => a - b);
  }, [meta?.videos]);

  const openMedia = (item: Media) => navigate(`/details/${encodeURIComponent(item.type)}/${encodeURIComponent(item.id)}`);
  const openPerson = (personId: number, personName: string, role: string | null, source: HTMLElement | null) => {
    const bounds = source?.getBoundingClientRect();
    navigate(`/person/${personId}`, { state: { name: personName, role, sourceRect: bounds ? { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height } : null, origin: location.pathname + location.search } });
  };
  const openEntity = (kind: string, company: Company, sourceType: string) => {
    if (company.tmdbId == null) return;
    const params = new URLSearchParams();
    if (company.name) params.set('name', company.name);
    params.set('sourceType', sourceType);
    navigate(`/entity/${kind}/${company.tmdbId}?${params}`, { state: { name: company.name, sourceType, origin: location.pathname + location.search } });
  };
  const toggleEpisode = async (video: Video) => {
    if (!meta) return;
    setSelectedEpisode(null);
    setMutationBusy(true);
    try {
      const result = await call<WatchedSnapshot>('details.watched.toggleEpisode', { type: meta.type, id: meta.id, videoId: video.id, season: video.season, episode: video.episode });
      setWatched(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setMutationBusy(false); }
  };
  const toggleSeason = async (season: number) => {
    if (!meta) return;
    setMutationBusy(true);
    try {
      const result = await call<WatchedSnapshot>('details.watched.toggleSeason', { type: meta.type, id: meta.id, season });
      setWatched(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setMutationBusy(false); }
  };
  const togglePreviousEpisodes = async (video: Video) => {
    if (!meta) return;
    setSelectedEpisode(null);
    setMutationBusy(true);
    try {
      const result = await call<WatchedSnapshot>('details.watched.togglePreviousEpisodes', { type: meta.type, id: meta.id, videoId: video.id, season: video.season, episode: video.episode });
      setWatched(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setMutationBusy(false); }
  };
  const openTrailer = async (url: string) => {
    setTrailerError(null);
    try { await call('app.openExternal', { url }); }
    catch (cause) { setTrailerError(cause instanceof Error ? cause.message : 'Could not open trailer'); }
  };
  const loadMoreComments = async (forceRefresh = false) => {
    if (!meta || commentsLoading) return;
    const generation = loadGeneration.current;
    setCommentsLoading(true); setCommentsError(null);
    try {
      const result = await call<CommentsPage>('details.comments.page', { type: meta.type, id: meta.id, page: forceRefresh ? 1 : commentsPage + 1, forceRefresh });
      if (loadGeneration.current !== generation) return;
      setComments((previous) => forceRefresh ? result.items : [...previous, ...result.items.filter((item) => !previous.some((old) => old.id === item.id))]);
      setCommentsPage(result.currentPage); setCommentsPageCount(result.pageCount);
    } catch (cause) { if (loadGeneration.current === generation) setCommentsError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (loadGeneration.current === generation) setCommentsLoading(false); }
  };

  if (loading && !meta) return <section style={sectionStyle}><div className="loading-block"><LoaderCircle className="spin" size={20} /><span>Loading cast, episodes, and related details…</span></div></section>;
  if (error && !meta) return <section style={sectionStyle}><InlineError message={error} onRetry={() => { setError(null); setLoading(true); void call<ExtrasMeta>('details.extras', { type, id }).then(setMeta).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => setLoading(false)); }} /></section>;
  if (!meta) return null;

  const watchedVideo = (video: Video) => watched?.episodes?.some((item) => item.season === video.season && item.episode === video.episode) ?? false;
  const renderMediaRail = (title: string, items: Media[], subtitle?: string) => items.length > 0 && <section style={sectionStyle} key={title}>
    <div style={headingStyle}><div><h2>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div></div>
    <div className="shelf-track">{stableKeys(items, (item) => mediaKey(item.type, item.id)).map((itemKey, index) => <Poster key={itemKey} item={items[index]} onClick={() => openMedia(items[index])} />)}</div>
  </section>;

  const sectionContents: Record<string, ReactNode> = {
    DETAILS: <section style={sectionStyle} className="details-extras-info">
      <div style={headingStyle}><h2>{/series|show|tv|anime/i.test(meta.type) ? 'Show Details' : 'Movie Details'}</h2></div>
      <div className="details-extras-info-rows">
        {meta.status && <InfoRow label="Status" value={meta.status} />}
        {meta.releaseInfo && <InfoRow label="Release Info" value={meta.releaseInfo} />}
        {meta.runtime && <InfoRow label="Runtime" value={formatRuntime(meta.runtime)} />}
        {meta.ageRating && <InfoRow label="Certification" value={meta.ageRating} />}
        {meta.country && <InfoRow label="Origin Country" value={meta.country} />}
        {meta.language && <InfoRow label="Original Language" value={meta.language.toUpperCase()} />}
      </div>
    </section>,
    PRODUCTION: (meta.productionCompanies.length > 0 || meta.networks.length > 0) ? <section style={sectionStyle}>
      <div style={headingStyle}><h2>Production</h2></div>
      {[['Companies', meta.productionCompanies, 'company'], ['Networks', meta.networks, 'network']].map(([heading, companies, kind]) => Array.isArray(companies) && companies.length > 0 && <div key={heading as string} className="details-extras-company-group"><h3>{heading as string}</h3><div className="details-extras-companies">{(companies as Company[]).map((company, index) => <button className="details-extras-company" key={`${company.name}:${company.tmdbId ?? index}`} type="button" disabled={company.tmdbId == null} onClick={() => void openEntity(kind as string, company, meta.type)}>{company.logo ? <img src={company.logo} alt="" loading="lazy" /> : <Building2 size={18} />}<span>{company.name}</span></button>)}</div></div>)}
    </section> : null,
    CAST: meta.cast.length > 0 ? <section style={sectionStyle}><div style={headingStyle}><h2>Cast</h2></div><div className="details-extras-people">{meta.cast.map((member, index) => <button className="details-extras-person" key={`${member.name}:${member.tmdbId ?? index}`} type="button" disabled={member.tmdbId == null} onClick={(event) => { if (member.tmdbId != null) openPerson(member.tmdbId, member.name, member.role, event.currentTarget.querySelector('img') ?? event.currentTarget); }}><span className={`details-extras-person-art ${castDepthOn?'has-card-depth depth-frame':''}`} style={castDepthOn ? depthStyle : undefined}>{member.photo ? <img src={member.photo} alt="" loading="lazy" /> : <span className="details-extras-placeholder">{initials(member.name)}</span>}</span><span><strong>{member.name}</strong>{member.role && member.role.toLowerCase() !== 'cast' && <small>{member.role}</small>}</span></button>)}</div></section> : null,
    TRAILERS: meta.trailers.length > 0 ? <section style={sectionStyle} className="details-extras-trailer-section"><div style={headingStyle}><h2>Trailers</h2><select className="details-trailer-select" aria-label="Trailer category" value={selectedTrailerCategory} onChange={(event) => setSelectedTrailerCategory(event.target.value)}>{[...new Set(meta.trailers.map((trailer) => trailer.type || 'Trailer'))].map((category) => <option key={category}>{category}</option>)}</select></div><div className="details-extras-trailers">{meta.trailers.filter((trailer) => (trailer.type || 'Trailer') === selectedTrailerCategory).map((trailer) => <button className="details-extras-trailer" type="button" key={trailer.id} onClick={() => void openTrailer(trailer.youtubeUrl)}><span className={`details-extras-trailer-image ${trailersDepthOn?'has-card-depth depth-frame':''}`} style={trailersDepthOn ? depthStyle : undefined}><img src={`https://img.youtube.com/vi/${trailer.key}/hqdefault.jpg`} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} /><Play size={22} fill="currentColor" /></span><span><strong>{trailer.displayName ?? trailer.name}</strong></span></button>)}</div>{trailerError && <InlineError message={trailerError} />}</section> : null,
    EPISODES: groupedVideos.length > 0 ? <SeriesEpisodes
      key={`${meta.type}:${meta.id}`}
      preferredSeason={(primaryAction ?? meta.primaryAction)?.seasonNumber}
      videos={meta.videos}
      poster={meta.poster}
      background={meta.background}
      seasonPosters={meta.seasonPosters}
      cardStyle={settings?.episodeCardStyle ?? 'list'}
      blurUnwatched={settings?.blurUnwatchedEpisodes ?? false}
      showRatings={settings?.showOverallRatings !== false}
      ratingsVisibility={settings?.episodeRatingsVisibility ?? 'show_all'}
      isWatched={watchedVideo}
      progressByVideoId={watched?.episodeProgress}
      onEpisodeClick={(video) => navigate(`/details/${encodeURIComponent(meta.type)}/${encodeURIComponent(meta.id)}/streams/${encodeURIComponent(video.id)}`)}
      onEpisodeLongPress={setSelectedEpisode}
      onToggleSeason={(season) => void toggleSeason(season)}
      mutationBusy={mutationBusy}
    /> : null,
    COMMENTS: (comments.length > 0 || commentsLoading || commentsError) ? <section style={sectionStyle}><div style={headingStyle}><h2>Comments & reviews</h2><button className="text-button" disabled={commentsLoading} onClick={() => void loadMoreComments(true)}><RotateCw size={13} /> Refresh</button></div>
      {commentsError && <InlineError message={commentsError} onRetry={() => void loadMoreComments(true)} />}{commentsLoading && comments.length === 0 && <div className="loading-block"><LoaderCircle className="spin" size={18} /><span>Loading comments…</span></div>}
      <div className="details-extras-comments">{comments.map((comment, index) => { const isSpoiler = comment.spoiler || comment.containsInlineSpoilers; const revealed = revealedSpoilers.has(comment.id); return <article className={`details-extras-comment ${isSpoiler && !revealed ? 'spoiler-hidden' : ''}`} key={comment.id}>
        <header><strong>{comment.authorDisplayName}</strong><span>{comment.review ? 'Review' : 'Comment'}{comment.rating != null ? ` · ${comment.rating}/10` : ''}{comment.likes ? ` · ${comment.likes} likes` : ''}</span>{comment.createdAt && <time>{comment.createdAt.slice(0, 10)}</time>}<button className="text-button" type="button" onClick={() => setSelectedComment(index)}>Details</button></header>
        {isSpoiler && !revealed ? <button className="text-button" onClick={() => setRevealedSpoilers((previous) => new Set(previous).add(comment.id))}>Reveal spoiler</button> : <p>{comment.comment.replace(/\[\/?spoiler\]/gi, '')}</p>}
      </article>; })}</div>
      {selectedComment != null && comments[selectedComment] && <CommentDetailSheet comment={comments[selectedComment]} position={selectedComment} total={comments.length} revealed={revealedSpoilers.has(comments[selectedComment].id)} onReveal={() => setRevealedSpoilers((previous) => new Set(previous).add(comments[selectedComment].id))} onPrevious={() => setSelectedComment((current) => current != null && current > 0 ? current - 1 : current)} onNext={() => setSelectedComment((current) => current != null && current < comments.length - 1 ? current + 1 : current)} onClose={() => setSelectedComment(null)} />}
      {commentsPage < commentsPageCount && <button className="button secondary" disabled={commentsLoading} onClick={() => void loadMoreComments()}>{commentsLoading ? <LoaderCircle className="spin" size={14} /> : null}Load more</button>}
    </section> : null,
    COLLECTION: groupedVideos.length === 0 && meta.collectionItems.length > 0 ? renderMediaRail(meta.collectionName ?? 'Collection', meta.collectionItems) : null,
    MORE_LIKE_THIS: meta.moreLikeThis.length > 0 ? renderMediaRail('More like this', meta.moreLikeThis, meta.moreLikeThisSource ? `From ${meta.moreLikeThisSource}` : undefined) : null,
  };

  const configuredSections = (settings?.items ?? [
    { key: 'EPISODES', title: 'Episodes', enabled: true, order: 0, tabGroup: null },
    { key: 'PRODUCTION', title: 'Production', enabled: true, order: 1, tabGroup: null },
    { key: 'CAST', title: 'Cast', enabled: true, order: 2, tabGroup: null },
    { key: 'TRAILERS', title: 'Trailers & videos', enabled: true, order: 3, tabGroup: null },
    { key: 'COMMENTS', title: 'Comments', enabled: true, order: 4, tabGroup: null },
    { key: 'DETAILS', title: 'Details', enabled: true, order: 5, tabGroup: null },
    { key: 'COLLECTION', title: 'Collection', enabled: true, order: 6, tabGroup: null },
    { key: 'MORE_LIKE_THIS', title: 'More like this', enabled: true, order: 7, tabGroup: null },
  ]).filter((item) => item.enabled && sectionContents[item.key]).sort((a, b) => a.order - b.order);

  const isReleased = (date: string | null) => !date || date.slice(0, 10) <= new Date().toISOString().slice(0, 10);
  const selectedSeasonEpisodes = selectedEpisode ? meta.videos.filter((video) => video.season === selectedEpisode.season && video.available && isReleased(video.released)) : [];
  const releasedEpisodes = meta.videos.filter((video) => video.available && isReleased(video.released)).sort(compareEpisodes);
  const selectedEpisodeIndex = selectedEpisode ? releasedEpisodes.findIndex((video) => video.id === selectedEpisode.id) : -1;
  const previousEpisodes = selectedEpisodeIndex > 0 ? releasedEpisodes.slice(0, selectedEpisodeIndex) : [];
  const previousEpisodesWatched = previousEpisodes.length > 0 && previousEpisodes.every(watchedVideo);
  const selectedSeasonWatched = selectedSeasonEpisodes.length > 0 && selectedSeasonEpisodes.every(watchedVideo);

  return <div className="details-extras">


    {error && <InlineError message={error} />}
    <ConfiguredSections items={configuredSections} contents={sectionContents} tabLayout={settings?.tabLayout ?? false} episodeList={(settings?.episodeCardStyle ?? 'list') === 'list'} />

    <button className="text-button details-extras-retry" type="button" onClick={() => { setLoading(true); void call<ExtrasMeta>('details.extras', { type, id }).then((result) => { setMeta(result); onMetaLoaded?.(result); }).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => setLoading(false)); }}><RotateCw size={14} /> Refresh details</button>
    <BottomSheetPresence onExitComplete={() => { const action = afterSheetExit.current; afterSheetExit.current = null; action?.(); }}>
    {selectedEpisode && <Dialog label={`Actions for ${selectedEpisode.title}`} onClose={() => setSelectedEpisode(null)} className="episode-actions-dialog">
      <div className="episode-actions-sheet">
        <span className="episode-actions-handle" aria-hidden="true" />
        <header><strong>{selectedEpisode.title}</strong><span>{actionEpisodeCode(selectedEpisode)}{selectedEpisode.season != null ? ` • Season ${selectedEpisode.season}` : ' • Specials'}</span></header>
        <div className="episode-actions-divider" />
        <button type="button" className="episode-action-row" disabled={mutationBusy} onClick={() => void toggleEpisode(selectedEpisode)}><span className="episode-action-icon"><CheckCircle size={20} /></span><span>{watchedVideo(selectedEpisode) ? 'Mark as unwatched' : 'Mark as watched'}</span></button>
        {previousEpisodes.length > 0 && <button type="button" className="episode-action-row" disabled={mutationBusy} onClick={() => void togglePreviousEpisodes(selectedEpisode)}><span className="episode-action-icon"><ListChecks size={20} /></span><span>Mark previous episodes {previousEpisodesWatched ? 'unwatched' : 'watched'}</span></button>}
        {selectedSeasonEpisodes.length > 0 && <button type="button" className="episode-action-row" disabled={mutationBusy} onClick={() => { setSelectedEpisode(null); void toggleSeason(selectedEpisode.season ?? 0); }}><span className="episode-action-icon"><CircleCheck size={20} /></span><span>Mark Season {selectedEpisode.season ?? 0} as {selectedSeasonWatched ? 'unwatched' : 'watched'}</span></button>}
        <button type="button" className="episode-action-row" disabled={mutationBusy || !selectedEpisode.available} onClick={() => { const episode = selectedEpisode; afterSheetExit.current = () => navigate(`/details/${encodeURIComponent(meta.type)}/${encodeURIComponent(meta.id)}/streams/${encodeURIComponent(episode.id)}?manual=1`); setSelectedEpisode(null); }}><span className="episode-action-icon"><Play size={20} fill="currentColor" /></span><span>Play manually</span></button>
      </div>
    </Dialog>}
    </BottomSheetPresence>
  </div>;
}

export function CommentDetailSheet({ comment, position, total, revealed, onReveal, onPrevious, onNext, onClose }: {
  comment: DetailComment; position: number; total: number; revealed: boolean;
  onReveal: () => void; onPrevious: () => void; onNext: () => void; onClose: () => void;
}) {
  const isSpoiler = comment.spoiler || comment.containsInlineSpoilers;
  const hidden = isSpoiler && !revealed;
  return <BottomSheetPresence>
    <Dialog label={`Comment by ${comment.authorDisplayName}`} onClose={onClose} className="comment-detail-dialog">
      <div className="comment-detail-head">
        <div><strong>{comment.authorDisplayName}</strong>{comment.authorUsername && <small>@{comment.authorUsername}</small>}</div>
        <div className="comment-detail-pager">
          <button className="icon-button" type="button" aria-label="Previous comment" disabled={position <= 0} onClick={onPrevious}><ChevronLeft size={20} /></button>
          <span>{position + 1} / {total}</span>
          <button className="icon-button" type="button" aria-label="Next comment" disabled={position >= total - 1} onClick={onNext}><ChevronRight size={20} /></button>
        </div>
      </div>
      {comment.review && <p className="comment-detail-badge">Review{comment.rating != null ? ` · ${comment.rating}/10` : ''}</p>}
      {!comment.review && <p className="muted">{[comment.rating != null ? `${comment.rating}/10` : '', comment.likes ? `${comment.likes} likes` : '', comment.createdAt?.slice(0, 10)].filter(Boolean).join(' · ')}</p>}
      {hidden
        ? <button className="text-button" type="button" onClick={onReveal}>Reveal spoiler</button>
        : <p className="comment-detail-body">{comment.comment.replace(/\[\/?spoiler\]/gi, '')}</p>}
      <div className="dialog-actions"><button className="button secondary" type="button" onClick={onClose}>Close</button></div>
    </Dialog>
  </BottomSheetPresence>;
}

function actionEpisodeCode(video: Video) {
  if (video.season == null && video.episode == null) return 'Episode';
  const code = video.episode == null ? `Season ${video.season ?? 0}` : `S${video.season ?? 0} E${video.episode}`;
  return code;
}
function compareEpisodes(a: Video, b: Video) { return (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0) || (a.released ?? '').localeCompare(b.released ?? ''); }

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="details-info-row"><strong>{label}</strong><span>{value}</span></div>;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
}

function formatRuntime(raw: string) {
  const minutes = Number.parseInt(raw.replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(minutes) || minutes <= 0) return raw;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return [hours ? `${hours}h` : '', remaining ? `${remaining}m` : ''].filter(Boolean).join(' ') || `${minutes}m`;
}

function ConfiguredSections({ items, contents, tabLayout, episodeList }: {
  items: Array<{ key: string; title: string; order: number; tabGroup: number | null }>;
  contents: Record<string, ReactNode>;
  tabLayout: boolean;
  episodeList: boolean;
}) {
  const processed = new Set<number>();
  return <div className="details-configured-sections">{items.map((item) => {
    const group = item.key === 'EPISODES' && episodeList ? null : item.tabGroup;
    if (!tabLayout || group == null) return <div key={item.key}>{contents[item.key]}</div>;
    if (processed.has(group)) return null;
    processed.add(group);
    const members = items.filter((candidate) => (candidate.key === 'EPISODES' && episodeList ? null : candidate.tabGroup) === group);
    if (members.length < 2) return <div key={item.key}>{contents[item.key]}</div>;
    return <DetailSectionTabs key={`group-${group}`} members={members} contents={contents} />;
  })}</div>;
}

function DetailSectionTabs({ members, contents }: {
  members: Array<{ key: string; title: string }>;
  contents: Record<string, ReactNode>;
}) {
  const [active, setActive] = useState(members[0]?.key ?? '');
  const selected = members.some((item) => item.key === active) ? active : (members[0]?.key ?? '');
  return <section className="details-tab-group">
    <div role="tablist" className="details-tab-list">{members.map((item) => <button key={item.key} type="button" role="tab" aria-selected={selected === item.key} onClick={() => setActive(item.key)}>{item.title}</button>)}</div>
    <div role="tabpanel" key={selected} className="details-tab-panel">{contents[selected]}</div>
  </section>;
}
