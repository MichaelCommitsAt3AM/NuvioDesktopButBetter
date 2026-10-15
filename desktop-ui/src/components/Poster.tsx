import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, CircleCheck, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Media } from '../generated/contract';
import { actions, call, refreshFeature, useFeatureSnapshot, useSelector } from '../bridge';
import type { AppearanceSnapshot } from '../features/settings/appearanceStore';
import { ListMembershipButton } from '../features/library/ListMembershipButton';
import { Dialog } from './Dialog';
import { HomeActionDialog } from '../features/home/HomeActionDialog';
import { PosterHoverPreview } from './PosterHoverPreview';
import { PosterLoadingCard } from './PosterLoadingCard';
import './poster.css';
import './uniformPosters.css';
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
export const Poster = memo(function Poster({ item, compact = false, onClick, showRating = true }: { item: Media; compact?: boolean; onClick?: () => void; showRating?: boolean }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const appearance = useFeatureSnapshot<AppearanceSnapshot>('appearance');
  const homeWatched = useFeatureSnapshot<{watchedKeys:string[]}>('homeWatched');
  const saved=useSelector(current=>current.library.items.some(row=>row.id===item.id&&row.type===item.type));
  const cardStyle = appearance?.cardStyle;
  const screen = pathname.startsWith('/library') ? 'library' : pathname.startsWith('/details') ? 'details' : pathname.startsWith('/search') || pathname.startsWith('/catalog') ? 'search' : pathname.startsWith('/collections') ? 'collections' : 'home';
  const pattern = appearance?.posters.pattern;
  const activeScreens = appearance?.posters.activeScreens;
  const landscape = cardStyle?.catalogLandscapeModeEnabled ?? false;
  const shouldResolve = !!pattern && !!activeScreens?.includes(screen);
  const posterResolveKey = `${screen}:${item.type}:${item.id}:${landscape ? 'landscape' : 'poster'}:${pattern ?? ''}`;
  const initialPoster = (shouldResolve ? resolvedPosterUrls.get(posterResolveKey) : undefined) ?? item.poster;
  const [poster, setPoster] = useState(initialPoster);
  const [posterLoadedUrl, setPosterLoadedUrl] = useState<string | null>(() => initialPoster && loadedPosterUrls.has(normalizePosterUrl(initialPoster)) ? normalizePosterUrl(initialPoster) : null);
  const [hover, setHover] = useState(false);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState('');
  const [watched, setWatched] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isWatchedOnCard = (screen === 'home' || screen === 'library') && (homeWatched?.watchedKeys?.includes(`${item.type}:${item.id}:-1:-1`) ?? false);
  const normalizedPoster = poster ? normalizePosterUrl(poster) : null;
  const posterLoaded = normalizedPoster !== null && posterLoadedUrl === normalizedPoster;
  useEffect(() => {
    let active = true;
    const initialPoster = (shouldResolve ? resolvedPosterUrls.get(posterResolveKey) : undefined) ?? item.poster;
    setPoster(initialPoster);
    setPosterLoadedUrl(initialPoster && loadedPosterUrls.has(normalizePosterUrl(initialPoster)) ? normalizePosterUrl(initialPoster) : null);
    if (shouldResolve) void call<{url:string|null}>('posters.resolve', {id:item.id,type:item.type,screen,shape:landscape?'landscape':'poster'}).then(result => { if(active && result.url){rememberResolvedPoster(posterResolveKey,result.url);const resolved=normalizePosterUrl(result.url);setPoster(result.url);setPosterLoadedUrl(loadedPosterUrls.has(resolved)?resolved:null);} }).catch(() => {});
    return () => { active = false; };
  }, [item.id,item.type,item.poster,shouldResolve,posterResolveKey,screen,landscape]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (!hover) return; const close = () => setHover(false); window.addEventListener('scroll',close,true); return () => window.removeEventListener('scroll',close,true); }, [hover]);
  const open = onClick ?? (() => navigate(`/details/${encodeURIComponent(item.type)}/${encodeURIComponent(item.id)}`));
  const openActions = () => {
    setMenu(true);
    setHover(false);
  };
  const showPreview = () => {
    if (!cardStyle?.hoverPreviewEnabled || !window.matchMedia('(hover:hover)').matches) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setRect(button.current?.getBoundingClientRect() ?? null); setHover(true); }, cardStyle.hoverPreviewOpenDelayMillis);
  };
  const hidePreview = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setHover(false),180); };
  const markWatched = async () => { try { const result = await call<{watched:boolean}>('details.watched.toggle', {id:item.id,type:item.type,name:item.name,poster:item.poster,background:item.background,logo:item.logo}); setWatched(result.watched); setError('');void refreshFeature('homeWatched','details.watched.snapshot');setMenu(false); } catch(cause){setError(cause instanceof Error?cause.message:String(cause));} };
  const toggleSaved=async()=>{try{await(saved?actions.removeFromLibrary(item.type,item.id):actions.addToLibrary(item.type,item.id));setMenu(false);}catch(cause){setError(String(cause));}};
  const hold=useCardHold(()=>{clearTimeout(timer.current);openActions();});
  const metrics = posterMetrics(cardStyle);
  const style = { '--poster-width': `${metrics.width}px`, '--poster-radius': `${metrics.radius}px`, '--poster-ratio': metrics.ratio } as CSSProperties;
  return <div className={`poster-item ${landscape?'landscape':''} ${menu&&screen==='home'?'action-anchor-hidden':''} ${appearance?.cardDepth.enabled && appearance.cardDepth.postersEnabled?'card-depth':''}`} style={style}>
    <button {...hold} ref={button} className={`media-card ${compact?'compact':''}`} onClick={open} onContextMenu={event=>{event.preventDefault();openActions();}} onMouseEnter={showPreview} onMouseLeave={hidePreview} aria-label={`Open ${item.name}`}>
      <span className="poster-frame">{(watched || isWatchedOnCard) && <span className="home-watched-badge" aria-label="Watched"><Check size={14}/></span>}{poster && <><PosterLoadingCard variant="poster" className="poster-art-loading"/><img className={posterLoaded ? 'poster-image-loaded' : 'poster-image-loading'} src={poster} alt="" loading="lazy" onLoad={event=>{const loaded=normalizePosterUrl(event.currentTarget.currentSrc||event.currentTarget.src);if(loaded===normalizedPoster){rememberPoster(loaded);setPosterLoadedUrl(loaded);}}} onError={event=>{const failed=normalizePosterUrl(event.currentTarget.currentSrc||event.currentTarget.src);if(failed===normalizedPoster){forgetPoster(failed);setPosterLoadedUrl(null);}}}/></>}{!poster && <PosterLoadingCard variant="poster" className="poster-art-loading"/>}{showRating && item.rating&&<span className="rating-chip">{item.rating}</span>}{landscape && cardStyle?.alwaysShowLandscapeClearlogo && item.logo && <img className="poster-clearlogo" src={item.logo} alt=""/>}</span>
      {!cardStyle?.hideLabelsEnabled && <><span className="card-title">{item.name}</span><span className="card-meta">{item.releaseInfo??item.type}</span></>}
    </button>
    {screen !== 'search' && <button className="poster-menu-button" aria-label={`Actions for ${item.name}`} onClick={openActions}><MoreHorizontal size={18}/></button>}
    {rect&&<PosterHoverPreview visible={hover} item={item} rect={rect} saved={saved} watched={watched||isWatchedOnCard} onOpen={open} onToggleWatched={()=>void markWatched()} onToggleSaved={()=>void toggleSaved()} onMouseEnter={()=>clearTimeout(timer.current)} onMouseLeave={hidePreview} />}
    {menu&&screen==='home'&&<HomeActionDialog title={item.name} poster={poster} subtitle={item.releaseInfo??undefined} onClose={()=>setMenu(false)}>{error&&<p role="alert">{error}</p>}<button className={saved?'destructive':''} onClick={()=>{setMenu(false);void toggleSaved();}}><span>{saved?'Remove from library':'Add to library'}</span>{saved?<Trash2 size={19}/>:<Plus size={19}/>}</button><button className={watched || isWatchedOnCard ? 'active' : undefined} onClick={()=>{setMenu(false);void markWatched();}}><span>{watched||isWatchedOnCard?'Mark as unwatched':'Mark as watched'}</span><CircleCheck size={19}/></button></HomeActionDialog>}
    {menu && screen!=='home' && <Dialog label={`Actions for ${item.name}`} onClose={()=>setMenu(false)}><h2>{item.name}</h2>{error&&<p role="alert" className="form-error">{error}</p>}<div className="poster-dialog-actions"><button className="button primary" onClick={()=>{setMenu(false);open();}}>View details</button><ListMembershipButton type={item.type} id={item.id} name={item.name}/><button className="button secondary" onClick={()=>{setMenu(false);void markWatched();}}><Check size={17}/>{watched?'Watched state updated':'Toggle watched'}</button><button className="button secondary" onClick={()=>setMenu(false)}>Close</button></div></Dialog>}
  </div>;
})
