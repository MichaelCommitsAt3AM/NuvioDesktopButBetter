import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, CircleCheck, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Media } from '../generated/contract';
import { actions, call, refreshFeature, useFeatureSnapshot, useSelector } from '../bridge';
import type { AppearanceSnapshot } from '../features/settings/appearanceStore';
import { ListMembershipButton } from '../features/library/ListMembershipButton';
import { Dialog } from './Dialog';
import { HomeActionDialog } from '../features/home/HomeActionDialog';
import { PosterHoverPreview, HOVER_PREVIEW_CLOSE_DELAY_MS } from './PosterHoverPreview';
import { rectOf, type SourceRect } from './sourceLift';
import { PosterLoadingCard } from './PosterLoadingCard';
import './poster.css';
import './uniformPosters.css';
import '../theme/cardDepth.css';
import { depthActive, depthVars } from '../theme/cardDepth';
import { posterMetrics } from './posterMetrics';
import { useCardHold } from './useCardHold';

// Route changes unmount poster cards. Remember successful image loads across those
// remounts so already-seen artwork stays visible instead of flashing a skeleton.
const loadedPosterUrls = new Map<string, true>();
const resolvedPosterUrls = new Map<string, string>();
const MAX_REMEMBERED_POSTERS = 512;
function normalizePosterUrl(url: string) {
  try { return new URL(url, document.baseURI).href; } catch { return url; }
}
function rememberPoster(url: string) {
  const normalized = normalizePosterUrl(url);
  loadedPosterUrls.delete(normalized);
  loadedPosterUrls.set(normalized, true);
  if (loadedPosterUrls.size > MAX_REMEMBERED_POSTERS) {
    const oldest = loadedPosterUrls.keys().next().value;
    if (oldest) loadedPosterUrls.delete(oldest);
  }
}
function forgetPoster(url: string) { loadedPosterUrls.delete(normalizePosterUrl(url)); }
function rememberResolvedPoster(key: string, url: string) {
  resolvedPosterUrls.delete(key);
  resolvedPosterUrls.set(key, url);
  if (resolvedPosterUrls.size > MAX_REMEMBERED_POSTERS) {
    const oldest = resolvedPosterUrls.keys().next().value;
    if (oldest) resolvedPosterUrls.delete(oldest);
  }
}

