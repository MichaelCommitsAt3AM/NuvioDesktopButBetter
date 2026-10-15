import { useEffect, useRef, useState } from 'react';
import { Compass, LoaderCircle } from 'lucide-react';
import { BackButton } from '../../components/BackButton';
import { useLocation, useNavigate } from 'react-router-dom';
import { call, refreshFeature, useSelector } from '../../bridge';
import type { Media } from '../../generated/contract';
import { EmptyState } from '../../components/EmptyState';
import { InlineError } from '../../components/Status';
import { PageHeader } from '../../components/ui';
import { Poster } from '../../components/Poster';
import './catalog.css';

type CatalogState = {
  key: string | null;
  source: string | null;
  title: string;
  subtitle: string;
  contentType: string;
  loading: boolean;
  hasMore: boolean;
  error: string | null;
  items: Media[];
  firstVisibleItemIndex: number;
  firstVisibleItemScrollOffset: number;
};
const emptyCatalog: CatalogState = { key: null, source: null, title: 'Catalog', subtitle: '', contentType: '', loading: false, hasMore: false, error: null, items: [], firstVisibleItemIndex: 0, firstVisibleItemScrollOffset: 0 };

export function CatalogPage() {
  const catalog = (useSelector((current) => current.catalog) as CatalogState | null) ?? emptyCatalog;
  const location = useLocation();
  const navigate = useNavigate();
  const sentinel = useRef<HTMLDivElement>(null);
  const listGeneration = useRef(0);
  const loadingMoreRef = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const search = new URLSearchParams(location.search);
  const key = search.get('key') ?? catalog.key ?? '';
  const source = search.get('source') ?? catalog.source ?? 'home';

  useEffect(() => {
    const generation = ++listGeneration.current;
    if (!key) return;
    void call('catalog.open', { key, source }).then(() => {
      if (listGeneration.current === generation) return refreshFeature('catalog', 'catalog.snapshot');
    }).catch(() => {
      if (listGeneration.current === generation) void refreshFeature('catalog', 'catalog.snapshot');
    });
    return () => { listGeneration.current += 1; };
  }, [key, source]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !catalog.hasMore || catalog.loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !loadingMoreRef.current) {
        loadingMoreRef.current = true;
        setLoadingMore(true);
        void call('catalog.loadMore', {}).catch(() => {}).finally(() => { loadingMoreRef.current = false; setLoadingMore(false); });
      }
    }, { rootMargin: '700px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [catalog.hasMore, catalog.loading, catalog.items.length]);

  useEffect(() => () => { if (saveTimer.current !== null) window.clearTimeout(saveTimer.current); }, []);

  const savePosition = () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const scrollable = document.scrollingElement;
      const offset = scrollable?.scrollTop ?? 0;
      const firstVisibleItemIndex = Math.max(0, Math.floor(Math.max(0, offset - 280) / 260) * 6);
      void call('catalog.saveScrollPosition', { firstVisibleItemIndex, firstVisibleItemScrollOffset: offset % 260 }).catch(() => {});
    }, 120);
  };

  return <div className="page catalog-page" onScroll={savePosition}>
    <BackButton className="catalog-back" onClick={() => navigate(-1)} />
    <PageHeader title={catalog.title || 'Catalog'} subtitle={catalog.subtitle || catalog.contentType} />
    {catalog.error && <InlineError message={catalog.error} onRetry={() => void call('catalog.refresh', {}).catch(() => {})} />}
    {catalog.loading && catalog.items.length === 0 && <div className="loading-block"><LoaderCircle className="spin" size={22} /><span>Loading {catalog.title || 'catalog'}…</span></div>}
    {!catalog.loading && !catalog.error && catalog.items.length === 0 && <EmptyState title="No titles found" message="This catalog did not return any titles." icon={<Compass size={22} />} />}
    {catalog.items.length > 0 && <div className="catalog-grid">{catalog.items.map((item, index) => <Poster key={`${item.type}-${item.id}-${index}`} item={item} />)}</div>}
    <div ref={sentinel} className="catalog-sentinel" />
    {(catalog.loading || loadingMore) && catalog.items.length > 0 && <div className="loading-block"><LoaderCircle className="spin" size={20} /><span>Loading more…</span></div>}
    {!catalog.hasMore && catalog.items.length > 0 && !catalog.loading && <div className="discover-end">You’re all caught up</div>}
  </div>;
}
