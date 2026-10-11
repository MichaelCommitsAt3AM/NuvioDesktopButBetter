import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { Home, LibraryBig, Search as SearchIcon, Settings as SettingsIcon } from 'lucide-react';
import { actions, initialize, refreshFeature, useAppState, useFeatureSnapshot, useSelector } from './bridge';
import { AuthPage } from './features/auth/AuthPage';
import { ProfileMenu } from './features/profiles/ProfileMenu';
import { HomePage } from './features/home/HomePage';
import { SearchPage } from './features/search/SearchPage';
import { LibraryPage } from './features/library/LibraryPage';
import { DetailsPage } from './features/details/DetailsPage';
import { StreamsPage } from './features/streams/StreamsPage';
import { PlaybackSurfacePage } from './features/player/PlaybackSurfacePage';
import { ProfilesPage } from './features/profiles/ProfilesPage';
import { ProfileEditorPage } from './features/profiles/ProfileEditorPage';
import { ProfileChooser } from './features/profiles/ProfileChooser';
import { ProfileLoadingScreen } from './features/profiles/ProfileLoadingScreen';
import type { ProfilesSnapshot } from './features/profiles/profileStore';
import { CatalogPage } from './features/catalog/CatalogPage';
import { DownloadsPage } from './features/downloads/DownloadsPage';
import { CollectionsPage, CollectionEditorPage, CollectionFolderPage } from './features/collections/CollectionsPages';
import { SettingsPage } from './features/settings/SettingsPage';
import { Avatar } from './components/ui';
import { ConnectionNotice, InlineError } from './components/Status';
import './features/features.css';

const navItems = [
  { to: '/', label: 'Home', Icon: Home },
  { to: '/search', label: 'Search', Icon: SearchIcon },
  { to: '/library', label: 'Library', Icon: LibraryBig },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
];

function Shell() {
  const session = useSelector((current) => current.session);
  const appearance = useFeatureSnapshot<{ navigationLayout: 'sidebar' | 'topbar'; navBarStyle: string; navBarGlowEnabled: boolean }>('appearance');
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
  const [profileOpen, setProfileOpen] = useState(false);
  const selected = navItems.find((item) => item.to === location.pathname || (item.to !== '/' && location.pathname.startsWith(`${item.to}/`)))?.label;
  useEffect(() => { if (!appearance) void refreshFeature('appearance').catch(() => {}); }, [appearance]);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const selectedProfile = session.profiles.find(profile => profile.id === session.activeProfile);
  const clearHold = () => { if (holdTimer.current) clearTimeout(holdTimer.current); holdTimer.current = null; };
  useEffect(() => () => clearHold(), []);
  useEffect(() => { setProfileOpen(false); }, [location.pathname]);
  const navigation = <>{navItems.map(({ to,label,Icon }) => label === 'Settings' ? <div className="profile-anchor settings-profile-anchor" key={to}>
    <Link to={to} className={`nav-link ${selected === label ? 'active' : ''}`} aria-current={selected === label ? 'page' : undefined} aria-haspopup="menu" aria-expanded={profileOpen} title="Settings — hold to switch profiles"
      onPointerDown={event => { if (event.button !== 0) return; held.current=false; clearHold(); holdTimer.current=setTimeout(() => { held.current=true; setProfileOpen(true); },500); }}
      onPointerUp={clearHold} onPointerCancel={clearHold} onPointerLeave={clearHold}
      onClick={event => { if (held.current) { event.preventDefault(); held.current=false; } }}
      onContextMenu={event => { event.preventDefault(); clearHold(); setProfileOpen(true); }}
      onKeyDown={event => { if (event.key === 'ArrowDown' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); setProfileOpen(true); } }}>
      <Avatar profile={selectedProfile} size="sm" /><span>Settings</span>
    </Link>{profileOpen && <ProfileMenu onClose={() => setProfileOpen(false)} />}
  </div> : <Link key={to} to={to} state={to === '/' ? { resetHomeScroll: true } : undefined} className={`nav-link ${selected === label ? 'active' : ''}`} aria-current={selected === label ? 'page' : undefined} title={label}><Icon size={19} strokeWidth={1.9} /><span>{label}</span></Link>)}</>;
  const sidebar = appearance?.navigationLayout === 'sidebar';
  const isDetailsRoute = /^\/details\/[^/]+\/[^/]+$/.test(location.pathname);
  const isStreamsRoute = /^\/details\/[^/]+\/[^/]+\/streams\/[^/]+$/.test(location.pathname);
  const isPlaybackRoute = location.pathname === '/playback';
  return <div className={`shell ${sidebar ? 'sidebar-layout' : 'topbar-layout'} ${location.pathname==='/'?'home-layout':''} ${isDetailsRoute?'details-layout':''} ${isStreamsRoute?'streams-layout':''} ${isPlaybackRoute?'playback-layout':''} nav-style-${appearance?.navBarStyle ?? 'adaptive'} ${appearance?.navBarGlowEnabled ? 'nav-glow' : ''}`}>
    {sidebar ? <aside className="side-nav">
      <nav className="side-nav-links" aria-label="Main navigation">{navigation}</nav>
    </aside> : <header className="topbar">
      <nav className="floating-nav" aria-label="Main navigation">{navigation}</nav>
    </header>}
    <main className={`main-area ${routeMotion}`} key={location.pathname}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
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
        <Route path="/details/:type/:id/streams/:videoId" element={<StreamsPage />} />
        <Route path="/playback" element={<PlaybackSurfacePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  </div>;
}

