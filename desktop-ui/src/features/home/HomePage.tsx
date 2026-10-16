import { useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Compass, Maximize, MoreHorizontal, RotateCcw, Trash2, Info, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { actions, call, refreshFeature, useFeatureSnapshot, useSelector } from '../../bridge';
import { EmptyState } from '../../components/EmptyState';
import { InlineError } from '../../components/Status';
import { HorizontalRail } from '../../components/HorizontalRail';
import { HomeCollections } from '../collections/CollectionsPages';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { AppearanceSnapshot } from '../settings/appearanceStore';
import { HomeActionDialog } from './HomeActionDialog';
import { useCardHold } from '../../components/useCardHold';
import { PosterLoadingCard } from '../../components/PosterLoadingCard';
import { HomeVisibility } from './homeVisibility';
import { HeroBackdrop } from './HeroBackdrop';
import { HeroTitle } from './HeroTitle';
import '../../theme/cardDepth.css';
import { depthActive, depthVars } from '../../theme/cardDepth';
import { rectOf, type SourceRect } from '../../components/sourceLift';
import { useDisintegratingRemoval } from '../../components/disintegration';
import { usePlacementFlip } from '../../components/placementFlip';
import '../../components/disintegration.css';
import './home.css';
import './homeParity.css';

type HomeExtras = {
  loading: boolean;
  source: string;
  continueWatching: ContinueItem[];
  upcoming: ContinueItem[];
  preferences: {
    isVisible: boolean; style: string; upNextFromFurthestEpisode: boolean;
    useEpisodeThumbnails: boolean; showUnairedNextUp: boolean; blurNextUp: boolean;
    showResumePromptOnLaunch: boolean; sortMode: string;
  };
};
type ContinueItem = {
  parentMetaId: string; parentMetaType: string; videoId: string; title: string; subtitle: string;
  imageUrl?: string | null; poster?: string | null; background?: string | null; logo?: string | null;
  seasonNumber?: number | null; episodeNumber?: number | null; episodeTitle?: string | null;
  episodeThumbnail?: string | null; pauseDescription?: string | null; isNextUp?: boolean;
  nextUpSeedSeasonNumber?: number | null; nextUpSeedEpisodeNumber?: number | null;
  resumePositionMs: number; durationMs: number; progressFraction: number; progressPercent?: number;
  released?: string | null; lastUpdatedEpochMs?: number; providerName?: string | null;
};

const homeViewPositions=new Map<string,{scrollTop:number;heroIndex:number}>();
const consumedHomeScrollResets=new Set<string>();
// Mirrors HOME_HERO_ITEM_LIMIT in HomeRepository.
const MAX_HERO_ITEMS = 8;
// The backend can emit a settled-but-empty home snapshot before catalogs
// resolve. Hold the empty state back briefly so a slow first snapshot never
// flashes "install an addon" at users who already have addons.
const HOME_EMPTY_STATE_GRACE_MS = 600;

function useConfirmedHomeEmpty(isEmpty: boolean): boolean {
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (!isEmpty) { setConfirmed(false); return; }
    const timer = window.setTimeout(() => setConfirmed(true), HOME_EMPTY_STATE_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [isEmpty]);
  return confirmed;
}

export function HomePage() {
  const visible = useContext(HomeVisibility);
  const home = useSelector((current) => current.home);
  const location = useLocation();
  const navigate = useNavigate();
  const appearance = useFeatureSnapshot<AppearanceSnapshot>('appearance');
  const profileId = useSelector((current) => current.session.activeProfile);
  const extras = useFeatureSnapshot<HomeExtras>('homeExtras');
  // Kotlin owns source selection, release filtering and collection fallback.
  // An empty hero is intentional; shelves may belong to unselected catalogs.
  const heroItems = (home.hero ?? []).slice(0, MAX_HERO_ITEMS);
  const viewKey=String(profileId??'default');
  const [heroIndex, setHeroIndex] = useState(()=>homeViewPositions.get(viewKey)?.heroIndex??0);
  const heroIndexRef=useRef(heroIndex);heroIndexRef.current=heroIndex;
  const resetHomeScroll=(location.state as {resetHomeScroll?:boolean}|null)?.resetHomeScroll===true&&!consumedHomeScrollResets.has(location.key);
  useLayoutEffect(() => {
    if (!visible) return;
    const main = document.querySelector<HTMLElement>('.main-area');
    if (!main) return;
    if (resetHomeScroll) consumedHomeScrollResets.add(location.key);
    main.scrollTop = resetHomeScroll ? 0 : homeViewPositions.get(viewKey)?.scrollTop ?? 0;
    // Save on scroll, before a route can hide Home and clamp the shared viewport.
    const save = () => homeViewPositions.set(viewKey, { scrollTop: main.scrollTop, heroIndex: heroIndexRef.current });
    main.addEventListener('scroll', save, { passive: true });
    return () => { main.removeEventListener('scroll', save); };
  }, [visible, viewKey, resetHomeScroll, location.key]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [extrasSnapshotState, setExtrasSnapshotState] = useState<{ profileId: number | null; settled: boolean }>({ profileId: null, settled: false });
  const generation = useRef(0);
  const swipeStart = useRef<number | null>(null);
  const heroDrag = useRef<{ startX: number; dx: number; dragging: boolean; startT: number; lastX: number; lastT: number } | null>(null);
  const heroBgRef = useRef<HTMLDivElement>(null);
  const heroCopyRef = useRef<HTMLDivElement>(null);
  const heroSuppressedClick = useRef(false);
  const applyHeroDrag = (dx: number, settling: boolean) => {
    for (const node of [heroBgRef.current, heroCopyRef.current]) {
      if (!node) continue;
      node.style.transition = settling ? 'transform 220ms cubic-bezier(0.2, 0, 0, 1)' : 'none';
      node.style.transform = dx === 0 ? '' : `translateX(${dx}px)`;
    }
  };
  const hero = heroItems.length ? heroItems[heroIndex % heroItems.length] : undefined;
  const preferences = extras?.preferences;
  const heroElement=useRef<HTMLElement>(null);
  const [heroActive,setHeroActive]=useState(true);
  const [heroDragging,setHeroDragging]=useState(false);
  const [viewport,setViewport]=useState({width:window.innerWidth,height:window.innerHeight});
  useEffect(()=>{const resize=()=>setViewport({width:window.innerWidth,height:window.innerHeight});window.addEventListener('resize',resize);return ()=>window.removeEventListener('resize',resize);},[]);
  useEffect(()=>{const element=heroElement.current;if(!element||typeof IntersectionObserver==='undefined')return;const observer=new IntersectionObserver(([entry])=>setHeroActive(entry.isIntersecting));observer.observe(element);return ()=>observer.disconnect();},[heroItems.length]);
  useEffect(()=>{if(!visible||!heroActive||heroDragging||heroItems.length<2)return;if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;const timer=setTimeout(()=>{if(document.visibilityState==='visible')setHeroIndex(index=>(index+1)%heroItems.length);},8000);return ()=>clearTimeout(timer);},[visible,heroIndex,heroItems.length,heroActive,heroDragging]);
  // Keep the starting item stable when catalogs update underneath the pager.
  useEffect(()=>{setHeroIndex(current=>heroItems.length?current%heroItems.length:0);},[heroItems.length]);
  // Decode the current and adjacent artwork deliberately: the pager never
  // shows a blank frame, without eagerly loading the whole catalog.
  useEffect(()=>{
    if(!heroItems.length)return;
    for(const offset of [0,1,heroItems.length-1]){
      const item=heroItems[(heroIndex+offset+heroItems.length)%heroItems.length];
      for(const url of [item.background,item.logo]){
        if(!url)continue;
        const probe=new Image();
        probe.decoding='async';
        probe.src=url;
      }
    }
  },[heroIndex,heroItems.length]);
  useEffect(() => { const position = homeViewPositions.get(viewKey); homeViewPositions.set(viewKey, { scrollTop: position?.scrollTop ?? 0, heroIndex }); }, [viewKey, heroIndex]);
  const unit=1.08,widthDp=viewport.width/unit,heightDp=viewport.height/unit;
  const wideProgress=Math.max(0,Math.min(1,(widthDp/heightDp-16/9)/(32/9-16/9)));
  const baseline=Math.max(460,Math.min(640,widthDp*.56));
  const gutter=(widthDp>=1440?32:widthDp>=1024?28:widthDp>=768?24:16)*unit;
  const heroStyle={'--home-hero-height':`${(baseline+(Math.max(baseline,heightDp)-baseline)*wideProgress)*unit}px`,'--home-hero-inset':`${gutter+(120*unit-gutter)*wideProgress}px`,'--home-hero-bottom':`${(40+152*wideProgress)*unit}px`,'--home-poster-width':`${Math.round((appearance?.cardStyle.widthDp??126)*1.4)*unit}px`,'--home-cw-width':`${Math.round((appearance?.cardStyle.widthDp??126)*1.4)*180/110*1.2*unit}px`,'--page-gutter':`${gutter}px`} as CSSProperties;

  useEffect(() => {
    const current = ++generation.current;
    setExtrasSnapshotState({ profileId, settled: false });
    // Render the locally available progress entries immediately. Resolving
    // Next Up requires remote metadata and can take much longer, so enrich in
    // the background after the initial Continue Watching snapshot is applied.
    void refreshFeature<HomeExtras>('homeExtras', 'home.extras.snapshot')
      .then(() => {
        if (generation.current === current) setExtrasSnapshotState({ profileId, settled: true });
        if (generation.current === current) return refreshFeature<HomeExtras>('homeExtras', 'home.extras.refresh');
        return undefined;
      })
      .catch(() => { if (generation.current === current) setExtrasSnapshotState({ profileId, settled: true }); });
    void refreshFeature('homeWatched', 'details.watched.snapshot').catch(() => {});
    return () => { if (generation.current === current) generation.current++; };
  }, [profileId]);
  useEffect(() => { setHeroIndex(homeViewPositions.get(viewKey)?.heroIndex??0); }, [viewKey]);

  const moveHero = (direction: number) => setHeroIndex((current) => (current + direction + heroItems.length) % heroItems.length);
  const openTitle = (type: string, id: string) => navigate(`/details/${encodeURIComponent(type)}/${encodeURIComponent(id)}`);
  const playbackRoute = (item: ContinueItem, mode: 'resume' | 'manual' | 'beginning') => {
    const path = `/details/${encodeURIComponent(item.parentMetaType)}/${encodeURIComponent(item.parentMetaId)}/streams/${encodeURIComponent(item.videoId)}`;
    const query = new URLSearchParams();
    if (mode === 'manual') query.set('manual', '1');
    if (mode === 'beginning') query.set('fromStart', '1');
    else if (item.resumePositionMs > 0) query.set('resumeMs', String(item.resumePositionMs));
    for (const [key, value] of Object.entries({
      title: item.title, poster: item.poster, background: item.background, logo: item.logo,
      episodeTitle: item.episodeTitle, episodeThumbnail: item.episodeThumbnail,
      seasonNumber: item.seasonNumber, episodeNumber: item.episodeNumber,
    })) if (value != null && value !== '') query.set(key, String(value));
    return `${path}?${query.toString()}`;
  };
  const resume = (item: ContinueItem) => navigate(playbackRoute(item, 'resume'));
  const playManually = (item: ContinueItem) => navigate(playbackRoute(item, 'manual'));
  const runAction = async (key: string, method: string, params: Record<string, unknown>) => {
    const ticket = generation.current;
    setActionError(null); setBusyKey(key);
    try {
      await call(method, params);
      if (ticket === generation.current) await refreshFeature<HomeExtras>('homeExtras', 'home.extras.snapshot');
    } catch (error) {
      if (ticket === generation.current) setActionError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally { if (ticket === generation.current) setBusyKey(null); }
  };
  const inProgress: ContinueItem[] = extras?.continueWatching ?? home.continueWatching?.map((item): ContinueItem => ({
    parentMetaId: item.id, parentMetaType: item.type, videoId: item.id, title: item.name, subtitle: '',
    imageUrl: item.background ?? item.poster, poster: item.poster, background: item.background,
    resumePositionMs: 0, durationMs: 0, progressFraction: 0,
  })) ?? [];
  const seen=new Set<string>();
  const candidates=[...inProgress,...(extras?.upcoming??[])].sort((a,b)=>(b.lastUpdatedEpochMs??0)-(a.lastUpdatedEpochMs??0)||Number(!b.isNextUp)-Number(!a.isNextUp)).filter(item=>{if(seen.has(item.parentMetaId))return false;seen.add(item.parentMetaId);return true;});
  const isUpcoming=(item:ContinueItem)=>preferences?.sortMode.toLowerCase()==='split_upcoming' && !!item.released && new Date(item.released).getTime()>Date.now();
  const continueItems=candidates.filter(item=>!isUpcoming(item));
  if(preferences?.sortMode.toLowerCase()==='streaming_style')continueItems.sort((a,b)=>{const future=(item:ContinueItem)=>!!item.isNextUp&&!!item.released&&new Date(item.released).getTime()>Date.now();return Number(future(a))-Number(future(b))||(future(a)&&future(b)?(a.released??'').localeCompare(b.released??''):0);});
  const upcoming=candidates.filter(isUpcoming).sort((a,b)=>(a.released??'').localeCompare(b.released??''));
  // Once the local snapshot settles, remote sync and Next Up enrichment must
  // not hide saved progress behind an indefinite loading state.
  const continueWatchingLoading = !extrasSnapshotState.settled || extrasSnapshotState.profileId !== profileId;
  const continueWatchingVisible = preferences?.isVisible ?? true;
  const homeEmpty = !home.loading && !home.error && !home.shelves.length && !hero;
  const showHomeEmpty = useConfirmedHomeEmpty(homeEmpty);
  const cwRemoval = useDisintegratingRemoval(continueItems, (entry) => `${entry.parentMetaId}:${entry.videoId}`, profileId);
  const upcomingRemoval = useDisintegratingRemoval(upcoming, (entry) => `${entry.parentMetaId}:next:${entry.videoId}`, profileId);
  const cwRailRef = useRef<HTMLDivElement>(null);
  const upcomingRailRef = useRef<HTMLDivElement>(null);
  usePlacementFlip(cwRailRef);
  usePlacementFlip(upcomingRailRef);

  return <div className="home-page" style={heroStyle}>
    {hero && appearance?.home.heroEnabled!==false && <section ref={heroElement} className="home-hero" tabIndex={0} aria-label="Featured titles" aria-roledescription="carousel" onKeyDown={event=>{if(event.key==='ArrowRight'){event.preventDefault();moveHero(1);}if(event.key==='ArrowLeft'){event.preventDefault();moveHero(-1);}}}
      onClickCapture={event=>{if(heroSuppressedClick.current){heroSuppressedClick.current=false;event.preventDefault();event.stopPropagation();}}}
      onPointerDown={event=>{if(event.button!==0||(event.target as HTMLElement).closest('button'))return;const now=performance.now();heroDrag.current={startX:event.clientX,dx:0,dragging:false,startT:now,lastX:event.clientX,lastT:now};swipeStart.current=event.clientX;setHeroDragging(true);try{event.currentTarget.setPointerCapture(event.pointerId);}catch{/* noop */}}}
      onPointerMove={event=>{const drag=heroDrag.current;if(!drag)return;const now=performance.now();drag.dx=event.clientX-drag.startX;drag.lastX=event.clientX;drag.lastT=now;if(!drag.dragging&&Math.abs(drag.dx)>8)drag.dragging=true;if(drag.dragging)applyHeroDrag(drag.dx,false);}}
      onPointerUp={event=>{const drag=heroDrag.current;heroDrag.current=null;swipeStart.current=null;setHeroDragging(false);if(!drag||!drag.dragging){applyHeroDrag(0,true);return;}const width=event.currentTarget.clientWidth||1;const dt=Math.max(1,performance.now()-drag.lastT);const velocity=(event.clientX-drag.lastX)/dt;const fling=velocity<-0.5?1:velocity>0.5?-1:0;const advance=drag.dx<-Math.max(60,width*0.15)||fling===1?1:drag.dx>Math.max(60,width*0.15)||fling===-1?-1:0;if(advance!==0){heroSuppressedClick.current=true;applyHeroDrag(0,true);moveHero(advance);}else applyHeroDrag(0,true);}}
      onPointerCancel={()=>{heroDrag.current=null;swipeStart.current=null;setHeroDragging(false);applyHeroDrag(0,true);}}>
      <HeroBackdrop key={hero.id} elementRef={heroBgRef} url={hero.background} />
      <div className="home-hero-top-fade"/><div className="home-hero-side-fade"/><div className="home-hero-bottom-fade"/>
      <div key={`copy:${hero.id}`} ref={heroCopyRef} className="home-hero-copy">
        <HeroTitle key={`${hero.type}:${hero.id}`} url={hero.logo} name={hero.name} onOpen={() => openTitle(hero.type,hero.id)} />
        <div className="hero-genres">{hero.genres.slice(0,3).join(' \u2022 ')||hero.type.replace(/^./,letter=>letter.toUpperCase())}</div>
        {hero.description&&<p className="hero-description">{hero.description}</p>}
        <button className="hero-details-button" onClick={()=>openTitle(hero.type,hero.id)}>View Details</button>
      </div>
      <button className="home-fullscreen" aria-label="Toggle fullscreen" onClick={()=>{const window=getCurrentWindow();void window.isFullscreen().then(fullscreen=>window.setFullscreen(!fullscreen)).catch(error=>setActionError(String(error)));}}><Maximize size={24}/></button>
      {heroItems.length>1&&<><button className="home-hero-arrow previous" aria-label="Show previous featured title" onClick={()=>moveHero(-1)}><ChevronLeft size={22}/></button><button className="home-hero-arrow next" aria-label="Show next featured title" onClick={()=>moveHero(1)}><ChevronRight size={22}/></button><div className="home-hero-dots">{heroItems.map((item,index)=><button key={`${item.type}:${item.id}`} aria-label={`Show featured title ${index+1}`} aria-current={index===heroIndex} onClick={()=>setHeroIndex(index)}/>)}</div></>}
    </section>}
    {actionError && <InlineError message={actionError} onRetry={() => setActionError(null)} />}
    {home.error && <InlineError message={home.error} onRetry={() => void actions.homeRefresh()} />}
    {(home.loading || (homeEmpty && !showHomeEmpty)) && !home.shelves.length && <HomeLoadingSkeleton showHero={!hero && appearance?.home.heroEnabled !== false} />}

    {continueWatchingVisible && (continueWatchingLoading || cwRemoval.visible.length > 0) && <section className="home-cw-section" aria-busy={continueWatchingLoading}>
      <div className="home-cw-heading"><h2>Continue Watching</h2></div>
      <HorizontalRail label="Continue Watching" trackRef={cwRailRef} className={`home-cw-rail style-${preferences?.style.toLowerCase() ?? 'wide'}`}>
        {continueWatchingLoading ? Array.from({ length: 5 }, (_, index) => <PosterLoadingCard key={index} variant="poster" className="home-cw-skeleton" />) : cwRemoval.visible.map((item) => <ContinueCard key={`${item.parentMetaId}:${item.videoId}`} item={item} disintegrating={cwRemoval.bursting.has(`${item.parentMetaId}:${item.videoId}`)} blurArtwork={preferences?.blurNextUp&&!!item.isNextUp&&preferences?.useEpisodeThumbnails&&!!item.episodeThumbnail} useEpisodeThumbnails={preferences?.useEpisodeThumbnails ?? true} isBusy={busyKey === item.videoId} onResume={() => resume(item)} onManual={() => playManually(item)} onRemove={() => void cwRemoval.remove(item, () => runAction(item.videoId, item.isNextUp?'home.continueWatching.dismissUpNext':'home.continueWatching.remove', { contentId: item.parentMetaId, seasonNumber: item.isNextUp?item.nextUpSeedSeasonNumber:item.seasonNumber, episodeNumber: item.isNextUp?item.nextUpSeedEpisodeNumber:item.episodeNumber })).catch(() => {})} onDetails={()=>openTitle(item.parentMetaType,item.parentMetaId)} onReset={item.isNextUp?undefined:()=>navigate(playbackRoute(item, 'beginning'))} />)}
      </HorizontalRail>
    </section>}
    {preferences?.isVisible && upcomingRemoval.visible.length > 0 && <section className="home-cw-section"><div className="home-cw-heading"><h2>Upcoming</h2></div>
      <HorizontalRail label="Upcoming" trackRef={upcomingRailRef} className={`home-cw-rail style-${preferences.style.toLowerCase()}`}>{upcomingRemoval.visible.map((item) => <ContinueCard key={`${item.parentMetaId}:next:${item.videoId}`} item={item} disintegrating={upcomingRemoval.bursting.has(`${item.parentMetaId}:next:${item.videoId}`)} blurArtwork={preferences.blurNextUp} useEpisodeThumbnails={preferences.useEpisodeThumbnails} onResume={() => resume(item)} onManual={() => playManually(item)} onDetails={()=>openTitle(item.parentMetaType,item.parentMetaId)} onDismiss={() => void upcomingRemoval.remove(item, () => runAction(`dismiss:${item.parentMetaId}`, 'home.continueWatching.dismissUpNext', { contentId: item.parentMetaId, seasonNumber: item.nextUpSeedSeasonNumber, episodeNumber: item.nextUpSeedEpisodeNumber })).catch(() => {})} />)}</HorizontalRail>
    </section>}
    <HomeCollections shelves={home.shelves} />
    {showHomeEmpty && <EmptyState title="Your home is ready for content" message="Install an addon from Settings to add catalogs and discover titles here." icon={<Compass size={22} />} />}
  </div>;
}

function HomeLoadingSkeleton({ showHero }: { showHero: boolean }) {
  return <div className="home-loading-skeleton" role="status" aria-label="Loading titles">
    {showHero && <div className="home-loading-hero poster-loading-shimmer"><span className="home-loading-hero-copy"><i className="poster-loading-shimmer"/><i className="poster-loading-shimmer"/><i className="poster-loading-shimmer"/></span></div>}
    {[0, 1, 2].map((row) => <section className="home-loading-shelf" key={row}>
      <span className="home-loading-heading poster-loading-shimmer" />
      <div className="home-loading-posters">{Array.from({ length: 8 }, (_, index) => <PosterLoadingCard key={index} variant="card" />)}</div>
    </section>)}
  </div>;
}

function ContinueCard({ item, isBusy, disintegrating = false, onResume, onManual, onRemove, onReset, onDismiss, onDetails, blurArtwork = false, useEpisodeThumbnails = true }: {
  item: ContinueItem; isBusy?: boolean; disintegrating?: boolean; blurArtwork?: boolean; useEpisodeThumbnails?: boolean; onResume: () => void; onManual?: () => void; onRemove?: () => void; onReset?: () => void; onDismiss?: () => void; onDetails?:()=>void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const artRef = useRef<HTMLButtonElement>(null);
  const [sourceRect, setSourceRect] = useState<SourceRect | null>(null);
  const sourceKey = `cw:${item.parentMetaId}:${item.videoId}`;
  const openActions = () => { setSourceRect(rectOf(artRef.current)); setMenuOpen(true); };
  const hold=useCardHold(openActions);
  const progress = Math.max(0, Math.min(100, item.progressPercent ?? item.progressFraction * 100));
  const artwork = (useEpisodeThumbnails ? item.episodeThumbnail : null) || item.imageUrl || item.background || item.poster;
  const remaining=Math.max(1,Math.floor((item.durationMs-item.resumePositionMs)/60000));
  const badge=item.isNextUp?(item.released&&new Date(item.released).getTime()>Date.now()?new Date(item.released).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'Up Next'):item.durationMs>0?(remaining>=60?`${Math.floor(remaining/60)}h ${remaining%60}m left`:`${remaining}m left`):`${Math.max(1,Math.min(99,Math.round(progress)))}% watched`;
  const appearance = useFeatureSnapshot<AppearanceSnapshot>('appearance');
  const depthOn = depthActive(appearance?.cardDepth, 'continueWatching');
  const cardContent=<>
      {!artwork && <span className="cw-art-fallback">{item.title}</span>}
      {!item.isNextUp && <span className="home-cw-progress"><i style={{ width: `${progress}%` }} /></span>}
      <span className="home-cw-badge">{badge}</span>
      <span className="home-cw-art-copy">{item.seasonNumber!=null&&item.episodeNumber!=null&&<small>S{item.seasonNumber} E{item.episodeNumber}</small>}<strong>{item.title}</strong>{item.episodeTitle&&<small>{item.episodeTitle}</small>}</span>
  </>;
  return <article className={`home-cw-card ${menuOpen?'action-anchor-hidden':''} ${blurArtwork ? "blur-artwork" : ""} ${depthOn?'has-card-depth':''} ${disintegrating?'is-disintegrating':''}`} style={depthOn ? depthVars(appearance?.cardDepth) : undefined} data-source-key={sourceKey} data-flip-key={`${item.parentMetaId}:${item.videoId}`}>
    {disintegrating && <span className="disintegration-burst" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></span>}
    <button {...hold} ref={artRef} className={`home-cw-art ${depthOn?'depth-frame':''}`} onClick={onResume} onContextMenu={event=>{event.preventDefault();openActions();}} aria-label={`Resume ${item.title}`} style={{ backgroundImage: artwork ? `linear-gradient(0deg,rgba(0,0,0,.82),transparent 60%),url("${artwork}")` : undefined }}>
      {blurArtwork&&<span className="home-cw-blurred-image" style={{backgroundImage:artwork?`url("${artwork}")`:undefined}}/>}{cardContent}
    </button>
    <div className="home-cw-copy"><div className="home-cw-text"><strong title={item.title}>{item.title}</strong><span>{item.subtitle || (item.isNextUp ? 'Next episode' : item.providerName || 'Continue watching')}</span></div>
      <button className="home-icon-button" aria-label="More continue watching actions" aria-expanded={menuOpen} onClick={openActions}><MoreHorizontal size={18} /></button>
    </div>
    {menuOpen && <HomeActionDialog title={item.title} poster={item.poster} artwork={<div className="home-cw-art home-cw-zoom" style={{backgroundImage:artwork?`linear-gradient(0deg,rgba(0,0,0,.82),transparent 60%),url("${artwork}")`:undefined}}>{cardContent}</div>} subtitle={item.subtitle} sourceKey={sourceKey} sourceRect={sourceRect} onClose={()=>setMenuOpen(false)}>{onDetails&&<button onClick={()=>{setMenuOpen(false);onDetails();}}>Go to details <Info size={18}/></button>}{onManual&&<button onClick={()=>{setMenuOpen(false);onManual();}}>Play manually <Play size={18} fill="currentColor"/></button>}{onReset && <button disabled={isBusy} onClick={()=>{setMenuOpen(false);onReset();}}>Start from beginning <RotateCcw size={18} /></button>}{onRemove && <button disabled={isBusy} className="destructive" onClick={()=>{setMenuOpen(false);onRemove();}}>Remove <Trash2 size={18} /></button>}{onDismiss && <button disabled={isBusy} className="destructive" onClick={()=>{setMenuOpen(false);onDismiss();}}>Remove <Trash2 size={18} /></button>}</HomeActionDialog>}
  </article>;
}

