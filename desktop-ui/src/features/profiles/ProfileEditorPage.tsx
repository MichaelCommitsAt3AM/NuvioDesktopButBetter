import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, LockKeyhole, Save, Shield, Sparkles, UserRound, WandSparkles, X } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Avatar, PageHeader } from '../../components/ui';
import { Dialog } from '../../components/Dialog';
import { InlineError } from '../../components/Status';
import { useProfiles, type AvatarChoice, type ProfileRecord } from './profileStore';

const defaultColor = '#1E88E5';

export function ProfileEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editingId = id ? Number(id) : null;
  const { snapshot, loading, error, refresh, run, setError } = useProfiles();
  const profile = snapshot?.items.find((item) => item.id === editingId) ?? null;
  const [name, setName] = useState('');
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [color, setColor] = useState(defaultColor);
  const [backgroundId, setBackgroundId] = useState<string | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [usesPrimaryAddons, setUsesPrimaryAddons] = useState(false);
  const [allowlistText, setAllowlistText] = useState('');
  const [saving, setSaving] = useState(false);
  const [pinAction, setPinAction] = useState<'set' | 'clear' | null>(null);
  const avatars = snapshot?.avatars ?? [];
  const selectedAvatar = useMemo(() => avatars.find((avatar) => avatar.id === avatarId) ?? null, [avatars, avatarId]);
  const safeAvatarUrl = avatarUrl.trim();
  const urlInvalid = safeAvatarUrl.length > 0 && !/^https?:\/\//i.test(safeAvatarUrl);

  useEffect(() => {
    if (!snapshot) return;
    if (editingId !== null && !profile) return;
    setName(profile?.name ?? '');
    setAvatarId(profile?.avatarId ?? null);
    setAvatarUrl(profile?.avatarUrl ?? '');
    setColor(profile?.avatarColorHex ?? avatars[0]?.color ?? defaultColor);
    setBackgroundId(profile?.backgroundId ?? null);
    setBackgroundUrl(profile?.backgroundUrl ?? '');
    setUsesPrimaryAddons(profile?.usesPrimaryAddons ?? false);
    setAllowlistText(profile?.primaryAddonsAllowlist?.join('\n') ?? '');
  }, [snapshot, editingId, profile?.id]);

  function chooseAvatar(avatar: AvatarChoice) {
    if (avatar.memberOnly) return;
    setAvatarId(avatar.id); setAvatarUrl('');
    if (avatar.color) setColor(avatar.color);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || urlInvalid) return;
    setSaving(true); setError('');
    const params: Record<string, unknown> = {
      ...(editingId !== null ? { id: editingId } : {}),
      name: name.trim(),
      avatarColorHex: color,
      avatarId: safeAvatarUrl ? null : avatarId,
      avatarUrl: safeAvatarUrl || null,
      backgroundId,
      backgroundUrl: backgroundUrl.trim() || null,
      usesPrimaryAddons,
      usesPrimaryPlugins: profile?.usesPrimaryPlugins ?? false,
      primaryAddonsAllowlist: usesPrimaryAddons ? allowlistText.split(/[\n,]/).map((value) => value.trim()).filter(Boolean) : null,
    };
    try {
      await run(editingId === null ? 'profiles.create' : 'profiles.update', params);
      navigate('/profiles');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save profile.'); }
    finally { setSaving(false); }
  }
  const visibleAvatarUrl = safeAvatarUrl || selectedAvatar?.url || null;
  const preview: ProfileRecord = profile ?? { id: 0, name: name || 'New profile', avatarColorHex: color, avatarId, avatarUrl: safeAvatarUrl || null, backgroundId, backgroundUrl: backgroundUrl || null, locked: false, pinLockedUntil: null, usesPrimaryAddons, usesPrimaryPlugins: false, primaryAddonsAllowlist: null };

  if (loading && !snapshot) return <div className="loading-block"><span className="spin" /> Loading profile settings…</div>;
  if (editingId !== null && snapshot && !profile) return <div className="page profiles-page"><PageHeader title="Profile not found" action={<Link className="button secondary" to="/profiles"><ArrowLeft size={15} /> Profiles</Link>} /><p className="muted">This profile may have been removed.</p></div>;

  return <div className="page profile-editor-page">
    <PageHeader title={editingId === null ? 'Create profile' : 'Edit profile'} subtitle={editingId === null ? 'Choose a name and avatar for this profile.' : 'Personalize your profile and set its privacy options.'} action={<Link className="button secondary" to="/profiles"><ArrowLeft size={15} /> All profiles</Link>} />
    {error && <InlineError message={error} onRetry={() => { void refresh(); }} />}
    <form className="profile-editor-form" onSubmit={(event) => void save(event)}>
      <section className="profile-editor-identity settings-section">
        <div className="profile-preview"><Avatar profile={{ id: preview.id, name: preview.name, color: preview.avatarColorHex, avatarUrl: visibleAvatarUrl, locked: preview.locked }} size="lg" /><span className="profile-preview-caption">Profile preview</span></div>
        <div className="profile-identity-fields">
          <label>Profile name<input autoFocus maxLength={32} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Family" required /></label>
          <label className="color-field">Accent color<span><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /><code>{color.toUpperCase()}</code></span></label>
        </div>
      </section>

      <section className="settings-section avatar-picker-section">
        <div className="settings-section-heading"><span className="settings-icon"><UserRound size={18} /></span><div><h2>Choose an avatar</h2><p>Pick a character image or use your own secure image URL.</p></div></div>
        {avatars.length ? <div className="avatar-choice-grid">{avatars.map((avatar) => <button key={avatar.id} type="button" className={`avatar-choice ${avatarId === avatar.id && !safeAvatarUrl ? 'selected' : ''} ${avatar.memberOnly ? 'member-only' : ''}`} disabled={avatar.memberOnly} onClick={() => chooseAvatar(avatar)} title={avatar.memberOnly ? `${avatar.name} is a member avatar` : avatar.name}>
          <span className="avatar-choice-image" style={{ background: avatar.color ?? '#30343a' }}>{avatar.url ? <img src={avatar.url} alt="" /> : avatar.name.slice(0, 1).toUpperCase()}</span><span>{avatar.name || avatar.id}</span>{avatar.memberOnly ? <small>Member</small> : avatarId === avatar.id && <Check size={14} />}
        </button>)}</div> : <p className="muted">Avatar choices are not available right now.</p>}
        <label className="profile-url-field">Custom avatar image URL<input type="url" value={avatarUrl} onChange={(event) => { setAvatarUrl(event.target.value); if (event.target.value) setAvatarId(null); }} placeholder="https://example.com/avatar.png" /></label>
        {urlInvalid && <p className="form-error">Use a valid http or https image URL.</p>}
      </section>

      {(snapshot?.backgrounds.length ?? 0) > 0 && <section className="settings-section background-picker-section">
        <div className="settings-section-heading"><span className="settings-icon"><Sparkles size={18} /></span><div><h2>Profile background</h2><p>Choose a backdrop from the available profile collection.</p></div></div>
        <div className="background-choice-grid"><button type="button" className={`background-choice ${backgroundId === null ? 'selected' : ''}`} onClick={() => { setBackgroundId(null); setBackgroundUrl(''); }}><span className="background-preview plain" /><span>Use theme background</span></button>{snapshot?.backgrounds.map((background) => <button type="button" key={background.id} className={`background-choice ${backgroundId === background.id ? 'selected' : ''}`} onClick={() => { setBackgroundId(background.id); setBackgroundUrl(background.url ?? ''); }}><span className="background-preview" style={background.url ? { backgroundImage: `url(${background.url})` } : undefined}><WandSparkles size={16} /></span><span>{background.name}</span></button>)}</div>
        <label className="profile-url-field">Custom background image URL<input type="url" value={backgroundUrl} onChange={(event) => { setBackgroundUrl(event.target.value); if (event.target.value) setBackgroundId(null); }} placeholder="https://example.com/background.jpg" /></label>
      </section>}

      <section className="settings-section profile-sharing-section">
        <div className="settings-section-heading"><span className="settings-icon"><Shield size={18} /></span><div><h2>Content and privacy</h2><p>Keep profile add-ons personal or reuse your primary profile setup.</p></div></div>
        <div className="settings-row-card"><span className="settings-row-copy"><strong>Use primary profile add-ons</strong><span>Share the add-ons installed on your primary profile.</span></span><label className="switch" aria-label="Use primary profile addons"><input type="checkbox" checked={usesPrimaryAddons} onChange={(event) => setUsesPrimaryAddons(event.target.checked)} /><span /></label></div>
        {usesPrimaryAddons && <label className="profile-url-field">Add-on allowlist <small>Leave blank to use all primary profile add-ons. Enter manifest IDs, one per line.</small><textarea value={allowlistText} onChange={(event) => setAllowlistText(event.target.value)} rows={3} placeholder="com.example.catalog" /></label>}
      </section>

      {profile && <section className="settings-section profile-pin-section">
        <div className="settings-section-heading"><span className="settings-icon"><LockKeyhole size={18} /></span><div><h2>Profile PIN</h2><p>{profile.locked ? 'A PIN is required before anyone can switch to this profile.' : 'Protect this profile with a four digit PIN.'}</p></div></div>
        <button type="button" className={profile.locked ? 'button secondary' : 'button secondary'} onClick={() => setPinAction(profile.locked ? 'clear' : 'set')}>{profile.locked ? <X size={15} /> : <LockKeyhole size={15} />}{profile.locked ? 'Remove PIN' : 'Set a PIN'}</button>
      </section>}

      <div className="profile-editor-footer"><span>{editingId === null ? 'You can change these details later.' : `Profile ${profile?.id ?? ''}`}</span><button className="button primary" disabled={saving || !name.trim() || urlInvalid}>{saving ? <span className="spin" /> : <Save size={15} />}{saving ? 'Saving…' : editingId === null ? 'Create profile' : 'Save changes'}</button></div>
    </form>
    {pinAction && profile && <PinDialog action={pinAction} profile={profile} onClose={() => setPinAction(null)} onDone={async (method, params) => { await run(method, params); setPinAction(null); }} />}
  </div>;
}

