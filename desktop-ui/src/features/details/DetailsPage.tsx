import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, CircleCheck, LoaderCircle, Maximize, MoreHorizontal, Play, Plus } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { actions, call, refreshFeature, useSelector } from '../../bridge';
import { InlineError } from '../../components/Status';
import { DetailsExtras, type ExtrasMeta } from './DetailsExtras';
import './details.css';

export function DetailsPage() {
  const { type = '', id = '' } = useParams();
  const details = useSelector((current) => current.details);
  const library = useSelector((current) => current.library);
  const navigate = useNavigate();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [savedOverride, setSavedOverride] = useState<boolean | null>(null);
  const [savedBusy, setSavedBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [watched, setWatched] = useState<{ loaded: boolean; watched?: boolean; fullyWatched?: boolean }>({ loaded: false });
  const [watchBusy, setWatchBusy] = useState(false);
  const [extraMeta, setExtraMeta] = useState<ExtrasMeta | null>(null);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
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
  useEffect(() => {
    setLoadTimedOut(false);
    if (!details.loading) return;
    const timeout = window.setTimeout(() => setLoadTimedOut(true), 30_000);
    return () => window.clearTimeout(timeout);
  }, [type, id, details.loading, details.requestId]);
  useEffect(() => { setActionsOpen(false); setSavedOverride(null); setActionError(''); }, [type, id]);
  useEffect(() => () => { if (playHoldTimer.current !== null) window.clearTimeout(playHoldTimer.current); }, []);
  const media = details.media;
  const saved = savedOverride ?? library.items.some((item) => item.id === id && item.type === type);
  useEffect(() => { setExtraMeta(null); }, [type, id]);
  useEffect(() => {
    let active = true;
    setWatched({ loaded: false });
    void call<{ loaded: boolean; watched?: boolean; fullyWatched?: boolean }>('details.watched.snapshot', { type, id }).then((state) => { if (active) setWatched(state); }).catch(() => { if (active) setWatched({ loaded: true }); });
    return () => { active = false; };
  }, [type, id]);
  const toggleWatched = async () => {
    if (!media) return;
    setWatchBusy(true);
    setActionError('');
    try { setWatched(await call<{ loaded: boolean; watched?: boolean; fullyWatched?: boolean }>('details.watched.toggle', { id: media.id, type: media.type, name: media.name, poster: media.poster, background: media.background, releaseInfo: media.releaseInfo, genres: media.genres, description: media.description })); }
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
  const openStreams = (manual = false) => navigate(`/details/${encodeURIComponent(media!.type)}/${encodeURIComponent(media!.id)}/streams/${encodeURIComponent(media!.id)}${manual ? '?manual=1' : ''}`);
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

  return <div className="detail-page" style={media?.background ? { '--detail-backdrop': `url("${media.background}")` } as CSSProperties : undefined}>
    {media && <div className="detail-screen-controls">
      <button className="detail-back" type="button" aria-label="Back" onClick={() => navigate(-1)}><ArrowLeft size={22} /></button>
      <button className="detail-fullscreen" type="button" aria-label="Toggle fullscreen" onClick={() => { const window = getCurrentWindow(); void window.isFullscreen().then((fullscreen) => window.setFullscreen(!fullscreen)).catch(() => {}); }}><Maximize size={20} /></button>
    </div>}
    {details.loading && (loadTimedOut
      ? <InlineError message="This title is taking longer than expected to load." onRetry={() => { setLoadTimedOut(false); void actions.loadDetails(type, id); }} />
      : <div className="detail-loading"><LoaderCircle className="spin" size={22} /><span>Loading title…</span></div>)}
    {details.error && <InlineError message={details.error} onRetry={() => void actions.loadDetails(type, id)} />}
    {media && <>
      <section className="detail-hero">
        <div className="detail-main">
          {media.logo ? <img className="detail-logo" src={media.logo} alt={media.name} /> : <h1>{media.name}</h1>}
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
            <button className="detail-play" type="button" onPointerDown={beginPlayHold} onPointerUp={cancelPlayHold} onPointerCancel={cancelPlayHold} onPointerLeave={cancelPlayHold} onContextMenu={(event) => event.preventDefault()} onClick={() => { if (longPlayTriggered.current) { longPlayTriggered.current = false; return; } openStreams(false); }}><Play size={19} fill="currentColor" />Play</button>
            <div className={`detail-action-expander ${actionsOpen ? 'expanded' : ''}`}>
              <span className="detail-inline-action-slot"><button className={`detail-inline-action ${watched.watched || watched.fullyWatched ? 'active' : ''}`} type="button" aria-label={watched.watched || watched.fullyWatched ? 'Mark unwatched' : 'Mark watched'} title={watched.watched || watched.fullyWatched ? 'Mark unwatched' : 'Mark watched'} disabled={watchBusy || !watched.loaded} onClick={() => void toggleWatched()}><CircleCheck size={21} /></button></span>
              <span className="detail-inline-action-slot"><button className={`detail-inline-action ${saved ? 'active' : ''}`} type="button" aria-label={saved ? 'Remove from library' : 'Add to library'} title={saved ? 'Remove from library' : 'Add to library'} disabled={savedBusy} onClick={() => void toggleSaved()}>{saved ? <Check size={21} /> : <Plus size={21} />}</button></span>
              <button className="detail-more" type="button" aria-label="More title actions" aria-expanded={actionsOpen} onClick={() => setActionsOpen((open) => !open)}><MoreHorizontal size={22} /></button>
            </div>
          </div>
          {actionError && <p className="detail-action-error" role="alert">{actionError}</p>}
        </div>
      </section>
      <DetailsExtras type={type} id={id} onMetaLoaded={setExtraMeta} />
    </>}
  </div>;
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
