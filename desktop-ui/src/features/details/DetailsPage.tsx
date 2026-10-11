import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, LoaderCircle, Maximize, MoreHorizontal, Play } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { actions, call, useSelector } from '../../bridge';
import { InlineError } from '../../components/Status';
import { DetailsExtras, type ExtrasMeta } from './DetailsExtras';
import { ListMembershipButton } from '../library/ListMembershipButton';
import './details.css';

export function DetailsPage() {
  const { type = '', id = '' } = useParams();
  const details = useSelector((current) => current.details);
  const navigate = useNavigate();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [watched, setWatched] = useState<{ loaded: boolean; watched?: boolean; fullyWatched?: boolean }>({ loaded: false });
  const [watchBusy, setWatchBusy] = useState(false);
  const [extraMeta, setExtraMeta] = useState<ExtrasMeta | null>(null);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const requestedDetailsKey = useRef<string | null>(null);
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
  useEffect(() => { setActionsOpen(false); }, [type, id]);
  const media = details.media;
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
    try { setWatched(await call<{ loaded: boolean; watched?: boolean; fullyWatched?: boolean }>('details.watched.toggle', { id: media.id, type: media.type, name: media.name, poster: media.poster, background: media.background, releaseInfo: media.releaseInfo, genres: media.genres, description: media.description })); }
    finally { setWatchBusy(false); }
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
            <button className="detail-play" type="button" onClick={() => navigate(`/details/${encodeURIComponent(media.type)}/${encodeURIComponent(media.id)}/streams/${encodeURIComponent(media.id)}`)}><Play size={19} fill="currentColor" />Play</button>
            <div className="detail-more-wrap">
              <button className="detail-more" type="button" aria-label="More title actions" aria-expanded={actionsOpen} onClick={() => setActionsOpen((open) => !open)}><MoreHorizontal size={22} /></button>
              {actionsOpen && <div className="detail-more-menu"><button className="detail-menu-action" type="button" disabled={watchBusy || !watched.loaded} onClick={() => void toggleWatched()}><Check size={17} />{watched.watched || watched.fullyWatched ? 'Mark unwatched' : 'Mark watched'}</button><ListMembershipButton type={media.type} id={media.id} name={media.name} /></div>}
            </div>
          </div>
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
