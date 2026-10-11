import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, CircleAlert, CircleHelp, FlaskConical, LoaderCircle, Plus, RefreshCw, Settings2, Trash2, X, Zap } from 'lucide-react';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';
import { InlineError } from '../../components/Status';
import { PageHeader } from '../../components/ui';
import { Link } from 'react-router-dom';

type PluginsSnapshot = {
  available: boolean;
  enabled: boolean;
  grouped: boolean;
  repositories: Array<{ url: string; name: string; description: string; version: string; scraperCount: number; refreshing: boolean; error: string | null }>;
  scrapers: Array<{ id: string; repositoryUrl: string; name: string; description: string; version: string; enabled: boolean; manifestEnabled: boolean; types: string[]; hasSettings: boolean; logo: string; contentLanguage: string[]; formats: string[] }>;
};
type PluginSettings = { id: string; name: string; layout: Array<{ type: string; key?: string; label?: string; description?: string; isPassword?: boolean; placeholder?: string; defaultValue?: string | boolean; options?: Array<{ value: string; label: string }> }>; settings: Record<string, unknown> };
type PluginTestItem = { title: string; name: string; url: string; quality: string; size: string; language: string; provider: string; type: string; seeders?: number; peers?: number };

export function PluginsSettingsPage() {
  const snapshot = useFeatureSnapshot<PluginsSnapshot>('plugins');
  const [loading, setLoading] = useState(!snapshot);
  const [error, setError] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [removeUrl, setRemoveUrl] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [testItems, setTestItems] = useState<Record<string, PluginTestItem[]>>({});
  const [settingsDialog, setSettingsDialog] = useState<PluginSettings | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { await refreshFeature<PluginsSnapshot>('plugins'); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load plugin settings.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!snapshot) void refresh(); }, [snapshot, refresh]);
  async function run(key: string, method: string, params: Record<string, unknown> = {}) {
    setBusyKey(key); setError('');
    try { const result = await call(method, params); await refreshFeature<PluginsSnapshot>('plugins'); return result; }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Plugin action failed.'); throw cause; }
    finally { setBusyKey(''); }
  }
  async function addRepository(event: FormEvent) {
    event.preventDefault();
    try { await run('add', 'plugins.addRepository', { url: repositoryUrl.trim() }); setRepositoryUrl(''); }
    catch { /* error shown above */ }
  }
  async function removeRepository() {
    if (!removeUrl) return;
    try { await run('remove', 'plugins.removeRepository', { url: removeUrl }); setRemoveUrl(null); }
    catch { /* error shown above */ }
  }
  async function testScraper(id: string) {
    try { const result = await run(`test:${id}`, 'plugins.testScraper', { id }) as { resultCount?: number; results?: PluginTestItem[] }; setTestResults((current) => ({ ...current, [id]: typeof result?.resultCount === 'number' ? `${result.resultCount} result${result.resultCount === 1 ? '' : 's'}` : 'Test completed' })); setTestItems((current) => ({ ...current, [id]: result.results ?? [] })); }
    catch (cause) { setTestResults((current) => ({ ...current, [id]: cause instanceof Error ? cause.message : 'Test failed' })); }
  }
  async function openSettings(id: string) {
    try { const result = await run(`settings:${id}`, 'plugins.scraperSettings', { id }) as PluginSettings; setSettingsDialog(result); }
    catch { /* bridge error is shown above */ }
  }
  async function saveSettings(settings: Record<string, unknown>) {
    if (!settingsDialog) return;
    try { await run(`settings:${settingsDialog.id}`, 'plugins.saveScraperSettings', { id: settingsDialog.id, settings }); setSettingsDialog(null); }
    catch { /* bridge error is shown above */ }
  }
  if (loading && !snapshot) return <div className="loading-block"><LoaderCircle size={17} className="spin" /> Loading plugins…</div>;
  const repositories = [...(snapshot?.repositories ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const repositoryNames = new Map(repositories.map((repository) => [repository.url, repository.name]));
  const scrapers = [...(snapshot?.scrapers ?? [])].sort((a, b) => (repositoryNames.get(a.repositoryUrl) ?? a.repositoryUrl).localeCompare(repositoryNames.get(b.repositoryUrl) ?? b.repositoryUrl) || a.name.localeCompare(b.name));
  return <div className="page settings-page plugins-page"><Link to="/settings/content" className="back-button settings-page-back"><ArrowLeft size={15} /> Content &amp; Discovery</Link><PageHeader title="Plugins" action={<button className="button secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh</button>} />
    {error && <InlineError message={error} onRetry={() => { void refresh(); }} />}
    {!snapshot?.available ? <div className="settings-section"><p className="muted">Plugins are unavailable in this desktop build.</p></div> : <>
      <h2 className="settings-group-title">OVERVIEW</h2><section className="settings-section"><div className="plugin-overview-badges"><span>{repositories.length} repos</span><span>{scrapers.length} providers</span><span>{snapshot.enabled ? 'Plugins enabled' : 'Plugins disabled'}</span></div>
        <PluginToggle title="Enable plugins" description="Allow installed scrapers to return stream sources." checked={snapshot.enabled} onChange={(enabled) => void run('enabled', 'plugins.setEnabled', { enabled }).catch(() => {})} />
        <PluginToggle title="Group results by repository" description="Keep results grouped by the repository that supplied the scraper." checked={snapshot.grouped} onChange={(enabled) => void run('grouped', 'plugins.setGrouped', { enabled }).catch(() => {})} />
      </section>
      <h2 className="settings-group-title">ADD REPOSITORY</h2><section className="settings-section">
        <form className="addon-install plugin-add-repository" onSubmit={(event) => void addRepository(event)}><label htmlFor="plugin-repo-url">Plugin manifest URL</label><input id="plugin-repo-url" type="url" value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} placeholder="Plugin manifest URL" required /><button className="button primary" disabled={busyKey === 'add' || !repositoryUrl.trim()}>{busyKey === 'add' ? <LoaderCircle className="spin" size={14} /> : <Plus size={15} />} {busyKey === 'add' ? 'Installing…' : 'Install repository'}</button></form>
      </section>
      <h2 className="settings-group-title">INSTALLED REPOSITORIES</h2><section className="settings-section">
        <div className="plugin-repository-list">{repositories.map((repository) => <article className="plugin-repository" key={repository.url}><div className="plugin-repository-title"><strong>{repository.name || repository.url}</strong><span>{repository.version && `v${repository.version}`} · {repository.scraperCount} providers</span></div>{repository.description && <p>{repository.description}</p>}<code className="plugin-repository-url">{repository.url}</code>{repository.error && <p className="form-error"><CircleAlert size={13} /> {repository.error}</p>}<div className="plugin-row-actions"><button className="button secondary" disabled={repository.refreshing || busyKey === `refresh:${repository.url}`} onClick={() => void run(`refresh:${repository.url}`, 'plugins.refreshRepository', { url: repository.url }).catch(() => {})}>{repository.refreshing || busyKey === `refresh:${repository.url}` ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />} {repository.refreshing ? 'Refreshing…' : 'Refresh'}</button><button className="button subtle-danger" disabled={busyKey === 'remove'} onClick={() => setRemoveUrl(repository.url)}><Trash2 size={14} /> Remove</button></div></article>)}{!repositories.length && <div className="plugin-empty"><CircleHelp size={16} /> No plugin repositories installed.</div>}</div>
      </section>
      <h2 className="settings-group-title">PROVIDERS</h2><section className="settings-section">
        <div className="plugin-scraper-list">{scrapers.map((scraper) => <article className="plugin-scraper" key={scraper.id}><div className="plugin-scraper-copy"><small>{repositoryNames.get(scraper.repositoryUrl) ?? scraper.repositoryUrl}</small><strong>{scraper.name}</strong><span>{scraper.description || 'No description provided.'}</span><small>{scraper.types.join(' | ')} · v{scraper.version}{!scraper.manifestEnabled ? ' · Disabled by repository' : ''}</small>{testResults[scraper.id] && <small className={testResults[scraper.id].toLowerCase().includes('failed') ? 'form-error' : 'plugin-test-result'}><Zap size={12} /> {testResults[scraper.id]}</small>}</div>{scraper.logo && <img className="plugin-scraper-logo" src={scraper.logo} alt="" />}{scraper.hasSettings && <button className="icon-button" title={`Settings for ${scraper.name}`} aria-label={`Settings for ${scraper.name}`} disabled={busyKey === `settings:${scraper.id}`} onClick={() => void openSettings(scraper.id)}>{busyKey === `settings:${scraper.id}` ? <LoaderCircle size={15} className="spin" /> : <Settings2 size={15} />}</button>}<button className="icon-button" title={`Test ${scraper.name}`} aria-label={`Test ${scraper.name}`} disabled={busyKey === `test:${scraper.id}`} onClick={() => void testScraper(scraper.id)}>{busyKey === `test:${scraper.id}` ? <LoaderCircle size={15} className="spin" /> : <FlaskConical size={15} />}</button><label className="switch" aria-label={`${scraper.enabled ? 'Disable' : 'Enable'} ${scraper.name}`}><input type="checkbox" checked={scraper.enabled} disabled={busyKey === `toggle:${scraper.id}` || !scraper.manifestEnabled} onChange={(event) => void run(`toggle:${scraper.id}`, 'plugins.toggleScraper', { id: scraper.id, enabled: event.target.checked }).catch(() => {})} /><span /></label>{testItems[scraper.id]?.length > 0 && <div className="plugin-test-results"><strong>{testResults[scraper.id]}</strong>{testItems[scraper.id].map((item, index) => <div key={`${item.url}-${index}`}><Zap size={13} /><span><strong>{item.title}</strong><code>{item.url}</code><small>{[item.quality, item.size, item.language, item.provider].filter(Boolean).join(' · ')}</small></span></div>)}</div>}</article>)}{!scrapers.length && <div className="plugin-empty"><CircleHelp size={16} /> No providers installed.</div>}</div>
      </section>
    </>}
    {settingsDialog && <PluginSettingsDialog key={settingsDialog.id} settings={settingsDialog} busy={busyKey === `settings:${settingsDialog.id}`} onClose={() => setSettingsDialog(null)} onSave={(value) => void saveSettings(value)} />}
    {removeUrl && <div className="consent-backdrop"><div className="consent-card" role="dialog" aria-modal="true" aria-labelledby="plugin-remove-title"><div className="dialog-head"><strong id="plugin-remove-title">Remove this repository?</strong><button className="icon-button" onClick={() => setRemoveUrl(null)} aria-label="Close"><X size={15} /></button></div><p className="muted">Its scrapers will be removed from this profile.</p><code className="plugin-repository-url">{removeUrl}</code><div className="dialog-actions"><button className="button secondary" onClick={() => setRemoveUrl(null)} disabled={busyKey === 'remove'}>Cancel</button><button className="button destructive" onClick={() => void removeRepository()} disabled={busyKey === 'remove'}><Trash2 size={14} /> Remove repository</button></div></div></div>}
  </div>;
}

function PluginToggle({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (enabled: boolean) => void }) {
  return <div className="settings-control-row"><span className="settings-control-copy"><strong>{title}</strong><span>{description}</span></span><label className="switch"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span /></label></div>;
}

function PluginSettingsDialog({ settings, busy, onClose, onSave }: { settings: PluginSettings; busy: boolean; onClose: () => void; onSave: (settings: Record<string, unknown>) => void }) {
  const [values, setValues] = useState<Record<string, unknown>>(settings.settings);
  const titleId = 'plugin-settings-title';
  function update(key: string, value: unknown) { setValues((current) => ({ ...current, [key]: value })); }
  return <div className="consent-backdrop"><div className="consent-card plugin-settings-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <div className="dialog-head"><strong id={titleId}>{settings.name} Settings</strong><button className="icon-button" onClick={onClose} aria-label="Close" disabled={busy}><X size={15} /></button></div>
    <div className="plugin-settings-fields">{settings.layout.map((field) => {
      const fieldKey = field.key ?? '';
      if (!['header', 'info'].includes(field.type) && !fieldKey) return null;
      if (field.type === 'header') return <h3 key={fieldKey}>{field.label}</h3>;
      if (field.type === 'info') return <p className="muted" key={fieldKey}>{field.label}</p>;
      if (field.type === 'toggle') {
        const checked = typeof values[fieldKey] === 'boolean' ? values[fieldKey] as boolean : field.defaultValue === true;
        return <PluginToggle key={fieldKey} title={field.label ?? fieldKey} description={field.description ?? ''} checked={checked} onChange={(value) => update(fieldKey, value)} />;
      }
      if (field.type === 'select') {
        const options = field.options ?? [];
        const selected = typeof values[fieldKey] === 'string' ? values[fieldKey] as string : typeof field.defaultValue === 'string' ? field.defaultValue : '';
        return <label className="profile-url-field" key={fieldKey}>{field.label ?? fieldKey}<select value={selected} onChange={(event) => update(fieldKey, event.target.value)}><option value="">Select option</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{field.description && <small>{field.description}</small>}</label>;
      }
      if (field.type === 'text') {
        const text = typeof values[fieldKey] === 'string' ? values[fieldKey] as string : '';
        return <label className="profile-url-field" key={fieldKey}>{field.label ?? fieldKey}<input type={field.isPassword ? 'password' : 'text'} value={text} placeholder={field.placeholder ?? ''} onChange={(event) => update(fieldKey, event.target.value)} />{field.description && <small>{field.description}</small>}</label>;
      }
      return null;
    })}</div>
    <div className="dialog-actions"><button className="button secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="button primary" onClick={() => onSave(values)} disabled={busy}>{busy ? <LoaderCircle size={14} className="spin" /> : null}Save</button></div>
  </div></div>;
}

