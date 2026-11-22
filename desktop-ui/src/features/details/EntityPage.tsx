import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams } from 'react-router-dom';
import { BackButton } from '../../components/BackButton';
import { FullscreenButton } from '../../components/FullscreenButton';
import { HorizontalRail } from '../../components/HorizontalRail';
import { PosterLoadingCard } from '../../components/PosterLoadingCard';
import { Poster } from '../../components/Poster';
import { InlineError } from '../../components/Status';
import { EmptyState } from '../../components/EmptyState';
import { call, useSelector } from '../../bridge';
import type { Media } from '../../generated/contract';
import { scrollKey, useActiveProfileId, useListScrollRestore } from '../../navigation/scrollStore';
import { mediaKey, stableKeys } from '../../components/keys';
import { Building2 } from 'lucide-react';
import './details.css';
import '../home/homeParity.css';
import './person.css';

type EntityRail = {
  mediaType: string; railType: string; currentPage: number; hasMore: boolean;
  loading: boolean; items: Media[];
};
type EntityBrowse = {
  header: { id: number; kind: string; name: string; logo: string | null; originCountry: string | null; secondaryLabel: string | null; description: string | null };
  rails: EntityRail[];
};
type RailPage = { page: number; hasMore: boolean; items: Media[] };
type RouteState = { name?: string; sourceType?: string; origin?: string } | null;

/**
 * Dedicated company/network route backed by `details.entity`, with per-rail
 * pagination through `details.entity.page`. Back restores the originating
 * route; stale rail pages are discarded by generation.
 */
export function EntityPage() {
  const { kind = '', entityId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const profileId = useActiveProfileId();
  const sessionProfile = useSelector((current) => current?.session?.activeProfile ?? null);
  const state = (location.state ?? null) as RouteState;
  const [entity, setEntity] = useState<EntityBrowse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [railPages, setRailPages] = useState<Record<string, RailPage>>({});
  const [railBusy, setRailBusy] = useState('');
  const generation = useRef(0);
  const pendingRails = useRef(new Set<string>());
  useListScrollRestore(scrollKey(profileId, `/entity/${kind}/${entityId}`, ''), navigationType, !!entity);

  useEffect(() => {
    const generationAtCall = ++generation.current;
    setEntity(null);
    setRailPages({});
    setRailBusy('');
    pendingRails.current.clear();
    setError('');
    setLoading(true);
    const params = new URLSearchParams(location.search);
    void call<EntityBrowse>('details.entity', {
      kind,
      entityId: Number(entityId),
      name: state?.name ?? params.get('name') ?? undefined,
      sourceType: state?.sourceType ?? params.get('sourceType') ?? 'movie',
    }).then((result) => { if (generation.current === generationAtCall) setEntity(result); })
      .catch((cause) => { if (generation.current === generationAtCall) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (generation.current === generationAtCall) setLoading(false); });
    return () => { generation.current += 1; };
  }, [kind, entityId, sessionProfile]);

  const loadPage = async (rail: EntityRail) => {
    const key = `${rail.mediaType}:${rail.railType}`;
    const ticket = generation.current;
    if (pendingRails.current.has(key)) return;
    pendingRails.current.add(key);
    const current = railPages[key] ?? { page: rail.currentPage, hasMore: rail.hasMore, items: rail.items };
    const page = current.page + 1;
    setRailBusy(key);
    try {
      const result = await call<RailPage>('details.entity.page', { kind, entityId: Number(entityId), mediaType: rail.mediaType, railType: rail.railType, page });
      if (generation.current !== ticket) return;
      setRailPages((previous) => {
        const seen = new Set(current.items.map((item) => `${item.type}:${item.id}`));
        return { ...previous, [key]: { page, hasMore: result.hasMore, items: [...current.items, ...result.items.filter((item) => !seen.has(`${item.type}:${item.id}`))] } };
      });
    } catch (cause) {
      if (generation.current === ticket) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (generation.current === ticket) { pendingRails.current.delete(key); setRailBusy(''); }
    }
  };

  const back = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(state?.origin ?? '/');
  };
  const openMedia = (item: Media) => navigate(`/details/${encodeURIComponent(item.type)}/${encodeURIComponent(item.id)}`);

  // Kotlin TmdbEntityBrowseScreen (desktop, wide): the actor page's two-column layout. A 392px
  // identity pane (kind, white logo box, name, facts, About) beside the independently scrolling
  // rails, over the first rail poster at 10% with the background gradient.
  const backdrop = entity ? (entity.rails.find((rail) => rail.mediaType === ((state?.sourceType ?? 'movie').toLowerCase() === 'movie' ? 'movie' : 'tv'))?.items[0]?.poster
    ?? entity.rails[0]?.items[0]?.poster ?? null) : null;
  const header = entity?.header;
  const kindLabel = (header?.kind ?? kind).toLowerCase() === 'network' ? 'Network' : 'Production Company';
  const metaLine = header ? [header.secondaryLabel, header.originCountry].filter((value): value is string => !!value?.trim()).join(' · ') : '';
  const catalogueCount = entity?.rails.reduce((sum, rail) => sum + rail.items.length, 0) ?? 0;
  const name = header?.name ?? state?.name ?? '';

  return <div className="person-page entity-page">
    {backdrop && <div className="entity-backdrop" aria-hidden="true" style={{ backgroundImage: `url("${backdrop}")` }} />}
    <div className="person-controls"><BackButton className="person-back" onClick={back} /></div>
    <FullscreenButton onError={setError} />
    {error && !entity && !loading ? <div className="person-error"><h1>{`Could not load ${name || 'this page'}`}</h1><InlineError message={error} onRetry={() => navigate(0)} /></div> : <div className="person-columns" aria-busy={loading}>
      <aside className="person-identity entity-identity" aria-label="Company information">
        <span className="entity-kind">{kindLabel}</span>
        {loading && !header ? <>
          <span className="entity-logo-box entity-logo-skeleton" aria-hidden="true" />
          {name && <h1>{name}</h1>}
          <div className="person-facts person-skeleton" role="status" aria-label="Loading company details"><span /><span /><span /></div>
        </> : header && <>
          {header.logo
            ? <span className="entity-logo-box"><img src={header.logo} alt={header.name} /></span>
            : <span className="entity-initials" aria-hidden="true"><span>{initials(header.name)}</span></span>}
          <div className="entity-name">
            <h1>{header.name}</h1>
            {metaLine && <p>{metaLine}</p>}
          </div>
          <div className="person-facts">
            {header.originCountry?.trim() && <EntityFact label="Country" value={header.originCountry} />}
            {header.secondaryLabel?.trim() && <EntityFact label="Type" value={header.secondaryLabel} />}
            {catalogueCount > 0 && <EntityFact label="Catalogue" value={`${catalogueCount} ${catalogueCount === 1 ? 'title' : 'titles'}`} />}
          </div>
          {header.description?.trim() && <section className="person-biography entity-about"><h2>About</h2><p>{header.description}</p></section>}
        </>}
      </aside>
      <div className="person-credits" aria-label="Titles">
        {loading && !entity ? <div className="person-loading-rails" aria-hidden="true">{[0, 1, 2].map((row) => <section className="person-rail" key={row}><span className="person-heading-skeleton" /><div className="shelf-track">{[0, 1, 2, 3, 4].map((card) => <PosterLoadingCard key={card} />)}</div></section>)}</div>
          : entity && <div className="person-credits-arrive">
            {error && <InlineError message={error} />}
            {!entity.rails.length && <EmptyState title="No titles found" message="No browsable titles were returned for this entry." icon={<Building2 size={22} />} />}
            {entity.rails.map((rail) => {
              const key = `${rail.mediaType}:${rail.railType}`;
              const page = railPages[key];
              return <EntityRailSection key={key} rail={rail} items={page?.items ?? rail.items} hasMore={page?.hasMore ?? rail.hasMore} busy={railBusy === key} onLoadMore={() => void loadPage(rail)} onOpen={openMedia} />;
            })}
          </div>}
      </div>
    </div>}
  </div>;
}


