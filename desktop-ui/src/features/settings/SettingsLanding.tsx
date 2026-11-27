import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bug, CloudDownload, Gauge, Heart, Info, Link2, Palette, Play, Puzzle, RefreshCw, Search, Shield, SlidersHorizontal, UserCircle, Users, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';
import { showTestBanner } from '../updater/updateBannerTest';
import { checkForUpdates } from '../updater/updater';
import { PageHeader } from '../../components/ui';
import { Dialog } from '../../components/Dialog';
import { settingsCategory } from './SettingsLayout';
import { useTabActive } from '../../navigation/tabActivity';
import { searchSettings, settingsResultDescription, settingsResultRoute } from './SettingsSearchEntries';
import './settingsSearch.css';

const entries = [
  {category:'account',path:'/profiles/choose',title:'Switch Profile',description:'Switch profiles, or use Manage Profiles to add, edit or delete one.',icon:Users},
  {category:'account',path:'/settings/account',title:'Account',description:'Account and sync status',icon:UserCircle},
  {category:'account',path:'/settings/integrations/tracking',title:'Tracking',description:'Connect tracking providers and choose which one powers your Library and Continue Watching.',icon:RefreshCw},
  {category:'general',path:'/settings/appearance',title:'Layout',description:'Home, streams, collections, and detail pages',icon:Palette,filled:true},
  {category:'general',path:'/settings/content',title:'Content & Discovery',description:'Manage addons and discovery sources.',icon:Puzzle,filled:true},
  {category:'general',path:'/settings/playback',title:'Playback',description:'Player, subtitles, and auto-play',icon:Play,filled:true},
  {category:'general',path:'/settings/integrations',title:'Integrations',description:'Manage available integrations',icon:Link2},
  // Last in General, with its on/off switch beside the way into its page (mobile's Data Saver shortcut).
  {category:'general',path:'/settings/data-saver',title:'Data Saver',description:'Smaller streams and no autoplaying trailers',icon:Gauge,toggle:true},
  {category:'about',path:'/settings/community',title:'Supporters & Contributors',description:'Open recognition and project credits',icon:Heart},
  {category:'about',path:'privacy',title:'Privacy Policy',description:'Learn how Nuvio handles your data',icon:Shield},
  {category:'about',path:'/settings/licenses',title:'Licenses & Attribution',description:'Data sources, acknowledgements, and platform licenses',icon:Info},
  {category:'about',path:'updates',title:'Check for updates',description:'Download latest release',icon:CloudDownload},
  {category:'about',path:'updates-test',title:'Test update banner',description:'Preview the banner and simulated download progress.',icon:Bug},
  {category:'advanced',path:'/settings/advanced',title:'Advanced',description:'Startup and profile behavior.',icon:SlidersHorizontal},
];

export function SettingsLanding() {
  const location=useLocation();
  const category=settingsCategory(location.pathname,location.search);
  const active=useTabActive();
  const [query,setQuery]=useState('');
  const [searchVisible,setSearchVisible]=useState(false);
  const searchInput=useRef<HTMLInputElement>(null);
  const searching=query.trim().length>0;
  const [updateMessage,setUpdateMessage]=useState<string|null>(null);
  const [checking,setChecking]=useState(false);
  const title=searching?'Settings':category[0].toUpperCase()+category.slice(1);
  useEffect(()=>{setQuery('');setSearchVisible(false);},[category]);
  useEffect(()=>{
    if(!active)return;
    const key=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'){event.preventDefault();setSearchVisible(true);searchInput.current?.focus();}};
    document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
  },[active]);
  async function checkUpdates(){
    setChecking(true);setUpdateMessage('Checking for updates…');
    try{setUpdateMessage(await checkForUpdates());}
    catch(error){setUpdateMessage(error instanceof Error?error.message:'Could not check for updates.');}finally{setChecking(false);}
  }
  function runRowAction(path:string){
    if(path==='privacy')void call('app.openExternal',{url:'https://nuvio.tv/privacy-policy'});
    else if(path==='updates')void checkUpdates();
    else if(path==='updates-test')showTestBanner();
  }
  const rows=searching?searchSettings(query).map(entry=>({key:entry.key,path:settingsResultRoute(entry),title:entry.title,description:settingsResultDescription(entry),icon:entries.find(row=>entry.route.startsWith(row.path))?.icon??Info})):entries.filter(entry=>entry.category===category&&(entry.path!=='updates-test'||import.meta.env.DEV)).map(entry=>({...entry,key:entry.path}));
  return <div className="page settings-root" onWheel={event=>{if(event.deltaY<0&& (document.querySelector('.settings-pane')?.scrollTop??0)===0)setSearchVisible(true);}}>
    <PageHeader title={title} action={<button className="icon-button" aria-label="Search settings" onClick={()=>{setSearchVisible(true);searchInput.current?.focus();}}><Search size={23}/></button>}/>
    {searchVisible&&<div className="settings-search-field"><Search size={23}/><input ref={searchInput} autoFocus className="settings-search" placeholder="Search Settings" aria-label="Search settings" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'){setQuery('');event.stopPropagation();}}}/>{query&&<button className="icon-button" aria-label="Clear search" onClick={()=>{setQuery('');searchInput.current?.focus();}}><X size={23}/></button>}</div>}
    <h2 className="settings-group-title">{searching?'Search Results':title}</h2>
    <div className="settings-nav-card">{rows.map(entry=>{
      const Icon=entry.icon;
      const filledIcon='filled' in entry&&entry.filled;
      const content=<><span className="settings-nav-icon"><Icon size={28} fill={filledIcon?'currentColor':'none'} strokeWidth={entry.path==='/settings/integrations'?3:2}/></span><span className="settings-nav-copy"><strong>{entry.title}</strong><span>{entry.description}</span></span></>;
      if('toggle' in entry&&entry.toggle)return <DataSaverNavRow key={entry.key} path={entry.path}>{content}</DataSaverNavRow>;
      return entry.path==='privacy'||entry.path==='updates'||entry.path==='updates-test'?<button key={entry.key} className="settings-nav-row" onClick={()=>runRowAction(entry.path)}>{content}</button>:<Link key={entry.key} className="settings-nav-row" to={entry.path}>{content}</Link>;
    })}</div>{searching&&!rows.length&&<p className="muted">No settings found.</p>}
    {updateMessage&&<Dialog label="Check for Updates" onClose={()=>setUpdateMessage(null)}><h2>Check for Updates</h2><p>{updateMessage}</p><div className="dialog-actions"><button className="button secondary" disabled={checking} onClick={()=>setUpdateMessage(null)}>Close</button></div></Dialog>}
  </div>;
}

/** The Data Saver row: opens its page, with the switch on the right turning it on or off. */
function DataSaverNavRow({ path, children }: { path: string; children: ReactNode }) {
  const enabled = useFeatureSnapshot<{ enabled?: boolean }>('dataSaver')?.enabled ?? false;
  const [busy, setBusy] = useState(false);
  const toggle = async (value: boolean) => {
    setBusy(true);
    try { await call('dataSaver.setEnabled', { enabled: value }); await refreshFeature('dataSaver'); }
    catch { /* The switch stays as Kotlin reports it. */ }
    finally { setBusy(false); }
  };
  return <div className="settings-nav-row settings-nav-row-toggle">
    <Link className="settings-nav-row-link" to={path}>{children}</Link>
    <label className="switch" aria-label="Data Saver"><input type="checkbox" checked={enabled} disabled={busy} onChange={event => void toggle(event.target.checked)} /><span /></label>
  </div>;
}
