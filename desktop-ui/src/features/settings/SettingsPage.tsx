import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ChevronRight, Clapperboard, Film, LayoutGrid, Moon, Network, Palette, Play, Puzzle, RefreshCw, Sparkles, Trash2, WandSparkles } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { actions, call, refreshFeature, useFeatureSnapshot, useSelector } from '../../bridge';
import type { Addon } from '../../generated/contract';
import { PageHeader } from '../../components/ui';
import { SettingsLayout } from './SettingsLayout';
import { SettingsLanding } from './SettingsLanding';
import { InlineError } from '../../components/Status';
import { useAppearance, type AppearanceSnapshot, type HomeSetting } from './appearanceStore';
import { MetadataSettingsPage, P2PSettingsPage, PlaybackSettingsPage } from './ExtendedSettings';
import { PluginsSettingsPage } from './PluginsSettings';
import { DebridSettingsPage, IntegrationsLanding, MdbListSettingsPage, SimklSettingsPage, TmdbSettingsPage, TrackingSettingsPage } from './IntegrationSettings';
import { AboutSettingsPage, CommunitySettingsPage, LicensesSettingsPage, LanguageSettingsControl } from './AboutSettings';
import { AdvancedSettingsPage } from './AdvancedSettings';
import { Dialog } from '../../components/Dialog';
import { DownloadFiltersPage } from '../downloads/DownloadFilters';
import './appearanceParity.css';

const posterScreens = ['home', 'continue_watching', 'collections', 'library', 'search', 'details'];
const screenNames: Record<string, string> = { home: 'Home', continue_watching: 'Continue Watching', collections: 'Collections', library: 'Library', search: 'Search', details: 'Details Screen' };

function SettingsRoot() { return <SettingsLanding />; }

function SettingsSubPage({ title, back = '/settings', children }: { title: string; back?: string; children: ReactNode }) {
  return <div className="page settings-page"><Link to={back} className="back-button settings-page-back" aria-label="Settings"><ArrowLeft size={15} /></Link><PageHeader title={title} />{children}</div>;
}

function AppearancePage() {
  const settings = useSelector((current) => current.settings);
  const { snapshot, loading, error, refresh, update } = useAppearance();
  const [openChoice, setOpenChoice] = useState<'layout' | 'style' | null>(null);
  const run = async (method: string, params: Record<string, unknown>) => { try { await update(method, params); } catch { /* The shared error banner reports the rejected setting. */ } };
  const theme = snapshot?.theme ?? settings.theme;
  const [showAppIcons, setShowAppIcons] = useState(false);
  const [iconConfirm, setIconConfirm] = useState<string | null>(null);
  const [customEditorOpen, setCustomEditorOpen] = useState(false);
  const themes = settings.themes;
  if (loading && !snapshot) return <SettingsSubPage title="Layout"><div className="loading-block"><span className="spin" /> Loading appearance…</div></SettingsSubPage>;
  return <SettingsSubPage title="Layout">
    {error && <InlineError message={error} onRetry={() => { void refresh(); }} />}
    <div className="appearance-section-label">THEME</div><section className="settings-section appearance-theme-section">
      <div className="theme-grid appearance-theme-grid">{themes.map((item) => <button key={item.id} className={`theme-option appearance-theme-option ${theme.toLowerCase() === item.id.toLowerCase() ? 'selected' : ''}`} aria-pressed={theme.toLowerCase() === item.id.toLowerCase()} onClick={() => { if (item.id.toLowerCase() === 'custom') setCustomEditorOpen(true); else void run('appearance.setTheme', { theme: item.id }); }}><span className="theme-swatch appearance-theme-swatch" style={{ background: item.id.toLowerCase() === 'custom' ? `linear-gradient(135deg, ${snapshot?.customThemeColors?.[1] ?? item.accent}, ${snapshot?.customThemeColors?.[2] ?? item.surface})` : item.accent, borderColor: theme.toLowerCase() === item.id.toLowerCase() ? '#e9ebee' : 'transparent' }}>{theme.toLowerCase() === item.id.toLowerCase() && <span aria-hidden="true">✓</span>}</span><span>{item.label}</span></button>)}</div>
      <CustomThemeColors snapshot={snapshot} onSaveColors={(colors) => update('appearance.setCustomTheme', { colors })} editing={customEditorOpen} onEditingChange={setCustomEditorOpen} />
    </section>
    <div className="appearance-section-label">DISPLAY</div><section className="settings-section appearance-display-section">
      <ControlRow title="AMOLED Black" description="Use pure black backgrounds for OLED screens." checked={snapshot?.amoledEnabled ?? false} onChange={(enabled) => run('appearance.setAmoled', { enabled })} />
      <SettingsChoice title="Desktop navigation" value={(snapshot?.navigationLayout ?? 'topbar') === 'sidebar' ? 'Sidebar' : 'Top Bar'} onClick={() => setOpenChoice('layout')} />
      <SettingsChoice title={(snapshot?.navigationLayout ?? 'topbar') === 'sidebar' ? 'Sidebar Style' : 'Top Bar Style'} value={({ adaptive: 'Adaptive', expanded: 'Always Expanded', compact: 'Always Compact', classic: 'Classic' } as Record<string, string>)[snapshot?.navBarStyle ?? 'expanded']} onClick={() => setOpenChoice('style')} />
      <AppearanceNavRow to="/settings/appearance/hover-preview" icon={Play} title="Hover Preview" description="Configure poster hover cards and their opening delay." />
      {!!snapshot?.appIcon?.options.length && <SettingsChoice title="App Icon" value={snapshot.appIcon.options.find((value) => value === snapshot.appIcon?.selected)?.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? 'Original'} trailing={<img className="app-icon-thumb" src={appIconAsset(snapshot.appIcon.selected)} alt="" />} onClick={() => setShowAppIcons(true)} />}
      {snapshot?.appIcon?.changeFailed && <InlineError message="The app icon could not be changed." />}
      <LanguageChoiceControl />
    </section>
    {openChoice && <Dialog label={openChoice === 'layout' ? 'Choose desktop navigation' : 'Choose navigation style'} onClose={() => setOpenChoice(null)}><h2>{openChoice === 'layout' ? 'Choose desktop navigation' : 'Choose navigation style'}</h2><div className="settings-choice-list">{(openChoice === 'layout' ? [['sidebar', 'Sidebar'], ['topbar', 'Top bar']] : [['adaptive', 'Adaptive'], ['expanded', 'Always Expanded'], ['compact', 'Always Compact'], ['classic', 'Classic']]).map(([value, label]) => { const selected = openChoice === 'layout' ? snapshot?.navigationLayout === value : snapshot?.navBarStyle === value; return <button key={value} className={`settings-choice-option ${selected ? 'selected' : ''}`} onClick={() => { void run(openChoice === 'layout' ? 'appearance.setNavigationLayout' : 'appearance.setNavBarStyle', openChoice === 'layout' ? { layout: value } : { style: value }); setOpenChoice(null); }}><strong>{label}</strong>{selected && <small>Selected</small>}</button>; })}</div></Dialog>}
    {showAppIcons && <Dialog label="Choose app icon" onClose={() => setShowAppIcons(false)}><h2>Choose App Icon</h2><div className="app-icon-options">{(snapshot?.appIcon?.options ?? ['original']).map((icon) => <button key={icon} className={`app-icon-option ${snapshot?.appIcon?.selected === icon ? 'selected' : ''}`} onClick={() => { setShowAppIcons(false); if (icon !== snapshot?.appIcon?.selected) setIconConfirm(icon); }}><img className="app-icon-mark" src={appIconAsset(icon)} alt="" /><strong>{icon.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}</strong></button>)}</div></Dialog>}
    {iconConfirm && <Dialog label="Change app icon confirmation" onClose={() => setIconConfirm(null)}><h2>Change App Icon?</h2><p>Changing the icon requires restarting Nuvio. Continue with {iconConfirm.replaceAll('_', ' ')}?</p><div className="dialog-actions"><button className="button secondary" onClick={() => setIconConfirm(null)}>Cancel</button><button className="button primary" onClick={() => { void run('appearance.setAppIcon', { icon: iconConfirm }); setIconConfirm(null); }}>Change icon</button></div></Dialog>}
    <div className="appearance-section-label">HOME</div><div className="settings-section appearance-link-group">
      <AppearanceNavRow to="/settings/appearance/home" icon={Sparkles} title="Home Layout" description="Adjust home layout, content visibility, and poster behavior" />
      <AppearanceNavRow to="/collections" icon={LayoutGrid} title="Collections" description="Create custom catalog groupings with folders shown on Home." />
      <AppearanceNavRow to="/settings/appearance/continue-watching" icon={Film} title="Continue Watching" description="Settings for the Continue Watching section." />
      <AppearanceNavRow to="/settings/appearance/posters" icon={Clapperboard} title="Poster Card Style" description="Tune card width and corner radius." />
    </div>
    <div className="appearance-section-label">STREAMS</div><div className="settings-section appearance-link-group"><AppearanceNavRow to="/settings/appearance/streams" icon={Network} title="Streams" description="Stream result display and badge URL rules." /></div>
    <div className="appearance-section-label">DETAIL PAGE</div><div className="settings-section appearance-link-group"><AppearanceNavRow to="/settings/details" icon={Clapperboard} title="Detail Page" description="Settings for the detail and episode screens." /></div>
  </SettingsSubPage>;
}

