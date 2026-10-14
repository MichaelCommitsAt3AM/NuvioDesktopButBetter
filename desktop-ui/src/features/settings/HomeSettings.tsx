import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { ArrowLeft, ChevronDown, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { call } from '../../bridge';
import { PageHeader } from '../../components/ui';
import { InlineError } from '../../components/Status';
import { useAppearance, type HomeSetting } from './appearanceStore';
import './homeSettings.css';
import { ReorderableSettingsRow } from './ReorderableSettingsRow';
import { usePointerSettingsReorder } from './usePointerSettingsReorder';

export function HomeSettings() {
  const { snapshot, loading, error, refresh, update } = useAppearance();
  const [heroExpanded, setHeroExpanded] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(0);
  const queue = useRef(Promise.resolve());
  const home = snapshot?.home;
  // Kotlin publishes pinned collections first; preserve that order.
  const items = home?.items ?? [];
  const catalogs = items.filter(item => !item.isCollection);
  const sources = catalogs.filter(item => item.heroSourceEnabled);
  const limit = home?.heroSourceSelectionLimit ?? 2;
  const collectionCount = items.length - catalogs.length;
  const sectionTitle = collectionCount && catalogs.length ? 'CATALOGS & COLLECTIONS' : collectionCount ? 'COLLECTIONS' : 'CATALOGS';
  const busy = pending > 0;
  function save(method: string, params: Record<string, unknown>) {
    setPending(value => value + 1);
    // Serialize text edits and mutations so slower replies cannot undo newer edits.
    queue.current = queue.current.then(async () => {
      try { await update(method, params); } catch { /* useAppearance reports save failures. */ }
      finally { setPending(value => value - 1); }
    });
    return queue.current;
  }
  function move(key: string, targetKey: string) {
    if (busy || key === targetKey) return Promise.resolve();
    const from = items.find(item => item.key === key);
    const to = items.find(item => item.key === targetKey);
    if (!from || !to || from.isPinnedToTop || to.isPinnedToTop) return Promise.resolve();
    return save('homePreferences.move', { key, targetKey });
  }
  const reorder = usePointerSettingsReorder(items, move, busy);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  return <div className="page settings-page home-settings-page">
    <Link to="/settings/appearance" className="back-button settings-page-back" aria-label="Back to Layout"><ArrowLeft size={23} /></Link>
    <PageHeader title="Home Layout" />
    {error && <InlineError message={error} onRetry={() => { void refresh(); }} />}
    {loading && !snapshot ? <div className="loading-block"><LoaderCircle size={28} className="spin" /> Loading…</div> : snapshot && <>
      <section className="settings-section home-summary"><strong>Keep Home focused</strong><span>{items.filter(item => item.enabled).length} of {items.length} catalogs visible • {sources.length} hero sources selected</span><small>Open a catalog only when you need to rename or reorder it.</small></section>
      <h2 className="settings-group-title">HOME LAYOUT</h2>
      <section className="settings-section home-layout-settings">
        <HomeSwitch title="Show Hero Section" description="Display hero carousel at top of home." checked={home!.heroEnabled} disabled={busy} onChange={enabled => save('homePreferences.setHeroEnabled', { enabled })} />
        <HomeSwitch title="Show Catalog Type" description="Show type suffix next to catalog name (Movie/Series)." checked={home!.showCatalogType} disabled={busy} onChange={enabled => save('homePreferences.setShowCatalogType', { enabled })} />
        <HomeSwitch title="Hide Unreleased Content" description="Hide movies and shows that haven't been released yet." checked={home!.hideUnreleasedContent} disabled={busy} onChange={enabled => save('homePreferences.setHideUnreleasedContent', { enabled })} />
      </section>
      {!!catalogs.length && home!.heroEnabled && <>
        <h2 className="settings-group-title">HERO CATALOGS</h2>
        <section className="settings-section home-hero-source-group">
          <button type="button" className="home-hero-source-summary" aria-expanded={heroExpanded} aria-controls="home-hero-sources" onClick={() => setHeroExpanded(value => !value)}><span><strong>{sources.length} of {limit} selected</strong><small>{sources.map(item => item.title).join(', ') || 'No hero sources selected'}</small></span><ChevronDown size={24} className={heroExpanded ? 'expanded' : ''} /></button>
          {heroExpanded && <div id="home-hero-sources">{catalogs.map(item => <HomeSwitch key={item.key} title={item.title} description={item.addonName + (!item.heroSourceEnabled && sources.length >= limit ? ' • Limit reached (max ' + limit + ')' : '')} checked={item.heroSourceEnabled} disabled={busy || (!item.heroSourceEnabled && sources.length >= limit)} onChange={enabled => save('homePreferences.setHeroSourceEnabled', { key: item.key, enabled })} />)}</div>}
        </section>
      </>}
      {items.length ? <>
        <h2 className="settings-group-title home-catalog-section-title">{sectionTitle}<button type="button" className="home-reset-button" disabled={busy} onClick={() => save('homePreferences.reset', {})}>Reset</button></h2>
        <section className="settings-section home-items-section settings-reorder-list" aria-label={sectionTitle}>
          {reorder.items.map((item, index) => <HomeCatalogRow key={item.key} item={item} expanded={expandedKey === item.key} busy={busy || reorder.saving} pointer={reorder.pointer(item)} dragging={dragKey === item.key} dropTarget={dropKey === item.key} onExpand={() => setExpandedKey(value => value === item.key ? null : item.key)} onToggle={enabled => save('homePreferences.setEnabled', { key: item.key, enabled })} onTitle={title => save('homePreferences.setCustomTitle', { key: item.key, title })} onPinned={() => setNotice('Remove pin to top from collection to move')} onDragStart={() => setDragKey(item.key)} onDragEnd={() => { setDragKey(null); setDropKey(null); }} onDragOver={() => { if (dragKey && !item.isPinnedToTop && dragKey !== item.key) setDropKey(item.key); }} onDrop={() => { if (dragKey) move(dragKey, item.key); setDragKey(null); setDropKey(null); }} onKeyboardMove={direction => { const target = reorder.items[index + direction]; if (target) move(item.key, target.key); }} />)}
        </section>
      </> : home!.isCatalogLoading ? <div className="home-catalog-loading" role="status" aria-label="Loading Home catalogs"><LoaderCircle size={28} className="spin" /></div> : <section className="settings-section home-catalog-empty"><h2>{home!.catalogErrorMessage ? 'Couldn’t load Home catalogs' : 'No home catalogs'}</h2><p>{home!.catalogErrorMessage || 'Enable or add an addon with catalogs to configure Home.'}</p>{home!.catalogErrorMessage && <button type="button" className="button secondary" onClick={() => { void call('addons.refreshAll').then(() => refresh()).catch(() => refresh()); }}>Retry</button>}</section>}
    </>}
    {notice && <div className="home-pinned-toast" role="status">{notice}</div>}
  </div>;
}

function HomeSwitch({ title, description, checked, disabled, onChange }: { title: string; description: string; checked: boolean; disabled: boolean; onChange: (enabled: boolean) => void }) {
  return <label className="settings-control-row home-switch-row"><span className="settings-control-copy"><strong>{title}</strong><span>{description}</span></span><span className="switch"><input type="checkbox" aria-label={title} checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /><span /></span></label>;
}

function HomeCatalogRow({ item, expanded, busy, dragging, dropTarget, onExpand, onToggle, onTitle, onPinned, onDragStart, onDragEnd, onDragOver, onDrop, onKeyboardMove, pointer }: { item: HomeSetting; pointer?: ComponentProps<typeof ReorderableSettingsRow>["pointer"]; expanded: boolean; busy: boolean; dragging: boolean; dropTarget: boolean; onExpand: () => void; onToggle: (enabled: boolean) => void; onTitle: (title: string) => void; onPinned: () => void; onDragStart: () => void; onDragEnd: () => void; onDragOver: () => void; onDrop: () => void; onKeyboardMove: (direction: number) => void }) {
  const [draft, setDraft] = useState(item.customTitle ?? '');
  useEffect(() => { if (!busy) setDraft(item.customTitle ?? ''); }, [item.customTitle, busy]);
  return <ReorderableSettingsRow pointer={pointer} rowKey={item.key} title={item.title} description={item.isCollection ? 'Collection • ' + item.addonName : item.addonName} status={<>{item.enabled ? 'Visible' : 'Hidden'}{item.isCollection ? item.isPinnedToTop ? ' • Pinned to top' : '' : item.heroSourceEnabled ? ' • Hero source' : ' • Not in hero'}</>} enabled={item.enabled} busy={busy} pinned={item.isPinnedToTop} expanded={expanded} onExpand={onExpand} onToggle={onToggle} onPinned={onPinned} drag={{ dragging, dropTarget, onDragStart, onDragEnd, onDragOver, onDrop, onKeyboardMove }}>
    {expanded && !item.isCollection && <label className="home-title-field"><span>Display Name</span><input aria-label={'Display Name for ' + item.title} value={draft} placeholder={item.defaultTitle} onChange={event => { setDraft(event.target.value); onTitle(event.target.value); }} /></label>}
  </ReorderableSettingsRow>;
}