// Memoized: shelves and grids re-render as progressive mounting fills in, but
// already-mounted cards skip re-render since their props are referentially
// stable. Each card still updates itself through its own store subscriptions.
export const Poster = memo(function Poster({ item, compact = false, onClick, showRating = true, onRemoveAction }: { item: Media; compact?: boolean; onClick?: () => void; showRating?: boolean; onRemoveAction?: (item: Media, operation: () => Promise<unknown>) => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const appearance = useFeatureSnapshot<AppearanceSnapshot>('appearance');
  const homeWatched = useFeatureSnapshot<{watchedKeys:string[]}>('homeWatched');
  const saved=useSelector(current=>current.library.items.some(row=>row.id===item.id&&row.type===item.type));
  const cardStyle = appearance?.cardStyle;
  const screen = pathname.startsWith('/library') ? 'library' : pathname.startsWith('/details') ? 'details' : pathname.startsWith('/search') || pathname.startsWith('/catalog') ? 'search' : pathname.startsWith('/collections') ? 'collections' : 'home';
  const homeStyleActions = screen === 'home' || screen === 'library';
  const pattern = appearance?.posters.pattern;
  const activeScreens = appearance?.posters.activeScreens;
  const landscape = cardStyle?.catalogLandscapeModeEnabled ?? false;
  const shouldResolve = !!pattern && !!activeScreens?.includes(screen);
  const posterResolveKey = `${screen}:${item.type}:${item.id}:${landscape ? 'landscape' : 'poster'}:${pattern ?? ''}`;
  const fallbackPoster = item.rawPoster ?? item.poster;
  const initialPoster = (shouldResolve ? resolvedPosterUrls.get(posterResolveKey) : undefined) ?? (shouldResolve ? item.poster : fallbackPoster);
  const [poster, setPoster] = useState(initialPoster);
  const [posterLoadedUrl, setPosterLoadedUrl] = useState<string | null>(() => initialPoster && loadedPosterUrls.has(normalizePosterUrl(initialPoster)) ? normalizePosterUrl(initialPoster) : null);
  const [hover, setHover] = useState(false);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState('');
  const [watched, setWatched] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [sourceRect, setSourceRect] = useState<SourceRect | null>(null);
  const sourceKey = `${item.type}:${item.id}`;
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isWatchedOnCard = (screen === 'home' || screen === 'library') && (homeWatched?.watchedKeys?.includes(`${item.type}:${item.id}:-1:-1`) ?? false);
  const normalizedPoster = poster ? normalizePosterUrl(poster) : null;
  const posterLoaded = normalizedPoster !== null && posterLoadedUrl === normalizedPoster;
  useEffect(() => {
    let active = true;
    const fallbackPoster = item.rawPoster ?? item.poster;
  const initialPoster = (shouldResolve ? resolvedPosterUrls.get(posterResolveKey) : undefined) ?? (shouldResolve ? item.poster : fallbackPoster);
    setPoster(initialPoster);
    setPosterLoadedUrl(initialPoster && loadedPosterUrls.has(normalizePosterUrl(initialPoster)) ? normalizePosterUrl(initialPoster) : null);
    if (shouldResolve) void call<{url:string|null}>('posters.resolve', {id:item.id,type:item.type,screen,shape:landscape?'landscape':'poster'}).then(result => { if(active && result.url){rememberResolvedPoster(posterResolveKey,result.url);const resolved=normalizePosterUrl(result.url);setPoster(result.url);setPosterLoadedUrl(loadedPosterUrls.has(resolved)?resolved:null);} }).catch(() => {});
    return () => { active = false; };
  }, [item.id,item.type,item.poster,item.rawPoster,shouldResolve,posterResolveKey,screen,landscape]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (!hover) return; const close = () => setHover(false); window.addEventListener('scroll',close,true); return () => window.removeEventListener('scroll',close,true); }, [hover]);
  const open = onClick ?? (() => navigate(`/details/${encodeURIComponent(item.type)}/${encodeURIComponent(item.id)}`));
  const openActions = () => {
    setSourceRect(rectOf(button.current));
    setMenu(true);
    setHover(false);
  };
  const showPreview = () => {
    if (!cardStyle?.hoverPreviewEnabled || !window.matchMedia('(hover:hover)').matches) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setRect(button.current?.getBoundingClientRect() ?? null);
      setHover(true);
      // Rapid hover across cards: the newly opened preview wins, any other
      // card's preview closes instead of overlapping it.
      window.dispatchEvent(new CustomEvent('nuvio:preview-open', { detail: `${item.type}:${item.id}` }));
    }, cardStyle.hoverPreviewOpenDelayMillis);
  };
  const hidePreview = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setHover(false), HOVER_PREVIEW_CLOSE_DELAY_MS); };
  useEffect(() => {
    const key = `${item.type}:${item.id}`;
    const closeOthers = (event: Event) => { if ((event as CustomEvent<string>).detail !== key) { clearTimeout(timer.current); setHover(false); } };
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { clearTimeout(timer.current); setHover(false); } };
    window.addEventListener('nuvio:preview-open', closeOthers);
    window.addEventListener('keydown', onEscape);
    return () => { window.removeEventListener('nuvio:preview-open', closeOthers); window.removeEventListener('keydown', onEscape); };
  }, [item.type, item.id]);
  const markWatched = async () => { try { const result = await call<{watched:boolean}>('details.watched.toggle', {id:item.id,type:item.type,name:item.name,poster:item.poster,background:item.background,logo:item.logo}); setWatched(result.watched); setError('');void refreshFeature('homeWatched','details.watched.snapshot');setMenu(false); } catch(cause){setError(cause instanceof Error?cause.message:String(cause));} };
  const toggleSaved=async()=>{try{const operation=()=>saved?actions.removeFromLibrary(item.type,item.id):actions.addToLibrary(item.type,item.id);if(saved&&onRemoveAction){setMenu(false);onRemoveAction(item,operation);}else{await operation();setMenu(false);}}catch(cause){setError(String(cause));}};
  const hold=useCardHold(()=>{clearTimeout(timer.current);openActions();});
  const metrics = posterMetrics(cardStyle);
  const depthOn = depthActive(appearance?.cardDepth, 'posters');
  const style = { '--poster-width': `${metrics.width}px`, '--poster-radius': `${metrics.radius}px`, '--poster-ratio': metrics.ratio, ...(depthOn ? depthVars(appearance?.cardDepth) : null) } as CSSProperties;
  return <div className={`poster-item ${landscape?'landscape':''} ${menu&&homeStyleActions?'action-anchor-hidden':''} ${depthOn?'has-card-depth':''}`} style={style} data-source-key={homeStyleActions ? sourceKey : undefined}>
    <button {...hold} ref={button} className={`media-card ${compact?'compact':''}`} onClick={open} onContextMenu={event=>{event.preventDefault();openActions();}} onMouseEnter={showPreview} onMouseLeave={hidePreview} aria-label={`Open ${item.name}`}>
      <span className={`poster-frame ${depthOn?'depth-frame':''}`}>{(watched || isWatchedOnCard) && <span className="home-watched-badge" aria-label="Watched"><Check size={14}/></span>}{poster && <><PosterLoadingCard variant="poster" className="poster-art-loading"/><img className={posterLoaded ? 'poster-image-loaded' : 'poster-image-loading'} src={poster} alt="" loading="lazy" onLoad={event=>{const loaded=normalizePosterUrl(event.currentTarget.currentSrc||event.currentTarget.src);if(loaded===normalizedPoster){rememberPoster(loaded);setPosterLoadedUrl(loaded);}}} onError={event=>{const failed=normalizePosterUrl(event.currentTarget.currentSrc||event.currentTarget.src);if(failed===normalizedPoster){forgetPoster(failed);setPosterLoadedUrl(null);if(fallbackPoster&&normalizePosterUrl(fallbackPoster)!==failed){resolvedPosterUrls.delete(posterResolveKey);setPoster(fallbackPoster);}}}}/></>}{!poster && <PosterLoadingCard variant="poster" className="poster-art-loading"/>}{showRating && item.rating&&<span className="rating-chip">{item.rating}</span>}{landscape && cardStyle?.alwaysShowLandscapeClearlogo && item.logo && <img className="poster-clearlogo" src={item.logo} alt=""/>}</span>
      {!cardStyle?.hideLabelsEnabled && <><span className="card-title">{item.name}</span><span className="card-meta">{item.releaseInfo??item.type}</span></>}
    </button>
    {screen !== 'search' && <button className="poster-menu-button" aria-label={`Actions for ${item.name}`} onClick={openActions}><MoreHorizontal size={18}/></button>}
    {rect&&<PosterHoverPreview visible={hover} item={item} rect={rect} saved={saved} watched={watched||isWatchedOnCard} trailer={appearance?.trailerPlaybackMode === 'in_app' && cardStyle?.hoverPreviewTrailerEnabled ? { enabled: true, soundEnabled: cardStyle.hoverPreviewTrailerSoundEnabled, startSeconds: cardStyle.hoverPreviewTrailerStartSeconds } : null} onOpen={open} onToggleWatched={()=>void markWatched()} onToggleSaved={()=>void toggleSaved()} onMouseEnter={()=>clearTimeout(timer.current)} onMouseLeave={hidePreview} />}
    {menu&&homeStyleActions&&<HomeActionDialog title={item.name} poster={poster} subtitle={item.releaseInfo??undefined} sourceKey={sourceKey} sourceRect={sourceRect} onClose={()=>setMenu(false)}>{error&&<p role="alert">{error}</p>}<button className={saved?'destructive':''} onClick={()=>{setMenu(false);void toggleSaved();}}><span>{saved?'Remove from library':'Add to library'}</span>{saved?<Trash2 size={19}/>:<Plus size={19}/>}</button><button className={watched || isWatchedOnCard ? 'active' : undefined} onClick={()=>{setMenu(false);void markWatched();}}><span>{watched||isWatchedOnCard?'Mark as unwatched':'Mark as watched'}</span><CircleCheck size={19}/></button></HomeActionDialog>}
    {menu && !homeStyleActions && <Dialog label={`Actions for ${item.name}`} onClose={()=>setMenu(false)}><h2>{item.name}</h2>{error&&<p role="alert" className="form-error">{error}</p>}<div className="poster-dialog-actions"><button className="button primary" onClick={()=>{setMenu(false);open();}}>View details</button><ListMembershipButton type={item.type} id={item.id} name={item.name}/><button className="button secondary" onClick={()=>{setMenu(false);void markWatched();}}><Check size={17}/>{watched?'Watched state updated':'Toggle watched'}</button><button className="button secondary" onClick={()=>setMenu(false)}>Close</button></div></Dialog>}
  </div>;
})
