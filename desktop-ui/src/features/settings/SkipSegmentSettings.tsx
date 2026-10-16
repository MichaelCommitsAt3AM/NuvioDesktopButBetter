import { useState } from 'react';
import { Check, ChevronRight, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import './playbackSettings.css';

export type SkipPreferences = {
  skipIntroEnabled: boolean; autoSkipSegmentTypes: string[]; animeSkipEnabled: boolean;
  animeSkipClientId: string; introDbApiKey: string; introSubmitEnabled: boolean;
};
const segmentOptions = [
  { key: 'INTRO', label: 'Intro / Opening', description: 'Skip intros and anime openings automatically.' },
  { key: 'RECAP', label: 'Recap', description: 'Skip recap segments automatically.' },
  { key: 'OUTRO', label: 'Outro / Ending', description: 'Skip outros and anime endings automatically.' },
  { key: 'MOVIE_CREDITS', label: 'End Credits', description: 'Skip movie credits, keeping post-credits scenes.' },
];

export function SkipSegmentSettings({ preferences, run }: { preferences: SkipPreferences; run: (method: string, params: Record<string, unknown>) => Promise<void> }) {
  const [dialog, setDialog] = useState<'segments' | 'animeSkipClientId' | 'introDbApiKey' | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const summary = segmentOptions.filter(option => preferences.autoSkipSegmentTypes.includes(option.key)).map(option => option.label).join(', ') || 'Off';
  async function save(method: string, params: Record<string, unknown>): Promise<boolean> {
    setBusy(true); setDialogError('');
    try { await run(method, params); return true; }
    catch (cause) { setDialogError(cause instanceof Error ? cause.message : 'Could not save this setting.'); return false; }
    finally { setBusy(false); }
  }
  const set = (key: string, value: boolean) => { void save('playbackSettings.set', { key, value }); };
  return <>
    <h2 className="settings-group-title">Skip Segments</h2>
    <section className="skip-segments-group" aria-label="Skip Segments">
      <SkipToggle title="Skip Intro" description="Use introdb.app to detect intros and recaps." checked={preferences.skipIntroEnabled} busy={busy} onChange={value => set('skipIntroEnabled', value)} />
      <SkipNavigation title="Automatic Skipping" description={summary} disabled={busy || !preferences.skipIntroEnabled} onClick={() => { setDialogError(''); setDialog('segments'); }} />
      <SkipToggle title="Anime Skip" description="Also search AnimeSkip for skip timestamps (requires client ID)." checked={preferences.animeSkipEnabled} busy={busy} onChange={value => set('animeSkipEnabled', value)} />
      {preferences.animeSkipEnabled && <SkipNavigation title="AnimeSkip Client ID" description={preferences.animeSkipClientId || 'Not set'} disabled={busy} onClick={() => { setDialogError(''); setDialog('animeSkipClientId'); }} />}
      <SkipToggle title="Enable Intro Submission" description="Show a button to submit intro/outro timestamps to the community database." checked={preferences.introSubmitEnabled} busy={busy} onChange={value => set('introSubmitEnabled', value)} />
      {preferences.introSubmitEnabled && <SkipNavigation title="IntroDB API Key" description={preferences.introDbApiKey || 'Not set'} disabled={busy} onClick={() => { setDialogError(''); setDialog('introDbApiKey'); }} />}
    </section>
    {dialog === 'segments' && <Dialog label="Automatic Skipping" className="skip-selection-dialog" onClose={() => setDialog(null)}><h2>Automatic Skipping</h2><div className="skip-selection-options">{segmentOptions.map(option => {
      const selected = preferences.autoSkipSegmentTypes.includes(option.key);
      return <button type="button" role="checkbox" aria-checked={selected} disabled={busy} key={option.key} onClick={() => { void save('playbackSettings.setAutoSkipType', { type: option.key, enabled: !selected }); }}><span><strong>{option.label}</strong><small>{option.description}</small></span>{selected && <Check size={22} />}</button>;
    })}</div>{dialogError && <p className="skip-credential-error" role="alert">{dialogError}</p>}<div className="skip-dialog-actions"><button type="button" onClick={() => setDialog(null)}>Done</button></div></Dialog>}
    {dialog && dialog !== 'segments' && <SkipCredentialDialog key={dialog} credential={dialog} initialValue={preferences[dialog] ?? ''} onClose={() => setDialog(null)} onSave={(key, value) => save('playbackSettings.saveSkipCredential', { key, value })} />}
  </>;
}
function SkipToggle({ title, description, checked, busy, onChange }: { title: string; description: string; checked: boolean; busy: boolean; onChange: (value: boolean) => void }) {
  return <label className="skip-setting-row"><span><strong>{title}</strong><small>{description}</small></span><span className="switch"><input type="checkbox" aria-label={title} checked={checked} disabled={busy} onChange={event => onChange(event.target.checked)} /><span /></span></label>;
}
function SkipNavigation({ title, description, disabled, onClick }: { title: string; description: string; disabled: boolean; onClick: () => void }) {
  return <button type="button" className="skip-setting-row" disabled={disabled} onClick={onClick}><span><strong>{title}</strong><small>{description}</small></span><ChevronRight size={24} /></button>;
}
function SkipCredentialDialog({ credential, initialValue, onClose, onSave }: { credential: 'animeSkipClientId' | 'introDbApiKey'; initialValue: string; onClose: () => void; onSave: (key: string, value: string) => Promise<boolean> }) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const introDb = credential === 'introDbApiKey';
  const title = introDb ? 'IntroDB API Key' : 'AnimeSkip Client ID';
  async function save() {
    const trimmed = value.trim();
    if (introDb && trimmed !== '' && trimmed === initialValue) { onClose(); return; }
    setSaving(true); setError('');
    const success = await onSave(credential, trimmed);
    setSaving(false);
    if (success) onClose(); else setError(introDb ? 'Invalid API Key or connection failed' : 'Could not save client ID.');
  }
  return <Dialog label={title} className="skip-selection-dialog" onClose={() => { if (!saving) onClose(); }}><h2>{title}</h2><p className="skip-credential-description">{introDb ? 'Enter your IntroDB API key to submit timestamps. Required for submission.' : 'Enter your AnimeSkip API client ID. Get one at anime-skip.com.'}</p><div className={introDb ? 'skip-secret-field' : ''}>{introDb && <span className="skip-secret-label">{title}</span>}<input className="skip-credential-input" type={introDb && !visible ? 'password' : 'text'} aria-label={title} aria-invalid={!!error} value={value} disabled={saving} autoComplete="off" onChange={event => { setValue(event.target.value); setError(''); }} />{introDb && <button type="button" disabled={saving} aria-label={visible ? 'Hide API key' : 'Show API key'} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={22} /> : <Eye size={22} />}</button>}</div>{error && <p className="skip-credential-error" role="alert">{error}</p>}<div className="skip-dialog-actions"><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={saving} onClick={() => { void save(); }}>{saving ? <LoaderCircle size={20} className="spin" aria-label="Verifying" /> : 'Save'}</button></div></Dialog>;
}
