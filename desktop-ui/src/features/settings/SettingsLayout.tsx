import { useEffect, type ReactNode } from 'react';
import { Info, Settings, SlidersHorizontal, UserCircle } from 'lucide-react';
import { Link, useLocation, useNavigationType } from 'react-router-dom';
import { useSelector, useFeatureSnapshot, refreshFeature } from '../../bridge';
import { readListPosition, saveListPosition, scrollKey, useActiveProfileId } from '../../navigation/scrollStore';
import './settingsParity.css';
import { ReadOnlyBoundary } from '../../components/ReadOnlyBoundary';

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
  const readOnly = useSelector(state => state.session.profiles.find(profile => profile.id === state.session.activeProfile)?.kidsEnabled === true);
  const theme = settings.themes.find(item=>item.id.toLowerCase()===settings.theme.toLowerCase());
  const version = useSelector(state => state.session.version);
  const about = useFeatureSnapshot<{versionCode?:number;basedOnVersion?:string|null}>('about');
  useEffect(()=>{void refreshFeature('about').catch(()=>{});},[]);
  const root = location.pathname === '/settings';
  const navigationType = useNavigationType();
  const profileId = useActiveProfileId();
  // Returning from a child page (Back) restores the pane position; entering
  // a section fresh starts at the top. Only numeric offsets are retained.
  useEffect(() => {
    const pane = document.querySelector<HTMLElement>('.settings-pane');
    if (!pane) return;
    const key = scrollKey(profileId, `settings${location.pathname}`, location.search);
    if (navigationType === 'POP') {
      pane.scrollTop = readListPosition(key) ?? 0;
    } else {
      pane.scrollTo(0, 0);
    }
    const save = () => saveListPosition(key, pane.scrollTop);
    pane.addEventListener('scroll', save, { passive: true });
    return () => { pane.removeEventListener('scroll', save); saveListPosition(key, pane.scrollTop); };
  }, [location.pathname, location.search, navigationType, profileId]);
  return <div className="settings-desktop" style={{'--settings-surface':theme?.settingsSurface??'var(--app-surface)'} as React.CSSProperties}>
    <aside className="settings-sidebar"><h1>Settings</h1><nav aria-label="Settings categories">{[
      ['account','Account',UserCircle],['general','General',Settings],['about','About',Info],['advanced','Advanced',SlidersHorizontal],
    ].map(([id,label,Icon]) => { const Glyph=Icon as typeof Info;return <Link key={String(id)} to={`/settings?category=${id}`} className={category===id?'selected':''} aria-current={category===id?'page':undefined}><span><Glyph size={23}/></span>{String(label)}</Link>; })}</nav></aside>
    <div className="settings-pane"><div className="settings-pane-inner"><ReadOnlyBoundary readOnly={readOnly} reason="Switch to an adult profile to change these settings.">{children}</ReadOnlyBoundary></div>{root&&<footer className="settings-attribution"><img src="/images/nuvio-wordmark.png" alt="Nuvio"/><div>Made with ❤️ by Tapframe and friends</div><div>Version {version}{about?.versionCode!=null?` (${about.versionCode})`:null}</div>{about?.basedOnVersion&&<div>Based on Nuvio {about.basedOnVersion}</div>}</footer>}</div>
  </div>;
}