function appIconAsset(icon: string) { return `/app-icons/app_icon_${icon}.png`; }

function AppearanceNavRow({ to, icon: Icon, title, description }: { to: string; icon: typeof Palette; title: string; description: string }) {
  return <Link className="settings-nav-row appearance-inline-nav" to={to}><span className="settings-nav-icon"><Icon size={17} /></span><span className="settings-nav-copy"><strong>{title}</strong><span>{description}</span></span><ChevronRight size={16} /></Link>;
}

function LanguageChoiceControl() {
  const snapshot = useFeatureSnapshot<{ language: string; languages: Array<{ code: string; label: string }> }>('about');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!snapshot) void refreshFeature('about').catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load language settings.')); }, [snapshot]);
  const options = snapshot?.languages ?? [{ code: 'device', label: 'Device language' }];
  const selected = options.find((item) => item.code === snapshot?.language)?.label ?? 'Device language';
  return <><button className="settings-choice-row" onClick={() => setOpen(true)}><span><small>App language</small><strong>{selected}</strong></span><ChevronRight size={16} /></button>{error && <InlineError message={error} onRetry={() => { setError(''); void refreshFeature('about').catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load language settings.')); }} />}{open && <Dialog label="Choose app language" onClose={() => setOpen(false)}><h2>Choose app language</h2><div className="settings-choice-list">{options.map((item) => <button key={item.code} className={`settings-choice-option ${item.code === snapshot?.language ? 'selected' : ''}`} onClick={() => { setError(''); void call('about.setLanguage', { language: item.code }).then(() => refreshFeature('about')).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not save language.')); setOpen(false); }}><strong>{item.label}</strong>{item.code === snapshot?.language && <small>Selected</small>}</button>)}</div></Dialog>}</>;
}

