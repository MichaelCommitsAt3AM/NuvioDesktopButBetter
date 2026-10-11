import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, Film, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Media } from '../generated/contract';
import { actions, call, refreshFeature, useFeatureSnapshot, useSelector } from '../bridge';
import type { AppearanceSnapshot } from '../features/settings/appearanceStore';
import { ListMembershipButton } from '../features/library/ListMembershipButton';
import { Dialog } from './Dialog';
import { HomeActionDialog } from '../features/home/HomeActionDialog';
import { PosterHoverPreview } from './PosterHoverPreview';
import './poster.css';
import { useCardHold } from './useCardHold';

export function Poster({ item, compact = false, onClick, sizeScale = 1, showRating = true, fixedDisplaySize = false }: { item: Media; compact?: boolean; onClick?: () => void; sizeScale?: number; showRating?: boolean; fixedDisplaySize?: boolean }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const appearance = useFeatureSnapshot<AppearanceSnapshot>('appearance');
  const homeWatched = useFeatureSnapshot<{watchedKeys:string[]}>('homeWatched');
  const library=useSelector(current=>current.library);
  const saved=library.items.some(row=>row.id===item.id&&row.type===item.type);
  const cardStyle = appearance?.cardStyle;
  const [poster, setPoster] = useState(item.poster);
  const [hover, setHover] = useState(false);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState('');
  const [watched, setWatched] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const screen = pathname.startsWith('/library') ? 'library' : pathname.startsWith('/details') ? 'details' : pathname.startsWith('/search') || pathname.startsWith('/catalog') ? 'search' : pathname.startsWith('/collections') ? 'collections' : 'home';
  const expandedPreview = screen === 'home' || screen === 'search' || screen === 'library';
  const isWatchedOnCard = (screen === 'home' || screen === 'library') && (homeWatched?.watchedKeys.includes(`${item.type}:${item.id}:-1:-1`) ?? false);
  const pattern = appearance?.posters.pattern;
  const activeScreens = appearance?.posters.activeScreens;
  const landscape = cardStyle?.catalogLandscapeModeEnabled ?? false;
  useEffect(() => {
    let active = true; setPoster(item.poster);
    if (pattern && activeScreens?.includes(screen)) void call<{url:string|null}>('posters.resolve', {id:item.id,type:item.type,screen,shape:landscape?'landscape':'poster'}).then(result => { if(active && result.url)setPoster(result.url); }).catch(() => {});
    return () => { active = false; };
  }, [item.id,item.type,item.poster,pattern,screen,activeScreens,landscape]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { const close = () => setHover(false); window.addEventListener('scroll',close,true); return () => window.removeEventListener('scroll',close,true); }, []);
  const open = onClick ?? (() => navigate(`/details/${encodeURIComponent(item.type)}/${encodeURIComponent(item.id)}`));
  const showPreview = () => {
    if (!cardStyle?.hoverPreviewEnabled || !window.matchMedia('(hover:hover)').matches) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setRect(button.current?.getBoundingClientRect() ?? null); setHover(true); }, cardStyle.hoverPreviewOpenDelayMillis);
  };
  const hidePreview = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setHover(false),180); };
  const markWatched = async () => { try { const result = await call<{watched:boolean}>('details.watched.toggle', {id:item.id,type:item.type,name:item.name,poster:item.poster,background:item.background,logo:item.logo}); setWatched(result.watched); setError('');void refreshFeature('homeWatched','details.watched.snapshot');setMenu(false); } catch(cause){setError(cause instanceof Error?cause.message:String(cause));} };
  const toggleSaved=async()=>{try{await(saved?actions.removeFromLibrary(item.type,item.id):actions.addToLibrary(item.type,item.id));setMenu(false);}catch(cause){setError(String(cause));}};
  const hold=useCardHold(()=>{clearTimeout(timer.current);setMenu(true);setHover(false);});
  const posterWidth = (cardStyle?.widthDp ?? 126) * 1.4;
  const posterRadius = cardStyle?.cornerRadiusDp ?? 12;
  const style = { '--poster-width': fixedDisplaySize ? `calc(${posterWidth}px / var(--content-scale,1.22))` : `calc(${posterWidth}px * var(--ui-scale,1) * ${sizeScale})`, '--poster-radius': fixedDisplaySize ? `calc(${posterRadius}px / var(--content-scale,1.22))` : `calc(${posterRadius}px * var(--ui-scale,1))`, '--poster-ratio': landscape ? '16/9' : `${cardStyle?.widthDp ?? 126}/${cardStyle?.heightDp ?? 189}` } as CSSProperties;
  return <div className={`poster-item ${landscape?'landscape':''} ${appearance?.cardDepth.enabled && appearance.cardDepth.postersEnabled?'card-depth':''}`} style={style}>
    <button {...hold} ref={button} className={`media-card ${compact?'compact':''}`} onClick={open} onContextMenu={event=>{event.preventDefault();setMenu(true);setHover(false);}} onMouseEnter={showPreview} onMouseLeave={hidePreview} aria-label={`Open ${item.name}`}>
      <span className="poster-frame">{(watched || isWatchedOnCard) && <span className="home-watched-badge" aria-label="Watched"><Check size={14}/></span>}{poster?<img src={poster} alt="" loading="lazy" onError={()=>{if(poster!==item.poster)setPoster(item.poster);}}/>:<span className="poster-fallback"><Film size={25}/><span>{item.name}</span></span>}{showRating && item.rating&&<span className="rating-chip">{item.rating}</span>}{landscape && cardStyle?.alwaysShowLandscapeClearlogo && item.logo && <img className="poster-clearlogo" src={item.logo} alt=""/>}</span>
      {!cardStyle?.hideLabelsEnabled && <><span className="card-title">{item.name}</span><span className="card-meta">{item.releaseInfo??item.type}</span></>}
    </button>
    {screen !== 'search' && <button className="poster-menu-button" aria-label={`Actions for ${item.name}`} onClick={()=>{setMenu(true);setHover(false);}}><MoreHorizontal size={18}/></button>}
    {hover&&rect&&expandedPreview&&<PosterHoverPreview item={item} rect={rect} saved={saved} watched={watched||isWatchedOnCard} onOpen={open} onToggleWatched={()=>void markWatched()} onToggleSaved={()=>void toggleSaved()} onMouseEnter={()=>clearTimeout(timer.current)} onMouseLeave={hidePreview} />}
    {hover&&rect&&!expandedPreview&&createPortal(<div className="poster-preview" style={{left:Math.max(12,Math.min(rect.left-40,window.innerWidth-372)),top:Math.max(12,Math.min(rect.top,window.innerHeight-380))}} onMouseEnter={()=>clearTimeout(timer.current)} onMouseLeave={hidePreview} onClick={event=>event.stopPropagation()}>
      {item.background&&<img src={item.background} alt=""/>}
      <div className="poster-preview-copy"><h3>{item.name}</h3><p>{[item.releaseInfo,item.rating,...item.genres.slice(0,3)].filter(Boolean).join(' · ')}</p>{item.description&&<p className="home-preview-description">{item.description.slice(0,360)}</p>}<div className="home-preview-actions"><button className="button primary" onClick={open}>More info</button><button className="button secondary" onClick={()=>{setMenu(true);setHover(false);}}>Manage title</button></div></div>
    </div>,document.body)}
    {menu&&screen==='home'&&<HomeActionDialog title={item.name} poster={poster} subtitle={item.releaseInfo??undefined} onClose={()=>setMenu(false)}>{error&&<p role="alert">{error}</p>}<button className={saved?'destructive':''} onClick={()=>void toggleSaved()}><span>{saved?'Remove from library':'Add to library'}</span>{saved?<Trash2 size={19}/>:<Plus size={19}/>}</button><button onClick={()=>void markWatched()}><span>{watched||isWatchedOnCard?'Mark as unwatched':'Mark as watched'}</span><Check size={19}/></button></HomeActionDialog>}
    {menu && screen!=='home' && <Dialog label={`Actions for ${item.name}`} onClose={()=>setMenu(false)}><h2>{item.name}</h2>{error&&<p role="alert" className="form-error">{error}</p>}<div className="poster-dialog-actions"><button className="button primary" onClick={()=>{setMenu(false);open();}}>View details</button><ListMembershipButton type={item.type} id={item.id} name={item.name}/><button className="button secondary" onClick={()=>void markWatched()}><Check size={17}/>{watched?'Watched state updated':'Toggle watched'}</button><button className="button secondary" onClick={()=>setMenu(false)}>Close</button></div></Dialog>}
  </div>;
}
