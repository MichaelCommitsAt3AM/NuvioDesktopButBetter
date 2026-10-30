import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BridgeStoreContext, getSnapshot, subscribe } from '../bridge';
import { createPausedStore } from './pausedStore';
import { Route, Routes, useLocation, useNavigationType, type Location } from 'react-router-dom';
import { HomePage } from '../features/home/HomePage';
import { HomeVisibility } from '../features/home/homeVisibility';
import { LibraryPage } from '../features/library/LibraryPage';
import { SearchPage } from '../features/search/SearchPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { TabActivity, TabNavigationType } from './tabActivity';

export type RootTab = 'home' | 'search' | 'library' | 'settings';

const TAB_ORDER: readonly RootTab[] = ['home', 'search', 'library', 'settings'];

/**
 * The four real main tabs. Sub-pages such as Downloads, details, streams and
 * playback are not retained: only the screens the top-bar pill switches
 * between keep their component tree and effects.
 */
export function rootTabForPath(pathname: string): RootTab | null {
  if (pathname === '/') return 'home';
  if (pathname === '/search') return 'search';
  if (pathname === '/library') return 'library';
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return 'settings';
  return null;
}

type ScreenProps = {
  tab: RootTab;
  location: Location;
  focusRequested: boolean;
  onFocusHandled: () => void;
};

/**
 * Memoized so a route change only renders the screen that gained or lost
 * visibility. Its `location` prop is the tab's last active location, which
 * keeps React Router hooks inside hidden tabs stable while another tab is in
 * front. The screen still follows live sub-route changes while active because
 * the cache is updated on every active render.
 */
const TabScreen = memo(function TabScreen({ tab, location, focusRequested, onFocusHandled }: ScreenProps) {
  if (tab === 'home') return <Routes location={location}><Route path="/" element={<HomePage />} /></Routes>;
  if (tab === 'search') return <Routes location={location}><Route path="/search" element={<SearchPage focusRequested={focusRequested} onFocusHandled={onFocusHandled} />} /></Routes>;
  if (tab === 'library') return <Routes location={location}><Route path="/library" element={<LibraryPage />} /></Routes>;
  return <Routes location={location}><Route path="/settings/*" element={<SettingsPage />} /></Routes>;
});

function RetainedTab({ tab, active, children }: { tab: RootTab; active: boolean; children: ReactNode }) {
  const [store] = useState(() => createPausedStore({ getSnapshot, subscribe }));
  useLayoutEffect(() => {
    store.setActive(active);
    return () => store.setActive(false);
  }, [store, active]);
  const element = useRef<HTMLDivElement>(null);
  const navigationType = useNavigationType();
  const lastActiveNavigationType = useRef(navigationType);
  if (active) lastActiveNavigationType.current = navigationType;
  useEffect(() => {
    if (active) return;
    // A retained subtree keeps focus unless the browser drops it itself. Move
    // focus out before the tab becomes unreachable instead of leaving it on a
    // display:none control.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && element.current?.contains(focused)) focused.blur();
  }, [active]);
  return <div
    ref={element}
    data-retained-tab={tab}
    data-retained-active={active ? 'true' : undefined}
    aria-hidden={active ? undefined : true}
    style={{ display: active ? 'contents' : 'none' }}
  >
    <BridgeStoreContext.Provider value={store}>
      <TabActivity.Provider value={active}>
        <TabNavigationType.Provider value={active ? navigationType : lastActiveNavigationType.current}>
          {tab === 'home' ? <HomeVisibility value={active}>{children}</HomeVisibility> : children}
        </TabNavigationType.Provider>
      </TabActivity.Provider>
    </BridgeStoreContext.Provider>
  </div>;
}

/**
 * Mounts a main tab on its first visit, then keeps it mounted. Only the
 * selected tab is laid out (`display: contents`) and exposed to the
 * accessibility tree; hidden tabs are `display: none` and pause the lifecycle
 * work that reads `TabActivity`.
 *
 * Callers must key this component by the active profile so a profile or
 * account change disposes every retained tree instead of showing another
 * profile's state.
 */
export function RetainedMainTabs({ focusRequested, onFocusHandled }: { focusRequested: boolean; onFocusHandled: () => void }) {
  const location = useLocation();
  const active = rootTabForPath(location.pathname);
  const visited = useRef<Set<RootTab>>(new Set());
  const locations = useRef<Partial<Record<RootTab, Location>>>({});
  if (active) {
    visited.current.add(active);
    locations.current[active] = location;
  }
  return <>{TAB_ORDER.map(tab => {
    const cached = locations.current[tab];
    if (!cached || !visited.current.has(tab)) return null;
    return <RetainedTab key={tab} tab={tab} active={active === tab}>
      <TabScreen
        tab={tab}
        location={cached}
        focusRequested={tab === 'search' ? focusRequested : false}
        onFocusHandled={onFocusHandled}
      />
    </RetainedTab>;
  })}</>;
}
