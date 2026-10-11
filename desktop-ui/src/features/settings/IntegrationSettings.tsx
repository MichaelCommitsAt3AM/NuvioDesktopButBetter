import './integrationSettings.css';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Cloud, Eye, EyeOff, Film, KeyRound, Link2, LoaderCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';
import { Dialog } from '../../components/Dialog';
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

function SubPage({ title, children }: { title: string; children: ReactNode }) { return <div className="page settings-page"><Link to="/settings/integrations" className="back-button settings-page-back"><ArrowLeft size={15} /> Integrations</Link><PageHeader title={title} />{children}</div>; }
function Toggle({ title, description, checked, onChange, disabled = false }: { title: string; description?: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) { return <div className="settings-control-row"><span className="settings-control-copy"><strong>{title}</strong>{description && <span>{description}</span>}</span><label className="switch"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span /></label></div>; }
function Select({ title, value, values, labels, description, onChange, disabled = false, disabledValues = [] }: { title: string; value: string; values: string[]; labels?: string[]; description?: string; onChange: (value: string) => void; disabled?: boolean; disabledValues?: string[] }) {
  const [open, setOpen] = useState(false);
  const selected = values.indexOf(value);
  return <>
    <button type="button" className="settings-control-row settings-value-row" disabled={disabled} onClick={() => setOpen(true)}><span className="settings-control-copy"><strong>{title}</strong>{description && <span>{description}</span>}<span className="settings-value-current">{labels?.[selected] ?? value}</span></span><span className="settings-value-chevron">›</span></button>
    {open && <div className="consent-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><div className="consent-card settings-choice-dialog" role="dialog" aria-modal="true" aria-label={title}><div className="dialog-head"><strong>{title}</strong><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close"><ArrowLeft size={15} /></button></div><div className="settings-radio-list">{values.map((option, index) => <label className="settings-radio-option" key={option}><span><strong>{labels?.[index] ?? option}</strong></span><input type="radio" name={`settings-${title}`} value={option} checked={value === option} disabled={disabledValues.includes(option)} onChange={() => { onChange(option); setOpen(false); }} /></label>)}</div></div></div>}
  </>;
}
function SecretField({ title, description, configured, onSave }: { title: string; description?: string; configured: boolean; onSave: (value: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false); const [value, setValue] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function save(next: string) { setBusy(true); setError(''); try { await onSave(next); setValue(''); setOpen(false); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this key.'); } finally { setBusy(false); } }
  return <>
    <button type="button" className="settings-control-row settings-value-row" onClick={() => setOpen(true)}><span className="settings-control-copy"><strong>{title}</strong><span>{configured ? '••••••••  ·  Saved' : 'Not set'}</span></span><KeyRound size={18} /></button>
    {open && <div className="consent-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}><div className="consent-card settings-choice-dialog" role="dialog" aria-modal="true" aria-label={title}><div className="dialog-head"><strong>{title}</strong><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close" disabled={busy}><ArrowLeft size={15} /></button></div>{description && <p className="muted">{description}</p>}<input type="password" value={value} autoComplete="new-password" placeholder={configured ? 'Enter a new key to replace saved key' : 'Enter API key'} onChange={(event) => setValue(event.target.value)} />{configured && <p className="muted small">The saved key is hidden. Leave the field empty to keep it.</p>}{error && <p className="form-error">{error}</p>}<div className="dialog-actions">{configured && <button className="button subtle-danger" disabled={busy} onClick={() => void save('')}>Remove</button>}<button className="button secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button className="button primary" disabled={!value.trim() || busy} onClick={() => void save(value.trim())}>{busy ? <LoaderCircle size={14} className="spin" /> : <KeyRound size={14} />} Save</button></div></div></div>}
  </>;
}
function TextField({ title, value, onSave, placeholder = '' }: { title: string; value: string; onSave: (value: string) => void; placeholder?: string }) { const [draft, setDraft] = useState(value); useEffect(() => setDraft(value), [value]); return <label className="profile-url-field">{title}<input value={draft} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onBlur={() => { if (draft !== value) onSave(draft); }} /></label>; }
function NumberField({ title, value, min, max, onSave }: { title: string; value: number; min: number; max: number; onSave: (value: number) => void }) { const [draft, setDraft] = useState(String(value)); useEffect(() => setDraft(String(value)), [value]); return <div className="settings-control-row"><span className="settings-control-copy"><strong>{title}</strong></span><input className="settings-inline-number" type="number" value={draft} min={min} max={max} onChange={(event) => setDraft(event.target.value)} onBlur={() => { const next = Number(draft); if (Number.isInteger(next) && next >= min && next <= max && next !== value) onSave(next); else setDraft(String(value)); }} /></div>; }
function SettingsError({ error, refresh }: { error: string; refresh: () => void }) { return error ? <InlineError message={error} onRetry={() => void refresh()} /> : null; }
function Loading({ title }: { title: string }) { return <SubPage title={title}><div className="loading-block"><LoaderCircle size={17} className="spin" /> Loading settings…</div></SubPage>; }

export function IntegrationsLanding() {
  const { snapshot: _snapshot, loading, error, refresh } = useDomain<{ tmdb: { enabled: boolean; hasApiKey: boolean }; mdblist: { isActive: boolean; hasAccount: boolean }; debrid: { enabled: boolean; hasAnyApiKey: boolean } }>('integrations');
  if (loading && !_snapshot) return <div className="page settings-page"><PageHeader title="Integrations" /><div className="loading-block"><LoaderCircle size={17} className="spin" /> Loading integrations…</div></div>;
  return <div className="page settings-page"><PageHeader title="Integrations" />{error && <SettingsError error={error} refresh={refresh} />}<h2 className="settings-group-title">INTEGRATIONS</h2><div className="settings-nav-card">
    <IntegrationLink to="tmdb" logoSrc="/images/attributions/tmdb.png" icon={<Film size={18} />} title="TMDB Enrichment" detail="Metadata enrichment controls" />
    <IntegrationLink to="mdblist" logoSrc="/images/attributions/mdblist.svg" icon={<Link2 size={18} />} title="MDBList Ratings" detail="External ratings providers" />
    <IntegrationLink to="debrid" title="Connected Services" detail="Connect accounts for links and library access" />
  </div></div>;
}
function IntegrationLink({ to, icon, logoSrc, title, detail }: { to: string; icon?: ReactNode; logoSrc?: string; title: string; detail: string }) { return <Link className="settings-nav-row" to={`/settings/integrations/${to}`}>{(logoSrc || icon) && <span className="settings-nav-icon">{logoSrc ? <img src={logoSrc} alt="" className="integration-brand-logo" /> : icon}</span>}<span className="settings-nav-copy"><strong>{title}</strong><span>{detail}</span></span></Link>; }
type Tmdb = { enabled: boolean; hasApiKey: boolean; hasEffectiveApiKey: boolean; language: string; useTrailers: boolean; useArtwork: boolean; useBasicInfo: boolean; useDetails: boolean; useCredits: boolean; useProductions: boolean; useNetworks: boolean; useEpisodes: boolean; useSeasonPosters: boolean; useMoreLikeThis: boolean; useCollections: boolean };
export function TmdbSettingsPage() {
  const { snapshot: s, loading, error, refresh, run } = useDomain<Tmdb>('tmdb');
  const set = (key: string, value: unknown) => void run('tmdb.set', { key, value }).catch(() => {});
  if (loading && !s) return <Loading title="TMDB Enrichment" />;
  if (!s) return <SubPage title="TMDB Enrichment"><SettingsError error={error} refresh={refresh} /></SubPage>;
  return <SubPage title="TMDB Enrichment">{error && <SettingsError error={error} refresh={refresh} />}
    <h2 className="settings-group-title">TMDB ENRICHMENT</h2><section className="settings-section">
      <Toggle title="Enable TMDB Enrichment" description="Use TMDB as a metadata source to enhance addon data" checked={s.enabled} onChange={(value) => set('enabled', value)} />
      <TmdbApiKeyField configured={s.hasApiKey} onSave={(value) => run('tmdb.set', { key: 'apiKey', value })} />
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
function tmdbDescription(key: string) { return ({ useBasicInfo: 'Description, genres, and rating from TMDB.', useDetails: 'Runtime, status, country, and language from TMDB.', useArtwork: 'Logo and backdrop images from TMDB.', useTrailers: 'Trailer candidates from TMDB videos for the detail trailer section.', useCredits: 'Cast with photos, director, and writer from TMDB.', useProductions: 'Production companies from TMDB.', useNetworks: 'Networks with logos from TMDB.', useEpisodes: 'Episode titles, overviews, thumbnails, and runtime from TMDB.', useSeasonPosters: 'Use TMDB season posters in the metadata screen season selector for series.', useMoreLikeThis: 'TMDB recommendation backdrops on detail page.', useCollections: 'TMDB movie collections in release order.' } as Record<string, string>)[key] ?? ''; }
function TmdbApiKeyField({ configured, onSave }: { configured: boolean; onSave: (value: string) => Promise<unknown> }) {
  const [value, setValue] = useState(''); const [visible, setVisible] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function save() { const key = value.trim(); if (!key) return; setBusy(true); setError(''); try { await onSave(key); setValue(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the API key.'); } finally { setBusy(false); } }
  return <div className="settings-tmdb-key-row"><div className="settings-tmdb-key-copy"><strong>Personal API key</strong><span>Use your own TMDB API key, or leave blank to use the default.</span></div><div className="settings-tmdb-key-input"><input type={visible ? 'text' : 'password'} value={value} autoComplete="new-password" placeholder="API key" aria-label="API key" onChange={(event) => setValue(event.target.value)} /><button type="button" className="icon-button" aria-label={visible ? 'Hide API key' : 'Show API key'} onClick={() => setVisible((shown) => !shown)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div><button className="button primary" disabled={!value.trim() || busy} onClick={() => void save()}>{busy ? <LoaderCircle size={14} className="spin" /> : null}Save</button>{error && <p className="form-error">{error}</p>}{configured && !value && <small className="settings-tmdb-key-status">A personal key is saved. Its value is hidden.</small>}</div>;
}
function LanguageField({ value, onSave }: { value: string; onSave: (value: string) => void }) { const [draft, setDraft] = useState(value || 'en'); useEffect(() => setDraft(value || 'en'), [value]); const normalized = draft.trim(); return <div className="settings-language-row"><span className="settings-control-copy"><strong>Language</strong><span>TMDB metadata language for title, logo, and enabled fields</span></span><label>Language code<input value={draft} placeholder="en" onChange={(event) => setDraft(event.target.value)} /></label><button className="button primary" disabled={!normalized || normalized === value} onClick={() => { setDraft(normalized); onSave(normalized); }}>Save</button></div>; }

type Mdb = { enabled: boolean; hasApiKey: boolean; hasAccount: boolean; hasCredentials: boolean; isActive: boolean; useImdb: boolean; useTmdb: boolean; useTomatoes: boolean; useMetacritic: boolean; useTrakt: boolean; useLetterboxd: boolean; useAudience: boolean; useMal: boolean; account: { connected: boolean; username: string | null; userId: string | null; isSupporter: boolean; mode: string | null; userCode: string | null; verificationUrl: string | null; verificationUrlComplete: string | null; expiresAtEpochMs: number | null; pollIntervalSeconds: number; isBusy: boolean; error: string | null; revokeFailed: boolean } };
export function MdbListSettingsPage() {
  const { snapshot: s, loading, error, refresh, run } = useDomain<Mdb>('mdblist');
  const set = (key: string, value: unknown) => void run('mdblist.set', { key, value }).catch(() => {});
  if (loading && !s) return <Loading title="MDBList Ratings" />;
  if (!s) return <SubPage title="MDBList Ratings"><SettingsError error={error} refresh={refresh} /></SubPage>;
  const providers = [['imdb', 'IMDb ratings', s.useImdb], ['tmdb', 'TMDB ratings', s.useTmdb], ['tomatoes', 'Rotten Tomatoes', s.useTomatoes], ['metacritic', 'Metacritic', s.useMetacritic], ['trakt', 'Trakt', s.useTrakt], ['letterboxd', 'Letterboxd', s.useLetterboxd], ['audience', 'Audience score', s.useAudience], ['mal', 'MyAnimeList', s.useMal]] as const;
  return <SubPage title="MDBList Ratings">{error && <SettingsError error={error} refresh={refresh} />}
    <h2 className="settings-group-title">MDBLIST RATINGS</h2><section className="settings-section">
      <Toggle title="Enable MDBList Ratings" description="Fetch ratings from external providers in metadata detail screen." checked={s.enabled} onChange={(value) => set('enabled', value)} />
      {!s.hasCredentials && <p className="muted small">Connect MDBList in Tracking or enter an API key to fetch ratings.</p>}
    </section>
    <h2 className="settings-group-title">API KEY</h2><section className="settings-section">
      {s.hasAccount && !s.hasApiKey && <p className="muted small">Using credentials from the connected MDBList account.</p>}
      <SecretField title="MDBList API key" description="Add a personal API key to override connected account credentials." configured={s.hasApiKey} onSave={(value) => run('mdblist.set', { key: 'apiKey', value })} />
    </section>
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
type DebridAuthorization = { providerId: string; userCode: string; verificationUrl: string; friendlyVerificationUrl: string; intervalSeconds: number; expiresAt: string; nextPollAtEpochMs: number };
export function DebridSettingsPage() {
  const { snapshot: s, loading, error, refresh, run } = useDomain<Debrid>('debrid');
  const [apiDrafts, setApiDrafts] = useState<Record<string, string>>({});
  const [device, setDevice] = useState<DebridAuthorization | null>(null);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [deviceMessage, setDeviceMessage] = useState('');
  const [busy, setBusy] = useState('');
  const set = (key: string, value: unknown, providerId?: string) => void run('debrid.set', { key, value, ...(providerId ? { providerId } : {}) }).catch(() => {});
  if (loading && !s) return <Loading title="Connected Services" />;
  if (!s) return <SubPage title="Connected Services"><SettingsError error={error} refresh={refresh} /></SubPage>;
  const saveKey = async (provider: DebridProvider) => { const apiKey = apiDrafts[provider.id]?.trim(); if (!apiKey) return; setBusy(provider.id); try { const validation = await call<{ valid: boolean }>('debrid.validateKey', { providerId: provider.id, apiKey }); if (!validation.valid) throw new Error('This API key was rejected by the provider.'); await run('debrid.set', { key: 'providerApiKey', providerId: provider.id, value: apiKey }); setApiDrafts((drafts) => ({ ...drafts, [provider.id]: '' })); } catch (cause) { throw cause; } finally { setBusy(''); } };
  async function startDevice(providerId: string) { setBusy(providerId); setDeviceMessage(''); try { const result = await call<DebridAuthorization>('debrid.device.start', { providerId }); setDevice(result); setActiveProviderId(null); } catch (cause) { setDeviceMessage(cause instanceof Error ? cause.message : 'Could not start device authorization.'); } finally { setBusy(''); } }
  async function pollDevice() { if (!device) return; setBusy(device.providerId); try { const result = await call<{ status: string; nextPollAtEpochMs?: number }>('debrid.device.poll', { providerId: device.providerId }); if (result.status === 'authorized') { setDevice(null); setDeviceMessage('Provider connected successfully.'); await refreshFeature<Debrid>('debrid'); } else if (result.status === 'expired') { setDevice(null); setDeviceMessage('This device code expired. Start a new authorization.'); } else setDevice((current) => current ? { ...current, nextPollAtEpochMs: result.nextPollAtEpochMs ?? current.nextPollAtEpochMs } : null); } catch (cause) { setDeviceMessage(cause instanceof Error ? cause.message : 'Could not check provider authorization.'); } finally { setBusy(''); } }
  async function cancelDevice() { if (!device) return; setBusy(device.providerId); try { await call('debrid.device.cancel', { providerId: device.providerId }); setDevice(null); } catch (cause) { setDeviceMessage(cause instanceof Error ? cause.message : 'Could not cancel authorization.'); } finally { setBusy(''); } }
  return <SubPage title="Connected Services">{error && <SettingsError error={error} refresh={refresh} />}{deviceMessage && <p className={deviceMessage.includes('successfully') ? 'success-message' : 'form-error'}>{deviceMessage}</p>}
    <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><Cloud size={18} /></span><div><h2>Connected Services</h2><p>Connect a resolver provider to enable cloud playback.</p></div></div><p className="muted small debrid-experimental-notice">These integrations are experimental and may be kept, changed, or removed later.</p><Toggle title="Cloud library" description="Browse and play files already in your connected accounts." checked={s.cloudLibraryEnabled} disabled={!s.hasCloudLibraryProvider} onChange={(value) => set('cloudLibraryEnabled', value)} /><Toggle title="Resolve playable links" description="Ask a connected service for playable links when a result needs it. This may add the item to that service." checked={s.enabled} disabled={!s.hasResolverProvider} onChange={(value) => set('enabled', value)} />{!s.hasResolverProvider && <p className="muted small">Connect an account first.</p>}{s.enabled && s.providers.filter((provider) => provider.configured).length > 1 && <Select title="Resolve with" description="Choose which connected account handles playable links." value={s.preferredResolverProviderId ?? ''} values={['', ...s.providers.filter((provider) => provider.configured).map((provider) => provider.id)]} labels={['Automatic', ...s.providers.filter((provider) => provider.configured).map((provider) => provider.displayName)]} onChange={(value) => { if (value) set('preferredResolverProviderId', value); }} />}</section>
    <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><KeyRound size={18} /></span><div><h2>Accounts</h2><p>Choose a provider to connect or enter its API key.</p></div></div>
      {s.providers.map((provider) => <button type="button" className="settings-control-row integration-provider-choice" key={provider.id} onClick={() => setActiveProviderId(provider.id)}><span className="settings-control-copy"><strong>{provider.displayName}</strong><span>{provider.authMethod === 'DeviceCode' ? `Link your ${provider.displayName} account in the browser.` : `Connect your ${provider.displayName} account.`}</span></span><span className="integration-provider-status">{provider.configured ? (provider.authMethod === 'DeviceCode' ? 'Connected' : 'API key configured') : 'Not set'}</span></button>)}
    </section>
    {activeProviderId && (() => { const provider = s.providers.find((item) => item.id === activeProviderId); return provider ? provider.authMethod === 'DeviceCode' ? <div className="consent-backdrop"><div className="consent-card" role="dialog" aria-modal="true"><div className="dialog-head"><strong>{provider.displayName}</strong><button className="icon-button" onClick={() => setActiveProviderId(null)} aria-label="Close"><ArrowLeft size={15} /></button></div><p className="muted">Link your {provider.displayName} account in the browser.</p>{provider.configured ? <div className="dialog-actions"><button className="button secondary" onClick={() => { set('providerApiKey', '', provider.id); setActiveProviderId(null); }}>Disconnect</button><button className="button secondary" onClick={() => setActiveProviderId(null)}>Close</button></div> : <div className="dialog-actions"><button className="button secondary" onClick={() => setActiveProviderId(null)}>Cancel</button><button className="button primary" disabled={busy === provider.id} onClick={() => void startDevice(provider.id)}>{busy === provider.id ? 'Connecting…' : 'Connect'}</button></div>}</div></div> : <div className="consent-backdrop"><div className="consent-card" role="dialog" aria-modal="true"><div className="dialog-head"><strong>{provider.displayName} API Key</strong><button className="icon-button" onClick={() => setActiveProviderId(null)} aria-label="Close"><ArrowLeft size={15} /></button></div><p className="muted">Enter your {provider.displayName} API key. {provider.configured ? 'A key is already configured; its value is hidden.' : ''}</p><input type="password" autoComplete="new-password" value={apiDrafts[provider.id] ?? ''} placeholder={`Enter ${provider.displayName} API key`} onChange={(event) => setApiDrafts((drafts) => ({ ...drafts, [provider.id]: event.target.value }))} />{deviceMessage && <p className="form-error">{deviceMessage}</p>}<div className="dialog-actions">{provider.configured && <button className="button subtle-danger" disabled={busy === provider.id} onClick={() => { set('providerApiKey', '', provider.id); setActiveProviderId(null); }}>Clear</button>}<button className="button secondary" onClick={() => setActiveProviderId(null)}>Cancel</button><button className="button primary" disabled={!apiDrafts[provider.id]?.trim() || busy === provider.id} onClick={() => void saveKey(provider).then(() => setActiveProviderId(null)).catch((cause) => setDeviceMessage(cause instanceof Error ? cause.message : 'Could not validate provider key.'))}>{busy === provider.id ? 'Validating…' : 'Save'}</button></div></div></div> : null; })()}
    {device && <div className="consent-backdrop"><div className="consent-card" role="dialog" aria-modal="true"><div className="dialog-head"><strong>Authorize {s.providers.find((provider) => provider.id === device.providerId)?.displayName}</strong></div><p>Enter this user code at the provider’s device authorization page.</p><code className="auth-device-code">{device.userCode}</code><div className="plugin-row-actions"><button className="button secondary" onClick={() => void call('app.openExternal', { url: device.friendlyVerificationUrl || device.verificationUrl }).catch(() => {})}>Open verification page</button><button className="button secondary" onClick={() => void pollDevice()} disabled={busy === device.providerId}>Check authorization</button><button className="button secondary" onClick={() => void cancelDevice()}>Cancel</button></div></div></div>}    <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><Film size={18} /></span><div><h2>Link Preparation</h2><p>Resolve playable links before playback starts.</p></div></div><Toggle title="Prepare links" description="Resolve playable links before playback starts." checked={s.instantPlaybackPreparationLimit > 0} disabled={!s.canResolvePlayableLinks} onChange={(enabled) => set('instantPlaybackPreparationLimit', enabled ? Math.min(3, s.limits.instantPlaybackMax) : 0)} />{s.instantPlaybackPreparationLimit > 0 && <NumberField title="Links to prepare" value={s.instantPlaybackPreparationLimit} min={1} max={s.limits.instantPlaybackMax} onSave={(value) => set('instantPlaybackPreparationLimit', value)} />}</section>
    <DebridResultManagement preferences={s.streamPreferences} enabled={s.canResolvePlayableLinks} onSave={(preferences) => set('streamPreferences', preferences)} />
    <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><RotateCcw size={18} /></span><div><h2>Formatting</h2><p>Customize how stream names and descriptions are shown.</p></div></div><TextField title="Stream name template" value={s.streamNameTemplate} onSave={(value) => set('streamNameTemplate', value)} /><TextField title="Stream description template" value={s.streamDescriptionTemplate} onSave={(value) => set('streamDescriptionTemplate', value)} /><button className="button secondary" onClick={() => set('resetStreamTemplates', true)}><RotateCcw size={14} /> Reset templates</button></section>
  </SubPage>;
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
    const selected = preferences[active];
    return <Dialog label="Max results" onClose={() => setActive(null)} className="settings-choice-dialog">
      <h2>Max results</h2>
      <div className="settings-dialog-options">{options.map((option) => <button type="button" className="settings-dialog-option" key={option} onClick={() => { onSave({ ...preferences, [active]: option }); setActive(null); }}><span>{resultCountLabel(option)}</span><span className={`settings-radio ${selected === option ? 'selected' : ''}`} aria-hidden="true" /></button>)}</div>
      <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setActive(null)}>Done</button></div>
    </Dialog>;
  }

  if (active === 'sizeRange') {
    const options: Array<[number, number]> = [[0, 0], [0, 5], [0, 10], [5, 20], [10, 50], [20, 100]];
    return <Dialog label="Size range" onClose={() => setActive(null)} className="settings-choice-dialog">
      <h2>Size range</h2>
      <div className="settings-dialog-options">{options.map(([min, max]) => <button type="button" className="settings-dialog-option" key={`${min}-${max}`} onClick={() => { onSave({ ...preferences, sizeMinGb: min, sizeMaxGb: max }); setActive(null); }}><span>{sizeRangeLabel(min, max)}</span><span className={`settings-radio ${preferences.sizeMinGb === min && preferences.sizeMaxGb === max ? 'selected' : ''}`} aria-hidden="true" /></button>)}</div>
      <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setActive(null)}>Done</button></div>
    </Dialog>;
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

function DebridMultiChoiceDialog({ title, values, selected, onClose, onSave }: { title: string; values: string[]; selected: string[]; onClose: () => void; onSave: (value: string[]) => void }) {
  const [draft, setDraft] = useState(selected);
  return <Dialog label={title} onClose={onClose} className="settings-choice-dialog">
    <h2>{title}</h2>
    <div className="settings-dialog-options debrid-multichoice-options">{values.map((value) => {
      const checked = draft.includes(value);
      return <button type="button" role="checkbox" aria-checked={checked} className="settings-dialog-option debrid-multichoice-option" key={value} onClick={() => setDraft((current) => checked ? current.filter((item) => item !== value) : [...current, value])}>
        <span>{preferenceChoiceLabel(value)}</span><span className={`debrid-checkbox ${checked ? 'selected' : ''}`} aria-hidden="true">{checked ? '✓' : ''}</span>
      </button>;
    })}</div>
    <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setDraft([])}>Clear</button><button type="button" className="button primary" onClick={() => { onSave(draft); onClose(); }}>Save</button></div>
  </Dialog>;
}

function DebridReleaseGroupDialog({ title, values, onClose, onSave }: { title: string; values: string[]; onClose: () => void; onSave: (value: string[]) => void }) {
  const [draft, setDraft] = useState(values.join('\n'));
  return <Dialog label={title} onClose={onClose} className="settings-choice-dialog">
    <h2>{title}</h2><p className="muted">Enter one group per line.</p>
    <textarea className="debrid-release-groups-input" value={draft} onChange={(event) => setDraft(event.target.value)} rows={5} aria-label={title} />
    <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setDraft('')}>Clear</button><button type="button" className="button primary" onClick={() => { onSave([...new Set(draft.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))]); onClose(); }}>Save</button></div>
  </Dialog>;
}

function selectionCountLabel(values: string[]) { return values.length ? `${values.length} selected` : 'Any'; }
function resultCountLabel(value: number) { return value <= 0 ? 'All results' : `${value} results`; }
function sizeRangeLabel(min: number, max: number) {
  if (min <= 0 && max <= 0) return 'Any';
  if (min <= 0) return `Up to ${max}GB`;
  if (max <= 0) return `${min}GB+`;
  return `${min}-${max}GB`;
}
function preferenceChoiceLabel(value: string) {
  const special: Record<string, string> = { P2160: '2160p', P1440: '1440p', P1080: '1080p', P720: '720p', P576: '576p', P480: '480p', P360: '360p', UNKNOWN: 'Unknown', BLURAY_REMUX: 'BluRay REMUX', BLURAY: 'BluRay', WEB_DL: 'WEB-DL', WEBRIP: 'WEBRip', HDRIP: 'HDRip', HD_RIP: 'HC HD-Rip', DVDRIP: 'DVDRip', HDTV: 'HDTV', HDR_DV: 'HDR+DV', DV_ONLY: 'DV Only', HDR_ONLY: 'HDR Only', HDR10_PLUS: 'HDR10+', HDR10: 'HDR10', DV: 'DV', HDR: 'HDR', HLG: 'HLG', TEN_BIT: '10bit', THREE_D: '3D', IMAX: 'IMAX', AI: 'AI', SDR: 'SDR', H_OU: 'H-OU', H_SBS: 'H-SBS', ATMOS: 'Atmos', DD_PLUS: 'DD+', DD: 'DD', DTS_X: 'DTS:X', DTS_HD_MA: 'DTS-HD MA', DTS_HD: 'DTS-HD', DTS_ES: 'DTS-ES', DTS: 'DTS', TRUEHD: 'TrueHD', OPUS: 'OPUS', FLAC: 'FLAC', AAC: 'AAC', CH_7_1: '7.1', CH_6_1: '6.1', CH_5_1: '5.1', CH_2_0: '2.0', AV1: 'AV1', HEVC: 'HEVC', AVC: 'AVC', XVID: 'XviD', DIVX: 'DivX', EN: 'English', HI: 'Hindi', IT: 'Italian', ES: 'Spanish', FR: 'French', DE: 'German', PT: 'Portuguese', PL: 'Polish', CS: 'Czech', LA: 'Latino', JA: 'Japanese', KO: 'Korean', ZH: 'Chinese', HU: 'Hungarian', HE: 'Hebrew', RU: 'Russian', UK: 'Ukrainian', AR: 'Arabic', TR: 'Turkish', TA: 'Tamil', TE: 'Telugu', ML: 'Malayalam', KN: 'Kannada', NL: 'Dutch', SV: 'Swedish', NO: 'Norwegian', DA: 'Danish', FI: 'Finnish', EL: 'Greek', RO: 'Romanian', TH: 'Thai', VI: 'Vietnamese', ID: 'Indonesian', MULTI: 'Multi' };
  return special[value] ?? value;
}

type Simkl = { mode: string; connected: boolean; credentialsConfigured: boolean; isLoading: boolean; usesPinFlow: boolean; username: string | null; accountId: string | null; pendingPinUserCode: string | null; pendingPinVerificationUrl: string | null; pendingPinExpiresAtEpochMs: number | null; error: string | null };
export function SimklSettingsPage() {
  const { snapshot: s, loading, error, refresh, run } = useDomain<Simkl>('simkl');
  const [busy, setBusy] = useState(false);
  if (loading && !s) return <Loading title="Simkl" />;
  if (!s) return <SubPage title="Simkl"><SettingsError error={error} refresh={refresh} /></SubPage>;
  async function connect() { setBusy(true); try { const result = await run('simkl.connect') as { authorizationUrl?: string | null }; if (result.authorizationUrl) await call('app.openExternal', { url: result.authorizationUrl }); } catch { /* error shown inline */ } finally { setBusy(false); } }
  return <SubPage title="Simkl">{error && <SettingsError error={error} refresh={refresh} />}<section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><img src="/images/attributions/simkl.svg" alt="" className="integration-brand-logo" /></span><div><h2>Simkl account</h2><p>Use Simkl for watch progress, library, and recommendations.</p></div></div><div className="settings-row-card"><span className="settings-row-copy"><strong>{s.connected ? `Connected${s.username ? ` as ${s.username}` : ''}` : s.mode === 'connecting' ? 'Waiting for authorization' : 'Not connected'}</strong><span>{s.credentialsConfigured ? 'Client credentials are configured.' : 'The built-in desktop authorization is available.'}</span></span>{s.connected ? <button className="button secondary" onClick={() => void run('simkl.disconnect')}>Disconnect</button> : <button className="button primary" onClick={() => void connect()} disabled={busy || s.isLoading}>{busy || s.isLoading ? 'Connecting…' : 'Connect Simkl'}</button>}</div>{s.pendingPinUserCode && <div className="device-auth-card"><strong>Approve Simkl sign-in</strong><p>Enter this code in the Simkl device authorization page.</p><code className="auth-device-code">{s.pendingPinUserCode}</code>{s.pendingPinVerificationUrl && <button className="button secondary" onClick={() => void call('app.openExternal', { url: s.pendingPinVerificationUrl }).catch(() => {})}>Open approval page</button>}</div>}{s.error && <p className="form-error">Connection status: {s.error}</p>}</section></SubPage>;
}

type Tracking = { librarySourceMode: string; effectiveLibrarySourceMode: string; watchProgressSource: string; effectiveWatchProgressSource: string; moreLikeThisSource: string; effectiveMoreLikeThisSource: string; simklAnimeIdPreference: string; simklConnected: boolean; mdblistConnected: boolean; traktAvailable: boolean };
export function TrackingSettingsPage() {
  const { snapshot: s, loading, error, refresh, run } = useDomain<Tracking>('trackingSettings');
  const set = (key: string, value: string) => void run('trackingSettings.set', { key, value }).catch(() => {});
  const [simklSyncing, setSimklSyncing] = useState(false);
  const [simklSyncMessage, setSimklSyncMessage] = useState('');
  async function syncSimkl() {
    setSimklSyncing(true);
    setSimklSyncMessage('');
    try {
      const result = await call<{ success: boolean }>('simkl.sync');
      await refreshFeature<Tracking>('trackingSettings');
      setSimklSyncMessage(result.success ? 'Simkl sync completed.' : 'Simkl could not refresh all tracking data.');
    } catch (cause) {
      setSimklSyncMessage(cause instanceof Error ? cause.message : 'Could not sync Simkl.');
    } finally {
      setSimklSyncing(false);
    }
  }
  if (loading && !s) return <Loading title="Library and tracking" />;
  if (!s) return <SubPage title="Library and tracking"><SettingsError error={error} refresh={refresh} /></SubPage>;
  return <SubPage title="Library and tracking">{error && <SettingsError error={error} refresh={refresh} />}
    <h2 className="settings-group-title">ACCOUNTS</h2><section className="settings-section">
      <div className="settings-row-card"><span className="settings-icon"><img src="/images/attributions/simkl.svg" alt="" className="integration-brand-logo" /></span><span className="settings-row-copy"><strong>Simkl</strong><span>{s.simklConnected ? 'Connected and available.' : 'Connect Simkl to use it as a source.'}</span></span><div className="plugin-row-actions"><Link className="button secondary" to="/settings/integrations/simkl">Manage Simkl</Link>{s.simklConnected && <button className="button secondary" onClick={() => void syncSimkl()} disabled={simklSyncing}>{simklSyncing ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />} {simklSyncing ? 'Syncing…' : 'Sync now'}</button>}</div></div>
      {simklSyncMessage && <p className={simklSyncMessage.includes('completed') ? 'success-message' : 'form-error'}>{simklSyncMessage}</p>}
      <div className="settings-row-card"><span className="settings-icon"><img src="/images/attributions/mdblist.svg" alt="" className="integration-brand-logo" /></span><span className="settings-row-copy"><strong>MDBList</strong><span>{s.mdblistConnected ? 'Connected and available.' : 'Connect MDBList to use it as a source.'}</span></span></div>
      {!s.traktAvailable && <p className="muted small">Trakt sync is unavailable in this desktop build.</p>}
    </section>
    <h2 className="settings-group-title">SOURCES</h2><section className="settings-section">
      <Select title="Library Source" description="Choose which source Nuvio reads for your Library" value={s.effectiveLibrarySourceMode} values={['LOCAL', 'SIMKL', 'MDBLIST']} labels={['Nuvio', 'Simkl', 'MDBList']} disabledValues={[...(!s.simklConnected ? ['SIMKL'] : []), ...(!s.mdblistConnected ? ['MDBLIST'] : [])]} onChange={(value) => set('librarySourceMode', value)} />
      {s.librarySourceMode !== s.effectiveLibrarySourceMode && <p className="muted small">{displaySource(s.librarySourceMode)} is unavailable. Using {displaySource(s.effectiveLibrarySourceMode)} until it is connected.</p>}
      <Select title="Watch Progress" description="Choose which progress source powers resume and continue watching" value={s.effectiveWatchProgressSource} values={['NUVIO_SYNC', 'SIMKL', 'MDBLIST']} labels={['Nuvio sync', 'Simkl', 'MDBList']} disabledValues={[...(!s.simklConnected ? ['SIMKL'] : []), ...(!s.mdblistConnected ? ['MDBLIST'] : [])]} onChange={(value) => set('watchProgressSource', value)} />
      {s.watchProgressSource !== s.effectiveWatchProgressSource && <p className="muted small">{displaySource(s.watchProgressSource)} is unavailable. Using {displaySource(s.effectiveWatchProgressSource)} until it is connected.</p>}
      {(s.simklConnected || s.traktAvailable) && <><Select title="More Like This source" description="Choose where recommendations come from on detail pages" value={s.effectiveMoreLikeThisSource} values={['TMDB', 'SIMKL']} labels={['TMDB', 'Simkl']} disabledValues={s.simklConnected ? [] : ['SIMKL']} onChange={(value) => set('moreLikeThisSource', value)} />{s.moreLikeThisSource !== s.effectiveMoreLikeThisSource && <p className="muted small">Using {displaySource(s.effectiveMoreLikeThisSource)} because {displaySource(s.moreLikeThisSource)} is unavailable.</p>}</>}
    </section>
    {s.simklConnected && <><h2 className="settings-group-title">SIMKL FEATURES</h2><section className="settings-section"><Select title="Anime ID preference" value={s.simklAnimeIdPreference} values={['IMDB', 'MAL', 'KITSU', 'TVDB']} onChange={(value) => set('simklAnimeIdPreference', value)} /></section></>}
  </SubPage>;
}
function displaySource(source: string) { return ({ LOCAL: 'Nuvio', NUVIO_SYNC: 'Nuvio sync', MDBLIST: 'MDBList', SIMKL: 'Simkl', TMDB: 'TMDB' } as Record<string, string>)[source] ?? source; }
