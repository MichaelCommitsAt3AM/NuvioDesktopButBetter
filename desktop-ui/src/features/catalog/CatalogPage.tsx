import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Compass, LoaderCircle } from 'lucide-react';
import { BackButton } from '../../components/BackButton';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { call, refreshFeature, useSelector } from '../../bridge';
import type { Media } from '../../generated/contract';
import { mediaKey, stableKeys } from '../../components/keys';
import { EmptyState } from '../../components/EmptyState';
import { InlineError } from '../../components/Status';
import { PageHeader } from '../../components/ui';
import { Poster } from '../../components/Poster';
import './catalog.css';
import { captureCatalogAnchor, catalogAnchorTarget, readCatalogAnchor, rememberCatalogAnchor } from './catalogScroll';
import { scrollKey, useActiveProfileId } from '../../navigation/scrollStore';

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
  const navigationType = useNavigationType();
  const profileId = useActiveProfileId();
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

  const grid = useRef<HTMLDivElement>(null);
  const itemKeys = stableKeys(catalog.items, (item) => mediaKey(item.type, item.id));
  const context = scrollKey(profileId, '/catalog', `${source}:${key}`);
  const matching = catalog.key === key && catalog.source === source && !catalog.loading;
  const restored = useRef('');
  const restoring = useRef(false);
  const entry = `${context}:${location.key}`;
  useLayoutEffect(() => {
    if (!matching || !catalog.items.length || restored.current === entry) return;
    const scroller = document.querySelector<HTMLElement>('.main-area');
    const node = grid.current;
    if (!scroller || !node) return;
    const saved = navigationType === 'POP' ? readCatalogAnchor(context) ?? {
      itemKey: null, index: catalog.firstVisibleItemIndex, offset: catalog.firstVisibleItemScrollOffset,
    } : { itemKey: null, index: 0, offset: 0 };
    restoring.current = true;
    let frame = 0;
    let done = false;
    const deadline = performance.now() + 2000;
    const finish = () => {
      done = true; cancelAnimationFrame(frame); restoring.current = false; restored.current = entry;
      scroller.removeEventListener('wheel', finish);
      scroller.removeEventListener('touchmove', finish);
      scroller.removeEventListener('pointerdown', finish);
      scroller.removeEventListener('keydown', finish);
    };
    const tick = () => {
      if (done) return;
      const target = catalogAnchorTarget(scroller, node, itemKeys, saved);
      if (target !== null) scroller.scrollTop = target;
      if ((target !== null && Math.abs(scroller.scrollTop - target) < 1) || performance.now() >= deadline) finish();
      else frame = requestAnimationFrame(tick);
    };
    scroller.addEventListener('wheel', finish, { passive: true });
    scroller.addEventListener('touchmove', finish, { passive: true });
    scroller.addEventListener('pointerdown', finish, { passive: true });
    scroller.addEventListener('keydown', finish);
    frame = requestAnimationFrame(tick);
    return finish;
  }, [entry, matching, catalog.items.length]);

  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>('.main-area');
    if (!matching || !scroller || !grid.current) return;
    const save = () => {
      if (restoring.current || restored.current !== entry || !grid.current) return;
      const anchor = captureCatalogAnchor(scroller, grid.current, itemKeys);
      rememberCatalogAnchor(context, anchor);
    };
    scroller.addEventListener('scroll', save, { passive: true });
    return () => scroller.removeEventListener('scroll', save);
  }, [entry, matching, catalog.items]);

  return <div className="page catalog-page">
    <BackButton className="catalog-back" onClick={() => navigate(-1)} />
    <PageHeader title={catalog.title || 'Catalog'} subtitle={catalog.subtitle || catalog.contentType} />
    {catalog.error && <InlineError message={catalog.error} onRetry={() => void call('catalog.refresh', {}).catch(() => {})} />}
    {catalog.loading && catalog.items.length === 0 && <div className="loading-block"><LoaderCircle className="spin" size={22} /><span>Loading {catalog.title || 'catalog'}…</span></div>}
    {!catalog.loading && !catalog.error && catalog.items.length === 0 && <EmptyState title="No titles found" message="This catalog did not return any titles." icon={<Compass size={22} />} />}
    {catalog.items.length > 0 && <div className="catalog-grid" ref={grid}>{catalog.items.map((item, index) => <Poster key={itemKeys[index]} item={item} />)}</div>}
    <div ref={sentinel} className="catalog-sentinel" />
    {(catalog.loading || loadingMore) && catalog.items.length > 0 && <div className="loading-block"><LoaderCircle className="spin" size={20} /><span>Loading more…</span></div>}
    {!catalog.hasMore && catalog.items.length > 0 && !catalog.loading && <div className="discover-end">You’re all caught up</div>}
  </div>;
}
