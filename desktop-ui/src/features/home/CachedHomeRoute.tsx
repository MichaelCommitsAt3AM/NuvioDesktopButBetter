import { memo, useRef } from 'react';
import { Route, Routes, useLocation, type Location } from 'react-router-dom';
import { HomePage } from './HomePage';
import { HomeVisibility } from './homeVisibility';

const HomeContent = memo(function HomeContent({ location }: { location: Location }) {
  return <Routes location={location}><Route path="/" element={<HomePage />} /></Routes>;
});

/** Keep the page and effects alive; don't restart hundreds of poster effects on return. */
export function CachedHomeRoute({ profileId }: { profileId: number | null }) {
  const location = useLocation();
  const homeLocation = useRef(location.pathname === '/' ? location : null);
  if (!homeLocation.current && location.pathname === '/') homeLocation.current = location;
  if (!homeLocation.current) return null;
  const active = location.pathname === '/';
  // Note: no `inert` here. The hidden tree is `display:none`, which already
  // removes it from focus order and the accessibility tree; toggling `inert`
  // on hundreds of posters forced a full-subtree recalc on every tab switch.
  return <HomeVisibility value={active}><div key={profileId} style={{ display: active ? 'contents' : 'none' }}>
    <HomeContent location={homeLocation.current} />
  </div></HomeVisibility>;
}
