import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronRight, Film, FolderPlus, Grid2X2, LoaderCircle, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';
import type { Media, Shelf as ShelfData } from '../../generated/contract';
import type { AppearanceSnapshot } from '../settings/appearanceStore';
import { EmptyState } from '../../components/EmptyState';
import { InlineError } from '../../components/Status';
import { PageHeader } from '../../components/ui';
import { Poster } from '../../components/Poster';
import { Dialog } from '../../components/Dialog';
import { Shelf } from '../../components/Shelf';
import { HorizontalRail } from '../../components/HorizontalRail';
import './collections.css';

type Source = { provider?: string; addonId?: string | null; type?: string | null; catalogId?: string | null; genre?: string | null; tmdbSourceType?: string | null; title?: string | null; tmdbId?: number | null; traktListId?: number | null; mediaType?: string | null; sortBy?: string | null; sortHow?: string | null; filters?: Record<string, unknown> | null };
type Folder = { id: string; title: string; coverImageUrl?: string | null; focusGifUrl?: string | null; focusGifEnabled?: boolean; mobileFocusGifEnabled?: boolean; coverEmoji?: string | null; tileShape?: string; hideTitle?: boolean; sources?: Source[]; catalogSources?: Source[] };
type Collection = { id: string; title: string; backdropImageUrl?: string | null; pinToTop: boolean; viewMode: string; showAllTab: boolean; folders: Folder[] };
type CatalogOption = { addonId: string; addonName: string; type: string; catalogId: string; catalogName: string; genreOptions: string[]; genreRequired: boolean };
type Result = { traktListId: number; title: string; subtitle: string; coverImageUrl?: string | null; sortBy?: string | null; sortHow?: string | null };
type Editor = { isNew: boolean; collectionId: string | null; title: string; backdropImageUrl: string | null; pinToTop: boolean; viewMode: string; showAllTab: boolean; folders: Folder[]; isLoading: boolean; availableCatalogs: CatalogOption[]; editingFolder: Folder | null; showFolderEditor: boolean; showCatalogPicker: boolean; showTmdbSourcePicker: boolean; showTraktSourcePicker: boolean; editingTraktSourceIndex: number | null; genrePickerSourceIndex: number | null; tmdbBuilderMode: string; tmdbInput: string; tmdbTitleInput: string; tmdbMediaType: string; tmdbMediaBoth: boolean; tmdbSortBy: string; tmdbPresets: { label: string; source: Source }[]; tmdbFilters: Record<string, any>; tmdbCompanyResults: any[]; tmdbCollectionResults: any[]; tmdbSearchError: string | null; traktInput: string; traktTitleInput: string; traktMediaType: string; traktMediaBoth: boolean; traktSortBy: string; traktSortHow: string; traktSearchResults: Result[]; traktTrendingResults: Result[]; traktPopularResults: Result[]; traktSearchError: string | null };
type FolderTab = { label: string; typeLabel: string; type: string; catalogId: string; items: Media[]; isLoading: boolean; isLoadingMore: boolean; canLoadMore: boolean; error?: string | null; source?: Source | null };
type FolderDetail = { folder: Folder | null; collectionTitle: string; viewMode: string; selectedTabIndex: number; isLoading: boolean; showAllTab: boolean; tabs: FolderTab[] };

async function featureAction<T>(method: string, params: Record<string, unknown>, topic: string): Promise<T | undefined> {
  const result = await call<T>(method, params);
  await refreshFeature(topic, topic === 'collectionEditor' ? 'collections.editor.snapshot' : topic === 'folderDetail' ? 'collections.folder.snapshot' : 'collections.snapshot');
  return result;
}
function sourceName(source: Source) {
  if (source.provider === 'tmdb') return `TMDB · ${source.title || source.tmdbSourceType || 'Collection'}`;
  if (source.provider === 'trakt') return `Trakt · ${source.title || `List ${source.traktListId ?? ''}`}`;
  return `${source.addonId || 'Add-on'} · ${source.catalogId || source.type || 'Catalog'}${source.genre ? ` · ${source.genre}` : ''}`;
}

function resolvedSources(folder: Folder): Source[] { return folder.sources?.length ? folder.sources : folder.catalogSources ?? []; }