const RAIL_LABELS: Record<string, string> = { popular: 'Popular', top_rated: 'Top Rated', recent: 'Recent' };

/** Kotlin entityRailTitle: "Movies • Popular". */
function railTitle(rail: EntityRail) {
  const media = rail.mediaType.toLowerCase() === 'movie' ? 'Movies' : 'Series';
  return `${media} • ${RAIL_LABELS[rail.railType.toLowerCase()] ?? rail.railType.replace(/_/g, ' ')}`;
}

/** A Kotlin DetailPosterRailSection; further pages load as the rail nears its end, without a button. */
function EntityRailSection({ rail, items, hasMore, busy, onLoadMore, onOpen }: { rail: EntityRail; items: Media[]; hasMore: boolean; busy: boolean; onLoadMore: () => void; onOpen: (item: Media) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLSpanElement>(null);
  const keys = stableKeys(items, (item) => mediaKey(item.type, item.id));
  useEffect(() => {
    const root = track.current; const end = sentinel.current;
    if (!hasMore || busy || !root || !end || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) onLoadMore(); }, { root, rootMargin: '0px 600px 0px 0px' });
    observer.observe(end);
    return () => observer.disconnect();
  }, [hasMore, busy, items.length]);
  if (!items.length) return null;
  const title = railTitle(rail);
  return <section className="person-rail"><h2>{title}</h2><HorizontalRail label={title} trackRef={track}>{items.map((item, index) => <Poster key={keys[index]} item={item} onClick={() => onOpen(item)} />)}{hasMore && <span ref={sentinel} className="entity-rail-sentinel" aria-hidden="true">{busy && <PosterLoadingCard />}</span>}</HorizontalRail></section>;
}

function EntityFact({ label, value }: { label: string; value: string }) {
  return <div className="person-fact"><h2>{label}</h2><p>{value}</p></div>;
}

function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?'; }
