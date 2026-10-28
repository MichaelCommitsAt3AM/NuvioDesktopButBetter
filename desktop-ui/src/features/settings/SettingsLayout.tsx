import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { Info, Settings, SlidersHorizontal, UserCircle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector, useFeatureSnapshot, refreshFeature } from '../../bridge';
import { readListPosition, saveListPosition, scrollKey, useActiveProfileId } from '../../navigation/scrollStore';
import { FullscreenButton } from '../../components/FullscreenButton';
import { useTabActive, useTabActivated, useTabNavigationType } from '../../navigation/tabActivity';
import './settingsParity.css';

export function settingsCategory(path: string, search = '') {
  if (path === '/settings') return new URLSearchParams(search).get('category') ?? 'general';
  if (/account|tracking/.test(path)) return 'account';
  if (/community|licenses|about/.test(path)) return 'about';
  if (/advanced/.test(path)) return 'advanced';
  return 'general';
}

export function SettingsLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const category = settingsCategory(location.pathname, location.search);
  const settings = useSelector(state => state.settings);
  const theme = settings.themes.find(item=>item.id.toLowerCase()===settings.theme.toLowerCase());
  const version = useSelector(state => state.session.version);
  const about = useFeatureSnapshot<{versionCode?:number;basedOnVersion?:string|null}>('about');
  useEffect(()=>{void refreshFeature('about').catch(()=>{});},[]);
  useTabActivated(()=>{void refreshFeature('about').catch(()=>{});});
  const root = location.pathname === '/settings';
  const navigationType = useTabNavigationType();
  const profileId = useActiveProfileId();
  const active = useTabActive();
  // Returning from a child page (Back) restores the pane position; entering
  // a section fresh starts at the top. Only numeric offsets are retained. A
  // hidden retained Settings tree neither saves nor restores the shared pane.
  useLayoutEffect(() => {
    if (!active) return;
    const pane = document.querySelector<HTMLElement>('.settings-pane');
    if (!pane) return;
    const key = scrollKey(profileId, `settings${location.pathname}`, location.search);
    if (navigationType === 'POP') {
      pane.scrollTop = readListPosition(key) ?? 0;
    } else {
      pane.scrollTop = 0;
    }
    const save = () => saveListPosition(key, pane.scrollTop);
    pane.addEventListener('scroll', save, { passive: true });
    return () => { pane.removeEventListener('scroll', save); saveListPosition(key, pane.scrollTop); };
  }, [active, location.pathname, location.search, navigationType, profileId]);
  return <div className="settings-desktop" data-tab-active={active ? 'true' : undefined} style={{'--settings-surface':theme?.settingsSurface??'var(--app-surface)'} as React.CSSProperties}>
    <FullscreenButton />
    <aside className="settings-sidebar"><h1>Settings</h1><nav aria-label="Settings categories">{[
      ['account','Account',UserCircle],['general','General',Settings],['about','About',Info],['advanced','Advanced',SlidersHorizontal],
    ].map(([id,label,Icon]) => { const Glyph=Icon as typeof Info;return <Link key={String(id)} to={`/settings?category=${id}`} className={category===id?'selected':''} aria-current={category===id?'page':undefined}><span><Glyph size={23}/></span>{String(label)}</Link>; })}</nav></aside>
    <div className="settings-pane"><div className="settings-pane-inner">{children}</div>{root&&<footer className="settings-attribution"><img src="/images/nuvio-wordmark.png" alt="Nuvio"/><div>Made with ❤️ by Tapframe and friends</div><div>Version {version}{about?.versionCode!=null?` (${about.versionCode})`:null}</div>{about?.basedOnVersion&&<div>Based on Nuvio {about.basedOnVersion}</div>}</footer>}</div>
  </div>;
}