function PinDialog({ action, profile, onClose, onDone }: { action: 'set' | 'clear'; profile: ProfileRecord; onClose: () => void; onDone: (method: string, params: Record<string, unknown>) => Promise<void> }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (profile.locked && action === 'set' && currentPin.length !== 4) { setError('Enter the current four digit PIN.'); return; }
    if (action === 'clear' && usePassword && !accountPassword) { setError('Enter your account password.'); return; }
    if (action === 'clear' && profile.locked && !usePassword && currentPin.length !== 4) { setError('Enter the current four digit PIN.'); return; }
    if (action === 'set' && (!/^\d{4}$/.test(pin) || pin !== confirm)) { setError(pin !== confirm ? 'The PINs do not match.' : 'Enter a four digit PIN.'); return; }
    setBusy(true);
    try {
      const method = action === 'clear' && usePassword ? 'profiles.pin.clearWithPassword' : `profiles.pin.${action}`;
      const params = action === 'set' ? { id: profile.id, pin, ...(profile.locked ? { currentPin } : {}) } : usePassword ? { id: profile.id, accountPassword } : { id: profile.id, ...(profile.locked ? { currentPin } : {}) };
      await onDone(method, params);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update the profile PIN.'); }
    finally { setBusy(false); }
  }
  return <Dialog label={action === 'set' ? 'Set profile PIN' : 'Remove profile PIN'} onClose={onClose}><form onSubmit={(event) => void submit(event)}>
    <div className="dialog-head"><strong>{action === 'set' ? `Protect ${profile.name}` : `Remove PIN for ${profile.name}`}</strong><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
    <p className="muted">{action === 'set' ? 'Choose a four digit code that is easy for you to remember.' : 'Anyone with access to this account will be able to open this profile.'}</p>
    {profile.locked && (!usePassword || action === 'set') && <label>Current PIN<input autoFocus inputMode="numeric" type={visible ? 'text' : 'password'} autoComplete="off" maxLength={4} value={currentPin} onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, ''))} /></label>}
    {action === 'clear' && profile.locked && <button type="button" className="text-button" onClick={() => { setUsePassword((value) => !value); setError(''); }}>{usePassword ? 'Use the profile PIN instead' : 'Use account password instead'}</button>}
    {action === 'clear' && profile.locked && usePassword && <label>Account password<input autoFocus type="password" autoComplete="current-password" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} /></label>}
    {action === 'set' && <><label>New PIN<span className="password-input-wrap"><input autoFocus={!profile.locked} inputMode="numeric" type={visible ? 'text' : 'password'} autoComplete="new-password" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} /><button type="button" className="icon-button" onClick={() => setVisible((current) => !current)} aria-label={visible ? 'Hide PIN' : 'Show PIN'}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label><label>Confirm PIN<input inputMode="numeric" type={visible ? 'text' : 'password'} autoComplete="new-password" maxLength={4} value={confirm} onChange={(event) => setConfirm(event.target.value.replace(/\D/g, ''))} /></label></>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : action === 'set' ? 'Set PIN' : 'Remove PIN'}</button></div>
  </form></Dialog>;
}
