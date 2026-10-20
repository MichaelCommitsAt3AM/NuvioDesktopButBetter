import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, LayoutGrid, LibraryBig, LoaderCircle, Play, RefreshCw, Rows2, Search } from 'lucide-react';
import { FullscreenButton } from '../../components/FullscreenButton';
import { call, refreshFeature, useFeatureSnapshot, useSelector } from '../../bridge';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/ui';
import { InlineError } from '../../components/Status';
import { Poster } from '../../components/Poster';
import { PosterLoadingCard } from '../../components/PosterLoadingCard';
import { DropdownChip } from '../../components/DropdownChip';
import { useProgressiveCount } from '../../components/ProgressiveMount';
import { Shelf } from '../../components/Shelf';
import { useLocale } from '../../i18n/strings';

import { Link, useNavigationType } from 'react-router-dom';
import './library.css';
import type { AppearanceSnapshot } from '../settings/appearanceStore';
import { projectLibraryItems } from './libraryProjection';
import { projectLibraryVertical } from './libraryVertical';
import { mediaTypeLabel, sortOptionLabel } from './libraryLabels';
import { useLibraryGridColumns } from './libraryGrid';
import { scrollKey, useActiveProfileId, useListScrollRestore } from '../../navigation/scrollStore';
import { useDisintegratingRemoval } from '../../components/disintegration';
import { usePlacementFlip } from '../../components/placementFlip';
import { mediaKey } from '../../components/keys';
import '../../components/disintegration.css';

type Extras = { sortOptions?: string[]; orderedKeys?: string[]; source: string; layout: string; sort: string; tabs: { key: string; title: string }[]; items: { id: string; type: string; savedAt: number; listKeys: string[]; category: string }[]; sections: { type: string; title: string; items: string[] }[] };
type CloudType = 'torrent' | 'usenet' | 'webdownload' | 'file';
type Cloud = { enabled: boolean; loading: boolean; loaded: boolean; providers: { id: string; name: string; error: string | null; items: { key: string; name: string; type: CloudType; status: string; size: number | null; progress?: number | null; files: { key: string; name: string; playable: boolean; size: number | null }[] }[] }[] };

