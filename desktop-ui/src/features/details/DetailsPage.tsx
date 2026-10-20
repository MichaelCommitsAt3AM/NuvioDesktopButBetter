import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useNavigationType, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Check, CircleCheck, MoreHorizontal, Play, Plus } from 'lucide-react';
import { BackButton } from '../../components/BackButton';
import { FullscreenButton } from '../../components/FullscreenButton';
import { actions, call, refreshFeature, useFeatureSnapshot, useSelector } from '../../bridge';
import { mainScroller, scrollKey, useActiveProfileId, useListScrollRestore } from '../../navigation/scrollStore';
import { cachedDominantColor, fetchDominantColor } from './dominantColor';
import { InlineError } from '../../components/Status';
import { DetailsExtras, type ExtrasMeta, type DetailsPrimaryAction } from './DetailsExtras';
import './details.css';

export function DetailsPage() {
  const { type = '', id = '' } = useParams();
  const details = useSelector((current) => current.details);
  const library = useSelector((current) => current.library);
  const playbackSettings = useFeatureSnapshot<{ streamAutoPlayMode?: string }>('playbackSettings');
  const navigate = useNavigate();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [savedOverride, setSavedOverride] = useState<boolean | null>(null);
  const [savedBusy, setSavedBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [watched, setWatched] = useState<{ loaded: boolean; watched?: boolean; fullyWatched?: boolean; primaryAction?: DetailsPrimaryAction | null; contentKey?: string }>({ loaded: false });
  const homeExtras = useFeatureSnapshot('homeExtras');
  const metadataSettings = useFeatureSnapshot<{ backgroundMode?: string }>('metadataSettings');
  useEffect(() => { if (!metadataSettings) void refreshFeature('metadataSettings').catch(() => {}); }, [metadataSettings]);
  const navigationType = useNavigationType();
  const profileId = useActiveProfileId();
  const [watchBusy, setWatchBusy] = useState(false);
  const [extraMeta, setExtraMeta] = useState<ExtrasMeta | null>(null);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [backdropFailed, setBackdropFailed] = useState(false);
  const requestedDetailsKey = useRef<string | null>(null);
  const playHoldTimer = useRef<number | null>(null);
  const longPlayTriggered = useRef(false);
  useEffect(() => {
    const key = `${type}:${id}`;
    // React Strict Mode replays mount effects in development. Details loading
    // is a bridge request with global request IDs, so issuing it twice can let
    // the Kotlin RPCs arrive out of order and make every result look stale.
    if (requestedDetailsKey.current === key) return;
    requestedDetailsKey.current = key;
    void actions.loadDetails(type, id);
  }, [type, id]);
  useEffect(() => { if (!playbackSettings) void refreshFeature('playbackSettings', 'playbackSettings.snapshot').catch(() => {}); }, [playbackSettings]);
  useEffect(() => {
    setLoadTimedOut(false);
    if (!details.loading) return;
    const timeout = window.setTimeout(() => setLoadTimedOut(true), 30_000);
    return () => window.clearTimeout(timeout);
  }, [type, id, details.loading, details.requestId]);
  useEffect(() => { setActionsOpen(false); setSavedOverride(null); setActionError(''); }, [type, id]);
  useEffect(() => () => { if (playHoldTimer.current !== null) window.clearTimeout(playHoldTimer.current); }, []);
  const media = details.media?.id === id && details.media.type === type ? details.media : null;
  // Returning from streams/person/entity restores the details offset once
  // content is present; a new title starts at the top via the shell reset.
  useListScrollRestore(scrollKey(profileId, `/details/${type}/${id}`, ''), navigationType, !!media);
  // Scroll-driven header: transform/opacity presentation without a React
  // state update per pixel. The var rides the page for the condensed title
  // and the document root for the portaled backdrop (cleared on leave).
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = mainScroller();
    const page = pageRef.current;
    if (!scroller || !page) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const progress = Math.min(1, scroller.scrollTop / 320).toFixed(3);
      page.style.setProperty('--details-scroll', progress);
      document.documentElement.style.setProperty('--details-scroll', progress);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
      document.documentElement.style.removeProperty('--details-scroll');
    };
  }, [type, id]);
  const primaryAction = (watched.contentKey === `${type}:${id}` ? watched.primaryAction : null) ?? (extraMeta?.id === id && extraMeta.type === type ? extraMeta.primaryAction : undefined);
  const saved = savedOverride ?? library.items.some((item) => item.id === id && item.type === type);
  useEffect(() => { setExtraMeta(null); }, [type, id]);
  useEffect(() => { setLogoFailed(false); setBackdropFailed(false); }, [type, id]);
  useEffect(() => {
    // Addon artwork can die for individual titles while the catalog copy still
    // works. Probe the backdrop like the original UI tolerates image failures:
    // drop it when it cannot load instead of showing an empty shade.
    setBackdropFailed(false);
    if (!media?.background) return;
    const probe = new Image();
    let cancelled = false;
    probe.onload = () => { if (!cancelled) setBackdropFailed(false); };
    probe.onerror = () => { if (!cancelled) setBackdropFailed(true); };
    probe.src = media.background;
    return () => { cancelled = true; probe.onload = null; probe.onerror = null; };
  }, [media?.background]);
  useEffect(() => {
    let active = true;
    setWatched((current) => current.contentKey === `${type}:${id}` ? current : { loaded: false });
    void call<{ loaded: boolean; watched?: boolean; fullyWatched?: boolean; primaryAction?: DetailsPrimaryAction | null }>('details.watched.snapshot', { type, id }).then((state) => { if (active) setWatched({ ...state, contentKey: `${type}:${id}` }); }).catch(() => { if (active) setWatched({ loaded: true }); });
    return () => { active = false; };
  }, [type, id, media?.id, homeExtras]);
  const toggleWatched = async () => {
    if (!media) return;
    setWatchBusy(true);
    setActionError('');
    try { setWatched({ ...await call<{ loaded: boolean; watched?: boolean; fullyWatched?: boolean; primaryAction?: DetailsPrimaryAction | null }>('details.watched.toggle', { id: media.id, type: media.type, name: media.name, poster: media.poster, background: media.background, releaseInfo: media.releaseInfo, genres: media.genres, description: media.description }), contentKey: `${type}:${id}` }); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setWatchBusy(false); }
  };
  const toggleSaved = async () => {
    if (!media || savedBusy) return;
    setSavedBusy(true);
    setActionError('');
    try {
      if (saved) await actions.removeFromLibrary(media.type, media.id);
      else await actions.addToLibrary(media.type, media.id);
      setSavedOverride(!saved);
      void refreshFeature('library').catch(() => {});
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSavedBusy(false); }
  };
  const openStreams = (manual = false) => {
    if (!media) return;
    const query = new URLSearchParams();
    if (manual) query.set('manual', '1');
    for (const [key, value] of Object.entries({
      title: media.name, background: media.background, poster: media.poster, logo: media.logo,
      seasonNumber: primaryAction?.seasonNumber, episodeNumber: primaryAction?.episodeNumber,
      episodeTitle: primaryAction?.episodeTitle, episodeThumbnail: primaryAction?.episodeThumbnail,
      resumeMs: primaryAction?.resumePositionMs,
    })) if (value != null && value !== '') query.set(key, String(value));
    navigate(`/details/${encodeURIComponent(media.type)}/${encodeURIComponent(media.id)}/streams/${encodeURIComponent(primaryAction?.videoId ?? media.id)}?${query}`);
  };
  const beginPlayHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    // Some embedded webviews do not populate `button` for pointerdown. Only
    // reject an explicitly non-primary button so long-press still works there.
    if (event.button > 0) return;
    if (playHoldTimer.current !== null) window.clearTimeout(playHoldTimer.current);
    playHoldTimer.current = window.setTimeout(() => {
      playHoldTimer.current = null;
      longPlayTriggered.current = true;
      openStreams(true);
      window.setTimeout(() => { longPlayTriggered.current = false; }, 1200);
    }, 520);
  };
  const cancelPlayHold = () => {
    if (playHoldTimer.current !== null) window.clearTimeout(playHoldTimer.current);
    playHoldTimer.current = null;
  };

  // Kotlin default is DominantColor; Normal shows no backdrop, Cinematic the
  // artwork backdrop, DominantColor a dominant wash (Phase 8 completes real
  // dominant-color extraction; until then it falls back to the artwork
  // backdrop so the mode switch still has an observable effect).
  const backgroundMode = (metadataSettings?.backgroundMode ?? 'dominant_color').toLowerCase();
  const showBackdrop = backgroundMode !== 'normal';
  const [dominant, setDominant] = useState<string | null>(null);
  useEffect(() => {
    const token = { cancelled: false };
    const url = media?.background;
    if (backgroundMode !== 'dominant_color' || !url || backdropFailed) { setDominant(null); return; }
    const known = cachedDominantColor(url);
    if (known !== undefined) { setDominant(known); return; }
    setDominant(null);
    void fetchDominantColor(url, token).then((color) => { if (!token.cancelled) setDominant(color); });
    return () => { token.cancelled = true; };
  }, [media?.background, backgroundMode, backdropFailed, type, id]);
  const backdropImage = media?.background
    ? (dominant ? `linear-gradient(color-mix(in srgb, ${dominant} 42%, transparent), transparent 75%), ` : '') + `var(--title-backdrop-shade),url("${media.background}")`
    : undefined;

  return <>
    {showBackdrop && media?.background && !backdropFailed && createPortal(<div className={`detail-viewport-backdrop${backgroundMode === 'dominant_color' ? ' detail-dominant-fallback' : ''}`} aria-hidden="true" style={{ backgroundImage: backdropImage }} />, document.body)}
    <div className="detail-page" ref={pageRef}>
    {(media || details.loading) && <div className="detail-screen-controls">
      <BackButton className="detail-back" onClick={() => navigate(-1)} />
      {media && <FullscreenButton />}
    </div>}
    {details.loading && loadTimedOut && <InlineError message="This title is taking longer than expected to load." onRetry={() => { setLoadTimedOut(false); void actions.loadDetails(type, id); }} />}
    {details.error && <InlineError message={details.error} onRetry={() => void actions.loadDetails(type, id)} />}
    {!media && details.loading && <section className="detail-hero detail-loading-hero" role="status" aria-label="Loading title details" aria-busy="true">
      <div className="detail-loading-placeholder">
        <span className="detail-skeleton-title" />
        <span className="detail-skeleton-meta" />
        <span className="detail-skeleton-copy" />
        <span className="detail-skeleton-copy short" />
        <span className="detail-skeleton-action" />
      </div>
    </section>}
    {media && <div className="detail-content-arrive" key={`${type}:${id}`}>
      <section className="detail-hero">
        <div className="detail-main">
          {media.logo && !logoFailed ? <img className="detail-logo" src={media.logo} alt={media.name} onError={() => setLogoFailed(true)} /> : <h1>{media.name}</h1>}
          <div className="detail-meta-line">
            {(extraMeta?.releaseInfo ?? media.releaseInfo) && <strong>{(extraMeta?.releaseInfo ?? media.releaseInfo)!.slice(0, 4)}</strong>}
            {extraMeta?.runtime && <strong>{formatRuntime(extraMeta.runtime)}</strong>}
          </div>
          <div className="detail-ratings-row">
            {extraMeta?.rating ? <span className="detail-external-rating detail-imdb"><img src="/images/ratings/imdb.png" alt="IMDb" /><strong>{extraMeta.rating}</strong></span> : !extraMeta && media.rating && <span className="detail-rating"><img src="/images/ratings/imdb.png" alt="IMDb" /><strong>{media.rating}</strong></span>}
            {extraMeta?.externalRatings.map((rating) => <span className={`detail-external-rating ${rating.source.toLowerCase().includes('tomato') ? 'detail-tomatoes' : ''}`} key={rating.source}>
              {rating.source.toLowerCase().includes('tomato') && <img src="/images/ratings/tomatoes-certified.png" alt="Rotten Tomatoes" />}
              <strong>{Number.isInteger(rating.value) ? rating.value : rating.value.toFixed(1)}%</strong>
            </span>)}
          </div>
          {media.genres.length > 0 && <p className="detail-genres">{media.genres.slice(0, 4).join(' · ')}</p>}
          {media.description && <p className="detail-description">{media.description}</p>}
          <div className="detail-actions">
            <button className="detail-play" type="button" onPointerDown={beginPlayHold} onPointerUp={cancelPlayHold} onPointerCancel={cancelPlayHold} onPointerLeave={cancelPlayHold} onContextMenu={(event) => event.preventDefault()} onClick={() => { if (longPlayTriggered.current) { longPlayTriggered.current = false; return; } openStreams(false); }}><Play size={19} fill="currentColor" />{primaryAction?.label ?? 'Play'}</button>
            <div className={`detail-action-expander ${actionsOpen ? 'expanded' : ''}`}>
              <span className="detail-inline-action-slot"><button className={`detail-inline-action ${watched.watched || watched.fullyWatched ? 'active' : ''}`} type="button" aria-label={watched.watched || watched.fullyWatched ? 'Mark unwatched' : 'Mark watched'} title={watched.watched || watched.fullyWatched ? 'Mark unwatched' : 'Mark watched'} disabled={watchBusy || !watched.loaded} onClick={() => void toggleWatched()}><CircleCheck size={21} /></button></span>
              <span className="detail-inline-action-slot"><button className={`detail-inline-action ${saved ? 'active' : ''}`} type="button" aria-label={saved ? 'Remove from library' : 'Add to library'} title={saved ? 'Remove from library' : 'Add to library'} disabled={savedBusy} onClick={() => void toggleSaved()}>{saved ? <Check size={21} /> : <Plus size={21} />}</button></span>
              <button className="detail-more" type="button" aria-label="More title actions" aria-expanded={actionsOpen} onClick={() => setActionsOpen((open) => !open)}><MoreHorizontal size={22} /></button>
            </div>
          </div>
          {actionError && <p className="detail-action-error" role="alert">{actionError}</p>}
        </div>
      </section>
      <DetailsExtras type={type} id={id} primaryAction={primaryAction} onMetaLoaded={setExtraMeta} />
    </div>}
    </div>
  </>;
}

function formatRuntime(raw: string) {
  const value = raw.trim();
  const hourMatch = value.match(/(\d+)\s*(?:h|hr|hour)s?/i);
  const minuteMatch = value.match(/(\d+)\s*(?:m|min|minute)s?/i);
  const hasExplicitUnit = hourMatch !== null || minuteMatch !== null;
  const minutes = hasExplicitUnit
    ? Number(hourMatch?.[1] ?? 0) * 60 + Number(minuteMatch?.[1] ?? 0)
    : Number.parseInt(value.replace(/\D/g, ''), 10);
  if (!Number.isFinite(minutes) || minutes <= 0) return raw;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours}h` : '', remainder ? `${remainder}m` : ''].filter(Boolean).join(' ') || `${minutes}m`;
}
