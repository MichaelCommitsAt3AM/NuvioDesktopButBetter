import './integrationSettings.css';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, ChevronDown, Cloud, Eye, EyeOff, Film, KeyRound, Link2, LoaderCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';
import { Dialog } from '../../components/Dialog';
import { DebridAccountDialog } from './DebridAccountDialog';
import { InlineError } from '../../components/Status';
import { PageHeader } from '../../components/ui';

type Domain = 'integrations' | 'tmdb' | 'mdblist' | 'debrid' | 'simkl' | 'trackingSettings';
function useDomain<T>(topic: Domain) {
  const snapshot = useFeatureSnapshot<T>(topic);
  const [loading, setLoading] = useState(!snapshot);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => { setLoading(true); try { await refreshFeature<T>(topic); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load these settings.'); } finally { setLoading(false); } }, [topic]);
  useEffect(() => { if (!snapshot) void refresh(); }, [snapshot, refresh]);
  const run = useCallback(async (method: string, params: Record<string, unknown> = {}) => { setError(''); try { const result = await call(method, params); await refreshFeature<T>(topic); return result; } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this setting.'); throw cause; } }, [topic]);
  return { snapshot, loading, error, refresh, run };
}

function SubPage({ title, children }: { title: string; children: ReactNode }) { return <div className="page settings-page"><Link to="/settings/integrations" className="back-button settings-page-back" aria-label="Integrations"><ArrowLeft size={15} /></Link><PageHeader title={title} />{children}</div>; }
function Toggle({ title, description, checked, onChange, disabled = false }: { title: string; description?: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) { return <div className="settings-control-row"><span className="settings-control-copy"><strong>{title}</strong>{description && <span>{description}</span>}</span><label className="switch"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span /></label></div>; }
function Select({ title, value, values, labels, description, onChange, disabled = false, disabledValues = [] }: { title: string; value: string; values: string[]; labels?: string[]; description?: string; onChange: (value: string) => void; disabled?: boolean; disabledValues?: string[] }) {
  const [open, setOpen] = useState(false);
  const selected = values.indexOf(value);
  return <>
    <button type="button" className="settings-control-row settings-value-row" disabled={disabled} onClick={() => setOpen(true)}><span className="settings-control-copy"><strong>{title}</strong>{description && <span>{description}</span>}<span className="settings-value-current">{labels?.[selected] ?? value}</span></span><span className="settings-value-chevron">›</span></button>
    {open && <div className="consent-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><div className="consent-card settings-choice-dialog" role="dialog" aria-modal="true" aria-label={title}><div className="dialog-head"><strong>{title}</strong><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close"><ArrowLeft size={15} /></button></div><div className="settings-radio-list">{values.map((option, index) => <label className="settings-radio-option" key={option}><span><strong>{labels?.[index] ?? option}</strong></span><input type="radio" name={`settings-${title}`} value={option} checked={value === option} disabled={disabledValues.includes(option)} onChange={() => { onChange(option); setOpen(false); }} /></label>)}</div></div></div>}
  </>;
}
function NumberField({ title, value, min, max, onSave }: { title: string; value: number; min: number; max: number; onSave: (value: number) => void }) { const [draft, setDraft] = useState(String(value)); useEffect(() => setDraft(String(value)), [value]); return <div className="settings-control-row"><span className="settings-control-copy"><strong>{title}</strong></span><input className="settings-inline-number" type="number" value={draft} min={min} max={max} onChange={(event) => setDraft(event.target.value)} onBlur={() => { const next = Number(draft); if (Number.isInteger(next) && next >= min && next <= max && next !== value) onSave(next); else setDraft(String(value)); }} /></div>; }
function SettingsError({ error, refresh }: { error: string; refresh: () => void }) { return error ? <InlineError message={error} onRetry={() => void refresh()} /> : null; }
function Loading({ title }: { title: string }) { return <SubPage title={title}><div className="loading-block"><LoaderCircle size={17} className="spin" /> Loading settings…</div></SubPage>; }

export function IntegrationsLanding() {
  const { snapshot: _snapshot, loading, error, refresh } = useDomain<{ tmdb: { enabled: boolean; hasApiKey: boolean }; mdblist: { isActive: boolean; hasAccount: boolean }; debrid: { enabled: boolean; hasAnyApiKey: boolean } }>('integrations');
  if (loading && !_snapshot) return <div className="page settings-page"><PageHeader title="Integrations" /><div className="loading-block"><LoaderCircle size={17} className="spin" /> Loading integrations…</div></div>;
  return <div className="page settings-page"><PageHeader title="Integrations" />{error && <SettingsError error={error} refresh={refresh} />}<h2 className="settings-group-title">INTEGRATIONS</h2><div className="settings-nav-card">
    <IntegrationLink to="servers" title="Media servers" detail="Connect Jellyfin or Emby libraries" />
    <IntegrationLink to="tmdb" logoSrc="/images/attributions/tmdb.png" icon={<Film size={18} />} title="TMDB Enrichment" detail="Metadata enrichment controls" />
    <IntegrationLink to="mdblist" logoSrc="/images/attributions/mdblist.svg" icon={<Link2 size={18} />} title="MDBList Ratings" detail="External ratings providers" />
    <IntegrationLink to="debrid" title="Connected Services" detail="Connect accounts for links and library access" />
  </div></div>;
}
function IntegrationLink({ to, icon, logoSrc, title, detail }: { to: string; icon?: ReactNode; logoSrc?: string; title: string; detail: string }) { return <Link className="settings-nav-row" to={`/settings/integrations/${to}`}>{(logoSrc || icon) && <span className="settings-nav-icon">{logoSrc ? <img src={logoSrc} alt="" className="integration-brand-logo" /> : icon}</span>}<span className="settings-nav-copy"><strong>{title}</strong><span>{detail}</span></span></Link>; }
type Tmdb = { enabled: boolean; hasApiKey: boolean; hasEffectiveApiKey: boolean; proxyAccess: boolean; language: string; useTrailers: boolean; useArtwork: boolean; useBasicInfo: boolean; useDetails: boolean; useCredits: boolean; useProductions: boolean; useNetworks: boolean; useEpisodes: boolean; useSeasonPosters: boolean; useMoreLikeThis: boolean; useCollections: boolean };
export function TmdbSettingsPage() {
  const { snapshot: s, loading, error, refresh, run } = useDomain<Tmdb>('tmdb');
  const set = (key: string, value: unknown) => void run('tmdb.set', { key, value }).catch(() => {});
  if (loading && !s) return <Loading title="TMDB Enrichment" />;
  if (!s) return <SubPage title="TMDB Enrichment"><SettingsError error={error} refresh={refresh} /></SubPage>;
  return <SubPage title="TMDB Enrichment">{error && <SettingsError error={error} refresh={refresh} />}
    <h2 className="settings-group-title">TMDB ENRICHMENT</h2><section className="settings-section">
      <Toggle title="Enable TMDB Enrichment" description="Use TMDB as a metadata source to enhance addon data" checked={s.enabled} onChange={(value) => set('enabled', value)} />
      <IntegrationApiKeyField title="Personal API key" description={s.proxyAccess ? "This kids profile uses the key stored by KidsScreen. Nothing is saved on this device." : "Use your own TMDB API key, or leave blank to use the default."} inputLabel="API key" configured={s.hasApiKey} onSave={(value) => run('tmdb.set', { key: 'apiKey', value })} />
    </section>
    <h2 className="settings-group-title">LOCALIZATION</h2><section className="settings-section">
      <LanguageField value={s.language} onSave={(value) => set('language', value)} />
    </section>
    <h2 className="settings-group-title">MODULES</h2><section className="settings-section">
      {(['useTrailers', 'useArtwork', 'useBasicInfo', 'useDetails', 'useCredits', 'useProductions', 'useNetworks', 'useEpisodes', 'useSeasonPosters', 'useMoreLikeThis', 'useCollections'] as const).map((key) => <Toggle key={key} title={tmdbLabel(key)} description={tmdbDescription(key)} checked={s[key]} disabled={!s.enabled} onChange={(value) => set(key, value)} />)}
    </section>
  </SubPage>;
}
function tmdbLabel(key: string) { return ({ useBasicInfo: 'Basic Info', useDetails: 'Details', useArtwork: 'Artwork', useTrailers: 'Trailers', useCredits: 'Credits', useProductions: 'Productions', useNetworks: 'Networks', useEpisodes: 'Episodes', useSeasonPosters: 'Season posters', useMoreLikeThis: 'More Like This', useCollections: 'Collections' } as Record<string, string>)[key] ?? key; }
function tmdbDescription(key: string) { return ({ useBasicInfo: 'Description, genres, and rating from TMDB', useDetails: 'Runtime, status, country, and language from TMDB', useArtwork: 'Logo and backdrop images from TMDB', useTrailers: 'Trailer candidates from TMDB videos for the detail trailer section', useCredits: 'Cast with photos, director, and writer from TMDB', useProductions: 'Production companies from TMDB', useNetworks: 'Networks with logos from TMDB', useEpisodes: 'Episode titles, overviews, thumbnails, and runtime from TMDB', useSeasonPosters: 'Use TMDB season posters in the metadata screen season selector for series.', useMoreLikeThis: 'TMDB recommendation backdrops on detail page', useCollections: 'TMDB movie collections in release order' } as Record<string, string>)[key] ?? ''; }
function IntegrationApiKeyField({ title, description, inputLabel, configured, usingAccount = false, onSave }: { title: string; description: string; inputLabel: string; configured: boolean; usingAccount?: boolean; onSave: (value: string) => Promise<unknown> }) {
  const [value, setValue] = useState(''); const [visible, setVisible] = useState(false); const [focused, setFocused] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function save(next = value.trim()) { setBusy(true); setError(''); try { await onSave(next); setValue(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the API key.'); } finally { setBusy(false); } }
  return <div className="settings-tmdb-key-row"><div className="settings-tmdb-key-copy"><strong>{title}</strong><span>{description}</span></div>{usingAccount && <small className="settings-tmdb-key-status">Using connected account</small>}<div className={`settings-tmdb-key-input settings-outlined-field ${focused || value || configured ? 'field-floating' : ''}`}><span>{inputLabel}</span><input type={visible ? 'text' : 'password'} value={value} autoComplete="new-password" placeholder={configured && !value ? '••••••••••••' : ''} aria-label={inputLabel} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={(event) => setValue(event.target.value)} /><button type="button" className="icon-button" aria-label={visible ? 'Hide API key' : 'Show API key'} onClick={() => setVisible((shown) => !shown)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div><div className="settings-tmdb-key-actions"><button className="button primary" disabled={!value.trim() || busy} onClick={() => void save()}>{busy ? <LoaderCircle size={14} className="spin" /> : null}Save</button>{configured && <button className="button secondary" disabled={busy} onClick={() => void save('')}>Clear</button>}</div>{error && <p className="form-error">{error}</p>}</div>;
}
function LanguageField({ value, onSave }: { value: string; onSave: (value: string) => void }) { const [draft, setDraft] = useState(value || 'en'); const [focused, setFocused] = useState(false); useEffect(() => setDraft(value || 'en'), [value]); const normalized = draft.trim(); return <div className="settings-language-row"><div className="settings-language-copy"><strong>Language</strong><span>TMDB metadata language for title, logo, and enabled fields</span></div><label className={`settings-language-input settings-outlined-field ${focused || draft ? 'field-floating' : ''}`}><span>Language code</span><input value={draft} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={(event) => setDraft(event.target.value)} /></label><button className="button primary" disabled={!normalized || normalized === value} onClick={() => { setDraft(normalized); onSave(normalized); }}>Save</button></div>; }

type Mdb = { listOptions?: { key: string; name: string; visible: boolean }[]; enabled: boolean; hasApiKey: boolean; hasAccount: boolean; hasCredentials: boolean; isActive: boolean; useImdb: boolean; useTmdb: boolean; useTomatoes: boolean; useMetacritic: boolean; useTrakt: boolean; useLetterboxd: boolean; useAudience: boolean; useMal: boolean; showOnHero?: boolean; account: { connected: boolean; username: string | null; userId: string | null; isSupporter: boolean; mode: string | null; userCode: string | null; verificationUrl: string | null; verificationUrlComplete: string | null; expiresAtEpochMs: number | null; pollIntervalSeconds: number; isBusy: boolean; error: string | null; revokeFailed: boolean } };
export function MdbListSettingsPage() {
  const { snapshot: s, loading, error, refresh, run } = useDomain<Mdb>('mdblist');
  const set = (key: string, value: unknown) => void run('mdblist.set', { key, value }).catch(() => {});
  if (loading && !s) return <Loading title="MDBList Ratings" />;
  if (!s) return <SubPage title="MDBList Ratings"><SettingsError error={error} refresh={refresh} /></SubPage>;
  const providers = [['imdb', 'IMDb', s.useImdb], ['tmdb', 'TMDB', s.useTmdb], ['tomatoes', 'Rotten Tomatoes', s.useTomatoes], ['metacritic', 'Metacritic', s.useMetacritic], ['trakt', 'Trakt', s.useTrakt], ['letterboxd', 'Letterboxd', s.useLetterboxd], ['audience', 'Audience Score', s.useAudience], ['mal', 'MyAnimeList', s.useMal]] as const;
  return <SubPage title="MDBList Ratings">{error && <SettingsError error={error} refresh={refresh} />}
    <h2 className="settings-group-title">MDBLIST RATINGS</h2><section className="settings-section">
      <Toggle title="Enable MDBList Ratings" description="Fetch ratings from external providers in metadata detail screen" checked={s.enabled} onChange={(value) => set('enabled', value)} />
      <Toggle title="Show ratings on Home" description="Show enabled external ratings on featured titles." checked={s.showOnHero ?? false} disabled={!s.enabled} onChange={value => set('showOnHero', value)} />
      {!s.hasCredentials && <p className="muted small">Connect MDBList in Tracking or enter an API key to fetch ratings.</p>}
    </section>
    <h2 className="settings-group-title">API KEY</h2><section className="settings-section">
      <IntegrationApiKeyField title="API Key" description="An API key overrides your connected account for ratings. Clear it and save to use the connected account again." inputLabel="API Key" configured={s.hasApiKey} usingAccount={s.hasAccount && !s.hasApiKey} onSave={(value) => run('mdblist.set', { key: 'apiKey', value })} />
    </section>
    {s.hasAccount && !!s.listOptions?.length && <><h2 className="settings-group-title">LIBRARY LISTS</h2><section className="settings-section">{s.listOptions.map(list => <Toggle key={list.key} title={list.name} checked={list.visible} onChange={visible => void run('mdblist.setListVisible', { key: list.key, visible }).catch(() => {})} />)}</section></>}
    <h2 className="settings-group-title">EXTERNAL RATINGS PROVIDERS</h2><section className="settings-section">
      {providers.map(([id, label, checked]) => <Toggle key={id} title={label} checked={checked} disabled={!s.enabled} onChange={(value) => void run('mdblist.setProviderEnabled', { providerId: id, enabled: value }).catch(() => {})} />)}
    </section>
  </SubPage>;
}

type DebridProvider = { id: string; displayName: string; shortName: string; authMethod: string; hasApiKey: boolean; configured: boolean; supportsCloudLibrary: boolean };
type DebridPreferences = { preferMatchingReleaseTitles: boolean; maxResults: number; maxPerResolution: number; maxPerQuality: number; sizeMinGb: number; sizeMaxGb: number; preferredResolutions: string[]; requiredResolutions: string[]; excludedResolutions: string[]; preferredQualities: string[]; requiredQualities: string[]; excludedQualities: string[]; preferredVisualTags: string[]; requiredVisualTags: string[]; excludedVisualTags: string[]; preferredAudioTags: string[]; requiredAudioTags: string[]; excludedAudioTags: string[]; preferredAudioChannels: string[]; requiredAudioChannels: string[]; excludedAudioChannels: string[]; preferredEncodes: string[]; requiredEncodes: string[]; excludedEncodes: string[]; preferredLanguages: string[]; requiredLanguages: string[]; excludedLanguages: string[]; requiredReleaseGroups: string[]; excludedReleaseGroups: string[] };
type Debrid = { enabled: boolean; cloudLibraryEnabled: boolean; hasAnyApiKey: boolean; hasResolverProvider: boolean; canResolvePlayableLinks: boolean; hasCloudLibraryProvider: boolean; preferredResolverProviderId: string | null; instantPlaybackPreparationLimit: number; streamMaxResults: number; streamSortMode: string; streamMinimumQuality: string; streamDolbyVisionFilter: string; streamHdrFilter: string; streamCodecFilter: string; streamNameTemplate: string; streamDescriptionTemplate: string; providers: DebridProvider[]; streamPreferences: DebridPreferences; limits: { instantPlaybackMin: number; instantPlaybackMax: number; streamMaxResultsMin: number; streamMaxResultsMax: number } };
type PreferenceListKey = Exclude<keyof DebridPreferences, 'preferMatchingReleaseTitles' | 'maxResults' | 'maxPerResolution' | 'maxPerQuality' | 'sizeMinGb' | 'sizeMaxGb'>;
const debridPreferenceGroups: Array<{ title: string; description: string; field: PreferenceListKey; choices: string[] }> = [
  { title: 'Preferred resolutions', description: 'Sort selected resolutions first, in default order.', field: 'preferredResolutions', choices: ['P2160', 'P1440', 'P1080', 'P720', 'P576', 'P480', 'P360', 'UNKNOWN'] },
  { title: 'Required resolutions', description: 'Only show selected resolutions.', field: 'requiredResolutions', choices: ['P2160', 'P1440', 'P1080', 'P720', 'P576', 'P480', 'P360', 'UNKNOWN'] },
  { title: 'Excluded resolutions', description: 'Hide selected resolutions.', field: 'excludedResolutions', choices: ['P2160', 'P1440', 'P1080', 'P720', 'P576', 'P480', 'P360', 'UNKNOWN'] },
  ...(['preferredQualities', 'requiredQualities', 'excludedQualities'] as const).map((field) => ({ title: ({ preferredQualities: 'Preferred qualities', requiredQualities: 'Required qualities', excludedQualities: 'Excluded qualities' } as const)[field], description: ({ preferredQualities: 'Sort selected qualities first, in default order.', requiredQualities: 'Only show selected qualities.', excludedQualities: 'Hide selected qualities.' } as const)[field], field, choices: ['BLURAY_REMUX', 'BLURAY', 'WEB_DL', 'WEBRIP', 'HDRIP', 'HD_RIP', 'DVDRIP', 'HDTV', 'CAM', 'TS', 'TC', 'SCR', 'UNKNOWN'] })),
  ...(['preferredVisualTags', 'requiredVisualTags', 'excludedVisualTags'] as const).map((field) => ({ title: ({ preferredVisualTags: 'Preferred visual tags', requiredVisualTags: 'Required visual tags', excludedVisualTags: 'Excluded visual tags' } as const)[field], description: ({ preferredVisualTags: 'Sort DV, HDR, 10bit, IMAX and similar tags.', requiredVisualTags: 'Require DV, HDR, 10bit, IMAX, SDR and similar tags.', excludedVisualTags: 'Hide DV, HDR, 10bit, 3D and similar tags.' } as const)[field], field, choices: ['HDR_DV', 'DV_ONLY', 'HDR_ONLY', 'HDR10_PLUS', 'HDR10', 'DV', 'HDR', 'HLG', 'TEN_BIT', 'IMAX', 'SDR', 'THREE_D', 'AI', 'H_OU', 'H_SBS', 'UNKNOWN'] })),
  ...(['preferredAudioTags', 'requiredAudioTags', 'excludedAudioTags'] as const).map((field) => ({ title: ({ preferredAudioTags: 'Preferred audio tags', requiredAudioTags: 'Required audio tags', excludedAudioTags: 'Excluded audio tags' } as const)[field], description: ({ preferredAudioTags: 'Sort Atmos, TrueHD, DTS, AAC and similar tags.', requiredAudioTags: 'Require Atmos, TrueHD, DTS, AAC and similar tags.', excludedAudioTags: 'Hide selected audio tags.' } as const)[field], field, choices: ['ATMOS', 'DD_PLUS', 'DD', 'DTS_X', 'DTS_HD_MA', 'DTS_HD', 'DTS_ES', 'DTS', 'TRUEHD', 'OPUS', 'FLAC', 'AAC', 'UNKNOWN'] })),
  ...(['preferredAudioChannels', 'requiredAudioChannels', 'excludedAudioChannels'] as const).map((field) => ({ title: ({ preferredAudioChannels: 'Preferred channels', requiredAudioChannels: 'Required channels', excludedAudioChannels: 'Excluded channels' } as const)[field], description: ({ preferredAudioChannels: 'Sort preferred channel layouts first.', requiredAudioChannels: 'Only show selected channel layouts.', excludedAudioChannels: 'Hide selected channel layouts.' } as const)[field], field, choices: ['CH_7_1', 'CH_6_1', 'CH_5_1', 'CH_2_0', 'UNKNOWN'] })),
  ...(['preferredEncodes', 'requiredEncodes', 'excludedEncodes'] as const).map((field) => ({ title: ({ preferredEncodes: 'Preferred encodes', requiredEncodes: 'Required encodes', excludedEncodes: 'Excluded encodes' } as const)[field], description: ({ preferredEncodes: 'Sort AV1, HEVC, AVC and similar encodes.', requiredEncodes: 'Require AV1, HEVC, AVC and similar encodes.', excludedEncodes: 'Hide selected encodes.' } as const)[field], field, choices: ['AV1', 'HEVC', 'AVC', 'XVID', 'DIVX', 'UNKNOWN'] })),
  ...(['preferredLanguages', 'requiredLanguages', 'excludedLanguages'] as const).map((field) => ({ title: ({ preferredLanguages: 'Preferred languages', requiredLanguages: 'Required languages', excludedLanguages: 'Excluded languages' } as const)[field], description: ({ preferredLanguages: 'Sort preferred audio languages first.', requiredLanguages: 'Only show results with selected languages.', excludedLanguages: 'Hide results where every language is excluded.' } as const)[field], field, choices: ['EN', 'HI', 'IT', 'ES', 'FR', 'DE', 'PT', 'PL', 'CS', 'LA', 'JA', 'KO', 'ZH', 'HU', 'HE', 'RU', 'UK', 'AR', 'TR', 'TA', 'TE', 'ML', 'KN', 'NL', 'SV', 'NO', 'DA', 'FI', 'EL', 'RO', 'TH', 'VI', 'ID', 'MULTI', 'UNKNOWN'] })),
];
export function DebridSettingsPage() {
  const { snapshot: s, loading, error, refresh, run } = useDomain<Debrid>('debrid');
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const set = (key: string, value: unknown, providerId?: string) => void run('debrid.set', { key, value, ...(providerId ? { providerId } : {}) }).catch(() => {});
  if (loading && !s) return <Loading title="Connected Services" />;
  if (!s) return <SubPage title="Connected Services"><SettingsError error={error} refresh={refresh} /></SubPage>;
  return <SubPage title="Connected Services">{error && <SettingsError error={error} refresh={refresh} />}
    <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><Cloud size={18} /></span><div><h2>Connected Services</h2><p>Connect a resolver provider to enable cloud playback.</p></div></div><p className="muted small debrid-experimental-notice">These integrations are experimental and may be kept, changed, or removed later.</p><Toggle title="Cloud library" description="Browse and play files already in your connected accounts." checked={s.cloudLibraryEnabled} disabled={!s.hasCloudLibraryProvider} onChange={(value) => set('cloudLibraryEnabled', value)} /><Toggle title="Resolve playable links" description="Ask a connected service for playable links when a result needs it. This may add the item to that service." checked={s.enabled} disabled={!s.hasResolverProvider} onChange={(value) => set('enabled', value)} />{!s.hasResolverProvider && <p className="muted small">Connect an account first.</p>}{s.enabled && s.providers.filter((provider) => provider.configured).length > 1 && <Select title="Resolve with" description="Choose which connected account handles playable links." value={s.preferredResolverProviderId ?? ''} values={['', ...s.providers.filter((provider) => provider.configured).map((provider) => provider.id)]} labels={['Automatic', ...s.providers.filter((provider) => provider.configured).map((provider) => provider.displayName)]} onChange={(value) => { if (value) set('preferredResolverProviderId', value); }} />}</section>
    <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><KeyRound size={18} /></span><div><h2>Accounts</h2><p>Choose a provider to connect or enter its API key.</p></div></div>
      {s.providers.map((provider) => <button type="button" className="settings-control-row integration-provider-choice" key={provider.id} onClick={() => setActiveProviderId(provider.id)}><span className="settings-control-copy"><strong>{provider.displayName}</strong><span>{provider.authMethod === 'DeviceCode' ? `Link your ${provider.displayName} account in the browser.` : `Connect your ${provider.displayName} account.`}</span></span><span className="integration-provider-status">{provider.configured ? (provider.authMethod === 'DeviceCode' ? 'Connected' : 'API key configured') : 'Not set'}</span></button>)}
    </section>
    {activeProviderId && (() => { const provider = s.providers.find(item => item.id === activeProviderId); return provider ? <DebridAccountDialog key={provider.id} provider={provider} onClose={() => setActiveProviderId(null)} /> : null; })()}
    <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><Film size={18} /></span><div><h2>Link Preparation</h2><p>Resolve playable links before playback starts.</p></div></div><Toggle title="Prepare links" description="Resolve playable links before playback starts." checked={s.instantPlaybackPreparationLimit > 0} disabled={!s.canResolvePlayableLinks} onChange={(enabled) => set('instantPlaybackPreparationLimit', enabled ? Math.min(3, s.limits.instantPlaybackMax) : 0)} />{s.instantPlaybackPreparationLimit > 0 && <NumberField title="Links to prepare" value={s.instantPlaybackPreparationLimit} min={1} max={s.limits.instantPlaybackMax} onSave={(value) => set('instantPlaybackPreparationLimit', value)} />}</section>
    <DebridResultManagement preferences={s.streamPreferences} enabled={s.canResolvePlayableLinks} onSave={(preferences) => set('streamPreferences', preferences)} />
    <DebridFormattingSection nameTemplate={s.streamNameTemplate} descriptionTemplate={s.streamDescriptionTemplate} enabled={s.canResolvePlayableLinks} onSave={(key, value) => set(key, value)} onReset={() => set('resetStreamTemplates', true)} />
  </SubPage>;
}

const DEFAULT_STREAM_NAME_TEMPLATE = '{stream.resolution::exists["{stream.resolution} "||""]}{service.shortName::exists["{service.shortName}"||"Cloud"]} Instant';
const DEFAULT_STREAM_DESCRIPTION_TEMPLATE = '';
type DebridTemplateField = 'name' | 'description';
function DebridFormattingSection({ nameTemplate, descriptionTemplate, enabled, onSave, onReset }: { nameTemplate: string; descriptionTemplate: string; enabled: boolean; onSave: (key: 'streamNameTemplate' | 'streamDescriptionTemplate', value: string) => void; onReset: () => void }) {
  const [activeField, setActiveField] = useState<DebridTemplateField | null>(null);
  const field = activeField === 'name'
    ? { title: 'Name template', description: 'Controls how result names appear. Leave blank to use the original result name.', value: nameTemplate, defaultValue: DEFAULT_STREAM_NAME_TEMPLATE, preferenceKey: 'streamNameTemplate' as const }
    : activeField === 'description'
      ? { title: 'Description template', description: 'Controls the metadata shown under each result. Leave blank to use the original result details.', value: descriptionTemplate, defaultValue: DEFAULT_STREAM_DESCRIPTION_TEMPLATE, preferenceKey: 'streamDescriptionTemplate' as const }
      : null;
  return <>
    <section className="settings-section">
      <div className="settings-section-heading"><span className="settings-icon"><RotateCcw size={18} /></span><div><h2>Formatting</h2><p>Customize how stream names and descriptions are shown.</p></div></div>
      <DebridPreferenceRow title="Name template" description="Controls how result names appear. Leave blank to use the original result name." value={templatePreview(nameTemplate, DEFAULT_STREAM_NAME_TEMPLATE)} enabled={enabled} onClick={() => setActiveField('name')} />
      <DebridPreferenceRow title="Description template" description="Controls the metadata shown under each result. Leave blank to use the original result details." value={templatePreview(descriptionTemplate, DEFAULT_STREAM_DESCRIPTION_TEMPLATE)} enabled={enabled} onClick={() => setActiveField('description')} />
      <DebridPreferenceRow title="Reset formatting" description="Restore default result formatting." value="Reset to Default" enabled={enabled} onClick={onReset} />
    </section>
    {field && <DebridTemplateDialog key={activeField} title={field.title} description={field.description} value={field.value} defaultValue={field.defaultValue} onClose={() => setActiveField(null)} onSave={(value) => { onSave(field.preferenceKey, value); setActiveField(null); }} />}
  </>;
}

function DebridTemplateDialog({ title, description, value, defaultValue, onClose, onSave }: { title: string; description: string; value: string; defaultValue: string; onClose: () => void; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  return <Dialog label={title} onClose={onClose} className="settings-choice-dialog debrid-result-dialog debrid-template-dialog">
    <h2>{title}</h2>
    <p className="muted">{description}</p>
    <textarea className="debrid-template-input" value={draft} onChange={(event) => setDraft(event.target.value)} rows={5} aria-label={title} />
    <div className="dialog-actions debrid-template-actions">
      <button type="button" className="button secondary" onClick={() => setDraft(defaultValue)}>Reset</button>
      <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
      <button type="button" className="button primary" onClick={() => onSave(draft)}>Save</button>
    </div>
  </Dialog>;
}

function templatePreview(value: string, defaultValue: string) {
  const trimmed = value.trim();
  if (!trimmed) return 'Original format';
  if (trimmed === defaultValue.trim()) return 'Default format';
  const firstLine = value.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return firstLine ? firstLine.length <= 28 ? firstLine : `${firstLine.slice(0, 28)}...` : 'Default format';
}

function DebridResultManagement({ preferences, enabled, onSave }: { preferences: DebridPreferences; enabled: boolean; onSave: (value: DebridPreferences) => void }) {
  const [active, setActive] = useState<DebridResultRowKey | null>(null);
  const rows: Array<{ key: 'maxResults' | 'maxPerResolution' | 'maxPerQuality' | 'sizeRange' | PreferenceListKey | 'requiredReleaseGroups' | 'excludedReleaseGroups'; title: string; description: string; value: string }> = [
    { key: 'maxResults', title: 'Max results', description: 'Limit how many results appear.', value: resultCountLabel(preferences.maxResults) },
    { key: 'maxPerResolution', title: 'Per resolution limit', description: 'Cap repeated 2160p, 1080p, 720p results after sorting.', value: resultCountLabel(preferences.maxPerResolution) },
    { key: 'maxPerQuality', title: 'Per quality limit', description: 'Cap repeated BluRay, WEB-DL, REMUX results after sorting.', value: resultCountLabel(preferences.maxPerQuality) },
    { key: 'sizeRange', title: 'Size range', description: 'Filter results by file size.', value: sizeRangeLabel(preferences.sizeMinGb, preferences.sizeMaxGb) },
    ...debridPreferenceGroups.map((rule) => ({ key: rule.field, title: rule.title, description: rule.description, value: selectionCountLabel(preferences[rule.field]) })),
    { key: 'requiredReleaseGroups', title: 'Required release groups', description: 'Only show selected release groups.', value: selectionCountLabel(preferences.requiredReleaseGroups) },
    { key: 'excludedReleaseGroups', title: 'Excluded release groups', description: 'Hide selected release groups.', value: selectionCountLabel(preferences.excludedReleaseGroups) },
  ];
  return <section className="settings-section">
    <div className="settings-section-heading"><span className="settings-icon"><ShieldCheck size={18} /></span><div><h2>Result management</h2></div></div>
    {rows.map((row) => <DebridPreferenceRow key={row.key} title={row.title} description={row.description} value={row.value} enabled={enabled} onClick={() => setActive(row.key)} />)}
    <DebridPreferenceDialogs active={active} setActive={setActive} preferences={preferences} onSave={onSave} />
  </section>;
}

type DebridResultRowKey = 'maxResults' | 'maxPerResolution' | 'maxPerQuality' | 'sizeRange' | PreferenceListKey | 'requiredReleaseGroups' | 'excludedReleaseGroups';
function DebridPreferenceRow({ title, description, value, enabled, onClick }: { title: string; description: string; value: string; enabled: boolean; onClick: () => void }) {
  return <button type="button" className="settings-control-row debrid-preference-row" disabled={!enabled} onClick={onClick}>
    <span className="settings-control-copy"><strong>{title}</strong><span>{description}</span></span>
    <span className="debrid-preference-value">{value}</span>
  </button>;
}

function DebridPreferenceDialogs({ active, setActive, preferences, onSave }: { active: DebridResultRowKey | null; setActive: (key: DebridResultRowKey | null) => void; preferences: DebridPreferences; onSave: (value: DebridPreferences) => void }) {
  const optionGroup = debridPreferenceGroups.find((group) => group.field === active);
  const isReleaseGroups = active === 'requiredReleaseGroups' || active === 'excludedReleaseGroups';
  if (!active) return null;

  if (active === 'maxResults' || active === 'maxPerResolution' || active === 'maxPerQuality') {
    const options = active === 'maxResults' ? [0, 5, 10, 20, 50] : [0, 1, 2, 3, 5];
    return <DebridSingleChoiceDialog title="Max results" selected={preferences[active]} options={options.map((value) => ({ value, label: resultCountLabel(value) }))} onClose={() => setActive(null)} onSelect={(value) => { onSave({ ...preferences, [active]: value }); setActive(null); }} />;
  }

  if (active === 'sizeRange') {
    return <DebridSizeRangeDialog min={preferences.sizeMinGb} max={preferences.sizeMaxGb} onClose={() => setActive(null)} onSave={(min, max) => {
      onSave({ ...preferences, sizeMinGb: min, sizeMaxGb: max });
      setActive(null);
    }} />;
  }

  if (optionGroup) {
    const selected = preferences[optionGroup.field] ?? [];
    return <DebridMultiChoiceDialog title={optionGroup.title} values={optionGroup.choices} selected={selected} onClose={() => setActive(null)} onSave={(values) => {
      const normalized = values.length || !optionGroup.field.startsWith('preferred') ? values : optionGroup.choices;
      onSave({ ...preferences, [optionGroup.field]: normalized });
    }} />;
  }

  if (isReleaseGroups) {
    const title = active === 'requiredReleaseGroups' ? 'Required release groups' : 'Excluded release groups';
    return <DebridReleaseGroupDialog title={title} values={preferences[active]} onClose={() => setActive(null)} onSave={(values) => onSave({ ...preferences, [active]: values })} />;
  }
  return null;
}

function DebridSingleChoiceDialog<T extends string | number>({ title, options, selected, onClose, onSelect }: { title: string; options: Array<{ value: T; label: string }>; selected: T; onClose: () => void; onSelect: (value: T) => void }) {
  return <Dialog label={title} onClose={onClose} className="settings-choice-dialog debrid-result-dialog">
    <h2>{title}</h2>
    <div className="settings-dialog-options debrid-choice-options">{options.map((option) => {
      const isSelected = selected === option.value;
      return <button type="button" className={`settings-dialog-option${isSelected ? ' selected' : ''}`} key={option.value} aria-pressed={isSelected} onClick={() => onSelect(option.value)}>
        <span>{option.label}</span>{isSelected && <Check size={20} strokeWidth={2} aria-hidden="true" />}
      </button>;
    })}</div>
  </Dialog>;
}

const SIZE_PRESET_VALUES_GB = [0, 0.5, 1, 2, 5, 10, 20, 50, 100];
const SIZE_CUSTOM_KEY = 'custom';

function sizePresetKey(value: number): string {
  if (value <= 0) return 'any';
  return SIZE_PRESET_VALUES_GB.includes(value) ? String(value) : SIZE_CUSTOM_KEY;
}
function sizeOptionLabel(value: number): string {
  if (value <= 0) return 'Any';
  return value < 1 ? `${Math.round(value * 1000)} MB` : `${value} GB`;
}
function sizeKeyLabel(key: string, text: string): string {
  if (key === 'any') return 'Any';
  if (key === SIZE_CUSTOM_KEY) return text.trim() ? `${text.trim()} GB` : 'Custom';
  return sizeOptionLabel(Number(key));
}
function sizeKeyValue(key: string, text: string): number | null {
  if (key === 'any') return 0;
  if (key === SIZE_CUSTOM_KEY) {
    const value = Number(text.replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  const value = Number(key);
  return Number.isFinite(value) ? value : null;
}

export function DebridSizeRangeDialog({ min, max, onClose, onSave }: { min: number; max: number; onClose: () => void; onSave: (min: number, max: number) => void }) {
  const [minKey, setMinKey] = useState(() => sizePresetKey(min));
  const [maxKey, setMaxKey] = useState(() => sizePresetKey(max));
  const [minText, setMinText] = useState(() => sizePresetKey(min) === SIZE_CUSTOM_KEY ? String(min) : '');
  const [maxText, setMaxText] = useState(() => sizePresetKey(max) === SIZE_CUSTOM_KEY ? String(max) : '');
  const [openField, setOpenField] = useState<'min' | 'max' | null>(null);
  const [error, setError] = useState('');
  const options = [...SIZE_PRESET_VALUES_GB.map((value) => ({ key: value <= 0 ? 'any' : String(value), label: sizeOptionLabel(value) })), { key: SIZE_CUSTOM_KEY, label: 'Custom…' }];
  const keyOf = (kind: 'min' | 'max') => kind === 'min' ? minKey : maxKey;
  const setKeyOf = (kind: 'min' | 'max', key: string) => { if (kind === 'min') setMinKey(key); else setMaxKey(key); };
  const field = (kind: 'min' | 'max') => {
    const label = kind === 'min' ? 'Minimum size' : 'Maximum size';
    const key = keyOf(kind);
    const text = kind === 'min' ? minText : maxText;
    return <div className="debrid-size-field">
      <span className="debrid-size-field-label">{label}</span>
      <button type="button" className="debrid-size-select" aria-haspopup="listbox" aria-expanded={openField === kind} aria-label={label} onClick={() => setOpenField(openField === kind ? null : kind)}>
        <span>{sizeKeyLabel(key, text)}</span><ChevronDown size={18} aria-hidden="true" />
      </button>
      {key === SIZE_CUSTOM_KEY && <input className="debrid-size-custom-input" type="number" min="0.1" step="0.1" inputMode="decimal" placeholder="Size in GB" aria-label={`${label} in GB`} value={text} onChange={(event) => { const value = event.target.value; if (kind === 'min') setMinText(value); else setMaxText(value); }} />}
    </div>;
  };
  return <Dialog label="Size range" onClose={onClose} className="settings-choice-dialog debrid-result-dialog debrid-size-dialog">
    <h2>Size range</h2>
    <div className="debrid-size-range-fields">{field('min')}{field('max')}</div>
    {openField && <div className="settings-dialog-options debrid-choice-options debrid-size-options" role="listbox" aria-label={openField === 'min' ? 'Minimum size' : 'Maximum size'}>
      {options.map((option) => {
        const selected = keyOf(openField) === option.key;
        return <button type="button" role="option" aria-selected={selected} className={`settings-dialog-option${selected ? ' selected' : ''}`} key={option.key} onClick={() => { setKeyOf(openField, option.key); setOpenField(null); }}>
          <span>{option.label}</span>{selected && <Check size={20} strokeWidth={2} aria-hidden="true" />}
        </button>;
      })}
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <DebridDialogActions onClear={() => { setMinKey('any'); setMaxKey('any'); setMinText(''); setMaxText(''); setError(''); }} onSave={() => {
      const minValue = sizeKeyValue(minKey, minText);
      const maxValue = sizeKeyValue(maxKey, maxText);
      if (minValue == null || maxValue == null) { setError('Enter a size greater than 0 GB.'); return; }
      if (maxValue > 0 && minValue > maxValue) { setError('Maximum size must be at least the minimum size.'); return; }
      onSave(minValue, maxValue);
    }} />
  </Dialog>;
}

function DebridDialogActions({ onClear, onSave }: { onClear: () => void; onSave: () => void }) {
  return <div className="dialog-actions debrid-dialog-actions">
    <button type="button" className="button secondary" onClick={onClear}>Clear</button>
    <button type="button" className="button primary" onClick={onSave}>Save</button>
  </div>;
}

function DebridMultiChoiceDialog({ title, values, selected, onClose, onSave }: { title: string; values: string[]; selected: string[]; onClose: () => void; onSave: (value: string[]) => void }) {
  const [draft, setDraft] = useState(selected);
  return <Dialog label={title} onClose={onClose} className="settings-choice-dialog debrid-result-dialog">
    <h2>{title}</h2>
    <div className="settings-dialog-options debrid-multichoice-options">{values.map((value) => {
      const checked = draft.includes(value);
      return <button type="button" role="checkbox" aria-checked={checked} className={`settings-dialog-option debrid-multichoice-option${checked ? ' selected' : ''}`} key={value} onClick={() => setDraft((current) => checked ? current.filter((item) => item !== value) : [...current, value])}>
        <span>{preferenceChoiceLabel(value)}</span>{checked && <Check size={20} strokeWidth={2} aria-hidden="true" />}
      </button>;
    })}</div>
    <DebridDialogActions onClear={() => setDraft([])} onSave={() => { onSave(draft); onClose(); }} />
  </Dialog>;
}

function DebridReleaseGroupDialog({ title, values, onClose, onSave }: { title: string; values: string[]; onClose: () => void; onSave: (value: string[]) => void }) {
  const [draft, setDraft] = useState(values.join('\n'));
  return <Dialog label={title} onClose={onClose} className="settings-choice-dialog debrid-result-dialog">
    <h2>{title}</h2><p className="muted">Enter one group per line.</p>
    <textarea className="debrid-release-groups-input" value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} aria-label={title} />
    <DebridDialogActions onClear={() => setDraft('')} onSave={() => { onSave([...new Set(draft.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))]); onClose(); }} />
  </Dialog>;
}

function selectionCountLabel(values: string[]) { return values.length ? `${values.length} selected` : 'Any'; }
function resultCountLabel(value: number) { return value <= 0 ? 'All results' : `${value} results`; }
function sizeRangeLabel(min: number, max: number) {
  if (min <= 0 && max <= 0) return 'Any';
  if (min <= 0) return `Up to ${sizeOptionLabel(max)}`;
  if (max <= 0) return `${sizeOptionLabel(min)}+`;
  return `${sizeOptionLabel(min)} – ${sizeOptionLabel(max)}`;
}
function preferenceChoiceLabel(value: string) {
  const special: Record<string, string> = { P2160: '2160p', P1440: '1440p', P1080: '1080p', P720: '720p', P576: '576p', P480: '480p', P360: '360p', UNKNOWN: 'Unknown', BLURAY_REMUX: 'BluRay REMUX', BLURAY: 'BluRay', WEB_DL: 'WEB-DL', WEBRIP: 'WEBRip', HDRIP: 'HDRip', HD_RIP: 'HC HD-Rip', DVDRIP: 'DVDRip', HDTV: 'HDTV', HDR_DV: 'HDR+DV', DV_ONLY: 'DV Only', HDR_ONLY: 'HDR Only', HDR10_PLUS: 'HDR10+', HDR10: 'HDR10', DV: 'DV', HDR: 'HDR', HLG: 'HLG', TEN_BIT: '10bit', THREE_D: '3D', IMAX: 'IMAX', AI: 'AI', SDR: 'SDR', H_OU: 'H-OU', H_SBS: 'H-SBS', ATMOS: 'Atmos', DD_PLUS: 'DD+', DD: 'DD', DTS_X: 'DTS:X', DTS_HD_MA: 'DTS-HD MA', DTS_HD: 'DTS-HD', DTS_ES: 'DTS-ES', DTS: 'DTS', TRUEHD: 'TrueHD', OPUS: 'OPUS', FLAC: 'FLAC', AAC: 'AAC', CH_7_1: '7.1', CH_6_1: '6.1', CH_5_1: '5.1', CH_2_0: '2.0', AV1: 'AV1', HEVC: 'HEVC', AVC: 'AVC', XVID: 'XviD', DIVX: 'DivX', EN: 'English', HI: 'Hindi', IT: 'Italian', ES: 'Spanish', FR: 'French', DE: 'German', PT: 'Portuguese', PL: 'Polish', CS: 'Czech', LA: 'Latino', JA: 'Japanese', KO: 'Korean', ZH: 'Chinese', HU: 'Hungarian', HE: 'Hebrew', RU: 'Russian', UK: 'Ukrainian', AR: 'Arabic', TR: 'Turkish', TA: 'Tamil', TE: 'Telugu', ML: 'Malayalam', KN: 'Kannada', NL: 'Dutch', SV: 'Swedish', NO: 'Norwegian', DA: 'Danish', FI: 'Finnish', EL: 'Greek', RO: 'Romanian', TH: 'Thai', VI: 'Vietnamese', ID: 'Indonesian', MULTI: 'Multi' };
  return special[value] ?? value;
}

type Simkl = { mode: string; connected: boolean; credentialsConfigured: boolean; isLoading: boolean; usesPinFlow: boolean; username: string | null; accountId: string | null; pendingPinUserCode: string | null; pendingPinVerificationUrl: string | null; pendingPinExpiresAtEpochMs: number | null; error: string | null };
export function SimklSettingsPage() {
  const [busy, setBusy] = useState(false);
  const { snapshot: s, loading, error, refresh, run } = useDomain<Simkl>('simkl');
  if (loading && !s) return <Loading title="Simkl" />;
  if (!s) return <SubPage title="Simkl"><SettingsError error={error} refresh={refresh} /></SubPage>;
  async function connect() { setBusy(true); try { const result = await run('simkl.connect') as { authorizationUrl?: string | null }; if (result.authorizationUrl) await call('app.openExternal', { url: result.authorizationUrl }); } catch { /* error shown inline */ } finally { setBusy(false); } }
  return <SubPage title="Simkl">{error && <SettingsError error={error} refresh={refresh} />}<section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><img src="/images/attributions/simkl.svg" alt="" className="integration-brand-logo" /></span><div><h2>Simkl account</h2><p>Use Simkl for watch progress, library, and recommendations.</p></div></div><div className="settings-row-card"><span className="settings-row-copy"><strong>{s.connected ? `Connected${s.username ? ` as ${s.username}` : ''}` : s.mode === 'connecting' ? 'Waiting for authorization' : 'Not connected'}</strong><span>{s.credentialsConfigured ? 'Client credentials are configured.' : 'The built-in desktop authorization is available.'}</span></span>{s.connected ? <button className="button secondary" onClick={() => void run('simkl.disconnect')}>Disconnect</button> : <button className="button primary" onClick={() => void connect()} disabled={busy || s.isLoading}>{busy || s.isLoading ? 'Connecting…' : 'Connect Simkl'}</button>}</div>{s.pendingPinUserCode && <div className="device-auth-card"><strong>Approve Simkl sign-in</strong><p>Enter this code in the Simkl device authorization page.</p><code className="auth-device-code">{s.pendingPinUserCode}</code>{s.pendingPinVerificationUrl && <button className="button secondary" onClick={() => void call('app.openExternal', { url: s.pendingPinVerificationUrl }).catch(() => {})}>Open approval page</button>}</div>}{s.error && <p className="form-error">Connection status: {s.error}</p>}</section></SubPage>;
}

export { TrackingSettingsPage } from './TrackingSettings';
