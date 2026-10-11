import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Building2, CheckCircle, CircleCheck, LoaderCircle, ListChecks, Play, RotateCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';
import type { Media } from '../../generated/contract';
import { InlineError } from '../../components/Status';
import { Dialog } from '../../components/Dialog';
import { Poster } from '../../components/Poster';
import { SeriesEpisodes } from './SeriesEpisodes';

type Person = { name: string; role: string | null; photo: string | null; tmdbId: number | null };
type Company = { name: string; logo: string | null; tmdbId: number | null };
type Trailer = { id: string; key: string; name: string; displayName: string | null; site: string; type: string; official: boolean; seasonNumber: number | null; youtubeUrl: string };
export type Video = { id: string; title: string; released: string | null; available: boolean; thumbnail: string | null; season: number | null; seasonPoster?: string | null; episode: number | null; overview: string | null; runtime: number | null; rating: number | null };
export type ExtrasMeta = {
  id: string; type: string; name: string; poster: string | null; background: string | null; logo: string | null; description: string | null; releaseInfo: string | null; lastAirDate: string | null; status: string | null;
  imdbId: string | null; rating: string | null; ageRating: string | null; runtime: string | null; country: string | null; awards: string | null; language: string | null; website: string | null;
  externalRatings: Array<{ source: string; value: number; certified: boolean }>;
  genres: string[]; director: string[]; writer: string[]; cast: Person[]; productionCompanies: Company[]; networks: Company[];
  moreLikeThis: Media[]; moreLikeThisSource: string | null; collectionName: string | null; collectionItems: Media[]; trailers: Trailer[]; links: Array<{ name: string; category: string; url: string }>;
  seasonPosters: Record<string, string>; videos: Video[];
};
type WatchedSnapshot = { loaded: boolean; watchedKeys: string[]; watched?: boolean; fullyWatched?: boolean; episodes?: Array<{ season: number | null; episode: number | null; videoId: string | null; key: string }> };
type PersonDetail = { tmdbId: number; name: string; biography: string | null; birthday: string | null; deathday: string | null; placeOfBirth: string | null; profilePhoto: string | null; knownFor: string | null; movieCredits: Media[]; tvCredits: Media[] };
type EntityBrowse = { header: { id: number; kind: string; name: string; logo: string | null; originCountry: string | null; secondaryLabel: string | null; description: string | null }; rails: Array<{ mediaType: string; railType: string; currentPage: number; hasMore: boolean; items: Media[] }> };
type EntityRailPage = { page: number; hasMore: boolean; items: Media[] };
type DetailComment = { id: number; authorDisplayName: string; authorUsername: string | null; comment: string; spoiler: boolean; containsInlineSpoilers: boolean; review: boolean; likes: number; rating: number | null; createdAt: string | null; updatedAt: string | null };
type CommentsPage = { enabled: boolean; items: DetailComment[]; currentPage: number; pageCount: number; itemCount: number };
type MetadataSettings = {
  items: Array<{ key: string; title: string; enabled: boolean; order: number; tabGroup: number | null }>;
  tabLayout: boolean; episodeCardStyle: 'horizontal' | 'list'; blurUnwatchedEpisodes: boolean;
  showOverallRatings: boolean; episodeRatingsVisibility: 'show_all' | 'hide_episodes' | 'hide_unwatched_episodes';
};

const sectionStyle = { marginTop: 28 } as const;
const headingStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 } as const;

