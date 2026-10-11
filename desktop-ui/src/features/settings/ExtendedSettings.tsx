import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Clapperboard, Film, Gauge, GripVertical, HardDrive, LoaderCircle, Network, RotateCcw, Subtitles, Volume2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { call, refreshFeature, useFeatureSnapshot, useSelector } from '../../bridge';
import { Dialog } from '../../components/Dialog';
import { InlineError } from '../../components/Status';

type PlaybackSnapshot = {
  showLoadingOverlay: boolean; showPlayerLoadingStatus: boolean; pauseOverlayEnabled: boolean; showParentalGuide: boolean;
  decoderPriority: number;
  availableLanguages: string[];
  preferredAudioLanguage: string; secondaryPreferredAudioLanguage: string | null; preferredSubtitleLanguage: string; secondaryPreferredSubtitleLanguage: string | null;
  subtitleStyle: { textColor: string; backgroundColor: string; outlineColor: string; outlineEnabled: boolean; outlineWidth: number; bold: boolean; fontSizeSp: number; bottomOffset: number; stripSdh: boolean; useForcedSubtitles: boolean; showOnlyPreferredLanguages: boolean };
  streamReuseLastLinkEnabled: boolean; streamReuseLastLinkCacheHours: number; streamAutoPlayMode: 'MANUAL' | 'FIRST_STREAM' | 'REGEX_MATCH'; streamAutoPlaySource: 'ALL_SOURCES' | 'INSTALLED_ADDONS_ONLY' | 'ENABLED_PLUGINS_ONLY'; streamAutoPlaySelectedAddons: string[]; streamAutoPlaySelectedPlugins: string[]; streamAutoPlayRegex: string; streamAutoPlayTimeoutSeconds: number;
  skipIntroEnabled: boolean; autoSkipSegmentTypes: string[]; animeSkipEnabled: boolean; animeSkipClientIdConfigured: boolean; introDbApiKeyConfigured: boolean; introSubmitEnabled: boolean;
  streamAutoPlayNextEpisodeEnabled: boolean; streamAutoPlayNextEpisodeFallbackEnabled: boolean; streamAutoPlayPreferBingeGroup: boolean; streamAutoPlayReuseBingeGroup: boolean; nextEpisodeThresholdMode: 'PERCENTAGE' | 'MINUTES_BEFORE_END'; nextEpisodeThresholdPercent: number; nextEpisodeThresholdMinutesBeforeEnd: number; preloadNextEpisodeSources: boolean; useLibass: boolean; nvidiaRtxSuperResolutionEnabled: boolean;
  nvidiaRtxSuperResolutionSupported: boolean;
};
type MetadataSnapshot = { items: Array<{ key: string; title: string; description: string; enabled: boolean; order: number; tabGroup: number | null; canBeTabbed: boolean }>; backgroundMode: 'normal' | 'cinematic' | 'dominant_color'; heroTrailerPlayback: boolean; tabLayout: boolean; episodeCardStyle: 'horizontal' | 'list'; blurUnwatchedEpisodes: boolean; posterTransitionEnabled: boolean; showOverallRatings: boolean; episodeRatingsVisibility: 'show_all' | 'hide_episodes' | 'hide_unwatched_episodes'; episodeShuffleAvailable: boolean };
type P2PSnapshot = { available: boolean; enabled: boolean; enableUpload: boolean; hideTorrentStats: boolean; torrentProfile: 'SOFT' | 'BALANCED' | 'FAST'; cacheSize: 'NONE' | 'GB_2' | 'GB_5' | 'GB_10'; cache: { usedBytes: number; protectedBytes: number; isClearing: boolean; hasMeasurement: boolean }; stream: { state: 'idle' | 'connecting' | 'streaming' | 'error'; downloadSpeed: number | string | null; uploadSpeed: number | string | null; peers: number; seeds: number; bufferProgress: number; totalProgress: number; errorMessage: string | null } };
type PluginSourceSnapshot = { scrapers: Array<{ id: string; name: string; enabled: boolean }> };

function useSettingsDomain<T>(topic: 'playbackSettings' | 'metadataSettings' | 'p2p') {
  const snapshot = useFeatureSnapshot<T>(topic);
  const [loading, setLoading] = useState(!snapshot);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    try { await refreshFeature<T>(topic); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load these settings.'); }
    finally { setLoading(false); }
  }, [topic]);
  useEffect(() => { if (!snapshot) void refresh(); }, [snapshot, refresh]);
  const run = useCallback(async (method: string, params: Record<string, unknown> = {}) => {
    setError('');
    try { await call(method, params); await refreshFeature<T>(topic); }
    catch (cause) { const message = cause instanceof Error ? cause.message : 'Could not save this setting.'; setError(message); throw cause; }
  }, [topic]);
  return { snapshot, loading, error, refresh, run };
}

