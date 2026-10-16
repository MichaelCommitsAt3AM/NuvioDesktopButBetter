import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { actions, call, refreshFeature, useFeatureSnapshot, useSelector } from '../../bridge';
import type { Addon, Discover, Search as SearchState, SearchHistory } from '../../generated/contract';
import type { AppearanceSnapshot } from '../settings/appearanceStore';
import { PosterGrid } from '../../components/PosterGrid';
import { PosterLoadingCard } from '../../components/PosterLoadingCard';
import { Shelf } from '../../components/Shelf';
import { EmptyState } from '../../components/EmptyState';
import { InlineError } from '../../components/Status';
import './search.css';
import { useDiscoverScroll } from './useDiscoverScroll';

const MAX_RECENT_SEARCHES = 5;

export function SearchPage({ focusRequested = false, onFocusHandled }: { focusRequested?: boolean; onFocusHandled?: () => void } = {}) {
  const search = useSelector((current) => current.search) as SearchState;
  const discover = useSelector((current) => current.discover) as Discover | null;
  const addons = useSelector((current) => current.addons) as Addon[];
  const appearance = useFeatureSnapshot<AppearanceSnapshot>('appearance');
  const history = useSelector((current) => current.searchHistory) as SearchHistory | null;
  const profileId = useSelector(current => current.session.activeProfile);
  const [query, setQuery] = useState(search.query);
  const [queryPending, setQueryPending] = useState(false);
  const [focused, setFocused] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (!focusRequested) return;
    inputRef.current?.focus({ preventScroll: true });
    onFocusHandled?.();
  }, [focusRequested, onFocusHandled]);
  const paging = useRef(false);
  const discoverCatalogKey = discover ? JSON.stringify([discover.selectedType, discover.selectedCatalogKey, discover.selectedGenre]) : null;
  const discoverScroll = useDiscoverScroll(profileId, discoverCatalogKey, Boolean(query.trim()), top => setScrolled(top > 48));
  const updateQuery = (value: string) => {
    setQuery(value);
    setQueryPending(Boolean(value.trim()));
    if (value.trim()) {
      // The same scroll container hosts Discover and results. Move it before
      // the debounce or network response, rather than inheriting Discover's depth.
      const main = document.querySelector<HTMLElement>('.main-area');
      if (main) main.scrollTop = 0;
      setScrolled(false);
    } else {
      paging.current = false;
      void actions.searchClear().catch(() => {});
    }
  };
  const addonRefreshKey = useMemo(() => addons
    .filter((addon) => addon.enabled)
    .map((addon) => [addon.id, addon.manifestUrl, addon.version ?? '', addon.catalogCount ?? '', ...(addon.types ?? [])].join('|'))
    .sort()
    .join('||'), [addons]);
  const hideUnreleasedContent = appearance?.home.hideUnreleasedContent ?? false;

  useEffect(() => {
    void refreshFeature<SearchHistory>('searchHistory', 'search.historySnapshot').catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    void call('discover.refresh')
      .then(() => active ? refreshFeature<Discover>('discover') : undefined)
      .catch(() => {});
    return () => { active = false; };
  }, [addonRefreshKey, hideUnreleasedContent]);

  useEffect(() => {
    const normalized = query.trim();
    const timer = window.setTimeout(() => {
      if (!normalized) {
        setQueryPending(false);
        if (search.query || search.loading || search.shelves.length) void actions.searchClear().catch(() => {});
        paging.current = false;
        return;
      }
      // Returning from a title keeps the previous results without refetching.
      // `search` is intentionally the mount-time snapshot, not a dependency.
      if (search.query.trim() === normalized && search.shelves.length > 0) {
        setQueryPending(false);
        return;
      }
      setQueryPending(false);
      void actions.searchStart(normalized);
    }, normalized ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const main = document.querySelector<HTMLElement>('.main-area');
    if (!main) return;
    const onScroll = () => {
      setScrolled(main.scrollTop > 48);
      if (query.trim() || discoverScroll.restoring.current || !discover?.hasMore || discover.loading || paging.current) return;
      if (main.scrollTop + main.clientHeight >= main.scrollHeight - 500) {
        paging.current = true;
        void call('discover.loadMore').then(() => refreshFeature('discover')).catch(() => {}).finally(() => { paging.current = false; });
      }
    };
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, [query, discover?.hasMore, discover?.loading]);

  useEffect(() => {
    if (search.error || !search.query || search.loading || search.shelves.length === 0) return;
    void call('search.historyRecord', { query: search.query }).catch(() => {});
  }, [search.error, search.loading, search.query, search.shelves.length]);

  const activeCatalog = discover?.catalogOptions.find((option) => option.key === discover.selectedCatalogKey);
  const normalizedQuery = query.trim();
  const waitingForSearch = queryPending || (Boolean(normalizedQuery) && search.query.trim() !== normalizedQuery);
  const showHistory = focused && !query.trim() && history?.enabled && (history.items.length ?? 0) > 0;
  const displayType = (value: string) => ({ movie: 'Movies', series: 'Series', anime: 'Anime', channel: 'Channels', tv: 'TV' }[value.toLowerCase()] ?? value.replace(/^./, (letter) => letter.toUpperCase()));
  const select = async (method: string, params: Record<string, unknown>) => {
    setOpenFilter(null);
    paging.current = false;
    await call(method, params);
    await refreshFeature<Discover>('discover').catch(() => {});
  };
  const emptyMessage = (reason: string | null | undefined, failed: boolean) => {
    if (failed || reason === 'RequestFailed') return ['Could not load results', 'Check your connection or try again.'];
    if (reason === 'NoActiveAddons') return ['No active addons', 'Enable an addon that provides search or discovery catalogs.'];
    if (reason === 'NoSearchCatalogs' || reason === 'NoDiscoverCatalogs') return ['No catalogs available', 'Addons with compatible catalogs will appear here.'];
    return ['No results found', 'Try another title or adjust your filters.'];
  };
  const searchEmpty = useMemo(() => emptyMessage(null, Boolean(search.error)), [search.error]);

  return <div className="page search-page">
    <header className="search-sticky-header">
      <h1>{!query.trim() && scrolled ? 'Discover' : 'Search'}</h1>
      <div className="search-input-wrap">
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Search movies, shows..."
          aria-label="Search movies and shows"
          onFocus={() => setFocused(true)}
          onBlur={() => { window.setTimeout(() => setFocused(false), 120); }}
          onChange={(event) => updateQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Escape') { if (query) updateQuery(''); else inputRef.current?.blur(); } }}
        />
        {query && <button type="button" className="search-clear" aria-label="Clear search" onMouseDown={(event) => event.preventDefault()} onClick={() => { updateQuery(''); inputRef.current?.focus(); }}><X size={18} /></button>}
      </div>
    </header>

    {showHistory && <section className="search-history" aria-label="Recent searches">
      <h2>Recent searches</h2>
      {history!.items.slice(0, MAX_RECENT_SEARCHES).map((item) => <div className="search-history-row" key={item}>
        <button type="button" className="search-history-query" onMouseDown={(event) => event.preventDefault()} onClick={() => { updateQuery(item); void call('search.historyUse', { query: item }).catch(() => {}); }}>{item}</button>
        <button type="button" className="search-history-remove" aria-label={`Remove ${item} from recent searches`} onMouseDown={(event) => event.preventDefault()} onClick={() => { void call('search.historyRemove', { query: item }).then(() => refreshFeature('searchHistory', 'search.historySnapshot')).catch(() => {}); }}><X size={16} /></button>
      </div>)}
    </section>}

    {!query.trim() ? <section className="search-discover" aria-labelledby="discover-heading" onClickCapture={() => discoverScroll.save.current()} onContextMenuCapture={() => discoverScroll.save.current()}>
      <h2 id="discover-heading">Discover</h2>
      <div className="discover-filters">
        <FilterChip id="type" label={displayType(discover?.selectedType ?? 'movie')} open={openFilter === 'type'} onToggle={() => setOpenFilter(openFilter === 'type' ? null : 'type')} options={(discover?.typeOptions ?? []).map((value) => ({ value, label: displayType(value) }))} selected={discover?.selectedType ?? ''} onSelect={(value) => void select('discover.selectType', { type: value })} />
        <FilterChip id="catalog" label={activeCatalog?.catalogName ?? 'Catalog'} open={openFilter === 'catalog'} onToggle={() => setOpenFilter(openFilter === 'catalog' ? null : 'catalog')} options={(discover?.catalogOptions ?? []).map((value) => ({ value: value.key, label: value.catalogName }))} selected={discover?.selectedCatalogKey ?? ''} onSelect={(value) => void select('discover.selectCatalog', { catalogKey: value })} />
        <FilterChip id="genre" label={discover?.selectedGenre ?? 'All Genres'} open={openFilter === 'genre'} onToggle={() => setOpenFilter(openFilter === 'genre' ? null : 'genre')} options={[...(activeCatalog?.genreRequired ? [] : [{ value: '', label: 'All Genres' }]), ...(discover?.genreOptions ?? []).map((value) => ({ value, label: value }))]} selected={discover?.selectedGenre ?? ''} enabled={Boolean((discover?.genreOptions.length ?? 0) > 0 || activeCatalog?.genreRequired)} onSelect={(value) => void select('discover.selectGenre', { genre: value || null })} />
      </div>
      {activeCatalog && <p className="discover-context">{activeCatalog.addonName} · {displayType(activeCatalog.type)}</p>}
      {discover?.error && <InlineError message={discover.error} onRetry={() => void call('discover.refresh', { force: true }).then(() => refreshFeature('discover')).catch(() => {})} />}
      {(!discover || (discover.loading && discover.items.length === 0)) ? <div className="discover-loading" role="status" aria-label="Loading catalog results" aria-busy="true">{Array.from({ length: 8 }, (_, index) => <PosterLoadingCard variant="poster" key={index} />)}</div>
        : discover.items.length ? <PosterGrid items={discover.items} resetKey={`${discover.selectedCatalogKey ?? ''}:${discover.selectedType ?? ''}:${discover.selectedGenre ?? ''}`} initialVisibleCount={discoverScroll.initialVisibleCount} />
          : <DiscoverEmpty discover={discover} />}
    </section> : <section className="search-results" aria-label="Search results">
      {waitingForSearch ? <SearchLoadingSkeleton /> : <>
        {search.shelves.map((shelf) => <Shelf key={shelf.key} shelf={shelf} source="search" />)}
        {search.loading && <SearchLoadingSkeleton rows={search.shelves.length ? 1 : 3} />}
        {search.error && <InlineError message={search.error} onRetry={() => void actions.searchStart(query.trim())} />}
        {!search.loading && !search.error && !search.shelves.length && <EmptyState title={searchEmpty[0]} message={searchEmpty[1]} icon={<span>⌕</span>} />}
      </>}
    </section>}
  </div>;
}

function SearchLoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return <div className="search-loading-skeleton" role="status" aria-label="Searching" aria-busy="true">
    <span className="search-skeleton-sr-only">Searching…</span>
    {Array.from({ length: rows }, (_, shelf) => <section className="search-skeleton-shelf" key={shelf} aria-hidden="true">
      <div className="search-skeleton-heading search-skeleton-shimmer" />
      <div className="search-skeleton-grid">{Array.from({ length: 9 }, (_, card) => <PosterLoadingCard key={card} />)}</div>
    </section>)}
  </div>;
}

function DiscoverEmpty({ discover }: { discover: Discover }) {
  const [title, message] = emptyDiscoverMessage(discover.emptyStateReason, Boolean(discover.error));
  return <EmptyState title={title} message={message} icon={<span>⌕</span>} action={discover.error ? <button className="button secondary" type="button" onClick={() => void call('discover.refresh', { force: true }).then(() => refreshFeature('discover')).catch(() => {})}>Try again</button> : undefined} />;
}

function emptyDiscoverMessage(reason: string | null | undefined, failed: boolean): [string, string] {
  if (failed || reason === 'RequestFailed') return ['Could not load results', 'Check your connection or try again.'];
  if (reason === 'NoActiveAddons') return ['No active addons', 'Enable an addon that provides discovery catalogs.'];
  if (reason === 'NoDiscoverCatalogs') return ['No catalogs available', 'Addons with compatible discovery catalogs will appear here.'];
  return ['No results found', 'Try another title or adjust your filters.'];
}

function FilterChip({ id, label, options, selected, open, enabled = options.length > 0, onToggle, onSelect }: { id: string; label: string; options: Array<{ value: string; label: string }>; selected: string; open: boolean; enabled?: boolean; onToggle: () => void; onSelect: (value: string) => void }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; minWidth: number; maxHeight: number } | null>(null);
  const updatePosition = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 160) - 8));
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const placeAbove = below < Math.min(options.length * 36 + 12, 360) && above > below;
    setPosition({ top: placeAbove ? Math.max(8, rect.top - Math.min(options.length * 36 + 12, 360) - 6) : rect.bottom + 6, left, minWidth: rect.width, maxHeight: Math.max(96, Math.min(360, placeAbove ? above : below)) });
  };
  useEffect(() => {
    if (!open) return;
    updatePosition();
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) onToggle();
    };
    const dismissEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onToggle(); };
    const reposition = () => updatePosition();
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('keydown', dismissEscape);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('keydown', dismissEscape);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, onToggle, options.length]);
  return <div className="discover-filter" data-filter={id}>
    <button ref={trigger} type="button" className="discover-filter-chip" aria-haspopup="listbox" aria-expanded={open} disabled={!enabled} onClick={() => { if (!open) updatePosition(); onToggle(); }}>{label}<ChevronDown size={14} /></button>
    {open && position && createPortal(<div ref={menu} className="discover-filter-menu" style={{ position: 'fixed', top: position.top, left: position.left, minWidth: Math.max(160, position.minWidth), maxHeight: position.maxHeight }} role="listbox" aria-label={`Choose ${id}`}>
      {options.map((option) => <button type="button" role="option" aria-selected={option.value === selected} key={option.value} onClick={() => onSelect(option.value)}>{option.label}{option.value === selected && <Check size={14} />}</button>)}
    </div>, document.body)}
  </div>;
}
