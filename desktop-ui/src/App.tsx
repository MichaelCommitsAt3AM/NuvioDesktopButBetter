import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { Home, LibraryBig, Search as SearchIcon, Settings as SettingsIcon } from 'lucide-react';
import { actions, initialize, refreshFeature, useAppState, useFeatureSnapshot, useSelector } from './bridge';
import { AuthPage } from './features/auth/AuthPage';
import { ProfileMenu } from './features/profiles/ProfileMenu';
import { CachedHomeRoute } from './features/home/CachedHomeRoute';
import { posterMetrics } from './components/posterMetrics';
import { LaunchResumePrompt } from './features/home/LaunchResumePrompt';
import { SearchPage } from './features/search/SearchPage';
import { LibraryPage } from './features/library/LibraryPage';
import { DetailsPage } from './features/details/DetailsPage';
import { PersonPage } from './features/details/PersonPage';
import { EntityPage } from './features/details/EntityPage';
import { StreamsPage } from './features/streams/StreamsPage';
import { PlaybackSurfacePage } from './features/player/PlaybackSurfacePage';
import { ProfilesPage } from './features/profiles/ProfilesPage';
import { UpdateBanner } from './features/updater/UpdateBanner';
import { ProfileEditorPage } from './features/profiles/ProfileEditorPage';
import { ProfileChooser } from './features/profiles/ProfileChooser';
import { ProfileLoadingScreen } from './features/profiles/ProfileLoadingScreen';
import { CatalogPage } from './features/catalog/CatalogPage';
import { DownloadsPage } from './features/downloads/DownloadsPage';
import { DownloadNotifications } from './features/downloads/DownloadNotifications';
import { CollectionsPage, CollectionEditorPage, CollectionFolderPage } from './features/collections/CollectionsPages';
import { SettingsPage } from './features/settings/SettingsPage';
import { Avatar } from './components/ui';
import { ConnectionNotice, InlineError } from './components/Status';
import './features/features.css';
import { LiquidNavigation } from './components/navigation/LiquidNavigation';
import { KotlinNavigationIcon } from './components/navigation/KotlinNavigationIcon';
import { sidebarExpanded } from './components/navigation/sidebarState';
import './components/navigation/sidebarAdaptive.css';
import { RewriteWelcome, useRewriteWelcome } from './features/welcome/RewriteWelcome';
import { resolveThemeEntry, themeCssVars } from './theme/palette';
import { useThemeRoot } from './theme/useThemeRoot';
import { mainScroller, shouldResetMainScroll } from './navigation/scrollStore';
import { useLocale } from './i18n/strings';
import { useFullscreenEscape } from './components/useFullscreenEscape';

const navItems = [
  { to: '/', key: 'compose_nav_home', Icon: Home },
  { to: '/search', key: 'compose_nav_search', Icon: SearchIcon },
  { to: '/library', key: 'compose_nav_library', Icon: LibraryBig },
  { to: '/settings', key: 'compose_nav_settings', Icon: SettingsIcon },
] as const;