function SubPage({ title, back, children }: { title: string; back: string; children: ReactNode }) {
  return <div className="page settings-page"><Link to={back} className="back-button settings-page-back"><ArrowLeft size={15} /> Settings</Link><div className="page-header"><div><h1>{title}</h1></div></div>{children}</div>;
}

function FeatureNotice({ error, retry }: { error: string; retry: () => void }) { return error ? <InlineError message={error} onRetry={retry} /> : null; }

function LoadingPage({ title, back }: { title: string; back: string }) { return <SubPage title={title} back={back}><div className="loading-block"><LoaderCircle size={17} className="spin" /> Loading settings…</div></SubPage>; }

function Toggle({ title, description, checked, onChange, disabled = false }: { title: string; description?: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <div className="settings-control-row"><span className="settings-control-copy"><strong>{title}</strong>{description && <span>{description}</span>}</span><label className="switch" aria-label={title}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span /></label></div>;
}
function Select({ title, value, values, labels, onChange, description }: { title: string; value: string; values: string[]; labels: string[]; onChange: (value: string) => void; description?: string }) {
  const [open, setOpen] = useState(false);
  const selectedLabel = labels[values.indexOf(value)] ?? value;
  return <>
    <button type="button" className="settings-choice-row" onClick={() => setOpen(true)}><span><strong>{title}</strong>{description && <small>{description}</small>}<span>{selectedLabel}</span></span><ChevronRight size={17} /></button>
    {open && <Dialog label={title} onClose={() => setOpen(false)} className="settings-choice-dialog"><h2>{title}</h2><div className="settings-dialog-options">{values.map((item, index) => <button type="button" className="settings-dialog-option" key={item} onClick={() => { onChange(item); setOpen(false); }}><span>{labels[index] ?? item}</span><span className={`settings-radio ${item === value ? 'selected' : ''}`} aria-hidden="true" /></button>)}</div><div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setOpen(false)}>Done</button></div></Dialog>}
  </>;
}
function NumberField({ title, value, min, max, step = 1, suffix, onSave }: { title: string; value: number; min: number; max: number; step?: number; suffix?: string; onSave: (value: number) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => { const next = Math.max(min, Math.min(max, Math.round((draft - min) / step) * step + min)); if (next !== value) onSave(next); };
  return <div className="settings-slider-row"><div><strong>{title}</strong><span>{draft}{suffix ? ` ${suffix}` : ''}</span></div><input aria-label={title} type="range" min={min} max={max} step={step} value={draft} onChange={(event) => setDraft(Number(event.target.value))} onPointerUp={commit} onKeyUp={commit} /></div>;
}
function LanguageField({ title, value, choices, onSave }: { title: string; value: string | null; choices: Array<string | null>; onSave: (value: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const displayName = (code: string) => {
    if (!code) return 'None';
    if (code === 'default') return 'Default';
    if (code === 'device') return 'Device language';
    if (code === 'original') return 'Original';
    if (code === 'forced') return 'Forced';
    try { return new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' }).of(code) ?? code; } catch { return code; }
  };
  const label = displayName(value ?? '');
  return <>
    <button type="button" className="settings-choice-row" onClick={() => setOpen(true)}><span><strong>{title}</strong><span>{label}</span></span><ChevronRight size={17} /></button>
    {open && <Dialog label={title} onClose={() => setOpen(false)} className="settings-choice-dialog"><h2>{title}</h2><div className="settings-dialog-options">{choices.map((choice, index) => <button type="button" className="settings-dialog-option" key={choice ?? `none-${index}`} onClick={() => { onSave(choice); setOpen(false); }}><span>{displayName(choice ?? '')}</span><span className={`settings-radio ${choice === value ? 'selected' : ''}`} aria-hidden="true" /></button>)}</div><div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setOpen(false)}>Done</button></div></Dialog>}
  </>;
}
function SettingCard({ icon: Icon, title, description, children, action }: { icon: typeof Film; title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><Icon size={18} /></span><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>{children}</section>;
}

export function PlaybackSettingsPage() {
  const { snapshot: s, loading, error, refresh, run } = useSettingsDomain<PlaybackSnapshot>('playbackSettings');
  const addons = useSelector((state) => state.addons);
  const plugins = useFeatureSnapshot<PluginSourceSnapshot>('plugins');
  const set = (key: string, value: unknown) => void run('playbackSettings.set', { key, value }).catch(() => {});
  if (loading && !s) return <LoadingPage title="Playback" back="/settings" />;
  if (!s) return <SubPage title="Playback" back="/settings"><FeatureNotice error={error} retry={() => { void refresh(); }} /></SubPage>;
  const style = s.subtitleStyle;
  function updateSubtitle(changes: Partial<typeof style>) { set('subtitleStyle', { ...style, ...changes }); }
  const timeoutValues = [0, ...Array.from({ length: 10 }, (_, index) => index + 1), 15, 20, 25, 30, 2147483647];
  return <SubPage title="Playback" back="/settings">{error && <FeatureNotice error={error} retry={() => { void refresh(); }} />}
    <SettingCard icon={Film} title="Player">
      <Toggle title="Loading Overlay" description="Show loading screen until first video frame appears." checked={s.showLoadingOverlay} onChange={(value) => set('showLoadingOverlay', value)} />
      <Toggle title="Show loading status" description="Display step-by-step progress while the player is initializing." checked={s.showPlayerLoadingStatus} onChange={(value) => set('showPlayerLoadingStatus', value)} />
      <Toggle title="Pause Overlay" description="Show details overlay after 5 seconds while paused." checked={s.pauseOverlayEnabled} onChange={(value) => set('pauseOverlayEnabled', value)} />
      <Toggle title="Content Warnings" description="Show parental guidance overlay when playback starts." checked={s.showParentalGuide} onChange={(value) => set('showParentalGuide', value)} />
    </SettingCard>
    <SettingCard icon={Volume2} title="Subtitle and audio">
      <LanguageField title="Preferred Audio Language" value={s.preferredAudioLanguage} choices={['default', 'device', 'original', ...s.availableLanguages]} onSave={(value) => set('preferredAudioLanguage', value)} />
      <LanguageField title="Secondary Audio Language" value={s.secondaryPreferredAudioLanguage} choices={[null, 'original', ...s.availableLanguages]} onSave={(value) => set('secondaryPreferredAudioLanguage', value)} />
      <LanguageField title="Preferred Language" value={s.preferredSubtitleLanguage} choices={['none', 'device', 'forced', ...s.availableLanguages]} onSave={(value) => set('preferredSubtitleLanguage', value)} />
      <LanguageField title="Secondary Preferred Language" value={s.secondaryPreferredSubtitleLanguage} choices={[null, 'forced', ...s.availableLanguages]} onSave={(value) => set('secondaryPreferredSubtitleLanguage', value)} />
      <Toggle title="Strip SDH Subtitles" description="Hide sound descriptions and speaker labels from text subtitles." checked={style.stripSdh} onChange={(value) => updateSubtitle({ stripSdh: value })} />
      <Toggle title="Use Forced Subtitles" description="Prefer forced subtitles when audio matches the subtitle language; if unavailable, select nothing." checked={style.useForcedSubtitles} onChange={(value) => updateSubtitle({ useForcedSubtitles: value })} />
      <Toggle title="Show Only Preferred Languages" description="Only show subtitles matching your preferred subtitle languages." checked={style.showOnlyPreferredLanguages} onChange={(value) => updateSubtitle({ showOnlyPreferredLanguages: value })} />
    </SettingCard>
    <SettingCard icon={Subtitles} title="Subtitle rendering">
      <ColorSetting title="Text color" value={style.textColor} kind="text" onChange={(value) => updateSubtitle({ textColor: value })} />
      <ColorSetting title="Background color" value={style.backgroundColor} kind="background" onChange={(value) => updateSubtitle({ backgroundColor: value })} />
      <NumberField title="Subtitle size" value={style.fontSizeSp} min={6} max={40} step={2} onSave={(value) => updateSubtitle({ fontSizeSp: value })} suffix="sp" />
      <NumberField title="Vertical offset" value={style.bottomOffset} min={0} max={200} step={5} onSave={(value) => updateSubtitle({ bottomOffset: value })} suffix="dp" />
      <Toggle title="Bold subtitles" checked={style.bold} onChange={(value) => updateSubtitle({ bold: value })} />
      <Toggle title="Subtitle outline" checked={style.outlineEnabled} onChange={(value) => updateSubtitle({ outlineEnabled: value })} />
      {style.outlineEnabled && <><ColorSetting title="Outline color" value={style.outlineColor} kind="text" onChange={(value) => updateSubtitle({ outlineColor: value })} /><NumberField title="Outline width" value={style.outlineWidth} min={0} max={10} onSave={(value) => updateSubtitle({ outlineWidth: value })} /></>}
      <Toggle title="Use libass for ASS/SSA subtitles" description="Experimental: advanced ASS/SSA rendering (styles, positioning, animations)." checked={s.useLibass} onChange={(value) => set('useLibass', value)} />
    </SettingCard>
    {s.nvidiaRtxSuperResolutionSupported && <SettingCard icon={Gauge} title="NVIDIA RTX Video"><Toggle title="RTX Video Super Resolution" description="Upscale low-resolution video using NVIDIA RTX AI Super Resolution." checked={s.nvidiaRtxSuperResolutionEnabled} onChange={(value) => set('nvidiaRtxSuperResolutionEnabled', value)} /></SettingCard>}
    <SettingCard icon={Gauge} title="Stream selection">
      <Toggle title="Reuse the last stream link" checked={s.streamReuseLastLinkEnabled} onChange={(value) => set('streamReuseLastLinkEnabled', value)} />
      {s.streamReuseLastLinkEnabled && <Select title="Remember link for" value={String(s.streamReuseLastLinkCacheHours)} values={['1', '2', '3', '6', '12', '24', '48', '72', '168']} labels={['1 hour', '2 hours', '3 hours', '6 hours', '12 hours', '24 hours', '2 days', '3 days', '7 days']} onChange={(value) => set('streamReuseLastLinkCacheHours', Number(value))} />}
    </SettingCard>
    <SettingCard icon={Gauge} title="Stream auto-play">
      <Select title="Auto-play mode" value={s.streamAutoPlayMode} values={['MANUAL', 'FIRST_STREAM', 'REGEX_MATCH']} labels={['Manual selection', 'First available stream', 'Match a pattern']} onChange={(value) => set('streamAutoPlayMode', value)} />
      {s.streamAutoPlayMode !== 'MANUAL' && <><Select title="Stream sources" value={s.streamAutoPlaySource} values={['ALL_SOURCES', 'INSTALLED_ADDONS_ONLY', 'ENABLED_PLUGINS_ONLY']} labels={['All sources', 'Installed add-ons', 'Enabled plugins']} onChange={(value) => set('streamAutoPlaySource', value)} /><Select title="Stream wait timeout" value={String(s.streamAutoPlayTimeoutSeconds)} values={timeoutValues.map(String)} labels={timeoutValues.map((value) => value === 2147483647 ? 'No timeout' : `${value} sec`)} onChange={(value) => set('streamAutoPlayTimeoutSeconds', Number(value))} /></>}
      {s.streamAutoPlayMode === 'REGEX_MATCH' && <TextSetting title="Match pattern" value={s.streamAutoPlayRegex} placeholder="720p|1080p" onSave={(value) => set('streamAutoPlayRegex', value)} />}
      {s.streamAutoPlayMode !== 'MANUAL' && s.streamAutoPlaySource === 'INSTALLED_ADDONS_ONLY' && addons.map((addon) => <Toggle key={addon.id} title={addon.name} checked={s.streamAutoPlaySelectedAddons.includes(addon.name)} onChange={(enabled) => set('streamAutoPlaySelectedAddons', enabled ? [...s.streamAutoPlaySelectedAddons, addon.name] : s.streamAutoPlaySelectedAddons.filter((name) => name !== addon.name))} />)}
      {s.streamAutoPlayMode !== 'MANUAL' && s.streamAutoPlaySource === 'ENABLED_PLUGINS_ONLY' && (plugins?.scrapers ?? []).filter((plugin) => plugin.enabled).map((plugin) => <Toggle key={plugin.id} title={plugin.name} checked={s.streamAutoPlaySelectedPlugins.includes(plugin.name)} onChange={(enabled) => set('streamAutoPlaySelectedPlugins', enabled ? [...s.streamAutoPlaySelectedPlugins, plugin.name] : s.streamAutoPlaySelectedPlugins.filter((name) => name !== plugin.name))} />)}
    </SettingCard>
    <SettingCard icon={Gauge} title="Decoder">
      <Select title="Decoder Priority" value={String(s.decoderPriority)} values={['0', '1', '2']} labels={['Device decoders only', 'Prefer device decoders', 'Prefer app decoders (FFmpeg)']} onChange={(value) => set('decoderPriority', Number(value))} />
    </SettingCard>
    <SettingCard icon={Clapperboard} title="Skip segments">
      <Toggle title="Auto-skip segments" checked={s.skipIntroEnabled} onChange={(value) => set('skipIntroEnabled', value)} />
      {s.skipIntroEnabled && <div className="settings-chip-group">{[['INTRO', 'Intros'], ['RECAP', 'Recaps'], ['OUTRO', 'Outros'], ['MOVIE_CREDITS', 'Movie credits']].map(([key, label]) => <label key={key} className="settings-choice-chip"><input type="checkbox" checked={s.autoSkipSegmentTypes.includes(key)} onChange={(event) => set('autoSkipSegmentTypes', event.target.checked ? [...s.autoSkipSegmentTypes, key] : s.autoSkipSegmentTypes.filter((item) => item !== key))} />{label}</label>)}</div>}
      <Toggle title="Anime Skip" description="Also search AnimeSkip for skip timestamps (requires client ID)." checked={s.animeSkipEnabled} onChange={(value) => set('animeSkipEnabled', value)} />
      {s.animeSkipEnabled && <SecureTextSetting title="Anime Skip client ID" configured={s.animeSkipClientIdConfigured} onSave={(value) => set('animeSkipClientId', value)} />}
      <Toggle title="Enable Intro Submission" description="Show a button to submit intro/outro timestamps to the community database." checked={s.introSubmitEnabled} onChange={(value) => set('introSubmitEnabled', value)} />
      {s.introSubmitEnabled && <SecureTextSetting title="IntroDB API key" configured={s.introDbApiKeyConfigured} onSave={(value) => set('introDbApiKey', value)} />}
    </SettingCard>
    <SettingCard icon={ChevronRight} title="Next episode">
      <Toggle title="Auto-play Next Episode" description="Start next episode automatically when prompt appears." checked={s.streamAutoPlayNextEpisodeEnabled} onChange={(value) => set('streamAutoPlayNextEpisodeEnabled', value)} />
      {s.streamAutoPlayMode === 'MANUAL' && s.streamAutoPlayNextEpisodeEnabled && <Toggle title="Fallback when binge group fails" description="Auto-select first available stream if binge group is not found. When off, shows the stream picker instead." checked={s.streamAutoPlayNextEpisodeFallbackEnabled} onChange={(value) => set('streamAutoPlayNextEpisodeFallbackEnabled', value)} />}
      <Toggle title="Prefer Binge Group (Next Episode)" description="Try the same source profile first (same addon/quality group) before normal auto-play rules." checked={s.streamAutoPlayPreferBingeGroup} onChange={(value) => set('streamAutoPlayPreferBingeGroup', value)} />
      {s.streamAutoPlayPreferBingeGroup && <Toggle title="Reuse Binge Group" description="Remember and reuse the last binge group across sessions (Continue Watching, Details, etc.)." checked={s.streamAutoPlayReuseBingeGroup} onChange={(value) => set('streamAutoPlayReuseBingeGroup', value)} />}
      <Toggle title="Preload Next Episode Sources" description="Start searching for sources in the background before the next episode button appears." checked={s.preloadNextEpisodeSources} onChange={(value) => set('preloadNextEpisodeSources', value)} />
      <Select title="Next Episode Threshold Mode" value={s.nextEpisodeThresholdMode} values={['PERCENTAGE', 'MINUTES_BEFORE_END']} labels={['Percentage', 'Minutes before end']} onChange={(value) => set('nextEpisodeThresholdMode', value)} />
      {s.nextEpisodeThresholdMode === 'PERCENTAGE' ? <NumberField title="Play next at" value={s.nextEpisodeThresholdPercent} min={97} max={100} step={0.5} onSave={(value) => set('nextEpisodeThresholdPercent', value)} suffix="%" /> : <NumberField title="Play next before end" value={s.nextEpisodeThresholdMinutesBeforeEnd} min={0} max={3.5} step={0.5} onSave={(value) => set('nextEpisodeThresholdMinutesBeforeEnd', value)} suffix="min" />}
    </SettingCard>
  </SubPage>;
}

function ColorSetting({ title, value, kind, onChange }: { title: string; value: string; kind: 'text' | 'background'; onChange: (value: string) => void }) {
  const choices = kind === 'background'
    ? [['#00000000', 'Transparent'], ['#8C000000', 'Black'], ['#B8111827', 'Slate'], ['#AD7F1D1D', 'Red'], ['#AD064E3B', 'Green'], ['#AD1E3A8A', 'Blue']]
    : [['#FFFFFFFF', 'White'], ['#FFFFD700', 'Gold'], ['#FF00E5FF', 'Cyan'], ['#FFFF5C5C', 'Red'], ['#FF00FF88', 'Mint'], ['#FF9B59B6', 'Purple'], ['#FFF97316', 'Orange'], ['#FF22C55E', 'Green'], ['#FF3B82F6', 'Blue'], ['#FF000000', 'Black']];
  const cssColor = (argb: string) => `#${argb.slice(3)}${argb.slice(1, 3)}`;
  return <div className="settings-control-row"><span className="settings-control-copy"><strong>{title}</strong><span>{value.toUpperCase() === '#00000000' ? 'Transparent' : value.toUpperCase()}</span></span><span className="settings-color-wrap" role="group" aria-label={title}>{choices.map(([color, label]) => <button key={color} type="button" title={label} aria-label={`${title}: ${label}`} aria-pressed={value.toUpperCase() === color} onClick={() => onChange(color)} style={{ width: 22, height: 22, padding: 0, borderRadius: 12, border: value.toUpperCase() === color ? '2px solid currentColor' : '1px solid #8888', backgroundColor: cssColor(color) }} />)}</span></div>;
}
function TextSetting({ title, value, placeholder, onSave }: { title: string; value: string; placeholder?: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <div className="settings-text-row"><label>{title}<input value={draft} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onBlur={() => { if (draft !== value) onSave(draft); }} /></label></div>;
}
function SecureTextSetting({ title, configured, onSave }: { title: string; configured: boolean; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState('');
  return <div className="settings-text-row"><label>{title}<input type="password" value={draft} placeholder={configured ? 'Configured; leave blank to keep current' : 'Enter secret'} autoComplete="new-password" onChange={(event) => setDraft(event.target.value)} onBlur={() => { if (draft.trim()) { onSave(draft.trim()); setDraft(''); } }} /></label><small>{configured ? 'A credential is saved. The value is never displayed.' : 'Not configured.'}</small></div>;
}

export function MetadataSettingsPage() {
  const { snapshot: s, loading, error, refresh, run } = useSettingsDomain<MetadataSnapshot>('metadataSettings');
  const [draggedSection, setDraggedSection] = useState<string | null>(null);
  const set = (key: string, value: unknown) => void run('metadataSettings.set', { key, value }).catch(() => {});
  if (loading && !s) return <LoadingPage title="Details page" back="/settings" />;
  if (!s) return <SubPage title="Details page" back="/settings"><FeatureNotice error={error} retry={() => { void refresh(); }} /></SubPage>;
  const items = [...s.items].sort((a, b) => a.order - b.order);
  const groupCounts = items.reduce<Record<number, number>>((counts, item) => { if (item.tabGroup !== null) counts[item.tabGroup] = (counts[item.tabGroup] ?? 0) + 1; return counts; }, {});
  const backgroundModes = [
    { value: 'normal', label: 'Normal', description: 'Use the standard app background.' },
    { value: 'cinematic', label: 'Cinematic', description: 'Show a soft blurred backdrop behind the page.' },
    { value: 'dominant_color', label: 'Dominant Color', description: 'Match the page background to the main color from the backdrop.' },
  ];
  const moveSection = (fromSection: string, toSection?: string) => {
    if (toSection && fromSection !== toSection) void run('metadataSettings.move', { fromSection, toSection }).catch(() => {});
    setDraggedSection(null);
  };
  return <SubPage title="Details page" back="/settings">{error && <FeatureNotice error={error} retry={() => { void refresh(); }} />}
    <SettingCard icon={Film} title="Appearance">
      <div className="metadata-settings-chip-row">
        <div className="metadata-settings-copy"><strong>Background mode</strong><span>Choose how artwork appears behind metadata pages.</span></div>
        <div className="metadata-chip-list" role="group" aria-label="Background mode">
          {backgroundModes.map((mode) => <button type="button" key={mode.value} className={`metadata-chip ${s.backgroundMode === mode.value ? 'selected' : ''}`} aria-pressed={s.backgroundMode === mode.value} onClick={() => set('backgroundMode', mode.value)}>{mode.label}</button>)}
        </div>
        <small className="metadata-settings-hint">{backgroundModes.find((mode) => mode.value === s.backgroundMode)?.description}</small>
      </div>
      <Toggle title="Hero trailer playback" description="Play trailer previews in the metadata hero when a trailer is available." checked={s.heroTrailerPlayback} onChange={(value) => set('heroTrailerPlayback', value)} />
      <Toggle title="Tab layout" description="Group sections into tabs like the TV app. Assign up to 3 sections per tab group." checked={s.tabLayout} onChange={(value) => set('tabLayout', value)} />
      <Toggle title="Show overall ratings" description={s.showOverallRatings ? 'Standard and TMDB ratings are shown.' : 'Standard and TMDB ratings are Hidden. MDBList provider settings take priority on detail pages.'} checked={s.showOverallRatings} onChange={(value) => set('showOverallRatings', value)} />
      <div className="metadata-settings-chip-row">
        <div className="metadata-settings-copy"><strong>Episode Ratings</strong><span>Choose which episode ratings are visible.</span></div>
        <div className="metadata-chip-list" role="group" aria-label="Episode ratings">
          {[
            { value: 'show_all', label: 'Show' },
            { value: 'hide_episodes', label: 'Hide' },
            { value: 'hide_unwatched_episodes', label: 'Hide Unwatched' },
          ].map((choice) => <button type="button" key={choice.value} className={`metadata-chip ${s.episodeRatingsVisibility === choice.value ? 'selected' : ''}`} aria-pressed={s.episodeRatingsVisibility === choice.value} onClick={() => set('episodeRatingsVisibility', choice.value)}>{choice.label}</button>)}
        </div>
      </div>
      <div className="metadata-episode-style">
        <div className="metadata-settings-copy"><strong>Episode Cards</strong><span>Choose how episodes are rendered on the metadata screen.</span></div>
        <div className="metadata-episode-options" role="radiogroup" aria-label="Episode cards">
          {[
            { value: 'horizontal', label: 'Horizontal', description: 'Backdrop-style row cards' },
            { value: 'list', label: 'List', description: 'Detail-first stacked cards' },
          ].map((style) => <button type="button" key={style.value} className={`metadata-episode-option ${s.episodeCardStyle === style.value ? 'selected' : ''}`} role="radio" aria-checked={s.episodeCardStyle === style.value} onClick={() => set('episodeCardStyle', style.value)}>
            <span className="metadata-episode-preview" aria-hidden="true">
              {style.value === 'horizontal' ? <span className="episode-preview-horizontal"><i /><b /><em /></span> : <span className="episode-preview-list"><i /><b><i /><i /><em /></b></span>}
              {s.episodeCardStyle === style.value && <span className="metadata-episode-check"><Check size={14} /></span>}
            </span>
            <strong>{style.label}</strong><small>{style.description}</small>
          </button>)}
        </div>
      </div>
      <Toggle title="Blur unwatched episodes" description="Blur episode thumbnails until watched to avoid spoilers." checked={s.blurUnwatchedEpisodes} onChange={(value) => set('blurUnwatchedEpisodes', value)} />
      <Toggle title="Random episode" description="Shuffle episodes from any series. Turning this off pauses shuffle." checked={s.episodeShuffleAvailable} onChange={(value) => set('episodeShuffleAvailable', value)} />
    </SettingCard>
    <SettingCard icon={ChevronDown} title="Sections" action={<button className="metadata-reset-button" type="button" onClick={() => void run('metadataSettings.reset').catch(() => {})}>Reset to Default</button>}>
      <div className="metadata-sections-list" role="list">
        {items.map((item) => <div
          className={`metadata-item-row ${draggedSection === item.key ? 'dragging' : ''}`}
          key={item.key}
          role="listitem"
          onDragOver={(event) => { if (draggedSection) event.preventDefault(); }}
          onDrop={(event) => { event.preventDefault(); moveSection(draggedSection ?? '', item.key); }}
        >
          <span className="metadata-item-copy"><strong>{item.title}</strong><span>{item.description}</span><small>{item.enabled ? 'Visible' : 'Hidden'}{s.tabLayout && item.tabGroup !== null ? ` · Tab Group ${item.tabGroup}` : ''}</small></span>
          {s.tabLayout && item.canBeTabbed && item.enabled && <div className="metadata-tab-groups"><button type="button" className={`metadata-chip ${item.tabGroup === null ? 'selected' : ''}`} aria-pressed={item.tabGroup === null} onClick={() => void run('metadataSettings.setTabGroup', { section: item.key, groupId: null }).catch(() => {})}>None</button>{[1, 2, 3].map((group) => { const selected = item.tabGroup === group; const full = (groupCounts[group] ?? 0) >= 3 && !selected; return <button type="button" key={group} className={`metadata-chip ${selected ? 'selected' : ''}`} disabled={full} aria-pressed={selected} onClick={() => void run('metadataSettings.setTabGroup', { section: item.key, groupId: group }).catch(() => {})}>Group {group}</button>; })}</div>}
          <label className="switch" aria-label={`Show ${item.title}`}><input type="checkbox" checked={item.enabled} onChange={(event) => void run('metadataSettings.setSectionEnabled', { section: item.key, enabled: event.target.checked }).catch(() => {})} /><span /></label>
          <button type="button" className="metadata-drag-handle" draggable aria-label={`Reorder ${item.title}`} title="Drag to reorder" onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.key); setDraggedSection(item.key); }} onDragEnd={() => setDraggedSection(null)} onKeyDown={(event) => { if (event.key === 'ArrowUp') { event.preventDefault(); moveSection(item.key, items[items.findIndex((candidate) => candidate.key === item.key) - 1]?.key); } else if (event.key === 'ArrowDown') { event.preventDefault(); moveSection(item.key, items[items.findIndex((candidate) => candidate.key === item.key) + 1]?.key); } }}><GripVertical size={22} /></button>
        </div>)}
      </div>
    </SettingCard>
  </SubPage>;
}

export function P2PSettingsPage() {
  const { snapshot: s, loading, error, refresh, run } = useSettingsDomain<P2PSnapshot>('p2p');
  const [showConsent, setShowConsent] = useState(false);
  const [clearing, setClearing] = useState(false);
  const set = (method: string, params: Record<string, unknown>) => void run(method, params).catch(() => {});
  async function enable(value: boolean) { if (value) { setShowConsent(true); return; } set('p2p.setEnabled', { enabled: false }); }
  async function confirmConsent() { setShowConsent(false); set('p2p.setEnabled', { enabled: true, consentAccepted: true }); }
  async function clearCache() { setClearing(true); try { await run('p2p.clearCache', {}); } catch { /* error banner */ } finally { setClearing(false); } }
  if (loading && !s) return <LoadingPage title="Peer-to-peer" back="/settings" />;
  if (!s) return <SubPage title="Peer-to-peer" back="/settings"><FeatureNotice error={error} retry={() => { void refresh(); }} /></SubPage>;
  const stream = s.stream;
  return <SubPage title="Peer-to-peer" back="/settings">{error && <FeatureNotice error={error} retry={() => { void refresh(); }} />}
    {!s.available ? <div className="settings-section"><p className="muted">Peer-to-peer playback is unavailable in this desktop build.</p></div> : <>
      <SettingCard icon={Network} title="Peer-to-peer streaming" description="Stream torrent sources through the built-in local peer engine.">
        <Toggle title="Enable peer-to-peer streaming" description="Acknowledge that peer-to-peer sources may share your network address with other peers." checked={s.enabled} onChange={(value) => void enable(value)} />
        {s.enabled && <><Toggle title="Allow uploads" description="Share downloaded pieces with other peers." checked={s.enableUpload} onChange={(value) => set('p2p.setUploadEnabled', { enabled: value })} /><Toggle title="Hide torrent stats" checked={s.hideTorrentStats} onChange={(value) => set('p2p.setHideStats', { enabled: value })} /><Select title="Streaming profile" value={s.torrentProfile} values={['SOFT', 'BALANCED', 'FAST']} labels={['Low bandwidth', 'Balanced', 'Fast']} onChange={(value) => set('p2p.setTorrentProfile', { profile: value })} /><Select title="Cache size" value={s.cacheSize} values={['NONE', 'GB_2', 'GB_5', 'GB_10']} labels={['None', '2 GB', '5 GB', '10 GB']} onChange={(value) => set('p2p.setCacheSize', { size: value })} /></>}
      </SettingCard>
      <SettingCard icon={HardDrive} title="Peer cache" description="Manage the space used for downloaded torrent pieces." action={<button className="button secondary" onClick={() => void clearCache()} disabled={clearing || s.cache.isClearing}>{clearing || s.cache.isClearing ? <LoaderCircle className="spin" size={14} /> : <RotateCcw size={14} />} Clear cache</button>}>
        <div className="p2p-cache-summary"><span><strong>{formatBytes(s.cache.usedBytes)}</strong><small>Used</small></span><span><strong>{formatBytes(s.cache.protectedBytes)}</strong><small>Protected</small></span>{!s.cache.hasMeasurement && <small>Cache size is not available yet.</small>}</div>
      </SettingCard>
      <SettingCard icon={Gauge} title="Current stream" description="Live peer and buffer status reported by the bridge.">
        <div className={`p2p-stream-state ${stream.state}`}><span className="p2p-state-dot" /><strong>{stream.state === 'idle' ? 'No active peer stream' : stream.state[0].toUpperCase() + stream.state.slice(1)}</strong>{stream.errorMessage && <small>{stream.errorMessage}</small>}</div>
        <div className="p2p-stats-grid"><Stat label="Download" value={formatRate(stream.downloadSpeed)} /><Stat label="Upload" value={formatRate(stream.uploadSpeed)} /><Stat label="Peers" value={`${stream.peers}`} /><Stat label="Seeds" value={`${stream.seeds}`} /><Stat label="Buffer" value={`${Math.round(stream.bufferProgress)}%`} /><Stat label="Progress" value={`${Math.round(stream.totalProgress)}%`} /></div>
      </SettingCard>
    </>}
    {showConsent && <div className="consent-backdrop"><div className="consent-card" role="dialog" aria-modal="true" aria-labelledby="p2p-consent-title"><div className="dialog-head"><strong id="p2p-consent-title">Enable peer-to-peer streaming?</strong></div><p className="muted">Peer-to-peer connections share your public IP address with other peers and may upload data if uploads are enabled. Continue only if you understand and accept this behavior.</p><div className="dialog-actions"><button className="button secondary" onClick={() => setShowConsent(false)}>Cancel</button><button className="button primary" onClick={() => void confirmConsent()}>I understand and enable</button></div></div></div>}
  </SubPage>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="p2p-stat"><strong>{value}</strong><small>{label}</small></div>; }
function formatBytes(value: number) { if (!Number.isFinite(value) || value <= 0) return '0 B'; const unit = 1024; const names = ['B', 'KB', 'MB', 'GB']; const index = Math.min(names.length - 1, Math.floor(Math.log(value) / Math.log(unit))); return `${(value / unit ** index).toFixed(index ? 1 : 0)} ${names[index]}`; }
function formatRate(value: number | string | null) { if (value == null) return '—'; if (typeof value === 'string') return value; return `${formatBytes(value)}/s`; }