export function DetailsExtras({ type, id, onMetaLoaded }: { type: string; id: string; onMetaLoaded?: (meta: ExtrasMeta) => void }) {
  const navigate = useNavigate();
  const settings = useFeatureSnapshot<MetadataSettings>('metadataSettings');
  const loadGeneration = useRef(0);
  const [meta, setMeta] = useState<ExtrasMeta | null>(null);
  const [watched, setWatched] = useState<WatchedSnapshot | null>(null);
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [entity, setEntity] = useState<EntityBrowse | null>(null);
  const [entityContext, setEntityContext] = useState<{ kind: string; id: number; sourceType: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trailerError, setTrailerError] = useState<string | null>(null);
  const [railPages, setRailPages] = useState<Record<string, EntityRailPage>>({});
  const [comments, setComments] = useState<DetailComment[]>([]);
  const [commentsPage, setCommentsPage] = useState(0);
  const [commentsPageCount, setCommentsPageCount] = useState(0);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<number>>(new Set());
  const [selectedTrailerCategory, setSelectedTrailerCategory] = useState('Trailer');
  const [selectedEpisode, setSelectedEpisode] = useState<Video | null>(null);

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
      void call<WatchedSnapshot>('details.watched.snapshot', { type, id }).then((snapshot) => {
        if (loadGeneration.current === generation) setWatched(snapshot);
      }).catch(() => {});
    }).catch((cause) => {
      if (loadGeneration.current !== generation) return;
      setLoading(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { loadGeneration.current += 1; };
  }, [type, id]);
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
  const openPerson = async (personId: number, personName: string, role: string | null) => {
    setPerson(null);
    setEntity(null);
    setError(null);
    setLoading(true);
    try {
      const result = await call<PersonDetail>('details.person', { personId, name: personName, preferCrew: /director|writer|producer/i.test(role ?? '') });
      setPerson(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setLoading(false); }
  };
  const openEntity = async (kind: string, company: Company, sourceType: string) => {
    if (company.tmdbId == null) return;
    setEntity(null);
    setPerson(null);
    setEntityContext({ kind, id: company.tmdbId, sourceType });
    setRailPages({});
    setLoading(true);
    setError(null);
    try {
      const result = await call<EntityBrowse>('details.entity', { kind, entityId: company.tmdbId, name: company.name, sourceType });
      setEntity(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setLoading(false); }
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
  const loadEntityPage = async (rail: EntityBrowse['rails'][number]) => {
    if (!entityContext) return;
    const key = `${rail.mediaType}:${rail.railType}`;
    const current = railPages[key] ?? { page: rail.currentPage, hasMore: rail.hasMore, items: rail.items };
    if (!current.hasMore) return;
    const page = current.page + 1;
    try {
      const result = await call<EntityRailPage>('details.entity.page', { kind: entityContext.kind, entityId: entityContext.id, mediaType: rail.mediaType, railType: rail.railType, page });
      setRailPages((previous) => {
        const old = previous[key] ?? { page: rail.currentPage, hasMore: rail.hasMore, items: rail.items };
        const seen = new Set(old.items.map((item) => `${item.type}:${item.id}`));
        return { ...previous, [key]: { page: result.page, hasMore: result.hasMore, items: [...old.items, ...result.items.filter((item) => !seen.has(`${item.type}:${item.id}`))] } };
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
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

  if (loading && !meta && !person && !entity) return <section style={sectionStyle}><div className="loading-block"><LoaderCircle className="spin" size={20} /><span>Loading cast, episodes, and related details…</span></div></section>;
  if (error && !meta && !person && !entity) return <section style={sectionStyle}><InlineError message={error} onRetry={() => { setError(null); setLoading(true); void call<ExtrasMeta>('details.extras', { type, id }).then(setMeta).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => setLoading(false)); }} /></section>;
  if (!meta) return null;

  const watchedVideo = (video: Video) => watched?.episodes?.some((item) => item.season === video.season && item.episode === video.episode) ?? false;
  const renderMediaRail = (title: string, items: Media[], subtitle?: string) => items.length > 0 && <section style={sectionStyle} key={title}>
    <div style={headingStyle}><div><h2>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div></div>
    <div className="shelf-track">{items.map((item, index) => <Poster key={`${item.type}:${item.id}:${index}`} item={item} onClick={() => openMedia(item)} />)}</div>
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
    CAST: meta.cast.length > 0 ? <section style={sectionStyle}><div style={headingStyle}><h2>Cast</h2></div><div className="details-extras-people">{meta.cast.map((member, index) => <button className="details-extras-person" key={`${member.name}:${member.tmdbId ?? index}`} type="button" disabled={member.tmdbId == null} onClick={() => member.tmdbId != null && void openPerson(member.tmdbId, member.name, member.role)}>{member.photo ? <img src={member.photo} alt="" loading="lazy" /> : <span className="details-extras-placeholder">{initials(member.name)}</span>}<span><strong>{member.name}</strong>{member.role && member.role.toLowerCase() !== 'cast' && <small>{member.role}</small>}</span></button>)}</div></section> : null,
    TRAILERS: meta.trailers.length > 0 ? <section style={sectionStyle} className="details-extras-trailer-section"><div style={headingStyle}><h2>Trailers</h2><select className="details-trailer-select" aria-label="Trailer category" value={selectedTrailerCategory} onChange={(event) => setSelectedTrailerCategory(event.target.value)}>{[...new Set(meta.trailers.map((trailer) => trailer.type || 'Trailer'))].map((category) => <option key={category}>{category}</option>)}</select></div><div className="details-extras-trailers">{meta.trailers.filter((trailer) => (trailer.type || 'Trailer') === selectedTrailerCategory).map((trailer) => <button className="details-extras-trailer" type="button" key={trailer.id} onClick={() => void openTrailer(trailer.youtubeUrl)}><span className="details-extras-trailer-image"><img src={`https://img.youtube.com/vi/${trailer.key}/hqdefault.jpg`} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} /><Play size={22} fill="currentColor" /></span><span><strong>{trailer.displayName ?? trailer.name}</strong></span></button>)}</div>{trailerError && <InlineError message={trailerError} />}</section> : null,
    EPISODES: groupedVideos.length > 0 ? <SeriesEpisodes
      videos={meta.videos}
      poster={meta.poster}
      background={meta.background}
      seasonPosters={meta.seasonPosters}
      cardStyle={settings?.episodeCardStyle ?? 'horizontal'}
      blurUnwatched={settings?.blurUnwatchedEpisodes ?? false}
      showRatings={settings?.showOverallRatings !== false}
      ratingsVisibility={settings?.episodeRatingsVisibility ?? 'show_all'}
      isWatched={watchedVideo}
      onEpisodeClick={(video) => navigate(`/details/${encodeURIComponent(meta.type)}/${encodeURIComponent(meta.id)}/streams/${encodeURIComponent(video.id)}`)}
      onEpisodeLongPress={setSelectedEpisode}
      onToggleSeason={(season) => void toggleSeason(season)}
      mutationBusy={mutationBusy}
    /> : null,
    COMMENTS: (comments.length > 0 || commentsLoading || commentsError) ? <section style={sectionStyle}><div style={headingStyle}><h2>Comments & reviews</h2><button className="text-button" disabled={commentsLoading} onClick={() => void loadMoreComments(true)}><RotateCw size={13} /> Refresh</button></div>
      {commentsError && <InlineError message={commentsError} onRetry={() => void loadMoreComments(true)} />}{commentsLoading && comments.length === 0 && <div className="loading-block"><LoaderCircle className="spin" size={18} /><span>Loading comments…</span></div>}
      <div className="details-extras-comments">{comments.map((comment) => { const isSpoiler = comment.spoiler || comment.containsInlineSpoilers; const revealed = revealedSpoilers.has(comment.id); return <article className={`details-extras-comment ${isSpoiler && !revealed ? 'spoiler-hidden' : ''}`} key={comment.id}>
        <header><strong>{comment.authorDisplayName}</strong><span>{comment.review ? 'Review' : 'Comment'}{comment.rating != null ? ` · ${comment.rating}/10` : ''}{comment.likes ? ` · ${comment.likes} likes` : ''}</span>{comment.createdAt && <time>{comment.createdAt.slice(0, 10)}</time>}</header>
        {isSpoiler && !revealed ? <button className="text-button" onClick={() => setRevealedSpoilers((previous) => new Set(previous).add(comment.id))}>Reveal spoiler</button> : <p>{comment.comment.replace(/\[\/?spoiler\]/gi, '')}</p>}
      </article>; })}</div>
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
    <style>{`.details-extras h2,.details-extras h3{margin:0}.details-extras-facts{display:flex;flex-wrap:wrap;gap:8px}.details-extras-credit{margin:10px 0;color:var(--muted,#a2a4aa)}.details-extras-credit strong{color:var(--text,#f5f5f5);margin-right:8px}.details-extras-awards{margin:10px 0}.details-extras-link{display:inline-flex;align-items:center;gap:6px;margin:10px 12px 0 0;color:var(--app-accent,#eee);font-size:13px;text-decoration:none}.details-extras-people,.details-extras-companies,.details-extras-trailers{display:flex;gap:10px;overflow-x:auto;padding:2px 0 8px}.details-extras-person,.details-extras-company,.details-extras-trailer{display:flex;align-items:center;gap:10px;flex:0 0 auto;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.035);color:var(--text,#f5f5f5);text-align:left;cursor:pointer}.details-extras-person{width:190px;min-height:70px;padding:8px}.details-extras-person img,.details-extras-placeholder{width:46px;height:54px;flex:0 0 46px;border-radius:8px;object-fit:cover;background:#26272b;display:grid;place-items:center}.details-extras-person strong,.details-extras-person small,.details-extras-trailer strong,.details-extras-trailer small{display:block}.details-extras-person strong,.details-extras-trailer strong{font-size:13px}.details-extras-person small,.details-extras-trailer small{margin-top:3px;color:var(--muted,#a2a4aa);font-size:11px}.details-extras-company{padding:9px 12px}.details-extras-company img{max-width:100px;max-height:35px;object-fit:contain}.details-extras-company span{font-size:12px}.details-extras-trailer{width:250px;min-height:72px;padding:10px}.details-extras-trailer-image{width:56px;height:44px;display:grid;place-items:center;border-radius:8px;background:linear-gradient(135deg,#4a2525,#18181b);color:#fff}.details-extras-episodes{display:grid;gap:14px}.details-extras-season{padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.018)}.details-extras-season-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}.details-extras-season-heading h3{font-size:15px}.details-extras-episode{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid rgba(255,255,255,.06)}.details-extras-episode>img{width:106px;height:62px;flex:0 0 106px;border-radius:8px;object-fit:cover}.details-extras-episode-copy{min-width:0;flex:1}.details-extras-episode-copy strong,.details-extras-episode-copy small{display:block}.details-extras-episode-copy strong{font-size:13px}.details-extras-episode-copy small,.details-extras-episode-copy p,.details-extras-biography,.details-extras-bottomline{color:var(--muted,#a2a4aa);font-size:12px}.details-extras-episode-copy small{margin-top:4px}.details-extras-episode-copy p{margin:5px 0 0;line-height:1.45}.details-extras-profile{float:left;width:110px;height:130px;margin:0 14px 8px 0;border-radius:12px;object-fit:cover}.details-extras-biography{line-height:1.65}.details-extras-browse{padding:16px;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.025)}.details-extras-bottomline{margin:24px 0 8px}.details-extras-retry{display:inline-flex;align-items:center;gap:7px;margin-top:10px}.details-extras button:disabled{opacity:.55;cursor:default}@media(max-width:640px){.details-extras-episode>img{width:76px;height:48px;flex-basis:76px}.details-extras-person{width:160px}.details-extras-browse{padding:12px}}`}</style>
    <style>{`.details-configured-sections{display:flex;flex-direction:column}.details-tab-group{margin-top:28px;padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)}.details-tab-list{display:flex;gap:6px;margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,.08)}.details-tab-list button{padding:9px 12px;border:0;border-bottom:2px solid transparent;background:transparent;color:#a4a7ad;font-size:12px;cursor:pointer}.details-tab-list button[aria-selected=true]{border-bottom-color:#eee;color:#fff}.details-extras-company-group h3{margin:8px 0;font-size:12px;color:#9da1a8}.details-extras-episode-open{display:flex;align-items:center;gap:12px;min-width:0;flex:1;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer}.details-extras-episode-open:disabled{cursor:default}.details-extras-episode-open>img{width:106px;height:62px;flex:0 0 106px;border-radius:8px;object-fit:cover}.details-extras-episode-open:hover strong{color:#fff;text-decoration:underline}.episode-find-streams{flex:0 0 auto;color:#b7bbc1;font-size:10px}.episode-card-layout .details-extras-season-episodes{display:flex;gap:10px;overflow-x:auto;padding-bottom:8px}.episode-card-layout .details-extras-episode{display:flex;flex-direction:column;align-items:stretch;flex:0 0 245px;padding:0;border:1px solid rgba(255,255,255,.07);border-radius:10px;overflow:hidden}.episode-card-layout .details-extras-episode-open{display:flex;flex-direction:column;align-items:stretch;gap:0}.episode-card-layout .details-extras-episode-open>img{width:100%;height:130px;flex-basis:130px;border-radius:0}.episode-card-layout .details-extras-episode-copy{padding:10px}.episode-card-layout .details-extras-episode>.icon-button{position:absolute;align-self:flex-end;margin:8px}.episode-card-layout .details-extras-episode{position:relative}.episode-card-layout .episode-find-streams{padding:0 10px 10px}.episode-list-layout .details-extras-season-episodes{display:grid}.episode-list-layout .details-extras-episode{min-height:76px}.episode-list-layout .details-extras-episode-open>img{width:106px;height:62px}.details-extras-episode-copy p{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}.details-extras-comments{display:grid;gap:9px;margin-bottom:12px}.details-extras-comment{padding:13px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:rgba(255,255,255,.025)}.details-extras-comment header{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.details-extras-comment header strong{font-size:12px}.details-extras-comment header span,.details-extras-comment time{color:#999da5;font-size:10px}.details-extras-comment time{margin-left:auto}.details-extras-comment p{margin:9px 0 0;color:#d0d2d6;font-size:12px;line-height:1.55;white-space:pre-wrap}.details-extras-comment.spoiler-hidden{background:rgba(120,80,20,.08)}.details-extras-comment.spoiler-hidden p{filter:blur(4px)}`}</style>
    {error && <InlineError message={error} />}
    <ConfiguredSections items={configuredSections} contents={sectionContents} tabLayout={settings?.tabLayout ?? false} episodeList={settings?.episodeCardStyle === 'list'} />

    {person && <section style={sectionStyle} className="details-extras-browse">
      <div style={headingStyle}><div><h2>{person.name}</h2><p className="muted">{[person.knownFor, person.birthday, person.deathday && `Died ${person.deathday}`, person.placeOfBirth].filter(Boolean).join(' · ')}</p></div><button className="button secondary" type="button" onClick={() => setPerson(null)}>Close</button></div>
      {person.profilePhoto && <img className="details-extras-profile" src={person.profilePhoto} alt={person.name} />}
      {person.biography && <p className="details-extras-biography">{person.biography}</p>}
      {renderMediaRail('Movies', person.movieCredits)}{renderMediaRail('TV', person.tvCredits)}
    </section>}

    {entity && <section style={sectionStyle} className="details-extras-browse">
      <div style={headingStyle}><div><h2>{entity.header.name}</h2><p className="muted">{[entity.header.kind, entity.header.originCountry, entity.header.secondaryLabel].filter(Boolean).join(' · ')}</p></div><button className="button secondary" type="button" onClick={() => setEntity(null)}>Close</button></div>
      {entity.header.description && <p className="details-extras-biography">{entity.header.description}</p>}
      {entity.rails.map((rail) => { const page = railPages[`${rail.mediaType}:${rail.railType}`]; return <section key={`${rail.mediaType}:${rail.railType}`} style={sectionStyle}>
        <div style={headingStyle}><h3>{rail.mediaType.toUpperCase()} · {rail.railType.replace('_', ' ')}</h3>{(page?.hasMore ?? rail.hasMore) && <button className="text-button" type="button" onClick={() => void loadEntityPage(rail)}>Load more</button>}</div>
        <div className="shelf-track">{(page?.items ?? rail.items).map((item, index) => <Poster key={`${item.type}:${item.id}:${index}`} item={item} onClick={() => openMedia(item)} />)}</div>
      </section>; })}
    </section>}
    {(person || entity) && loading && <div className="loading-block"><LoaderCircle className="spin" size={18} /><span>Loading browse results…</span></div>}
    <button className="text-button details-extras-retry" type="button" onClick={() => { setLoading(true); void call<ExtrasMeta>('details.extras', { type, id }).then((result) => { setMeta(result); onMetaLoaded?.(result); }).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => setLoading(false)); }}><RotateCw size={14} /> Refresh details</button>
    {selectedEpisode && <Dialog label={`Actions for ${selectedEpisode.title}`} onClose={() => setSelectedEpisode(null)} className="episode-actions-dialog">
      <div className="episode-actions-sheet">
        <span className="episode-actions-handle" aria-hidden="true" />
        <header><strong>{selectedEpisode.title}</strong><span>{actionEpisodeCode(selectedEpisode)}{selectedEpisode.season != null ? ` • Season ${selectedEpisode.season}` : ' • Specials'}</span></header>
        <div className="episode-actions-divider" />
        <button type="button" className="episode-action-row" disabled={mutationBusy} onClick={() => void toggleEpisode(selectedEpisode)}><span className="episode-action-icon"><CheckCircle size={20} /></span><span>{watchedVideo(selectedEpisode) ? 'Mark as unwatched' : 'Mark as watched'}</span></button>
        {previousEpisodes.length > 0 && <button type="button" className="episode-action-row" disabled={mutationBusy} onClick={() => void togglePreviousEpisodes(selectedEpisode)}><span className="episode-action-icon"><ListChecks size={20} /></span><span>Mark previous episodes {previousEpisodesWatched ? 'unwatched' : 'watched'}</span></button>}
        {selectedSeasonEpisodes.length > 0 && <button type="button" className="episode-action-row" disabled={mutationBusy} onClick={() => { setSelectedEpisode(null); void toggleSeason(selectedEpisode.season ?? 0); }}><span className="episode-action-icon"><CircleCheck size={20} /></span><span>Mark Season {selectedEpisode.season ?? 0} as {selectedSeasonWatched ? 'unwatched' : 'watched'}</span></button>}
        <button type="button" className="episode-action-row" disabled={mutationBusy || !selectedEpisode.available} onClick={() => { const episode = selectedEpisode; setSelectedEpisode(null); navigate(`/details/${encodeURIComponent(meta.type)}/${encodeURIComponent(meta.id)}/streams/${encodeURIComponent(episode.id)}?manual=1`); }}><span className="episode-action-icon"><Play size={20} fill="currentColor" /></span><span>Play manually</span></button>
      </div>
    </Dialog>}
  </div>;
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
    <div role="tabpanel">{contents[selected]}</div>
  </section>;
}