function Shell({ offlineDownloads = false, welcomePending = false }: { offlineDownloads?: boolean; welcomePending?: boolean }) {
  const session = useSelector((current) => current.session);
  const appearance = useFeatureSnapshot<{ navigationLayout: 'sidebar' | 'topbar'; navBarStyle: string; navBarGlowEnabled: boolean; home?: { heroEnabled?: boolean } }>('appearance');
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const previousPath = useRef<string | null>(null);
  const fromPath = previousPath.current;
  const isMovieDetailsRoute = (path: string) => /^\/details\/[^/]+\/[^/]+$/.test(path);
  const isStreamsOrPlaybackRoute = (path: string) => path.includes('/streams/') || path === '/playback';
  const isOpeningMovieDetails = fromPath !== null && !isMovieDetailsRoute(fromPath) && isMovieDetailsRoute(location.pathname);
  const isReturningFromMovieDetails = isMovieDetailsRoute(fromPath ?? '') && !isStreamsOrPlaybackRoute(location.pathname);
  const routeMotion = isOpeningMovieDetails
    ? navigationType === 'POP' ? 'route-enter-back' : 'route-enter-forward'
    : isReturningFromMovieDetails
      ? navigationType === 'POP' ? 'route-enter-back' : 'route-enter-forward'
      : '';
  useEffect(() => { previousPath.current = location.pathname; }, [location.pathname]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [focusSearch, setFocusSearch] = useState(false);
  const [sideHover, setSideHover] = useState(false);
  const { t } = useLocale();
  const labelOf = (key: string) => t(key);
  const selected = navItems.find((item) => item.to === location.pathname || (item.to !== '/' && location.pathname.startsWith(`${item.to}/`)))?.to;
  useEffect(() => { if (!appearance) void refreshFeature('appearance').catch(() => {}); }, [appearance]);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  // The top bar stays extended until the appearance snapshot arrives, so
  // startup never flashes the compact bar at users who selected extended.
  const navBarStyle = appearance?.navBarStyle ?? 'expanded';
  const selectedProfile = session.profiles.find(profile => profile.id === session.activeProfile);
  const kidsProfile = selectedProfile?.kidsEnabled === true;
  const kidsRouteAllowed = ['/', '/search', '/library', '/playback', '/settings'].includes(location.pathname) || location.pathname.startsWith('/details/') || location.pathname.startsWith('/settings/');
  const clearHold = () => { if (holdTimer.current) clearTimeout(holdTimer.current); holdTimer.current = null; };
  useEffect(() => () => clearHold(), []);
  useEffect(() => { setProfileOpen(false); }, [location.pathname]);
  useEffect(() => {
    // The main scroll container is shared across routes. Forward navigation
    // into a list starts at the top instead of inheriting the previous
    // route's depth; Back/Forward never resets so the returning route can
    // restore its anchor (Home/Search/Catalog/Library own theirs, other
    // routes keep the live offset).
    if (shouldResetMainScroll(location.pathname, navigationType)) {
      // Plain scrollTop assignment: instant, and safe where scrollTo is missing.
      const main = mainScroller();
      if (main) main.scrollTop = 0;
    }
  }, [location.pathname, navigationType]);
  const navigation = <>{navItems.map(({ to,key,Icon }) => { const label = labelOf(key); return to === '/settings' ? <div className="profile-anchor settings-profile-anchor" key={to}>
    <Link to={to} className={`nav-link ${selected === to ? 'active' : ''}`} aria-current={selected === to ? 'page' : undefined} aria-haspopup="menu" aria-expanded={profileOpen} title={`${label} — hold to switch profiles`}
      onPointerDown={event => { if (event.button !== 0) return; held.current=false; clearHold(); holdTimer.current=setTimeout(() => { held.current=true; setProfileOpen(true); },500); }}
      onPointerUp={clearHold} onPointerCancel={clearHold} onPointerLeave={clearHold}
      onClick={event => { if (held.current) { event.preventDefault(); held.current=false; } }}
      onContextMenu={event => { event.preventDefault(); clearHold(); setProfileOpen(true); }}
      onKeyDown={event => { if (event.key === 'ArrowDown' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); setProfileOpen(true); } }}>
      <Avatar profile={selectedProfile} size="sm" /><span>{label}</span>
    </Link>{profileOpen && <ProfileMenu holdGesture={held} onClose={() => setProfileOpen(false)} />}
  </div> : <Link key={to} to={to} className={`nav-link ${selected === to ? 'active' : ''}`} aria-current={selected === to ? 'page' : undefined} title={label}
    onClick={event => { if (to === '/search' && event.detail > 1 && location.pathname === '/search') event.preventDefault(); }}
    onDoubleClick={to === '/search' ? event => { event.preventDefault(); setFocusSearch(true); if (location.pathname !== '/search') navigate('/search'); } : undefined}
  ><Icon size={19} strokeWidth={1.9} /><span>{label}</span></Link>; })}</>;
  const sidebar = appearance?.navigationLayout === 'sidebar';
  const isDetailsRoute = /^\/(details\/[^/]+\/[^/]+|person\/[^/]+|entity\/[^/]+\/[^/]+)$/.test(location.pathname);
  const isStreamsRoute = /^\/details\/[^/]+\/[^/]+\/streams\/[^/]+$/.test(location.pathname);
  const isPlaybackRoute = location.pathname === '/playback';
  return <div className={`shell ${sidebar ? 'sidebar-layout' : 'topbar-layout'} ${location.pathname==='/'?'home-layout':''} ${isDetailsRoute?'details-layout':''} ${isStreamsRoute?'streams-layout':''} ${isPlaybackRoute?'playback-layout':''} nav-style-${navBarStyle} ${appearance?.navBarGlowEnabled ? 'nav-glow' : ''}`}>
    {sidebar ? <aside className={`side-nav${sidebarExpanded(navBarStyle, sideHover, profileOpen) ? ' is-expanded' : ''}`} aria-expanded={sidebarExpanded(navBarStyle, sideHover, profileOpen)} onPointerEnter={() => setSideHover(true)} onPointerLeave={() => setSideHover(false)} onFocusCapture={() => setSideHover(true)} onBlurCapture={() => setSideHover(false)}>
      <nav className="side-nav-links" aria-label="Main navigation">{navigation}</nav>
    </aside> : <header className="topbar">
      <LiquidNavigation labels={navItems.map(item => labelOf(item.key))} visuals={navItems.map(item => <KotlinNavigationIcon key={item.key} route={item.to} />)} selectedIndex={navItems.findIndex(item => item.to === selected)} style={navBarStyle} heroEnabled={appearance?.home?.heroEnabled !== false} profileOpen={profileOpen} glowEnabled={appearance?.navBarGlowEnabled !== false} routeKey={location.pathname} onDragStart={clearHold} onDragSelect={index => { const item = navItems[index]; if (item) { held.current = false; navigate(item.to); } }}>{navigation}</LiquidNavigation>
    </header>}
    <main className={`main-area ${routeMotion}`}>
      {kidsProfile && !kidsRouteAllowed ? <div className="page"><h1>Kids profile</h1><p>Switch to the parent profile to use this feature.</p><Link className="button secondary" to="/">Go Home</Link></div> : <>
      <CachedHomeRoute profileId={session.activeProfile} />
      <Routes key={location.pathname}>
        <Route path="/" element={null} />
        <Route path="/search" element={<SearchPage focusRequested={focusSearch} onFocusHandled={() => setFocusSearch(false)} />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/library/downloads" element={<DownloadsPage />} />
        <Route path="/downloads" element={<Navigate to="/library/downloads" replace />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/collections/:collectionId/edit" element={<CollectionEditorPage />} />
        <Route path="/collections/:collectionId/folders/:folderId" element={<CollectionFolderPage />} />
        <Route path="/settings/*" element={<SettingsPage />} />
        <Route path="/profiles" element={<ProfilesPage />} />
        <Route path="/profiles/new" element={<ProfileEditorPage />} />
        <Route path="/profiles/:id/edit" element={<ProfileEditorPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/details/:type/:id" element={<DetailsPage />} />
        <Route path="/person/:tmdbId" element={<PersonPage />} />
        <Route path="/entity/:kind/:entityId" element={<EntityPage />} />
        <Route path="/details/:type/:id/streams/:videoId" element={<StreamsPage />} />
        <Route path="/playback" element={<PlaybackSurfacePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </>}
    </main>
    {!offlineDownloads && !welcomePending && <LaunchResumePrompt />}
  </div>;
}

function AppContent() {
  const welcome = useRewriteWelcome();
  const state = useAppState();
  const location = useLocation();
  const navigate = useNavigate();
  const [launchPicker,setLaunchPicker]=useState<boolean|null>(null);
  const [offlineStartup, setOfflineStartup] = useState<boolean | null>(null);
  const browserOfflineAtLaunch = useRef(navigator.onLine === false);
  useEffect(() => {
    if (offlineStartup !== null || state.status !== 'ready') return;
    const condition = state.session.networkCondition;
    // Wait for the first actual session snapshot/epoch, rather than deciding
    // from the empty store as soon as the local process becomes ready.
    if (condition === undefined && state.session.status === 'loading') return;
    if (browserOfflineAtLaunch.current || condition === 'NoInternet') {
      setOfflineStartup(true);
      navigate('/library/downloads', { replace: true });
    } else if (condition !== 'Unknown' && condition !== 'Checking') {
      // Missing condition supports older bridge snapshots. A server outage
      // alone does not mean the device has no internet connection.
      setOfflineStartup(false);
    }
  }, [offlineStartup, state.status, state.session.status, state.session.networkCondition, navigate]);
  const offlineDownloads = state.session.status !== 'loading' && !state.session.profiles.find(profile => profile.id === state.session.activeProfile)?.kidsEnabled && offlineStartup === true && (location.pathname === '/library/downloads' || location.pathname === '/playback');
  useEffect(()=>{
    if(state.session.status==='signedOut'){setLaunchPicker(null);return;}
    if(offlineDownloads||state.session.status!=='signedIn'||launchPicker!==null)return;
    let active=true;
    void (async()=>{
      if(!active)return;
      // Session already contains account-scoped cached profiles. Cosmetic
      // catalogs are refreshed by the picker/editor without delaying startup.
      const available=state.session.profiles;
      if(available.length===1&&!available[0].locked){
        if(state.session.activeProfile===available[0].id){setLaunchPicker(false);return;}
        try {
          await actions.selectProfile(available[0].id);
          if(active)setLaunchPicker(false);
        } catch {
          if(active)setLaunchPicker(true);
        }
        return;
      }
      setLaunchPicker(true);
    })().catch(()=>{if(active)setLaunchPicker(true);});
    return ()=>{active=false;};
  },[state.session.status,launchPicker,offlineDownloads]);
  const appearance = useFeatureSnapshot<{ theme?: string; customThemeColors?: string[]; amoledEnabled?: boolean; cardStyle?: Parameters<typeof posterMetrics>[0] }>('appearance');
  useEffect(() => { void initialize(); }, []);
  // Saved language drives translated chrome; load it at startup so the first
  // paint already reflects the profile's locale and document direction.
  useEffect(() => { void refreshFeature('about').catch(() => {}); }, []);
  const themeId = appearance?.theme ?? state.settings.theme;
  const entry = resolveThemeEntry(state.settings.themes, themeId);
  const customColors = appearance?.customThemeColors;
  const cardMetrics = posterMetrics(appearance?.cardStyle);
  const style = { '--movie-card-width': `${cardMetrics.width}px`, '--movie-card-radius': `${cardMetrics.radius}px`, '--movie-card-ratio': cardMetrics.ratio, ...themeCssVars(entry, { amoled: appearance?.amoledEnabled, customColors }) } as CSSProperties;
  useThemeRoot(style);
  const startupError = state.session.error ?? state.connectionMessage;
  const profileSetupRoute = location.pathname.startsWith('/profiles');
  const explicitPicker=location.pathname==='/profiles/choose';
  const showPicker=explicitPicker||(!profileSetupRoute&&launchPicker===true);
  const startupLoading = offlineStartup === null || (state.session.status === 'loading' && state.status !== 'disconnected') || (state.session.status === 'signedIn' && launchPicker === null && !profileSetupRoute);
  return <div className="app" style={style} onContextMenu={event => {
    const target = event.target;
    const editable = target instanceof Element && (
      target.closest('input, textarea') !== null ||
      (target instanceof HTMLElement && target.isContentEditable)
    );
    if (!editable) event.preventDefault();
  }}>
    {state.status !== 'ready' && <ConnectionNotice status={state.status} />}
    <UpdateBanner />
    {!state.session.profiles.find(profile => profile.id === state.session.activeProfile)?.kidsEnabled && <DownloadNotifications />}
    {offlineDownloads && state.status === 'ready'
      ? <Shell offlineDownloads welcomePending={welcome.pending} />
      : state.session.status === 'loading' && state.status === 'disconnected'
      ? <div className="boot"><InlineError message={startupError ?? 'The Kotlin backend could not start.'} onRetry={() => { void actions.restartBridge().catch(() => {}); }} /></div>
      : startupLoading
      ? <ProfileLoadingScreen startup />
      : state.session.status === 'signedOut'
        ? <AuthPage />
        : showPicker
          ? <ProfileChooser onSelected={() => { setLaunchPicker(false); navigate('/'); }} onBack={explicitPicker && !launchPicker && state.session.activeProfile !== null ? () => navigate(-1) : undefined} />
          : <Shell welcomePending={welcome.pending} />}
    {state.profileTransition && !startupLoading && !offlineDownloads && <ProfileLoadingScreen />}
    {welcome.pending && state.status === 'ready' && !startupLoading && state.session.status !== 'signedOut' && !showPicker && !state.profileTransition && location.pathname === '/' && <RewriteWelcome onClose={welcome.dismiss} />}
  </div>;
}

export default function AppRoot() {
  useFullscreenEscape();
  // Screens already render cached data or loading placeholders. Commit the
  // route at input priority so it cannot trail the pointer-driven nav bubble
  // behind background poster mounting and bridge snapshot updates.
  return <BrowserRouter useTransitions={false}><AppContent /></BrowserRouter>;
}
