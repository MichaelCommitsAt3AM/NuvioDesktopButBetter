import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, Grid2X2, LibraryBig, LoaderCircle, Maximize, RefreshCw, Play, Rows3, Search } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { call, refreshFeature, useFeatureSnapshot, useSelector } from '../../bridge';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/ui';
import { InlineError } from '../../components/Status';
import { Poster } from '../../components/Poster';
import { PosterLoadingCard } from '../../components/PosterLoadingCard';
import { useProgressiveCount } from '../../components/ProgressiveMount';
import { Shelf } from '../../components/Shelf';
import { ListMembershipButton } from './ListMembershipButton';
import { Link } from 'react-router-dom';
import './library.css';

type Extras = { source: string; layout: string; sort: string; tabs: { key: string; title: string }[]; items: { id: string; type: string; savedAt: number; listKeys: string[]; category: string }[]; sections: { type: string; title: string; items: string[] }[] };
type CloudType = 'torrent' | 'usenet' | 'webdownload' | 'file';
type Cloud = { enabled: boolean; loading: boolean; loaded: boolean; providers: { id: string; name: string; error: string | null; items: { key: string; name: string; type: CloudType; status: string; size: number | null; progress?: number | null; files: { key: string; name: string; playable: boolean; size: number | null }[] }[] }[] };