function CustomThemeColors({ snapshot, onSaveColors, editing, onEditingChange }: { snapshot: AppearanceSnapshot | null; onSaveColors: (colors: string[]) => Promise<AppearanceSnapshot>; editing: boolean; onEditingChange: (editing: boolean) => void }) {
  const initial = snapshot?.customThemeColors?.length === 3 ? snapshot.customThemeColors : ['#B75AFF', '#EC70A9', '#FFB37A'];
  const [colors, setColors] = useState(initial);
  const [gradient, setGradient] = useState(snapshot?.customThemeGradientEnabled === true && new Set(initial).size > 1);
  const [selected, setSelected] = useState(0);
  const [hex, setHex] = useState(snapshot?.customThemeGradientEnabled ? initial[0] : initial[1]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (snapshot?.customThemeColors?.length === 3) {
      setColors(snapshot.customThemeColors);
      setGradient(snapshot.customThemeGradientEnabled && new Set(snapshot.customThemeColors).size > 1);
      setHex(snapshot.customThemeGradientEnabled ? snapshot.customThemeColors[0] : snapshot.customThemeColors[1]);
    }
  }, [snapshot?.customThemeColors.join('|'), snapshot?.customThemeGradientEnabled]);
  const color = colors[gradient ? selected : 1] ?? colors[1];
  const updateColor = (value: string, index = gradient ? selected : 1) => {
    if (!/^#[\da-f]{6}$/i.test(value)) { setHex(value); return; }
    setHex(value.toUpperCase());
    setError('');
    setColors((current) => current.map((item, position) => position === index ? value.toUpperCase() : item));
  };
  const swatches = ['#FF6B6B', '#FFB37A', '#D45C00', '#22D37C', '#4DE3FF', '#3185F5', '#B75AFF', '#EC70A9', '#FFFFFF'];
  const draft = gradient ? colors : [colors[1], colors[1], colors[1]];
  const hsv = hexToHsv(color);
  const save = async () => {
    if (!/^#[\da-f]{6}$/i.test(hex)) { setError('Enter a valid six-digit hex color.'); return; }
    try { await onSaveColors(draft); onEditingChange(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the custom theme.'); }
  };
  if (!editing) return null;
  return <Dialog label="Custom theme" onClose={() => onEditingChange(false)} className="custom-theme-dialog">
      <h2>{gradient ? 'Custom theme' : 'Custom solid theme'}</h2>
      {snapshot?.customThemeGradientEnabled && <div className="custom-theme-mode" role="radiogroup" aria-label="Custom theme mode">
        {[['gradient', 'Gradient'], ['solid', 'Solid']].map(([mode, label]) => <button key={mode} type="button" role="radio" aria-checked={gradient === (mode === 'gradient')} className={gradient === (mode === 'gradient') ? 'selected' : ''} onClick={() => { const next = mode === 'gradient'; setGradient(next); setSelected(next ? 0 : 1); setHex(colors[next ? 0 : 1]); }}>{label}</button>)}
      </div>}
      <p className="muted">{gradient ? 'Choose three colors for your custom theme gradient.' : 'Choose a solid accent color for your custom theme.'}</p>
      <div className="custom-theme-live-preview" style={{ background: `linear-gradient(115deg, ${draft[0]}, ${draft[1]}, ${draft[2]})` }} aria-label="Theme preview" />
      {gradient && <div className="custom-theme-color-slots">{colors.map((value, index) => <button key={index} type="button" className={selected === index ? 'selected' : ''} onClick={() => { setSelected(index); setHex(value); }}><i style={{ background: value }} /><strong>Color {index + 1}</strong><small>{value}</small></button>)}</div>}
      <div className="custom-theme-swatches" aria-label="Color presets">{swatches.map((value) => <button key={value} type="button" aria-label={value} aria-pressed={color === value} style={{ background: value }} onClick={() => updateColor(value)} />)}</div>
      <div className="custom-theme-channels">
        <ColorChannel title="Hue" value={hsv.h} max={359} label={`${Math.round(hsv.h)}°`} gradient="linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" onChange={(value) => updateColor(hsvToHex(value, hsv.s, hsv.v))} />
        <ColorChannel title="Saturation" value={hsv.s * 100} max={100} label={`${Math.round(hsv.s * 100)}%`} gradient={`linear-gradient(90deg,#fff,${hsvToHex(hsv.h, 1, 1)})`} onChange={(value) => updateColor(hsvToHex(hsv.h, value / 100, hsv.v))} />
        <ColorChannel title="Brightness" value={hsv.v * 100} max={100} label={`${Math.round(hsv.v * 100)}%`} gradient={`linear-gradient(90deg,#000,${hsvToHex(hsv.h, hsv.s, 1)})`} onChange={(value) => updateColor(hsvToHex(hsv.h, hsv.s, value / 100))} />
      </div>
      <label className="custom-theme-picker">Color<input type="color" value={/^#[\da-f]{6}$/i.test(color) ? color : '#B75AFF'} onChange={(event) => updateColor(event.target.value)} /></label>
      <label className="custom-theme-hex">Hex color<input value={hex} maxLength={7} aria-invalid={!!error} onChange={(event) => { const value = event.target.value; setHex(value); if (/^#[\da-f]{6}$/i.test(value)) updateColor(value); else setError('Enter a valid six-digit hex color.'); }} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="button secondary" onClick={() => onEditingChange(false)}>Cancel</button><button className="button primary" onClick={() => void save()} disabled={!/^#[\da-f]{6}$/i.test(hex)}>Save</button></div>
  </Dialog>;
}

function ColorChannel({ title, value, max, label, gradient, onChange }: { title: string; value: number; max: number; label: string; gradient: string; onChange: (value: number) => void }) {
  return <label className="custom-theme-channel"><span><strong>{title}</strong><small>{label}</small></span><input aria-label={title} type="range" min={0} max={max} value={value} style={{ background: gradient }} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function hexToHsv(hex: string) {
  const normalized = /^#[\da-f]{6}$/i.test(hex) ? hex.slice(1) : 'B75AFF';
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0;
  if (delta) h = max === r ? 60 * (((g - b) / delta) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
  return { h: (h + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToHex(h: number, s: number, v: number) {
  const chroma = v * s;
  const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - chroma;
  const [r, g, b] = h < 60 ? [chroma, x, 0] : h < 120 ? [x, chroma, 0] : h < 180 ? [0, chroma, x] : h < 240 ? [0, x, chroma] : h < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return `#${[r, g, b].map((value) => Math.round((value + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function NavigationSettings() {
  const { snapshot, loading, error, refresh, update } = useAppearance();
  const [openChoice, setOpenChoice] = useState<'layout' | 'style' | null>(null);
  const run = async (method: string, params: Record<string, unknown>) => { try { await update(method, params); } catch { /* banner */ } };
  if (loading && !snapshot) return <SettingsSubPage title="Navigation" back="/settings/appearance"><div className="loading-block"><span className="spin" /> Loading…</div></SettingsSubPage>;
  return <SettingsSubPage title="Navigation" back="/settings/appearance">{error && <InlineError message={error} onRetry={() => { void refresh(); }} />}
    <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><LayoutGrid size={18} /></span><div><h2>Navigation layout</h2><p>Choose where the main navigation appears.</p></div></div>
      <SettingsChoice title="Layout" value={(snapshot?.navigationLayout ?? 'topbar') === 'sidebar' ? 'Sidebar' : 'Top Bar'} onClick={() => setOpenChoice('layout')} />
      <SettingsChoice title="Navigation style" value={({ adaptive: 'Adaptive', expanded: 'Always Expanded', compact: 'Always Compact', classic: 'Classic' } as Record<string, string>)[snapshot?.navBarStyle ?? 'expanded']} onClick={() => setOpenChoice('style')} />
      <ControlRow title="Accent glow" description="Show a soft glow behind the active navigation item." checked={snapshot?.navBarGlowEnabled ?? true} onChange={(enabled) => run('appearance.setNavBarGlow', { enabled })} icon={Sparkles} />
    </section>
    {openChoice && <Dialog label={openChoice === 'layout' ? 'Navigation layout' : 'Navigation style'} onClose={() => setOpenChoice(null)}><h2>{openChoice === 'layout' ? 'Navigation layout' : 'Navigation style'}</h2><div className="settings-choice-list">{(openChoice === 'layout' ? [['sidebar', 'Sidebar'], ['topbar', 'Top bar']] : [['adaptive', 'Adaptive'], ['expanded', 'Always Expanded'], ['compact', 'Always Compact'], ['classic', 'Classic']]).map(([value, label]) => { const selected = openChoice === 'layout' ? snapshot?.navigationLayout === value : snapshot?.navBarStyle === value; return <button key={value} className={`settings-choice-option ${selected ? 'selected' : ''}`} onClick={() => { void run(openChoice === 'layout' ? 'appearance.setNavigationLayout' : 'appearance.setNavBarStyle', openChoice === 'layout' ? { layout: value } : { style: value }); setOpenChoice(null); }}><strong>{label}</strong>{selected && <small>Selected</small>}</button>; })}</div></Dialog>}
  </SettingsSubPage>;
}

function SettingsChoice({ title, value, onClick, trailing }: { title: string; value: string; onClick: () => void; trailing?: ReactNode }) {
  return <button className="settings-choice-row" onClick={onClick}><span><small>{title}</small><strong>{value}</strong></span>{trailing ?? <ChevronRight size={16} />}</button>;
}

function PostersSettings() {
  const { snapshot, loading, error, refresh, update } = useAppearance();
  const [pattern, setPattern] = useState('');
  const [patternInitialized, setPatternInitialized] = useState(false);
  const [fineTune, setFineTune] = useState(false);
  const [depthDraft, setDepthDraft] = useState({ edge: 0, sheen: 0, coverage: 0 });
  const run = async (method: string, params: Record<string, unknown>) => { try { await update(method, params); } catch { /* banner */ } };
  useEffect(() => { if (snapshot && !patternInitialized) { setPattern(snapshot.posters.pattern); setPatternInitialized(true); } }, [snapshot, patternInitialized]);
  const card = snapshot?.cardStyle;
  const depth = snapshot?.cardDepth;
  const openFineTune = () => { setDepthDraft({ edge: depth?.edgeStrength ?? 28, sheen: depth?.sheenStrength ?? 10, coverage: depth?.edgeCoverage ?? 0 }); setFineTune(true); };
  const commitDepth = (next: typeof depthDraft) => { void run('posters.setCardDepth', { edgeStrength: Math.round(next.edge), sheenStrength: Math.round(next.sheen), edgeCoverage: Math.round(next.coverage) }); };
  const resetDepth = async () => { await run('posters.setCardDepth', { enabled: false, edgeStrength: 28, sheenStrength: 10, edgeCoverage: 0 }); for (const surface of ['Posters','ContinueWatching','EpisodeCards','Cast','Trailers']) await run('posters.setCardDepth', { surface, surfaceEnabled: true }); };
  const preset = (title: string, options: Array<[string, number]>, value: number, field: 'edgeStrength' | 'sheenStrength' | 'edgeCoverage') => <div className="poster-preset-row"><strong>{title}</strong><div>{options.map(([label, amount]) => <button type="button" key={label} aria-pressed={value === amount} className={`poster-preset-chip ${value === amount ? 'selected' : ''}`} onClick={() => void run('posters.setCardDepth', { [field]: amount })}>{label}</button>)}</div></div>;
  if (loading && !snapshot) return <SettingsSubPage title="Poster Card Style" back="/settings/appearance"><div className="loading-block"><span className="spin" /> Loading…</div></SettingsSubPage>;
  return <SettingsSubPage title="Poster Card Style" back="/settings/appearance">{error && <InlineError message={error} onRetry={() => { void refresh(); }} />}
    <h2 className="settings-group-title poster-section-title">POSTER CARD STYLE<button className="button secondary" onClick={() => void run('posters.setCardStyle', { widthDp: 126, cornerRadiusDp: 12, catalogLandscapeModeEnabled: false, hideLabelsEnabled: false, alwaysShowLandscapeClearlogo: false })}>Reset</button></h2><section className="settings-section poster-style-panel">
      <p className="muted">Tune card width and corner radius.</p>
      <div className="poster-live-preview"><div className="poster-preview-shape" style={{ width: `${Math.min(140, card?.widthDp ?? 126)}px`, height: `${Math.min(210, Math.round((card?.widthDp ?? 126) * 1.5))}px`, borderRadius: `${card?.cornerRadiusDp ?? 12}px` }} /><div className="poster-preview-values"><strong>Live Preview</strong><span>Width: {card?.widthDp ?? 126} dp</span><span>Corner radius: {card?.cornerRadiusDp ?? 12} dp</span><small>Height: {Math.round((card?.widthDp ?? 126) * 1.5)} dp</small></div></div>
      <PosterPresetControl title={`Width · ${({104:'Compact',112:'Dense',120:'Standard',126:'Balanced',134:'Comfort',140:'Large'} as Record<number,string>)[card?.widthDp ?? 126] ?? 'Custom'}`} value={card?.widthDp ?? 126} options={[["Compact",104],["Dense",112],["Standard",120],["Balanced",126],["Comfort",134],["Large",140]]} onSelect={(widthDp) => run('posters.setCardStyle', { widthDp })} />
      <PosterPresetControl title={`Corner radius · ${({0:'Sharp',4:'Subtle',8:'Classic',12:'Rounded',16:'Pill'} as Record<number,string>)[card?.cornerRadiusDp ?? 12] ?? 'Custom'}`} value={card?.cornerRadiusDp ?? 12} options={[["Sharp",0],["Subtle",4],["Classic",8],["Rounded",12],["Pill",16]]} onSelect={(cornerRadiusDp) => run('posters.setCardStyle', { cornerRadiusDp })} />
      <ControlRow title="Landscape Posters" checked={card?.catalogLandscapeModeEnabled ?? false} onChange={(enabled) => run('posters.setCardStyle', { catalogLandscapeModeEnabled: enabled })} />
      <ControlRow title="Hide poster labels" checked={card?.hideLabelsEnabled ?? false} onChange={(enabled) => run('posters.setCardStyle', { hideLabelsEnabled: enabled })} />
      <ControlRow title="Always show landscape clearlogo" checked={card?.alwaysShowLandscapeClearlogo ?? false} onChange={(enabled) => run('posters.setCardStyle', { alwaysShowLandscapeClearlogo: enabled })} />
    </section>
    <h2 className="settings-group-title poster-section-title">CUSTOM POSTER SOURCE{snapshot?.posters.pattern && <button className="button secondary" onClick={() => { setPattern(''); void run('posters.clearPattern', {}); }}>Clear</button>}</h2><section className="settings-section poster-custom-panel">
      <p className="muted">Provide a poster URL pattern from an external service. If a placeholder has no value for a title, the original poster is used instead.</p>
      <label className="poster-pattern-field">Poster URL pattern<textarea value={pattern} onChange={(event) => setPattern(event.target.value)} placeholder="https://example.com/posters/{id}.jpg" rows={3} /></label>
      <button className="button primary" onClick={() => void run('posters.setPattern', { pattern })} disabled={!pattern.trim() || pattern === snapshot?.posters.pattern}>Save</button>
      {snapshot?.posters.pattern && <><p className="poster-active-state">✓ Custom poster URLs are active</p><strong>Apply to</strong><div className="poster-screen-list">{posterScreens.map((screen) => <ControlRow key={screen} title={screenNames[screen]} checked={snapshot.posters.activeScreens.includes(screen)} onChange={(enabled) => run('posters.setScreenEnabled', { screen, enabled })} />)}</div></>}
    </section>
    <h2 className="settings-group-title poster-section-title">CARD DEPTH<button className="button secondary" onClick={() => void resetDepth()}>Reset</button></h2><section className="settings-section poster-depth-panel">
      <p className="muted">Add dimensional light to the surfaces you choose.</p>
      <ControlRow title="Enable card depth" checked={depth?.enabled ?? false} onChange={(enabled) => run('posters.setCardDepth', { enabled })} />
      {!!depth?.enabled && <>
        {preset('Edge glow', [["Subtle",28],["Balanced",42],["Bold",56]], depth.edgeStrength, 'edgeStrength')}
        {preset('Top sheen', [["Off",0],["Soft",10],["Bright",16]], depth.sheenStrength, 'sheenStrength')}
        {preset('Edge coverage', [["Top only",0],["Half",50],["Full outline",100]], depth.edgeCoverage, 'edgeCoverage')}
        <button className="poster-fine-tune-link" onClick={openFineTune}><span><strong>Fine-tune</strong><small>Adjust edge glow and sheen together</small></span><WandSparkles size={18} /></button>
        <strong>Apply to</strong>{(['posters','continueWatching','episodeCards','cast','trailers'] as const).map((surface) => <ControlRow key={surface} title={surfaceLabel(surface)} checked={surfaceEnabled(depth, surface)} onChange={(enabled) => run('posters.setCardDepth', { surface: surfaceKey(surface), surfaceEnabled: enabled })} />)}
      </>}
    </section>
    {fineTune && <Dialog label="Fine-tune Depth" onClose={() => { commitDepth(depthDraft); setFineTune(false); }}><div className="poster-fine-tune"><div className="poster-fine-tune-title"><h2>Fine-tune Depth</h2><button className="button secondary" onClick={() => { const reset={edge:28,sheen:10,coverage:0};setDepthDraft(reset);commitDepth(reset); }}>Reset</button></div><p>Drag the dot right for a brighter edge, up for more sheen. Use the slider to extend the glow around the full outline.</p><div className="depth-preview-card" style={{ boxShadow:`0 0 ${depthDraft.edge}px rgba(132,170,255,.38), inset 0 ${depthDraft.sheen/2}px ${depthDraft.sheen}px rgba(255,255,255,.3)`, borderImage:`linear-gradient(90deg,rgba(130,165,255,${depthDraft.edge/100}),transparent ${depthDraft.coverage}%) 1` }}><span>FEATURED · MOVIE</span><strong>Preview Card</strong></div><div className="depth-value-row"><span>Edge glow: {depthDraft.edge.toFixed(1)}%</span><span>Sheen: {depthDraft.sheen.toFixed(1)}%</span></div><div className="depth-tuning-pad" onPointerDown={(event) => { const box=event.currentTarget.getBoundingClientRect();const next={...depthDraft,edge:(event.clientX-box.left)/box.width*70,sheen:(1-(event.clientY-box.top)/box.height)*25};setDepthDraft(next); }} onPointerMove={(event) => { if(event.buttons!==1)return;const box=event.currentTarget.getBoundingClientRect();setDepthDraft((current)=>({...current,edge:(event.clientX-box.left)/box.width*70,sheen:(1-(event.clientY-box.top)/box.height)*25})); }} onPointerUp={() => commitDepth(depthDraft)}><span className="depth-thumb" style={{ left:`${depthDraft.edge/70*100}%`,top:`${100-depthDraft.sheen/25*100}%` }} /></div><label>Edge coverage · {depthDraft.coverage.toFixed(1)}%<input type="range" min="0" max="100" step="0.1" value={depthDraft.coverage} onChange={(event) => setDepthDraft((current)=>({...current,coverage:Number(event.target.value)}))} onPointerUp={(event) => { const next={...depthDraft,coverage:Number(event.currentTarget.value)};setDepthDraft(next);commitDepth(next); }} /></label></div></Dialog>}
  </SettingsSubPage>;
}

function HoverPreviewSettings() {
  const { snapshot, loading, error, refresh, update } = useAppearance();
  const run = async (params: Record<string, unknown>) => { try { await update('posters.setCardStyle', params); } catch { /* The shared error banner reports rejected settings. */ } };
  const card = snapshot?.cardStyle;
  if (loading && !snapshot) return <SettingsSubPage title="Hover preview" back="/settings/appearance"><div className="loading-block"><span className="spin" /> Loading…</div></SettingsSubPage>;
  return <SettingsSubPage title="Hover preview" back="/settings/appearance">{error && <InlineError message={error} onRetry={() => { void refresh(); }} />}
    <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><Play size={18} /></span><div><h2>Preview behavior</h2><p>Choose when the preview opens and whether trailer playback is enabled.</p></div></div>
      <ControlRow title="Enable hover preview" description="Show an expanded preview when a poster is hovered." checked={card?.hoverPreviewEnabled ?? true} onChange={(enabled) => run({ hoverPreviewEnabled: enabled })} />
      <NumberSetting title="Preview delay" description="Wait before opening the preview. Changes apply in 500 ms steps." value={card?.hoverPreviewOpenDelayMillis ?? 2000} min={500} max={5000} step={500} onSave={(value) => run({ hoverPreviewOpenDelayMillis: value })} suffix="ms" />
    </section>
    <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><Film size={18} /></span><div><h2>Trailer playback</h2><p>Trailer controls require an enabled hover preview.</p></div></div>
      <ControlRow title="Play trailer previews" description="Play a trailer in the hover preview when one is available." checked={card?.hoverPreviewTrailerEnabled ?? false} disabled={!(card?.hoverPreviewEnabled ?? true)} onChange={(enabled) => run({ hoverPreviewTrailerEnabled: enabled })} />
      <ControlRow title="Trailer preview sound" description="Allow trailer audio. Turn this off to keep previews muted." checked={card?.hoverPreviewTrailerSoundEnabled ?? false} disabled={!(card?.hoverPreviewEnabled ?? true) || !(card?.hoverPreviewTrailerEnabled ?? false)} onChange={(enabled) => run({ hoverPreviewTrailerSoundEnabled: enabled })} />
      <NumberSetting title="Trailer start time" description="Choose how far into the trailer playback begins (0–5 seconds)." value={card?.hoverPreviewTrailerStartSeconds ?? 0} min={0} max={5} onSave={(value) => run({ hoverPreviewTrailerStartSeconds: value })} suffix="s" />
    </section>
  </SettingsSubPage>;
}

function StreamsAppearanceSettings() {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const settings = useFeatureSnapshot<{ streamPreferences: { preferMatchingReleaseTitles: boolean } }>('debrid');
  const streams = useFeatureSnapshot<{ badges: { showFileSize: boolean; showAddonLogo: boolean; placement: 'top' | 'bottom'; backgroundMode: 'normal' | 'cinematic'; rules: { imports: Array<{ sourceUrl: string; isActive: boolean; filters: Array<{ id: string; groupId: string; name: string; imageURL: string; tagColor: string; isEnabled: boolean }>; groups: Array<{ id: string; name: string }> }> } } }>('streams');
  const [badgeUrl, setBadgeUrl] = useState('');
  const [savingBadge, setSavingBadge] = useState(false);
  const [choice, setChoice] = useState<'placement' | 'background' | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const refresh = async () => { setError(''); try { await Promise.all([refreshFeature('debrid'), refreshFeature('streams')]); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load stream settings.'); } };
  useEffect(() => { void refresh(); }, []);
  const saveMatching = async (enabled: boolean) => {
    if (!settings) return;
    setSaving(true); setError('');
    try { await call('debrid.set', { key: 'streamPreferences', value: { ...settings.streamPreferences, preferMatchingReleaseTitles: enabled } }); await refreshFeature('debrid'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save stream settings.'); }
    finally { setSaving(false); }
  };
  const updateStream = async (method: string, params: Record<string, unknown>) => {
    setSavingBadge(true); setError('');
    try { await call(method, params); await refreshFeature('streams'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save stream settings.'); }
    finally { setSavingBadge(false); }
  };
  const importBadgeUrl = async () => {
    if (!badgeUrl.trim()) return;
    setSavingBadge(true); setError('');
    try { await call('streams.badges.rules.importFromUrl', { url: badgeUrl.trim() }); setBadgeUrl(''); await refreshFeature('streams'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not import badge rules.'); }
    finally { setSavingBadge(false); }
  };
  return <SettingsSubPage title="Streams" back="/settings/appearance">{error && <InlineError message={error} onRetry={() => { void refresh(); }} />}
    <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><Network size={18} /></span><div><h2>Stream selection</h2><p>Prefer stream titles that match the selected movie or episode.</p></div></div>
      <ControlRow title="Prefer matching release titles" description="Give closer title matches priority in stream results." checked={settings?.streamPreferences.preferMatchingReleaseTitles ?? false} disabled={!settings || saving} onChange={(enabled) => void saveMatching(enabled)} />
    </section>
    <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><Sparkles size={18} /></span><div><h2>Badges</h2><p>Choose which stream details and provider logos appear.</p></div></div>
      <ControlRow title="File size badges" description="Show each stream’s file size when available." checked={streams?.badges.showFileSize ?? true} disabled={!streams || savingBadge} onChange={(enabled) => void updateStream('streams.badges.setFileSizeEnabled', { enabled })} />
      <SettingsChoice title="Badge position" value={(streams?.badges.placement ?? 'bottom') === 'top' ? 'Top' : 'Bottom'} onClick={() => setChoice('placement')} />
      <ControlRow title="Add-on logo" description="Show the source add-on’s logo with its stream." checked={streams?.badges.showAddonLogo ?? false} disabled={!streams || savingBadge} onChange={(enabled) => void updateStream('streams.badges.setAddonLogoEnabled', { enabled })} />
      <SettingsChoice title="Stream background" value={(streams?.badges.backgroundMode ?? 'normal') === 'cinematic' ? 'Cinematic' : 'Normal'} onClick={() => setChoice('background')} />
    </section>
    <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><Clapperboard size={18} /></span><div><h2>Custom badge rules</h2><p>Import remote badge sets and choose which set is active. Maximum 3 imports.</p></div></div>
      <label className="profile-url-field">Badge rules URL<input type="url" value={badgeUrl} onChange={(event) => setBadgeUrl(event.target.value)} placeholder="https://example.com/badges.json" /></label><div className="poster-pattern-actions"><button className="button primary" disabled={savingBadge || !badgeUrl.trim()} onClick={() => void importBadgeUrl()}>{savingBadge ? 'Importing…' : 'Import rules'}</button></div>
      <div className="stream-badge-rules">{(streams?.badges.rules.imports ?? []).map((item) => <div className="stream-badge-source" key={item.sourceUrl}><span><strong>{item.sourceUrl}</strong><br /><small>{item.groups.length} groups · {item.filters.filter((filter) => filter.isEnabled).length} active badges{item.isActive ? ' · Active' : ''}</small></span><button className="button secondary" onClick={() => setPreviewUrl(item.sourceUrl)}>Preview</button>{!item.isActive && <button className="button secondary" disabled={savingBadge} onClick={() => void updateStream('streams.badges.rules.setActive', { url: item.sourceUrl })}>Use</button>}<button className="icon-button danger" aria-label={`Remove rules from ${item.sourceUrl}`} disabled={savingBadge} onClick={() => void updateStream('streams.badges.rules.remove', { url: item.sourceUrl })}><Trash2 size={15} /></button></div>)}</div>
    </section>
    {choice && <Dialog label={choice === 'placement' ? 'Badge position' : 'Stream background'} onClose={() => setChoice(null)}><h2>{choice === 'placement' ? 'Badge position' : 'Stream background'}</h2><div className="settings-choice-list">{(choice === 'placement' ? [['TOP', 'Top'], ['BOTTOM', 'Bottom']] : [['Normal', 'Normal'], ['Cinematic', 'Cinematic']]).map(([value, label]) => <button key={value} className="settings-choice-option" onClick={() => { void updateStream(choice === 'placement' ? 'streams.badges.setPlacement' : 'streams.badges.setBackgroundMode', choice === 'placement' ? { placement: value } : { mode: value }); setChoice(null); }}><strong>{label}</strong></button>)}</div></Dialog>}
    {previewUrl && (() => { const item = streams?.badges.rules.imports.find((entry) => entry.sourceUrl === previewUrl); if (!item) return null; const sections = item.groups.map((group) => ({ ...group, badges: item.filters.filter((filter) => filter.groupId === group.id && filter.isEnabled && filter.imageURL) })).filter((group) => group.badges.length); const ungrouped = item.filters.filter((filter) => filter.isEnabled && filter.imageURL && !item.groups.some((group) => group.id === filter.groupId)); return <Dialog label="Badge preview" onClose={() => setPreviewUrl(null)}><h2>Badge preview</h2><p className="muted">{item.sourceUrl}</p><div className="badge-preview-content">{[...sections, ...(ungrouped.length ? [{ id: 'other', name: 'Other', badges: ungrouped }] : [])].map((section) => <section key={section.id}><strong>{section.name || 'Badge group'}</strong><div>{section.badges.map((badge) => <span className="badge-preview-chip" key={badge.id} style={{ background: /^#[\da-f]{3}(?:[\da-f]{3})?(?:[\da-f]{2})?$/i.test(badge.tagColor) ? badge.tagColor : undefined }}>{badge.name}</span>)}</div></section>)}{!sections.length && !ungrouped.length && <p className="muted">This import has no enabled badge preview rules.</p>}</div><button className="button secondary" onClick={() => setPreviewUrl(null)}>Close</button></Dialog>; })()}
  </SettingsSubPage>;
}

function surfaceKey(surface: string) { return ({ posters: 'Posters', continueWatching: 'ContinueWatching', episodeCards: 'EpisodeCards', cast: 'Cast', trailers: 'Trailers' } as Record<string, string>)[surface]; }
function surfaceLabel(surface: string) { return ({ posters: 'Posters', continueWatching: 'Continue Watching', episodeCards: 'Episode cards', cast: 'Cast', trailers: 'Trailers' } as Record<string, string>)[surface]; }
function surfaceEnabled(depth: AppearanceSnapshot['cardDepth'] | undefined, surface: 'posters' | 'continueWatching' | 'episodeCards' | 'cast' | 'trailers') { if (!depth) return false; return ({ posters: depth.postersEnabled, continueWatching: depth.continueWatchingEnabled, episodeCards: depth.episodeCardsEnabled, cast: depth.castEnabled, trailers: depth.trailersEnabled })[surface]; }

function HomeSettings() {
  const { snapshot, loading, error, refresh, update } = useAppearance();
  const run = async (method: string, params: Record<string, unknown>) => { try { await update(method, params); } catch { /* banner */ } };
  const [heroExpanded, setHeroExpanded] = useState(false);
  const [expandedCatalogKey, setExpandedCatalogKey] = useState<string | null>(null);
  const items = useMemo(() => [...(snapshot?.home.items ?? [])].sort((a, b) => a.order - b.order), [snapshot?.home.items]);
  const catalogItems = items.filter((item) => !item.isCollection);
  const heroItems = catalogItems.filter((item) => item.heroSourceEnabled);
  const collectionCount = items.filter((item) => item.isCollection).length;
  const catalogCount = catalogItems.length;
  if (loading && !snapshot) return <SettingsSubPage title="Home screen" back="/settings/appearance"><div className="loading-block"><span className="spin" /> Loading…</div></SettingsSubPage>;
  const catalogTitle = collectionCount && catalogCount ? 'CATALOGS & COLLECTIONS' : collectionCount ? 'COLLECTIONS' : 'CATALOGS';
  return <SettingsSubPage title="Home Layout" back="/settings/appearance">{error && <InlineError message={error} onRetry={() => { void refresh(); }} />}
    <section className="settings-section home-summary"><strong>Keep Home focused</strong><span>{items.filter((item) => item.enabled).length} of {items.length} catalogs visible · {heroItems.length} hero sources selected</span><small>Open a catalog only when you need to rename or reorder it.</small></section>
    <h2 className="settings-group-title">HOME LAYOUT</h2><section className="settings-section home-layout-settings">
      <ControlRow title="Show Hero Section" description="Display hero carousel at top of home." checked={snapshot?.home.heroEnabled ?? true} onChange={(enabled) => run('homePreferences.setHeroEnabled', { enabled })} />
      <ControlRow title="Catalog type" description="Show whether catalogs contain movies or series." checked={snapshot?.home.showCatalogType ?? true} onChange={(enabled) => run('homePreferences.setShowCatalogType', { enabled })} />
      <ControlRow title="Hide unreleased" description="Hide titles that have not been released yet." checked={snapshot?.home.hideUnreleasedContent ?? false} onChange={(enabled) => run('homePreferences.setHideUnreleasedContent', { enabled })} />
    </section>
    {!!catalogItems.length && (snapshot?.home.heroEnabled ?? true) && <><h2 className="settings-group-title">HERO CATALOGS</h2><section className="settings-section home-hero-source-group">
      <button className="home-hero-source-summary" aria-expanded={heroExpanded} onClick={() => setHeroExpanded((value) => !value)}><span><strong>{heroItems.length} of 2 selected</strong><small>{heroItems.map((item) => item.title).join(', ') || 'No hero sources selected'}</small></span><ChevronRight className={heroExpanded ? 'expanded' : ''} size={18} /></button>
      {heroExpanded && catalogItems.map((item) => <ControlRow key={item.key} title={item.title} description={!item.heroSourceEnabled && heroItems.length >= 2 ? `Selection limit reached (maximum 2)` : item.key} checked={item.heroSourceEnabled} disabled={!item.heroSourceEnabled && heroItems.length >= 2} onChange={(enabled) => run('homePreferences.setHeroSourceEnabled', { key: item.key, enabled })} />)}
    </section></>}
    <h2 className="settings-group-title">{catalogTitle}<button className="home-reset-button" title="Reset" onClick={() => void run('homePreferences.reset', {})}>Reset</button></h2><section className="settings-section home-items-section">
      {items.map((item, index) => <HomeCatalogRow key={item.key} item={item} index={index} count={items.length} expanded={expandedCatalogKey === item.key} onExpandedChange={(expanded) => setExpandedCatalogKey(expanded ? item.key : null)} onToggle={(enabled) => run('homePreferences.setEnabled', { key: item.key, enabled })} onTitle={(title) => run('homePreferences.setCustomTitle', { key: item.key, title })} onMove={(direction) => run('homePreferences.move', { key: item.key, direction })} />)}
      {!items.length && <p className="muted">No home catalogs. Enable or add an addon with catalogs to configure Home.</p>}
    </section>
  </SettingsSubPage>;
}

function HomeCatalogRow({ item, index, count, expanded, onExpandedChange, onToggle, onTitle, onMove }: { item: HomeSetting; index: number; count: number; expanded: boolean; onExpandedChange: (expanded: boolean) => void; onToggle: (enabled: boolean) => void; onTitle: (title: string) => void; onMove: (direction: 'up' | 'down') => void }) {
  return <article className={`home-catalog-row ${expanded ? 'expanded' : ''}`}>
    <div className="home-catalog-summary"><button className="home-catalog-info" aria-expanded={expanded} onClick={() => onExpandedChange(!expanded)}><strong>{item.title}</strong><span>{item.isCollection ? `Collection · ${item.collectionId ?? ''}` : item.key}</span><small>{item.enabled ? 'Visible' : 'Hidden'} · {item.isCollection ? 'Collection' : item.heroSourceEnabled ? 'Hero source' : 'Not in hero'}</small></button><span className="home-catalog-row-actions"><label className="switch" aria-label={`Show ${item.title}`}><input type="checkbox" checked={item.enabled} onChange={(event) => onToggle(event.target.checked)} /><span /></label><span className="home-order-controls"><button className="icon-button" disabled={!index} onClick={() => onMove('up')} aria-label={`Move ${item.title} up`}>↑</button><button className="icon-button" disabled={index === count - 1} onClick={() => onMove('down')} aria-label={`Move ${item.title} down`}>↓</button></span></span></div>
    {expanded && !item.isCollection && <label className="home-title-field">Display Name<input value={item.customTitle ?? ''} onChange={(event) => onTitle(event.target.value)} placeholder={item.defaultTitle} /></label>}
  </article>;
}

function PosterPresetControl({ title, value, options, onSelect }: { title: string; value: number; options: Array<[string, number]>; onSelect: (value: number) => void }) {
  return <div className="poster-preset-control"><strong>{title}</strong><div>{options.map(([label, optionValue]) => <button type="button" key={label} aria-pressed={value === optionValue} className={`poster-preset-chip ${value === optionValue ? 'selected' : ''}`} onClick={() => onSelect(optionValue)}>{label}</button>)}</div></div>;
}

function ContinueWatchingSettings() {
  const { snapshot, loading, error, refresh, update } = useAppearance();
  const [sortDialog, setSortDialog] = useState(false);
  const run = async (method: string, params: Record<string, unknown>) => { try { await update(method, params); } catch { /* banner */ } };
  if (loading && !snapshot) return <SettingsSubPage title="Continue Watching" back="/settings/appearance"><div className="loading-block"><span className="spin" /> Loading…</div></SettingsSubPage>;
  const cw = snapshot?.continueWatching;
  const style = cw?.style ?? 'card';
  const sortMode = cw?.sortMode ?? 'default';
  const sortTitles = { default: 'Default', streaming_style: 'Streaming Style', split_upcoming: 'Separate Upcoming Row' } as const;
  const sortDescriptions = { default: 'Sort all items by recency', streaming_style: 'Released items first, upcoming at the end', split_upcoming: 'Move unaired episodes to a separate Upcoming row' } as const;
  return <SettingsSubPage title="Continue Watching" back="/settings/appearance">{error && <InlineError message={error} onRetry={() => { void refresh(); }} />}
    <h2 className="settings-group-title">VISIBILITY</h2><section className="settings-section"><ControlRow title="Show Continue Watching" description="Display the Continue Watching shelf on the Home screen." checked={cw?.visible ?? true} onChange={(enabled) => run('continueWatching.setVisible', { enabled })} /></section>
    <h2 className="settings-group-title">POSTER CARD STYLE</h2><section className="settings-section"><div className="continue-style-grid">{(['card', 'wide', 'poster'] as const).map((option) => <button type="button" key={option} className={`continue-style-option ${style === option ? 'selected' : ''}`} aria-pressed={style === option} onClick={() => void run('continueWatching.setStyle', { style: option })}><span className={`continue-style-preview ${option}`} aria-hidden="true"><i className="cw-art" />{option === 'card' && <><i className="cw-badge" /><i className="cw-copy short" /><i className="cw-copy long" /><i className="cw-progress" /></>}{option === 'wide' && <><i className="cw-copy wide-title" /><i className="cw-copy wide-meta" /><i className="cw-progress" /></>}{option === 'poster' && <><i className="cw-poster-title" /><i className="cw-progress" /></>}</span><strong>{option === 'card' ? 'Card' : option === 'wide' ? 'Wide' : 'Poster'}</strong><small>{option === 'card' ? 'TV-style landscape card' : option === 'wide' ? 'Info-dense horizontal card' : 'Artwork-first poster card'}</small></button>)}</div></section>
    <h2 className="settings-group-title">NEXT UP BEHAVIOR</h2><section className="settings-section">
      {style !== 'poster' && <ControlRow title="Prefer Episode Thumbnails in Continue Watching" description="Prefer episode thumbnails when available." checked={cw?.useEpisodeThumbnails ?? true} onChange={(enabled) => run('continueWatching.setUseEpisodeThumbnails', { enabled })} />}
      <ControlRow title="Next Up From Furthest Episode" description="Show next episode based on the furthest watched episode. Disable for rewatches to use the most recently watched episode instead." checked={cw?.upNextFromFurthestEpisode ?? false} onChange={(enabled) => run('continueWatching.setUpNextFromFurthestEpisode', { enabled })} />
      <ControlRow title="Show Unaired Next Up Episodes" description="Include upcoming episodes in Continue Watching before they air." checked={cw?.showUnairedNextUp ?? false} onChange={(enabled) => run('continueWatching.setShowUnairedNextUp', { enabled })} />
      {style !== 'poster' && (cw?.useEpisodeThumbnails ?? true) && <ControlRow title="Blur Unwatched in Continue Watching" description="Blur unwatched episode thumbnails in Continue Watching to avoid spoilers." checked={cw?.blurNextUp ?? false} onChange={(enabled) => run('continueWatching.setBlurNextUp', { enabled })} />}
    </section>
    <h2 className="settings-group-title">ON LAUNCH</h2><section className="settings-section"><ControlRow title="Resume prompt on launch" description="Show a popup to continue where you left off when opening the app after leaving from the player." checked={cw?.showResumePromptOnLaunch ?? false} onChange={(enabled) => run('continueWatching.setShowResumePromptOnLaunch', { enabled })} /></section>
    <h2 className="settings-group-title">SORT ORDER</h2><section className="settings-section"><SettingsChoice title="Sort Order" value={sortTitles[sortMode]} onClick={() => setSortDialog(true)} /></section>
    {sortDialog && <Dialog label="Sort Order" onClose={() => setSortDialog(false)}><h2>Sort Order</h2><div className="settings-choice-list">{(['default', 'streaming_style', 'split_upcoming'] as const).map((mode) => <button key={mode} className={`settings-choice-option ${sortMode === mode ? 'selected' : ''}`} onClick={() => { void run('continueWatching.setSortMode', { sortMode: mode }); setSortDialog(false); }}><strong>{sortTitles[mode]}</strong><small>{sortDescriptions[mode]}</small>{sortMode === mode && <small>Selected</small>}</button>)}</div></Dialog>}
  </SettingsSubPage>;
}

function ContentSettings() {
 const history=useSelector(current=>current.searchHistory);
 const [error,setError]=useState('');
 useEffect(()=>{void refreshFeature('searchHistory','search.historySnapshot').catch(cause=>setError(String(cause)));},[]);
 return <SettingsSubPage title="Content & Discovery">{error&&<InlineError message={error}/>}<h2 className="settings-group-title">Search</h2><section className="settings-section"><ControlRow title="Recent Searches" description="Save recent searches and show them when the search bar is focused." checked={history?.enabled??true} onChange={enabled=>{void call('search.historyEnabled',{enabled}).then(()=>refreshFeature('searchHistory','search.historySnapshot')).catch(cause=>setError(String(cause)));}}/></section><h2 className="settings-group-title">Sources</h2><div className="settings-nav-card"><Link className="settings-nav-row" to="/settings/content/addons"><span className="settings-nav-copy"><strong>Addons</strong><span>Install, remove, refresh, and sort your content sources.</span></span></Link><Link className="settings-nav-row" to="/settings/content/plugins"><span className="settings-nav-copy"><strong>Plugins</strong><span>Install JavaScript scraper repositories and test providers internally.</span></span></Link></div></SettingsSubPage>;
}

function AddonsSettings() {
  const addons = useSelector(current => current.addons);
  const [manifest,setManifest]=useState('');
  const [status,setStatus]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  async function install(event:FormEvent){event.preventDefault();setBusy(true);setStatus('Checking addon…');try{await actions.installAddon(manifest.trim());setManifest('');setStatus('Addon installed successfully.');}catch(error){setStatus(error instanceof Error?error.message:'Could not install addon.');}finally{setBusy(false);}}
  return <SettingsSubPage title="Addons" back="/settings/content"><h2 className="settings-group-title">Overview</h2><section className="settings-section addon-overview">{[[addons.length,'Addons'],[addons.filter(item=>item.enabled).length,'Active'],[addons.reduce((sum,item)=>sum+((item as Addon & {catalogCount?:number}).catalogCount??0),0),'Catalogs']].map(([value,label])=><div key={label}><strong>{value}</strong><span>{label}</span></div>)}</section><h2 className="settings-group-title">Add Addon</h2><form className="settings-section addon-install-native" onSubmit={event=>void install(event)}><input aria-label="Addon URL" type="url" value={manifest} onChange={event=>setManifest(event.target.value)} placeholder="Addon URL" required/><button className="button primary full" disabled={busy||!manifest.trim()}>Install Addon</button></form><h2 className="settings-group-title">Installed Addons</h2><div className="addon-list">{addons.map((addon,index)=><AddonRow key={addon.id} addon={addon} index={index} count={addons.length}/>)}{!addons.length&&<p className="muted">No addons installed.</p>}</div>{status&&<Dialog label="Install Addon" onClose={()=>{if(!busy)setStatus(null);}}><h2>Install Addon</h2><p>{status}</p><div className="dialog-actions"><button className="button primary" disabled={busy} onClick={()=>setStatus(null)}>OK</button></div></Dialog>}</SettingsSubPage>;
}

export function AddonRow({addon,index,count}:{addon:Addon;index?:number;count?:number}) {
 const [pending,setPending]=useState(false);const [error,setError]=useState('');const [removing,setRemoving]=useState(false);
 const metadata=addon as Addon & {version?:string;resources?:Array<{name:string;types:string[];idPrefixes:string[]}>;catalogCount?:number;types?:string[];idRuleCount?:number};
 async function run(action:()=>Promise<unknown>){setPending(true);setError('');try{await action();setRemoving(false);}catch(cause){setError(cause instanceof Error?cause.message:'Addon action failed.');}finally{setPending(false);}}
 const configure=()=>{const url=new URL(addon.manifestUrl);url.pathname=url.pathname.replace(/\/manifest\.json$/,'').replace(/\/$/,'')+'/configure';void run(()=>call('app.openExternal',{url:url.toString()}));};
 return <article className="settings-section addon-native-card"><div className="addon-native-heading"><span className="addon-logo"><AddonLogo addon={addon}/></span><div><h2>{addon.name}</h2>{metadata.version&&<p>Version {metadata.version}</p>}</div><label className="switch" aria-label={`Enable ${addon.name}`}><input type="checkbox" checked={addon.enabled} disabled={pending} onChange={event=>void run(()=>actions.toggleAddon(addon.id,event.target.checked))}/><span/></label></div><div className="addon-row-actions">{index!=null&&index>0&&<button className="icon-button" aria-label={`Move ${addon.name} up`} disabled={pending} onClick={()=>void run(()=>call('addons.move',{from:index,to:index-1}))}>↑</button>}{index!=null&&index<(count??0)-1&&<button className="icon-button" aria-label={`Move ${addon.name} down`} disabled={pending} onClick={()=>void run(()=>call('addons.move',{from:index,to:index+1}))}>↓</button>}<button className="icon-button" aria-label={`Refresh ${addon.name}`} disabled={pending||addon.refreshing} onClick={()=>void run(()=>call('addons.refresh',{id:addon.id}))}><RefreshCw size={23}/></button>{addon.configurable&&<button className="icon-button" aria-label={`Configure ${addon.name}`} disabled={pending} onClick={configure}><Palette size={23}/></button>}<button className="icon-button danger" aria-label={`Remove ${addon.name}`} disabled={pending} onClick={()=>setRemoving(true)}><Trash2 size={23}/></button></div><div className="addon-native-details"><div className="addon-native-badges"><span>{addon.refreshing?'Refreshing':addon.enabled?'Active':'Disabled'}</span>{metadata.resources&&<span>{metadata.resources.length} resources</span>}{metadata.catalogCount!=null&&<span>{metadata.catalogCount} catalogs</span>}{addon.configurable&&<span>Configurable</span>}</div>{addon.description&&<p>{addon.description}</p>}{metadata.types&&<p>{metadata.types.map(type=>type==='movie'?'Movie':type==='series'?'Series':type).join(' / ')} • {metadata.resources?.map(item=>item.name).join(', ')}{metadata.idRuleCount?` • ${metadata.idRuleCount} id rules`:''}</p>}{(error||addon.error)&&<InlineError message={error||addon.error||''}/>}</div>{removing&&<Dialog label="Delete Addon?" onClose={()=>setRemoving(false)}><h2>Delete Addon?</h2><p>Are you sure you want to delete {addon.name}?</p><div className="dialog-actions"><button className="button secondary" onClick={()=>setRemoving(false)}>No</button><button className="button primary" disabled={pending} onClick={()=>void run(()=>actions.removeAddon(addon.id))}>Yes</button></div></Dialog>}</article>;
}

function AddonLogo({addon}:{addon:Addon}) {
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[addon.logo]);
 if(addon.logo&&!failed)return <img src={addon.logo} alt="" onError={()=>setFailed(true)}/>;
 return <Puzzle size={36} fill="currentColor" aria-hidden="true"/>;
}

function AccountSettings() {
  const session = useSelector(current => current.session);
  const [confirm,setConfirm]=useState(false);
  const [error,setError]=useState('');
  return <SettingsSubPage title="Account"><section className="settings-section account-section"><h2>Account</h2><div className="account-info-row"><span>Status</span><strong>{session.email?'Signed in':'Anonymous'}</strong></div>{session.email&&<div className="account-info-row"><span>Email</span><strong>{session.email}</strong></div>}</section><button className="button primary full" onClick={()=>setConfirm(true)}>Sign Out</button>{error&&<InlineError message={error}/>} {confirm&&<Dialog label="Sign Out?" onClose={()=>setConfirm(false)}><h2>Sign Out?</h2><p>You will be returned to the login screen.</p><div className="dialog-actions"><button className="button secondary" onClick={()=>setConfirm(false)}>Cancel</button><button className="button primary" onClick={()=>{setConfirm(false);void actions.signOut().catch(cause=>setError(String(cause)));}}>Sign Out</button></div></Dialog>}</SettingsSubPage>;
}

function ControlRow({ title, description, checked, onChange, icon: Icon, disabled = false }: { title: string; description?: string; checked: boolean; onChange: (checked: boolean) => void; icon?: typeof Moon; disabled?: boolean }) {
  return <div className={`settings-control-row${disabled ? ' disabled' : ''}`}>{Icon && <span className="settings-icon"><Icon size={16} /></span>}<span className="settings-control-copy"><strong>{title}</strong>{description && <span>{description}</span>}</span><label className="switch" aria-label={title}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span /></label></div>;
}
function NumberSetting({ title, description, value, min, max, step = 1, suffix, onSave }: { title: string; description?: string; value: number; min: number; max: number; step?: number; suffix?: string; onSave: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <div className="settings-control-row"><span className="settings-control-copy"><strong>{title}</strong>{description && <span>{description}</span>}</span><span className="settings-number-wrap"><input className="settings-inline-number" type="number" value={draft} min={min} max={max} step={step} onChange={(event) => setDraft(event.target.value)} onBlur={() => { const next = Number(draft); if (Number.isFinite(next) && next >= min && next <= max && next !== value) onSave(next); else setDraft(String(value)); }} />{suffix && <small>{suffix}</small>}</span></div>;
}

function SettingsContent() {
  const location = useLocation();
  const path = location.pathname.replace(/^\/settings\/?/, '').replace(/\/$/, '');
  if (!path) return <SettingsRoot />;
  if (path === 'appearance') return <AppearancePage />;
  if (path === 'appearance/navigation') return <NavigationSettings />;
  if (path === 'appearance/hover-preview') return <HoverPreviewSettings />;
  if (path === 'appearance/streams') return <StreamsAppearanceSettings />;
  if (path === 'appearance/posters') return <PostersSettings />;
  if (path === 'appearance/home') return <HomeSettings />;
  if (path === 'appearance/continue-watching') return <ContinueWatchingSettings />;
  if (path === 'playback') return <PlaybackSettingsPage />;
  if (path === 'details') return <MetadataSettingsPage />;
  if (path === 'downloads') return <DownloadFiltersPage />;
  if (path === 'peer-to-peer') return <P2PSettingsPage />;
  if (path === 'content') return <ContentSettings />;
  if (path === 'content/addons') return <AddonsSettings />;
  if (path === 'content/plugins') return <PluginsSettingsPage />;
  if (path === 'integrations') return <IntegrationsLanding />;
  if (path === 'integrations/tmdb') return <TmdbSettingsPage />;
  if (path === 'integrations/mdblist') return <MdbListSettingsPage />;
  if (path === 'integrations/debrid') return <DebridSettingsPage />;
  if (path === 'integrations/simkl') return <SimklSettingsPage />;
  if (path === 'integrations/tracking') return <TrackingSettingsPage />;
  if (path === 'account') return <AccountSettings />;
  if (path === 'about') return <AboutSettingsPage />;
  if (path === 'advanced') return <AdvancedSettingsPage />;
  if (path === 'community') return <CommunitySettingsPage />;
  if (path === 'licenses') return <LicensesSettingsPage />;
  if (path === 'language') return <SettingsSubPage title="Language"><LanguageSettingsControl /></SettingsSubPage>;
  return <SettingsRoot />;
}

export function SettingsPage() { return <SettingsLayout><SettingsContent /></SettingsLayout>; }