export function LibraryPage() {
  const library = useSelector(current => current.library);
  const extras = useFeatureSnapshot<Extras>('libraryExtras');
  const cloud = useFeatureSnapshot<Cloud>('cloud');
  const appearance = useFeatureSnapshot<AppearanceSnapshot>('appearance');
  const { t } = useLocale();
  const [mode, setMode] = useState('saved');
  const [selectedList, setSelectedList] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [cloudQuery, setCloudQuery] = useState('');
  const [cloudProvider, setCloudProvider] = useState('');
  const [cloudType, setCloudType] = useState('');
  const [selectedCloudItem, setSelectedCloudItem] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const navigationType = useNavigationType();
  const profileId = useActiveProfileId();
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setSelectedList(''); setSelectedType(''); }, [profileId, extras?.source]);
  const layout = extras?.layout === 'vertical' ? 'vertical' : 'horizontal';
  const selectedSection = extras?.sections.find(section => section.type === selectedList);
  usePlacementFlip(gridRef);
  useEffect(() => { void refreshFeature('libraryExtras', 'library.extras').catch(cause => setError(String(cause))); }, []);
  useEffect(() => { if (mode === 'cloud') { setSelectedCloudItem(null); void refreshFeature('cloud').catch(cause => setError(String(cause))); } }, [mode]);
  const run = async (method: string, params: Record<string, unknown>, topic = 'libraryExtras') => { setError(''); try { await call(method, params); await refreshFeature(topic, topic === 'libraryExtras' ? 'library.extras' : 'cloud.snapshot'); } catch(cause) { setError(cause instanceof Error ? cause.message : String(cause)); } };
  const flatItems = useMemo(() => {
    const result = [...library.items];
    if (extras?.orderedKeys) return projectLibraryItems(result, extras.orderedKeys);
    const sort = extras?.sort ?? 'added_desc';
    if (sort.startsWith('title')) result.sort((a,b) => a.name.localeCompare(b.name) * (sort === 'title_desc' ? -1 : 1));
    else if (sort.startsWith('added')) {
      const savedAt = new Map((extras?.items ?? []).map(record => [`${record.type}|${record.id}`, record.savedAt]));
      result.sort((a,b) => ((savedAt.get(`${a.type}|${a.id}`) ?? 0) - (savedAt.get(`${b.type}|${b.id}`) ?? 0)) * (sort === 'added_desc' ? -1 : 1));
    }
    return result;
  }, [library.items, extras]);
  const vertical = useMemo(() => projectLibraryVertical({
    items: library.items,
    extraItems: extras?.items ?? [],
    orderedKeys: extras?.orderedKeys ?? [],
    sections: extras?.sections ?? [],
    source: extras?.source ?? 'local',
    selectedSectionType: selectedList,
    selectedType,
  }), [library.items, extras, selectedList, selectedType]);
  const displayItems = layout === 'vertical' ? vertical.items : flatItems;
  const sortOptions = extras?.sortOptions ?? [];
  const columns = useLibraryGridColumns(gridRef, appearance?.cardStyle?.widthDp ?? 126, layout === 'vertical');
  const hasContent = displayItems.length > 0 || (extras?.sections.length ?? 0) > 0;
  useListScrollRestore(scrollKey(profileId, '/library', `${layout}|${mode}|${extras?.sort ?? ''}|${selectedSection?.type ?? ''}|${vertical.selectedType ?? ''}`), navigationType, !library.loading);
  const removal = useDisintegratingRemoval(displayItems, (entry) => mediaKey(entry.type, entry.id), profileId);
  const playCloud = async (itemKey: string, fileKey: string) => { setBusy(fileKey); try { await call('cloud.play', { itemKey, fileKey }); setError(''); } catch(cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(''); } };
  const visibleCount = useProgressiveCount(displayItems.length, `library:${layout}:${extras?.sort ?? 'added_desc'}:${mode}:${selectedSection?.type ?? ''}:${vertical.selectedType ?? ''}`);
  const removalPaged = removal.visible.slice(0, visibleCount);
  for (const entry of removal.visible) {
    if (removal.bursting.has(mediaKey(entry.type, entry.id)) && !removalPaged.includes(entry)) removalPaged.push(entry);
  }
  const pendingCount = Math.max(0, displayItems.length - visibleCount);
  const targetLayout = layout === 'horizontal' ? 'vertical' : 'horizontal';
  const targetLayoutLabel = targetLayout === 'vertical' ? t('library_layout_show_vertical') : t('library_layout_show_horizontal');
  const headerActions = <div className="library-header-actions">
    {mode === 'saved' && <button className="library-icon-button library-layout-toggle" type="button" aria-label={targetLayoutLabel} title={targetLayoutLabel} onClick={() => void run('library.setLayout', { layout: targetLayout })}>
      <span key={layout} className="library-layout-toggle-icon">{targetLayout === 'vertical' ? <LayoutGrid size={24} /> : <Rows2 size={24} />}</span>
    </button>}
    <Link className="button secondary library-downloads-button" to="/library/downloads"><Download size={19} /><span>Downloads</span></Link>
  </div>;
  const savedControls = layout === 'vertical' || sortOptions.length > 0
    ? <div className="library-saved-controls">
      {layout === 'vertical' && vertical.availableSections.length > 0 && <DropdownChip
        ariaLabel={t('library_filter_list')}
        label={vertical.selectedSection?.title ?? ''}
        selectedKey={vertical.selectedSection?.type ?? ''}
        options={vertical.availableSections.map(section => ({ key: section.type, label: section.title }))}
        enabled={vertical.availableSections.length > 1}
        onSelect={option => { setSelectedList(option.key); setSelectedType(''); }} />}
      {layout === 'vertical' && <DropdownChip
        ariaLabel={t('library_filter_type')}
        label={vertical.selectedType ? mediaTypeLabel(t, vertical.selectedType) : t('library_filter_all_types')}
        selectedKey={vertical.selectedType ?? ''}
        options={[{ key: '', label: t('library_filter_all_types') }, ...vertical.availableTypes.map(type => ({ key: type, label: mediaTypeLabel(t, type) }))]}
        enabled={vertical.availableTypes.length > 0}
        onSelect={option => setSelectedType(option.key)} />}
      {sortOptions.length > 0 && <DropdownChip
        ariaLabel={t('library_filter_sort')}
        label={sortOptionLabel(t, extras?.sort ?? 'default')}
        selectedKey={extras?.sort}
        options={sortOptions.map(option => ({ key: option, label: sortOptionLabel(t, option) }))}
        enabled={sortOptions.length > 1}
        onSelect={option => void run('library.setSort', { sort: option.key })} />}
    </div>
    : null;
  const shelfSections = extras?.sections.length ? extras.sections : [{ type: 'all', title: 'Saved titles', items: flatItems.map(item => `${item.type}|${item.id}`) }];
  return <div className={`page library-page ${mode === 'cloud' ? 'library-cloud-mode' : ''}`}>
    <FullscreenButton onError={setError} />
    <PageHeader title="Library" action={headerActions} />
    <div className="library-source-switch" role="tablist" aria-label="Library source">
      <button role="tab" aria-selected={mode === 'saved'} className={mode === 'saved' ? 'selected' : ''} onClick={() => setMode('saved')}>Saved</button>
      <button role="tab" aria-selected={mode === 'cloud'} className={mode === 'cloud' ? 'selected' : ''} onClick={() => setMode('cloud')}>Cloud</button>
    </div>
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
      {!library.loading && !hasContent && <EmptyState title="No saved titles" message="Save titles from their details page to add them here." icon={<LibraryBig />} />}
      {!library.loading && hasContent && <>
        {savedControls}
        {layout === 'horizontal' && shelfSections.map(section => <Shelf className="library-shelf" key={section.type} showPosterRating={false} shelf={{ key: `library:${section.type}`, title: section.title, subtitle: '', items: projectLibraryItems(library.items, section.items), hasMore: false }} />)}
        {layout === 'vertical' && <div className="library-grid" ref={gridRef} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{removalPaged.map(item => { const key = mediaKey(item.type, item.id); const bursting = removal.bursting.has(key); return <div key={key} data-flip-key={key} className={bursting ? 'is-disintegrating' : undefined}>{bursting && <span className="disintegration-burst" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></span>}<Poster item={item} onRemoveAction={(entry, operation) => void removal.remove(entry, operation).catch((cause) => setError(String(cause)))} /></div>; })}{Array.from({ length: pendingCount }, (_, index) => <div key={`skeleton-${index}`}><PosterLoadingCard variant="poster" /></div>)}</div>}
      </>}
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
          {selectedItem ? <div className="cloud-item-picker"><div><button className="library-icon-button" aria-label="Back to cloud items" onClick={() => setSelectedCloudItem(null)}><ArrowLeft size={18}/></button><div><strong>{selectedItem.name}</strong><small>Select a file to play</small></div></div>{selectedItem.files.map(file => <button className="cloud-file" key={file.key} disabled={!file.playable || !!busy} onClick={() => void playCloud(selectedItem.key, file.key)}><Play size={16}/><span>{file.name}</span>{file.size != null && <span>{(file.size / 1024 ** 3).toFixed(2)} GB</span>}</button>)}</div> : visibleItems.map(item => <button className="cloud-item-row" key={item.key} disabled={!item.files.some(file => file.playable)} onClick={() => { const playable = item.files.filter(file => file.playable); if (playable.length === 1) void playCloud(item.key, playable[0].key); else setSelectedCloudItem(item.key); }}><span className="cloud-item-copy"><strong>{item.name}</strong><small>{provider.name} • {item.type === 'webdownload' ? 'Web download' : item.type}</small><small>{[item.status, item.size != null ? `${(item.size / 1024 ** 3).toFixed(2)} GB` : '', item.progress != null ? `${Math.round(item.progress * 100)}%` : ''].filter(Boolean).join(' • ') || 'Ready'}</small></span>{item.files.some(file => file.playable) && <Play size={19}/>}</button>)}</section>;
      })}
    </>}
  </div>;
}