export function LibraryPage() {
  const library = useSelector(current => current.library);
  const extras = useFeatureSnapshot<Extras>('libraryExtras');
  const cloud = useFeatureSnapshot<Cloud>('cloud');
  const [mode, setMode] = useState('saved');
  const [cloudQuery, setCloudQuery] = useState('');
  const [cloudProvider, setCloudProvider] = useState('');
  const [cloudType, setCloudType] = useState('');
  const [selectedCloudItem, setSelectedCloudItem] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => { void refreshFeature('libraryExtras', 'library.extras').catch(cause => setError(String(cause))); }, []);
  useEffect(() => { if (mode === 'cloud') { setSelectedCloudItem(null); void refreshFeature('cloud').catch(cause => setError(String(cause))); } }, [mode]);
  const run = async (method: string, params: Record<string, unknown>, topic = 'libraryExtras') => { setError(''); try { await call(method, params); await refreshFeature(topic, topic === 'libraryExtras' ? 'library.extras' : 'cloud.snapshot'); } catch(cause) { setError(cause instanceof Error ? cause.message : String(cause)); } };
  const items = useMemo(() => {
    const result = [...library.items];
    const sort = extras?.sort ?? 'added_desc';
    if (sort.startsWith('title')) result.sort((a,b) => a.name.localeCompare(b.name) * (sort === 'title_desc' ? -1 : 1));
    else if (sort.startsWith('added')) result.sort((a,b) => ((extras?.items.find(record => record.id === a.id && record.type === a.type)?.savedAt ?? 0) - (extras?.items.find(record => record.id === b.id && record.type === b.type)?.savedAt ?? 0)) * (sort === 'added_desc' ? -1 : 1));
    return result;
  }, [library.items, extras]);
  const playCloud = async (itemKey: string, fileKey: string) => { setBusy(fileKey); try { await call('cloud.play', { itemKey, fileKey }); setError(''); } catch(cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(''); } };
  const targetLayout = extras?.layout === 'horizontal' ? 'vertical' : 'horizontal';
  const visibleCount = useProgressiveCount(items.length, `library:${extras?.layout ?? 'grid'}`);
  const visibleItems = items.slice(0, visibleCount);
  const pendingCount = items.length - visibleItems.length;
  const headerActions = <div className="library-header-actions">
    <button className="library-icon-button" type="button" aria-label="Toggle fullscreen" title="Toggle fullscreen" onClick={() => { const win = getCurrentWindow(); void win.isFullscreen().then(fullscreen => win.setFullscreen(!fullscreen)).catch(() => {}); }}><Maximize size={18} /></button>
    {mode === 'saved' && <button className="library-icon-button" type="button" aria-label={targetLayout === 'vertical' ? 'Show grid view' : 'Show horizontal shelves'} title={targetLayout === 'vertical' ? 'Show grid view' : 'Show horizontal shelves'} onClick={() => void run('library.setLayout', { layout: targetLayout })}>{targetLayout === 'vertical' ? <Grid2X2 size={19} /> : <Rows3 size={19} />}</button>}
    <Link className="library-icon-button" to="/library/downloads" aria-label="Downloads" title="Downloads"><Download size={19} /></Link>
  </div>;
  return <div className={`page library-page ${mode === 'cloud' ? 'library-cloud-mode' : ''}`}>
    <PageHeader title="Library" action={headerActions} />
    <div className="library-source-switch" role="tablist" aria-label="Library source">
      <button role="tab" aria-selected={mode === 'saved'} className={mode === 'saved' ? 'selected' : ''} onClick={() => setMode('saved')}>Saved</button>
      <button role="tab" aria-selected={mode === 'cloud'} className={mode === 'cloud' ? 'selected' : ''} onClick={() => setMode('cloud')}>Cloud</button>
    </div>
    {mode === 'saved' && <div className="library-saved-spacer" aria-hidden="true" />}
    {mode === 'cloud' && <>
      <div className="library-cloud-toolbar">
        <select aria-label="Cloud provider" className="library-cloud-filter" value={cloudProvider} onChange={event => { setCloudProvider(event.target.value); setCloudType(''); setSelectedCloudItem(null); }}><option value="">All</option>{cloud?.providers.map(provider => <option value={provider.id} key={provider.id}>{provider.name}</option>)}</select>
        <select aria-label="Cloud item type" className="library-cloud-filter" value={cloudType} onChange={event => { setCloudType(event.target.value); setSelectedCloudItem(null); }}><option value="">All</option>{(['torrent', 'usenet', 'webdownload', 'file'] as CloudType[]).filter(type => cloud?.providers.some(provider => (!cloudProvider || provider.id === cloudProvider) && provider.items.some(item => item.type === type))).map(type => <option value={type} key={type}>{type === 'webdownload' ? 'Web download' : type[0].toUpperCase() + type.slice(1)}</option>)}</select>
        <button className="library-icon-button library-refresh-icon" type="button" aria-label="Refresh cloud library" title="Refresh" onClick={() => void run('cloud.refresh', {}, 'cloud')}><RefreshCw size={18} /></button>
      </div>
      <label className="library-cloud-search"><Search size={18} /><input aria-label="Search cloud library" placeholder="Search cloud library" value={cloudQuery} onChange={event => { setCloudQuery(event.target.value); setSelectedCloudItem(null); }} />{cloudQuery && <button type="button" aria-label="Clear cloud library search" onClick={() => setCloudQuery('')}>×</button>}</label>
    </>}
    {error && <InlineError message={error} />}
    {mode === 'saved' && <>
      {library.error && <InlineError message={library.error} />}
      {library.loading && <div className="loading-block"><LoaderCircle className="spin" />Loading your library…</div>}
      {!library.loading && !items.length && <EmptyState title="No saved titles" message="Save titles from their details page to add them here." icon={<LibraryBig />} />}
      {extras?.layout === 'horizontal' && (extras.sections.length ? extras.sections : [{ type: 'all', title: 'Saved titles', items: items.map(item => `${item.type}|${item.id}`) }]).map(section => <Shelf className="library-shelf" key={section.type} showPosterRating={false} shelf={{ key: `library:${section.type}`, title: section.title, subtitle: '', items: items.filter(item => section.items.includes(`${item.type}|${item.id}`)), hasMore: false }} />)}
      {extras?.layout !== 'horizontal' && <div className="library-grid">{visibleItems.map(item => <div key={`${item.type}:${item.id}`}><Poster item={item} /><ListMembershipButton type={item.type} id={item.id} name={item.name} /></div>)}{Array.from({ length: pendingCount }, (_, index) => <div key={`skeleton-${index}`}><PosterLoadingCard variant="poster" /></div>)}</div>}
    </>}
    {mode === 'cloud' && <>
      {cloud?.loading && <div className="loading-block">Refreshing cloud library…</div>}
      {cloud?.enabled === false && <EmptyState title="Cloud library is disabled" message="Enable it in the debrid service settings." icon={<LibraryBig />} />}
      {cloud?.loaded && !cloud.providers.length && <EmptyState title="No connected cloud services" message="Connect a supported debrid provider in Settings to browse cloud files." icon={<LibraryBig />} />}
      {cloud?.providers.filter(provider => !cloudProvider || provider.id === cloudProvider).map(provider => {
        const visibleItems = provider.items.filter(item => (!cloudType || item.type === cloudType) && (item.name.toLowerCase().includes(cloudQuery.toLowerCase()) || item.files.some(file => file.name.toLowerCase().includes(cloudQuery.toLowerCase()))));
        const selectedItem = visibleItems.find(item => item.key === selectedCloudItem);
        return <section key={provider.id} className="cloud-provider">
          {provider.error && !provider.items.length && <div className="cloud-error-card"><strong>Couldn't load {provider.name} cloud library</strong><p>{provider.error}</p><button className="button primary" onClick={() => void run('cloud.refresh', {}, 'cloud')}>Retry</button></div>}
          {selectedItem ? <div className="cloud-item-picker"><div><button className="library-icon-button" aria-label="Back to cloud items" onClick={() => setSelectedCloudItem(null)}><ArrowLeft size={18}/></button><div><strong>{selectedItem.name}</strong><small>Select a file to play</small></div></div>{selectedItem.files.map(file => <button className="cloud-file" key={file.key} disabled={!file.playable || !!busy} onClick={() => void playCloud(selectedItem.key, file.key)}><Play size={16}/><span>{file.name}</span>{file.size != null && <span>{(file.size / 1024 ** 3).toFixed(2)} GB</span>}</button>)}</div> : visibleItems.map(item => <button className="cloud-item-row" key={item.key} disabled={!item.files.some(file => file.playable)} onClick={() => { const playable = item.files.filter(file => file.playable); if (playable.length === 1) void playCloud(item.key, playable[0].key); else setSelectedCloudItem(item.key); }}><span className="cloud-item-copy"><strong>{item.name}</strong><small>{provider.name} • {item.type === 'webdownload' ? 'Web download' : item.type}</small><small>{[item.status, item.size != null ? `${(item.size / 1024 ** 3).toFixed(2)} GB` : '', item.progress != null ? `${Math.round(item.progress * 100)}%` : ''].filter(Boolean).join(' • ') || 'Ready'}</small></span>{item.files.some(file => file.playable) && <Play size={19}/>}</button>)}
        </section>;
      })}
    </>}
  </div>;
}