function AppContent() {
  const state = useAppState();
  const location = useLocation();
  const navigate = useNavigate();
  const [launchPicker,setLaunchPicker]=useState<boolean|null>(null);
  useEffect(()=>{
    if(state.session.status==='signedOut'){setLaunchPicker(null);return;}
    if(state.session.status!=='signedIn'||launchPicker!==null)return;
    let active=true;
    void refreshFeature<ProfilesSnapshot>('profiles').then(async profiles=>{
      if(!active)return;
      const available=profiles?.items??[];
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
    }).catch(()=>{if(active)setLaunchPicker(true);});
    return ()=>{active=false;};
  },[state.session.status,launchPicker]);
  const appearance = useFeatureSnapshot<{ theme?: string; customThemeColors?: string[]; amoledEnabled?: boolean }>('appearance');
  useEffect(() => { void initialize(); }, []);
  const themeId = appearance?.theme ?? state.settings.theme;
  const theme = state.settings.themes.find((item) => item.id.toLowerCase() === themeId.toLowerCase());
  const customColors = appearance?.customThemeColors;
  const isCustomTheme = themeId.toLowerCase() === 'custom';
  const style = { '--app-bg': appearance?.amoledEnabled ? '#000000' : (isCustomTheme ? customColors?.[0] : theme?.background) ?? customColors?.[0] ?? '#0d0d0d', '--app-accent': (isCustomTheme ? customColors?.[1] : theme?.accent) ?? customColors?.[1] ?? '#f5f5f5', '--app-surface': (isCustomTheme ? customColors?.[2] : theme?.surface) ?? customColors?.[2] ?? '#1a1a1a' } as CSSProperties;
  const startupError = state.session.error ?? state.connectionMessage;
  const profileSetupRoute = location.pathname.startsWith('/profiles');
  const explicitPicker=location.pathname==='/profiles/choose';
  const showPicker=explicitPicker||(!profileSetupRoute&&launchPicker===true);
  const startupLoading = (state.session.status === 'loading' && state.status !== 'disconnected') || (state.session.status === 'signedIn' && launchPicker === null && !profileSetupRoute);
  return <div className="app" style={style}>
    {state.status !== 'ready' && <ConnectionNotice status={state.status} />}
    {state.session.status === 'loading' && state.status === 'disconnected'
      ? <div className="boot"><InlineError message={startupError ?? 'The Kotlin backend could not start.'} onRetry={() => { void actions.restartBridge().catch(() => {}); }} /></div>
      : startupLoading
      ? <ProfileLoadingScreen startup />
      : state.session.status === 'signedOut'
        ? <AuthPage />
        : showPicker
          ? <ProfileChooser onSelected={() => { setLaunchPicker(false); navigate('/'); }} onBack={explicitPicker && !launchPicker && state.session.activeProfile !== null ? () => navigate(-1) : undefined} />
          : <Shell />}
    {state.profileTransition && !startupLoading && <ProfileLoadingScreen />}
  </div>;
}

export default function AppRoot() { return <BrowserRouter><AppContent /></BrowserRouter>; }
