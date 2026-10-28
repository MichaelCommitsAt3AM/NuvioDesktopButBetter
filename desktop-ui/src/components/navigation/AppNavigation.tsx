import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, LibraryBig, Search as SearchIcon, Settings as SettingsIcon } from 'lucide-react';
import { refreshFeature, useFeatureSnapshot, useSelector } from '../../bridge';
import { ProfileMenu } from '../../features/profiles/ProfileMenu';
import { Avatar } from '../ui';
import { LiquidNavigation } from './LiquidNavigation';
import { KotlinNavigationIcon } from './KotlinNavigationIcon';
import { sidebarExpanded } from './sidebarState';
import { translate, useLocale } from '../../i18n/strings';

const navItems = [
  { to: '/', key: 'compose_nav_home', Icon: Home },
  { to: '/search', key: 'compose_nav_search', Icon: SearchIcon },
  { to: '/library', key: 'compose_nav_library', Icon: LibraryBig },
  { to: '/settings', key: 'compose_nav_settings', Icon: SettingsIcon },
] as const;

const navigationVisuals = navItems.map(item => <KotlinNavigationIcon key={item.key} route={item.to} />);

/** Navigation owns its interactions independently of page and bridge-result renders. */
export const AppNavigation = memo(function AppNavigation({ onSearchFocus }: { onSearchFocus: () => void }) {
  const appearance = useFeatureSnapshot<{ navigationLayout: 'sidebar' | 'topbar'; navBarStyle: string; navBarGlowEnabled: boolean; home?: { heroEnabled?: boolean } }>('appearance');
  const location = useLocation();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [sideHover, setSideHover] = useState(false);
  const { code } = useLocale();
  const labels = useMemo(() => navItems.map(item => translate(code, item.key)), [code]);
  const selected = navItems.find((item) => item.to === location.pathname || (item.to !== '/' && location.pathname.startsWith(`${item.to}/`)))?.to;
  useEffect(() => { if (!appearance) void refreshFeature('appearance').catch(() => {}); }, [appearance]);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  // The top bar stays extended until the appearance snapshot arrives, so
  // startup never flashes the compact bar at users who selected extended.
  const navBarStyle = appearance?.navBarStyle ?? 'expanded';
  const selectedProfile = useSelector(current => current.session.profiles.find(profile => profile.id === current.session.activeProfile));
  const clearHold = useCallback(() => { if (holdTimer.current) clearTimeout(holdTimer.current); holdTimer.current = null; }, []);
  useEffect(() => () => clearHold(), []);
  useEffect(() => { setProfileOpen(false); }, [location.pathname]);
  const selectFromDrag = useCallback((index: number) => { const item = navItems[index]; if (item) { held.current = false; navigate(item.to); } }, [navigate]);
  const navigation = useMemo(() => <>{navItems.map(({ to,Icon }, index) => { const label = labels[index]; return to === '/settings' ? <div className="profile-anchor settings-profile-anchor" key={to}>
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
    onDoubleClick={to === '/search' ? event => { event.preventDefault(); onSearchFocus(); if (location.pathname !== '/search') navigate('/search'); } : undefined}
  ><Icon size={19} strokeWidth={1.9} /><span>{label}</span></Link>; })}</>, [selected, location.pathname, labels, selectedProfile, profileOpen, clearHold, navigate, onSearchFocus]);
  const sidebar = appearance?.navigationLayout === 'sidebar';
  return sidebar ? <aside className={`side-nav${sidebarExpanded(navBarStyle, sideHover, profileOpen) ? ' is-expanded' : ''}`} aria-expanded={sidebarExpanded(navBarStyle, sideHover, profileOpen)} onPointerEnter={() => setSideHover(true)} onPointerLeave={() => setSideHover(false)} onFocusCapture={() => setSideHover(true)} onBlurCapture={() => setSideHover(false)}>
      <nav className="side-nav-links" aria-label="Main navigation">{navigation}</nav>
    </aside> : <header className="topbar">
      <LiquidNavigation labels={labels} visuals={navigationVisuals} selectedIndex={navItems.findIndex(item => item.to === selected)} style={navBarStyle} heroEnabled={appearance?.home?.heroEnabled !== false} profileOpen={profileOpen} glowEnabled={appearance?.navBarGlowEnabled !== false} routeKey={location.pathname} onDragStart={clearHold} onDragSelect={selectFromDrag}>{navigation}</LiquidNavigation>
    </header>;
});
