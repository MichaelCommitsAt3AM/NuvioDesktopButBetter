import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams } from 'react-router-dom';
import { BackButton } from '../../components/BackButton';
import { Poster } from '../../components/Poster';
import { InlineError } from '../../components/Status';
import { EmptyState } from '../../components/EmptyState';
import { call, useSelector } from '../../bridge';
import type { Media } from '../../generated/contract';
import { scrollKey, useActiveProfileId, useListScrollRestore } from '../../navigation/scrollStore';
import { mediaKey, stableKeys } from '../../components/keys';
import { Building2, LoaderCircle } from 'lucide-react';
import './details.css';

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

  return <div className="page detail-page entity-page">
    <div className="detail-screen-controls">
      <BackButton className="detail-back" onClick={back} />
      {entity && <span className="detail-condensed-title" aria-hidden="true">{entity.header.name}</span>}
    </div>
    {loading && <div className="loading-block"><LoaderCircle className="spin" size={22} /><span>Loading company…</span></div>}
    {error && !entity && <InlineError message={error} onRetry={() => navigate(0)} />}
    {entity && <>
      <div className="entity-hero">
        {entity.header.logo
          ? <img className="entity-logo" src={entity.header.logo} alt="" />
          : <span className="entity-logo entity-logo-fallback" aria-hidden="true"><Building2 size={32} /></span>}
        <div><h1>{entity.header.name}</h1><p className="muted">{[entity.header.kind, entity.header.originCountry, entity.header.secondaryLabel].filter(Boolean).join(' · ')}</p></div>
      </div>
      {entity.header.description && <p className="details-extras-biography">{entity.header.description}</p>}
      {!entity.rails.length && <EmptyState title="No titles found" message="No browsable titles were returned for this entry." icon={<Building2 size={22} />} />}
      {entity.rails.map((rail) => {
        const page = railPages[`${rail.mediaType}:${rail.railType}`];
        const items = page?.items ?? rail.items;
        const keys = stableKeys(items, (item) => mediaKey(item.type, item.id));
        const busy = railBusy === `${rail.mediaType}:${rail.railType}`;
        return <section key={`${rail.mediaType}:${rail.railType}`} className="details-extras-rail">
          <div className="details-rail-heading"><h2>{rail.mediaType.toUpperCase()} · {rail.railType.replace('_', ' ')}</h2>{(page?.hasMore ?? rail.hasMore) && <button className="text-button" type="button" disabled={busy} onClick={() => void loadPage(rail)}>{busy ? 'Loading…' : 'Load more'}</button>}</div>
          <div className="shelf-track">{items.map((item, index) => <Poster key={keys[index]} item={item} onClick={() => openMedia(item)} />)}</div>
        </section>;
      })}
    </>}
  </div>;
}
