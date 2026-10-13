import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, LockKeyhole, Save, Shield, Sparkles, Trash2, UserRound, WandSparkles, X } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Avatar, PageHeader } from '../../components/ui';
import { Dialog } from '../../components/Dialog';
import { ProfilePinManager } from './PinDialogs';
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
  const [syncAddons, setSyncAddons] = useState(false);
  const [addonSyncProfileId, setAddonSyncProfileId] = useState<number | null>(null);
  const availableProfiles = (snapshot?.items ?? []).filter((item) => item.id !== editingId);
  const validAddonSource = !syncAddons || availableProfiles.some((item) => item.id === addonSyncProfileId);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
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
    setSyncAddons(profile?.addonSyncProfileId != null);
    setAddonSyncProfileId(profile?.addonSyncProfileId ?? null);
  }, [snapshot, editingId, profile?.id]);

  function chooseAvatar(avatar: AvatarChoice) {
    if (avatar.memberOnly) return;
    setAvatarId(avatar.id); setAvatarUrl('');
    if (avatar.color) setColor(avatar.color);
  }
  async function removeProfile() {
    if (!profile || profile.id <= 1 || deleting || saving) return;
    setDeleting(true); setDeleteError('');
    try { await run('profiles.delete', { id: profile.id }); navigate('/profiles'); }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : 'Could not delete profile.'); }
    finally { setDeleting(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || urlInvalid || !validAddonSource) return;
    setSaving(true); setError('');
    const params: Record<string, unknown> = {
      ...(editingId !== null ? { id: editingId } : {}),
      name: name.trim(),
      avatarColorHex: color,
      avatarId: safeAvatarUrl ? null : avatarId,
      avatarUrl: safeAvatarUrl || null,
      backgroundId,
      backgroundUrl: backgroundUrl.trim() || null,
      usesPrimaryAddons: false,
      addonSyncProfileId: syncAddons ? addonSyncProfileId : null,
      usesPrimaryPlugins: profile?.usesPrimaryPlugins ?? false,
      primaryAddonsAllowlist: null,
    };
    try {
      await run(editingId === null ? 'profiles.create' : 'profiles.update', params);
      navigate('/profiles');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save profile.'); }
    finally { setSaving(false); }
  }
  const visibleAvatarUrl = safeAvatarUrl || selectedAvatar?.url || null;
  const preview: ProfileRecord = profile ?? { id: 0, name: name || 'New profile', avatarColorHex: color, avatarId, avatarUrl: safeAvatarUrl || null, backgroundId, backgroundUrl: backgroundUrl || null, locked: false, pinLockedUntil: null, usesPrimaryAddons: false, usesPrimaryPlugins: false, primaryAddonsAllowlist: null };

  if (loading && !snapshot) return <div className="loading-block"><span className="spin" /> Loading profile settingsâ€¦</div>;
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
        <div className="settings-section-heading"><span className="settings-icon"><Shield size={18} /></span><div><h2>Content and privacy</h2><p>Keep add-ons separate or sync them with another profile.</p></div></div>
        <div className="settings-row-card"><span className="settings-row-copy"><strong>Sync add-ons with another profile</strong><span>Keep additions, removals, and add-on settings in sync between both profiles.</span></span><label className="switch" aria-label="Sync add-ons with another profile"><input type="checkbox" checked={syncAddons} disabled={!availableProfiles.length} onChange={(event) => setSyncAddons(event.target.checked)} /><span /></label></div>
        {!availableProfiles.length && <p className="muted">Create another profile to enable add-on syncing.</p>}
        {syncAddons && <label className="profile-url-field">Sync with profile<select value={addonSyncProfileId ?? ''} onChange={(event) => setAddonSyncProfileId(event.target.value ? Number(event.target.value) : null)} required><option value="" disabled>Select a profile</option>{availableProfiles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><small>This profile will use the selected profile's current add-ons. Future changes from either profile are shared. Turning sync off keeps the current add-ons.</small></label>}
      </section>

      {profile && <section className="settings-section profile-pin-section">
        <div className="settings-section-heading"><span className="settings-icon"><LockKeyhole size={18} /></span><div><h2>Profile PIN</h2><p>{profile.locked ? 'A PIN is required before anyone can switch to this profile.' : 'Protect this profile with a four digit PIN.'}</p></div></div>
        <button type="button" className={profile.locked ? 'button secondary' : 'button secondary'} onClick={() => setPinAction(profile.locked ? 'clear' : 'set')}>{profile.locked ? <X size={15} /> : <LockKeyhole size={15} />}{profile.locked ? 'Remove PIN' : 'Set a PIN'}</button>
      </section>}

      <div className="profile-editor-footer"><span>{editingId === null ? 'You can change these details later.' : `Profile ${profile?.id ?? ''}`}</span><button className="button primary" disabled={saving || !name.trim() || urlInvalid || !validAddonSource}>{saving ? <span className="spin" /> : <Save size={15} />}{saving ? 'Savingâ€¦' : editingId === null ? 'Create profile' : 'Save changes'}</button></div>
    </form>
    {profile && profile.id > 1 && <button type="button" className="button destructive" disabled={saving || deleting} onClick={() => { setDeleteError(''); setConfirmDelete(true); }}><Trash2 size={15} />Delete profile</button>}
    {confirmDelete && profile && <Dialog label={`Delete ${profile.name}`} onClose={() => { if (!deleting) setConfirmDelete(false); }}><div className="dialog-head"><strong>Delete {profile.name}?</strong></div><p className="muted">This permanently removes this profile and its profile-specific settings.</p>{deleteError && <p className="form-error" role="alert">{deleteError}</p>}<div className="dialog-actions"><button type="button" className="button secondary" disabled={deleting} onClick={() => setConfirmDelete(false)}>Cancel</button><button type="button" className="button destructive" disabled={deleting} onClick={() => void removeProfile()}><Trash2 size={15} />{deleting ? 'Deleting…' : 'Delete profile'}</button></div></Dialog>}
    {pinAction && profile && <ProfilePinManager action={pinAction} profile={profile} onClose={() => setPinAction(null)} onDone={() => setPinAction(null)} />}
  </div>;
}