export function HomeCollections({ shelves }: { shelves: ShelfData[] }) {
  const state = useFeatureSnapshot<{ items: Collection[] }>('collections');
  const appearance = useFeatureSnapshot<AppearanceSnapshot>('appearance');
  useEffect(() => { void refreshFeature('collections').catch(() => {}); }, []);
  const items = state?.items ?? [];
  const preferences = appearance?.home.items ?? [];
  const rows = [...items.filter(collection => !preferences.some(p => p.collectionId === collection.id && !p.enabled)).map(collection => {
    const setting = preferences.find(p => p.collectionId === collection.id);
    return { order: collection.pinToTop ? -1 : setting?.order ?? Number.MAX_SAFE_INTEGER, content: <section className="shelf home-collection" key={collection.id}><div className="shelf-heading"><h2>{setting?.title ?? collection.title}</h2><Link className="text-button" to={`/collections/${collection.id}/edit`}>Edit collection</Link></div><HorizontalRail label={collection.title}>{collection.folders.map(folder => <HomeFolderTile key={folder.id} collectionId={collection.id} folder={folder} />)}</HorizontalRail></section> };
  }), ...shelves.map((shelf,index) => ({ order: preferences.find(p => p.key === shelf.key)?.order ?? index, content: <Shelf key={shelf.key} shelf={shelf} /> }))];
  return <>{rows.sort((a,b) => a.order-b.order).map(row => row.content)}</>;
}
function HomeFolderTile({ collectionId,folder }: { collectionId: string; folder: Folder }) {
  const [focused,setFocused] = useState(false);
  const artwork = focused && folder.focusGifEnabled && folder.focusGifUrl ? folder.focusGifUrl : folder.coverImageUrl;
  return <Link className={`home-folder-tile shape-${folder.tileShape ?? 'poster'}`} to={`/collections/${collectionId}/folders/${folder.id}`} onMouseEnter={() => setFocused(true)} onMouseLeave={() => setFocused(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}><span className="home-folder-art">{artwork ? <img src={artwork} alt="" /> : <span>{folder.coverEmoji || <Grid2X2 size={36} />}</span>}</span>{!folder.hideTitle && <strong>{folder.title}</strong>}</Link>;
}

export { CollectionsPage } from './CollectionManagementPage';

export function CollectionEditorPage() {
  const { collectionId = 'new' } = useParams(); const navigate = useNavigate();
  const editor = useFeatureSnapshot<Editor>('collectionEditor');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const openKey = useRef('');
  useEffect(() => {
    const key = collectionId === 'new' ? null : collectionId;
    if (openKey.current === (key ?? 'new')) return; openKey.current = key ?? 'new';
    void featureAction('collections.editor.open', { collectionId: key }, 'collectionEditor').catch((e) => setError(String(e)));
    return () => { openKey.current = ''; };
  }, [collectionId]);
  const act = async (method: string, params: Record<string, unknown> = {}) => { setError(''); try { await featureAction(method, params, 'collectionEditor'); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
  const save = async () => { setBusy(true); setError(''); try { await call('collections.editor.save', {}); await refreshFeature('collections'); navigate('/collections'); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  if (!editor) return <div className="page collections-page"><div className="loading-block"><LoaderCircle className="spin" size={22} /> Loading collection editor…</div></div>;
  const folder = editor.editingFolder;
  return <div className="page collections-page collection-editor-page">
    <PageHeader title={editor.isNew ? 'New collection' : 'Edit collection'} subtitle="Set up the collection and its folders." action={<div className="catalog-actions"><button className="button secondary" onClick={() => { void act('collections.editor.cancel').then(() => navigate('/collections')); }}><X size={15} /> Cancel</button><button className="button primary" disabled={busy || editor.isLoading} onClick={() => void save()}><Check size={15} /> {busy ? 'Saving…' : 'Save collection'}</button></div>} />
    {error && <InlineError message={error} />}
    <section className="collection-editor-card"><h2>Collection</h2><label className="collection-field">Name<input value={editor.title} onChange={(e) => void act('collections.editor.setTitle', { title: e.target.value })} placeholder="e.g. Weekend watchlist" /></label>
      <label className="collection-field">Backdrop image URL<input value={editor.backdropImageUrl || ''} onChange={(e) => void act('collections.editor.setBackdrop', { url: e.target.value })} placeholder="https://…" /></label>
      {editor.backdropImageUrl && <div className="collection-backdrop-preview" style={{ backgroundImage: `url(${editor.backdropImageUrl})` }} />}
      <label className="collection-check"><input type="checkbox" checked={editor.pinToTop} onChange={(e) => void act('collections.editor.setPinToTop', { enabled: e.target.checked })} /> Pin collection to the top</label>
      <label className="collection-field">Folder layout<select value={editor.viewMode} onChange={(e) => void act('collections.editor.setViewMode', { mode: e.target.value })}><option value="TABBED_GRID">Tabbed grid</option><option value="ROWS">Rows</option><option value="FOLLOW_LAYOUT">Follow layout</option></select></label>
      <label className="collection-check"><input type="checkbox" checked={editor.showAllTab} onChange={(e) => void act('collections.editor.setShowAllTab', { enabled: e.target.checked })} /> Show an “All” tab</label>
    </section>
    <section className="collection-editor-card"><div className="collection-editor-heading"><div><h2>Folders</h2><p>Each folder can combine add-on catalogs, TMDB sources, and Trakt lists.</p></div><button className="button secondary" onClick={() => void act('collections.editor.addFolder', { title: `Folder ${editor.folders.length + 1}` })}><FolderPlus size={15} /> Add folder</button></div>
      {!editor.folders.length && <p className="collection-muted">No folders yet. Add a folder, then choose its sources.</p>}
      <div className="editor-folder-list">{editor.folders.map((item, index) => <div className="editor-folder-row" key={item.id}><span className="folder-emoji">{item.coverEmoji || <Grid2X2 size={16} />}</span><div className="editor-folder-copy"><strong>{item.title}</strong><span>{resolvedSources(item).length} sources · {item.tileShape || 'poster'} cards</span></div><button title="Move up" disabled={index === 0} onClick={() => void act('collections.editor.moveFolder', { from: index, to: index - 1 })}><ArrowUp size={15} /></button><button title="Move down" disabled={index === editor.folders.length - 1} onClick={() => void act('collections.editor.moveFolder', { from: index, to: index + 1 })}><ArrowDown size={15} /></button><button title="Edit folder" onClick={() => void act('collections.editor.editFolder', { id: item.id })}><Pencil size={15} /></button><button title="Remove folder" onClick={() => void act('collections.editor.removeFolder', { id: item.id })}><Trash2 size={15} /></button></div>)}</div>
    </section>
    {editor.showFolderEditor && folder && <FolderEditor editor={editor} act={act} />}
    {editor.showCatalogPicker && <PickerPanel title="Add-on catalogs" onClose={() => void act('collections.editor.hideCatalogPicker')}><div className="catalog-option-list">{editor.availableCatalogs.map((catalog) => <CatalogOption folder={folder} key={`${catalog.addonId}/${catalog.type}/${catalog.catalogId}`} catalog={catalog} selected={(folder ? resolvedSources(folder) : []).some(s => s.addonId === catalog.addonId && s.type === catalog.type && s.catalogId === catalog.catalogId)} act={act} />)}</div></PickerPanel>}
    {editor.showTmdbSourcePicker && <TmdbPicker editor={editor} act={act} />}
    {editor.showTraktSourcePicker && <TraktPicker editor={editor} act={act} />}
  </div>;
}

function FolderEditor({ editor, act }: { editor: Editor; act: (method: string, params?: Record<string, unknown>) => Promise<void> }) {
  const folder = editor.editingFolder!;
  const field = (name: string, value: string) => void act('collections.editor.updateFolder', { field: name, value });
  const bool = (name: string, enabled: boolean) => void act('collections.editor.updateFolder', { field: name, enabled });
  const sources = resolvedSources(folder);
  return <section className="collection-editor-card folder-editor"><div className="collection-editor-heading"><div><h2>Edit folder</h2><p>Folder settings and real source pickers.</p></div><button className="button secondary" onClick={() => void act('collections.editor.cancelFolder')}><X size={14} /> Close</button></div>
    <div className="collection-editor-grid"><label className="collection-field">Folder name<input value={folder.title} onChange={(e) => field('title', e.target.value)} /></label><label className="collection-field">Cover image URL<input value={folder.coverImageUrl || ''} onChange={(e) => field('coverImageUrl', e.target.value)} placeholder="https://…" /></label><label className="collection-field">Focus GIF URL<input value={folder.focusGifUrl || ''} onChange={(e) => field('focusGifUrl', e.target.value)} placeholder="https://…" /></label><label className="collection-field">Cover emoji<input value={folder.coverEmoji || ''} onChange={(e) => field('coverEmoji', e.target.value)} placeholder="Optional" /></label>
      <label className="collection-field">Tile shape<select value={folder.tileShape || 'poster'} onChange={(e) => field('tileShape', e.target.value)}><option value="poster">Poster</option><option value="landscape">Landscape</option><option value="square">Square</option></select></label>
    </div>
    <div className="collection-control-row"><label className="collection-check"><input type="checkbox" checked={folder.mobileFocusGifEnabled ?? true} onChange={(e) => bool('mobileFocusGifEnabled', e.target.checked)} /> Enable focus GIF on mobile</label><label className="collection-check"><input type="checkbox" checked={folder.hideTitle ?? false} onChange={(e) => bool('hideTitle', e.target.checked)} /> Hide folder title</label><button className="button secondary" onClick={() => void act('collections.editor.updateFolder', { field: 'clearCover' })}>Clear cover</button></div>
    <div className="collection-source-heading"><h3>Sources</h3><div><button className="button secondary" onClick={() => void act('collections.editor.showCatalogPicker')}><Plus size={14} /> Add-on catalog</button><button className="button secondary" onClick={() => void act('collections.editor.showTmdbPicker')}><Plus size={14} /> TMDB source</button><button className="button secondary" onClick={() => void act('collections.editor.showTraktPicker')}><Plus size={14} /> Trakt list</button></div></div>
    {sources.length ? <div className="collection-source-list">{sources.map((source, i) => <div key={`${source.provider}/${source.addonId}/${source.catalogId}/${source.tmdbId}/${source.traktListId}/${i}`} className="collection-source-pill"><span>{sourceName(source)}</span>{!['tmdb','trakt'].includes(source.provider ?? '') && <select aria-label={`Genre for ${sourceName(source)}`} value={source.genre ?? ''} onChange={e => void act('collections.editor.setCatalogGenre', { index: i, genre: e.target.value || null })}><option value="">All genres</option>{editor.availableCatalogs.find(c => c.addonId === source.addonId && c.type === source.type && c.catalogId === source.catalogId)?.genreOptions.map(g => <option key={g}>{g}</option>)}</select>}{source.provider === 'trakt' && <button className="icon-button" aria-label="Edit Trakt source" onClick={() => void act('collections.editor.editTraktSource', { index: i })}><Pencil size={16} /></button>}<button className="icon-button" aria-label={`Remove ${sourceName(source)}`} onClick={() => void act('collections.editor.removeSource', { index: i })}><Trash2 size={16} /></button></div>)}</div> : <p className="collection-muted">No sources added. Choose one of the source types above.</p>}
    <div className="collection-editor-footer"><button className="button primary" onClick={() => void act('collections.editor.saveFolder')}>Done with folder</button></div>
  </section>;
}

function CatalogOption({ catalog, selected, folder, act }: { catalog: CatalogOption; selected: boolean; folder: Folder | null; act: (method: string, params?: Record<string, unknown>) => Promise<void> }) {
  const sources = folder ? resolvedSources(folder) : [];
  const index = sources.findIndex(s => s.addonId === catalog.addonId && s.type === catalog.type && s.catalogId === catalog.catalogId);
  const genre = index >= 0 ? sources[index].genre ?? '' : '';
  return <div className="catalog-option"><label><input type="checkbox" checked={selected} onChange={() => void act('collections.editor.toggleCatalog', { catalog })} /><span><strong>{catalog.catalogName}</strong><small>{catalog.addonName} · {catalog.type}</small></span></label>{catalog.genreOptions.length > 0 && <select aria-label={`Genre for ${catalog.catalogName}`} disabled={!selected} value={genre} onChange={e => void act('collections.editor.setCatalogGenre', { index, genre: e.target.value || null })}>{!catalog.genreRequired && <option value="">All genres</option>}{catalog.genreOptions.map(g => <option key={g}>{g}</option>)}</select>}</div>;
}

function PickerPanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <Dialog label={title} onClose={onClose}><section className="collection-picker"><div className="collection-picker-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose}><X size={18} /></button></div>{children}</section></Dialog>; }

function TmdbPicker({ editor, act }: { editor: Editor; act: (method: string, params?: Record<string, unknown>) => Promise<void> }) {
  const modes = ['PRESETS', 'LIST', 'PRODUCTION', 'NETWORK', 'COLLECTION', 'PERSON', 'DIRECTOR', 'DISCOVER'];
  const filters = editor.tmdbFilters || {};
  const setFilter = (key: string, value: string) => { const numeric = ['voteAverageGte','voteAverageLte','voteCountGte','year'].includes(key); const parsed = value === '' ? null : numeric ? Number(value) : value; if (typeof parsed === 'number' && !Number.isFinite(parsed)) return; void act('collections.editor.tmdb.setFilters', { filters: { ...filters, [key]: parsed } }); };
  const modeNeedsInput = !['PRESETS', 'DISCOVER'].includes(editor.tmdbBuilderMode);
  return <PickerPanel title="Add TMDB source" onClose={() => void act('collections.editor.hideTmdbPicker')}>
    <div className="source-mode-tabs">{modes.map(mode => <button className={editor.tmdbBuilderMode === mode ? 'active' : ''} key={mode} onClick={() => void act('collections.editor.tmdb.setMode', { mode })}>{mode.toLowerCase().replace('_', ' ')}</button>)}</div>
    <label className="collection-field">Source title<input value={editor.tmdbTitleInput} onChange={(e) => void act('collections.editor.tmdb.setTitle', { value: e.target.value })} placeholder="Optional display name" /></label>
    <div className="collection-control-row"><label className="collection-field">Media type<select value={editor.tmdbMediaType} onChange={(e) => void act('collections.editor.tmdb.setMediaType', { value: e.target.value })}><option value="MOVIE">Movies</option><option value="TV">Series</option></select></label><label className="collection-check"><input type="checkbox" checked={editor.tmdbMediaBoth} onChange={(e) => void act('collections.editor.tmdb.setMediaBoth', { enabled: e.target.checked })} /> Include both movies and series</label><label className="collection-field">Sort<select value={editor.tmdbSortBy} onChange={(e) => void act('collections.editor.tmdb.setSort', { value: e.target.value })}>{['original','popularity.desc','vote_average.desc','vote_count.desc','primary_release_date.desc','first_air_date.desc'].map(s => <option key={s} value={s}>{s}</option>)}</select></label></div>
    {editor.tmdbBuilderMode === 'PRESETS' ? <div className="picker-results"><p className="collection-muted">Choose a built-in TMDB source.</p>{editor.tmdbPresets?.map((preset,index) => <button className="picker-result" key={preset.label} onClick={() => void act('collections.editor.tmdb.addPreset', { index })}><strong>{preset.label}</strong><Plus size={15} /></button>)}</div> : <>
      {modeNeedsInput && <div className="tmdb-input-row"><label className="collection-field">{editor.tmdbBuilderMode === 'COLLECTION' || editor.tmdbBuilderMode === 'PRODUCTION' || editor.tmdbBuilderMode === 'NETWORK' ? 'Search name or enter TMDB ID' : 'Enter TMDB ID or search value'}<input value={editor.tmdbInput} onChange={(e) => void act('collections.editor.tmdb.setInput', { value: e.target.value })} placeholder={editor.tmdbBuilderMode === 'PERSON' || editor.tmdbBuilderMode === 'DIRECTOR' ? 'Person ID' : 'ID or search phrase'} /></label>{['PRODUCTION','NETWORK'].includes(editor.tmdbBuilderMode) && <button className="button secondary" onClick={() => void act('collections.editor.tmdb.searchCompanies')}><Search size={14} /> Search</button>}{editor.tmdbBuilderMode === 'COLLECTION' && <button className="button secondary" onClick={() => void act('collections.editor.tmdb.searchCollections')}><Search size={14} /> Search</button>}</div>}
      {editor.tmdbBuilderMode === 'DISCOVER' && <div className="collection-filter-grid">{[['withGenres','Genres'],['withoutGenres','Exclude genres'],['releaseDateGte','Release date from'],['releaseDateLte','Release date to'],['voteAverageGte','Rating at least'],['voteAverageLte','Rating at most'],['voteCountGte','Vote count at least'],['withOriginalLanguage','Language'],['withOriginCountry','Country'],['withKeywords','Keyword IDs'],['withoutKeywords','Exclude keywords'],['withCompanies','Company IDs'],['withoutCompanies','Exclude companies'],['withNetworks','Network IDs'],['year','Year'],['watchRegion','Watch region'],['withWatchProviders','Provider IDs'],['withoutWatchProviders','Exclude providers']].map(([key,label]) => <label className="collection-field" key={key}>{label}<input value={filters[key] ?? ''} onChange={(e) => setFilter(key, e.target.value)} /></label>)}</div>}
      {editor.tmdbSearchError && <InlineError message={editor.tmdbSearchError} />}
      {(editor.tmdbCompanyResults.length > 0 || editor.tmdbCollectionResults.length > 0) && <div className="picker-results">{[...editor.tmdbCompanyResults.map(r=>({...r, kind:'COMPANY'})), ...editor.tmdbCollectionResults.map(r=>({...r, kind:'COLLECTION'}))].map((r:any) => <button className="picker-result" key={`${r.kind}-${r.id}`} onClick={() => void act('collections.editor.tmdb.addSource', { source: { provider:'tmdb', tmdbSourceType:editor.tmdbBuilderMode === 'NETWORK' ? 'NETWORK' : r.kind, title:r.name, tmdbId:r.id, mediaType:editor.tmdbMediaType.toLowerCase(), sortBy:editor.tmdbSortBy } })}><strong>{r.name}</strong><span>{r.kind} · {r.originCountry || ''}</span><Plus size={15} /></button>)}</div>}
      <button className="button primary" onClick={() => void act('collections.editor.tmdb.addInput')}>Add TMDB source</button>
    </>}
  </PickerPanel>;
}

function TraktPicker({ editor, act }: { editor: Editor; act: (method: string, params?: Record<string, unknown>) => Promise<void> }) {
  const [query, setQuery] = useState(''); const [tab, setTab] = useState<'trending'|'popular'|'search'>('trending');
  const results = tab === 'trending' ? editor.traktTrendingResults : tab === 'popular' ? editor.traktPopularResults : editor.traktSearchResults;
  return <PickerPanel title="Add Trakt list" onClose={() => void act('collections.editor.hideTraktPicker')}>
    <label className="collection-field">List URL or ID<input value={editor.traktInput} onChange={(e) => void act('collections.editor.trakt.setInput', { value: e.target.value })} placeholder="https://trakt.tv/lists/… or list ID" /></label><label className="collection-field">Source title<input value={editor.traktTitleInput} onChange={(e) => void act('collections.editor.trakt.setTitle', { value: e.target.value })} placeholder="Optional title" /></label>
    <div className="collection-control-row"><label className="collection-field">Media type<select value={editor.traktMediaType} onChange={(e) => void act('collections.editor.trakt.setMediaType', { value: e.target.value })}><option value="MOVIE">Movies</option><option value="TV">Series</option></select></label><label className="collection-check"><input type="checkbox" checked={editor.traktMediaBoth} onChange={(e) => void act('collections.editor.trakt.setMediaBoth', { enabled: e.target.checked })} /> Both types</label><label className="collection-field">Sort<select value={editor.traktSortBy} onChange={(e) => void act('collections.editor.trakt.setSort', { value: e.target.value })}>{['rank','added','title','released','runtime','popularity','percentage','votes'].map(x=><option key={x}>{x}</option>)}</select></label><label className="collection-field">Direction<select value={editor.traktSortHow} onChange={(e) => void act('collections.editor.trakt.setDirection', { value: e.target.value })}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label></div>
    <div className="tmdb-input-row"><label className="collection-field">Find public lists<input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter') void act('collections.editor.trakt.setInput',{value:query}).then(()=>act('collections.editor.trakt.search'));}} placeholder="Search lists" /></label><button className="button secondary" onClick={() => void act('collections.editor.trakt.setInput', { value: query }).then(() => act('collections.editor.trakt.search'))}><Search size={14} /> Search</button></div>
    {editor.traktSearchError && <InlineError message={editor.traktSearchError} />}
    <div className="source-mode-tabs"><button className={tab==='trending'?'active':''} onClick={()=>setTab('trending')}>Trending</button><button className={tab==='popular'?'active':''} onClick={()=>setTab('popular')}>Popular</button><button className={tab==='search'?'active':''} onClick={()=>setTab('search')}>Search results</button></div>
    <div className="picker-results">{results.map(result=><button className="picker-result" key={result.traktListId} onClick={()=>void act('collections.editor.trakt.addResult',{result})}><span className="picker-result-art">{result.coverImageUrl ? <img src={result.coverImageUrl} /> : <Film size={18}/>}</span><span className="picker-result-copy"><strong>{result.title}</strong><small>{result.subtitle}</small></span><Plus size={15}/></button>)}</div>
    <button className="button primary" onClick={() => void act('collections.editor.trakt.addInput')}>Add list URL / ID</button>
  </PickerPanel>;
}

export function CollectionFolderPage() {
  const { collectionId = '', folderId = '' } = useParams(); const navigate = useNavigate();
  const snapshot = useFeatureSnapshot<FolderDetail>('folderDetail'); const [error, setError] = useState('');
  const key = `${collectionId}/${folderId}`; const active = useRef('');
  useEffect(() => { if (active.current === key) return; active.current = key; void featureAction('collections.folder.open', { collectionId, folderId }, 'folderDetail').catch((e)=>setError(String(e))); return ()=>{active.current='';}; }, [key]);
  const run = async (method: string, params: Record<string, unknown> = {}) => { setError(''); try { await featureAction(method, params, 'folderDetail'); } catch(e) { setError(e instanceof Error ? e.message : String(e)); } };
  useEffect(() => { const state = snapshot; if (!state) return; const selected = state.tabs[state.selectedTabIndex]; if (!selected?.canLoadMore || selected.isLoadingMore) return; const sentinel = document.querySelector('.folder-load-sentinel'); if (!sentinel) return; const observer = new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)) void run('collections.folder.loadMore');},{rootMargin:'650px'}); observer.observe(sentinel); return ()=>observer.disconnect(); }, [snapshot?.selectedTabIndex, snapshot?.tabs.map(t=>t.items.length).join(',')]);
  if (!snapshot) return <div className="page collections-page">{error ? <InlineError message={error} /> : <div className="loading-block"><LoaderCircle className="spin" size={22}/> Loading folder…</div>}</div>;
  const selected = snapshot.tabs[snapshot.selectedTabIndex];
  return <div className="page folder-detail-page"><PageHeader title={snapshot.folder?.title || 'Folder'} subtitle={`${snapshot.collectionTitle}${selected?.label ? ` · ${selected.label}` : ''}`} action={<div className="catalog-actions"><button className="button secondary" onClick={()=>navigate(`/collections/${collectionId}/edit`)}><Pencil size={14}/> Edit collection</button><button className="button secondary" onClick={()=>void run('collections.folder.refresh',{collectionId,folderId})}><RefreshCw size={14}/> Refresh</button></div>}/>
    {error && <InlineError message={error} onRetry={()=>void run('collections.folder.refresh',{collectionId,folderId})}/>}
    {snapshot.tabs.length>1 && <div className="folder-tabs">{snapshot.tabs.map((tab,index)=><button key={`${tab.label}-${index}`} className={index===snapshot.selectedTabIndex?'active':''} onClick={()=>void run('collections.folder.selectTab',{index})}>{tab.label}</button>)}</div>}
    {selected?.error && <InlineError message={selected.error} onRetry={()=>void run('collections.folder.refresh',{collectionId,folderId})}/>}
    {snapshot.isLoading && !selected?.items.length ? <div className="loading-block"><LoaderCircle className="spin" size={22}/> Loading {selected?.label || 'folder'}…</div> : selected?.items.length ? <>{snapshot.viewMode === 'ROWS' ? snapshot.tabs.filter(tab => tab.items.length).map((tab,index) => <Shelf key={`${tab.catalogId}-${index}`} shelf={{ key: tab.catalogId, title: tab.label, subtitle: tab.typeLabel, items: tab.items, hasMore: false }} />) : <div className="media-grid">{selected.items.map((item,index)=><Poster key={`${item.id}-${index}`} item={item}/>)}</div>}<div className="folder-load-sentinel" />{selected.isLoadingMore && <div className="loading-block"><LoaderCircle className="spin" size={18}/> Loading more…</div>}{selected.canLoadMore && <button className="button secondary load-more-button" onClick={()=>void run('collections.folder.loadMore')}><ChevronDownIcon/> Load more</button>}</> : <EmptyState icon={<Film />} title="Nothing here yet" message="This folder has no available titles for the selected source."/>}
  </div>;
}
function ChevronDownIcon(){return <ChevronRight size={15}/>}
