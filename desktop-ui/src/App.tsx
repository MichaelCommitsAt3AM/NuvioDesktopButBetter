import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { actions, initialize, refreshFeature, useFeatureSnapshot, useSelector } from './bridge';
import { AuthPage } from './features/auth/AuthPage';
// Retain the stylesheet order when moving profile controls into AppNavigation.
import './features/profiles/ProfileMenu';
// Screens used only by RetainedMainTabs are imported for their stylesheet
// evaluation order; the component references live in the retention module.
import './features/home/HomePage';
import { posterMetrics } from './components/posterMetrics';
import { LaunchResumePrompt } from './features/home/LaunchResumePrompt';
import './features/search/SearchPage';
import './features/library/LibraryPage';
import { DetailsPage } from './features/details/DetailsPage';
import { PersonPage } from './features/details/PersonPage';
import { EntityPage } from './features/details/EntityPage';
import { StreamsPage } from './features/streams/StreamsPage';
import { PlaybackSurfacePage } from './features/player/PlaybackSurfacePage';
import { UpdateBanner } from './features/updater/UpdateBanner';
import { ProfileEditorPage } from './features/profiles/ProfileEditorPage';
import { ProfileChooser } from './features/profiles/ProfileChooser';
import { ProfileLoadingScreen } from './features/profiles/ProfileLoadingScreen';
import { CatalogPage } from './features/catalog/CatalogPage';
import { DownloadsPage } from './features/downloads/DownloadsPage';
import { DownloadNotifications } from './features/downloads/DownloadNotifications';
import { CollectionsPage, CollectionEditorPage, CollectionFolderPage } from './features/collections/CollectionsPages';
import './features/settings/SettingsPage';
import { RetainedMainTabs } from './navigation/RetainedMainTabs';
import { ConnectionNotice, InlineError } from './components/Status';
import './features/features.css';
import { AppNavigation } from './components/navigation/AppNavigation';
import './components/navigation/sidebarAdaptive.css';
import { RewriteWelcome, useRewriteWelcome } from './features/welcome/RewriteWelcome';
import { resolveThemeEntry, themeCssVars } from './theme/palette';
import { useThemeRoot } from './theme/useThemeRoot';
import { mainScroller, shouldResetMainScroll } from './navigation/scrollStore';
import { useFullscreenEscape } from './components/useFullscreenEscape';

const Shell = memo(function Shell({ offlineDownloads = false, welcomePending = false }: { offlineDownloads?: boolean; welcomePending?: boolean }) {
  const profileId = useSelector(current => current.session.activeProfile);
  const appearance = useFeatureSnapshot<{ navigationLayout: 'sidebar' | 'topbar'; navBarStyle: string; navBarGlowEnabled: boolean; home?: { heroEnabled?: boolean } }>('appearance');
  const location = useLocation();
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
  const [focusSearch, setFocusSearch] = useState(false);
  const requestSearchFocus = useCallback(() => setFocusSearch(true), []);
  const searchFocusHandled = useCallback(() => setFocusSearch(false), []);
  useEffect(() => {
    // A pending double-click focus must not fire when Search is opened later
    // for an unrelated reason.
    if (location.pathname !== '/search') setFocusSearch(false);
  }, [location.pathname]);
  const navBarStyle = appearance?.navBarStyle ?? 'expanded';
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
  const sidebar = appearance?.navigationLayout === 'sidebar';
  const isDetailsRoute = /^\/(details\/[^/]+\/[^/]+|person\/[^/]+|entity\/[^/]+\/[^/]+)$/.test(location.pathname);
  const isStreamsRoute = /^\/details\/[^/]+\/[^/]+\/streams\/[^/]+$/.test(location.pathname);
  const isPlaybackRoute = location.pathname === '/playback';
  return <div className={`shell ${sidebar ? 'sidebar-layout' : 'topbar-layout'} ${location.pathname==='/'?'home-layout':''} ${isDetailsRoute?'details-layout':''} ${isStreamsRoute?'streams-layout':''} ${isPlaybackRoute?'playback-layout':''} nav-style-${navBarStyle} ${appearance?.navBarGlowEnabled ? 'nav-glow' : ''}`}>
    <AppNavigation onSearchFocus={requestSearchFocus} />
    <main className={`main-area ${routeMotion}`}>
      <RetainedMainTabs key={profileId ?? 'none'} focusRequested={focusSearch} onFocusHandled={searchFocusHandled} />
      <Routes key={location.pathname}>
        <Route path="/" element={null} />
        <Route path="/search" element={null} />
        <Route path="/library" element={null} />
        <Route path="/library/downloads" element={<DownloadsPage />} />
        <Route path="/downloads" element={<Navigate to="/library/downloads" replace />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/collections/:collectionId/edit" element={<CollectionEditorPage />} />
        <Route path="/collections/:collectionId/folders/:folderId" element={<CollectionFolderPage />} />
        <Route path="/settings/*" element={null} />
        <Route path="/profiles" element={<Navigate to="/profiles/choose" replace />} />
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
    </main>
    {!offlineDownloads && !welcomePending && <LaunchResumePrompt />}
  </div>;
});

function AppContent() {
  const welcome = useRewriteWelcome();
  // Page snapshots have their own subscribers; they must not rerender the app shell.
  const status = useSelector(current => current.status);
  const session = useSelector(current => current.session);
  const settings = useSelector(current => current.settings);
  const connectionMessage = useSelector(current => current.connectionMessage);
  const profileTransition = useSelector(current => current.profileTransition);
  const state = { status, session, settings, connectionMessage, profileTransition };
  const location = useLocation();
  const navigate = useNavigate();
  useFullscreenEscape(() => { if ((window.history.state?.idx ?? 0) > 0) navigate(-1); });
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
  const offlineDownloads = state.session.status !== 'loading' && offlineStartup === true && (location.pathname === '/library/downloads' || location.pathname === '/playback');
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
    {state.status === 'disconnected' && <ConnectionNotice status="disconnected" />}
    {state.status === 'starting' && import.meta.env.DEV && <ConnectionNotice status="starting" />}
    <UpdateBanner />
    <DownloadNotifications key={state.session.activeProfile} />
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
  // Top-bar input paints its own selection before scheduling the route. Other
  // navigation keeps the router's existing explicit scheduling policy.
  return <BrowserRouter useTransitions={false}><AppContent /></BrowserRouter>;
}
