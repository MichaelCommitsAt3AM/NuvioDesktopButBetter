import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ChevronDown, Maximize, Shield, Trash2, UserRound, WandSparkles } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/ui';
import { Dialog } from '../../components/Dialog';
import { ProfilePinManager } from './PinDialogs';
import { InlineError } from '../../components/Status';
import { useProfiles, type AvatarChoice } from './profileStore';
import { call } from '../../bridge';
import './profileSharing.css';
import './profileEditorParity.css';

const defaultColor = '#1E88E5';
const kidsServiceUrl = 'https://kids-screen.vercel.app';
type CopyAddon = { url: string; name: string; enabled: boolean };

export function ProfileEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editingId = id ? Number(id) : null;
  const isEditing = editingId !== null;
  const { snapshot, loading, error, refresh, run, setError } = useProfiles();
  const profile = snapshot?.items.find((item) => item.id === editingId) ?? null;
  const initializedForm = useRef<number | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [color, setColor] = useState(defaultColor);
  const [backgroundId, setBackgroundId] = useState<string | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [syncAddons, setSyncAddons] = useState(false);
  const [kidsEnabled, setKidsEnabled] = useState(false);
  const [kidsMaxRating, setKidsMaxRating] = useState('G');
  const [kidsApiKey, setKidsApiKey] = useState('');
  const savedProfileId = useRef<number | null>(null);
  const [addonSyncProfileId, setAddonSyncProfileId] = useState<number | null>(null);
  const [syncAllAddons, setSyncAllAddons] = useState(true);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [copyAddons, setCopyAddons] = useState<CopyAddon[]>([]);
  const [copyUrls, setCopyUrls] = useState<string[]>([]);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [copyLoadedSource, setCopyLoadedSource] = useState<number | null>(null);
  const [copyRetry, setCopyRetry] = useState(0);
  const availableProfiles = (snapshot?.items ?? []).filter((item) => item.id !== editingId);
  const validAddonSource = !syncAddons || availableProfiles.some((item) => item.id === addonSyncProfileId);
  const copyReady = !syncAddons || (!isEditing && syncAllAddons) || (!copyLoading && !copyError && copyLoadedSource === addonSyncProfileId && (!isEditing || copyUrls.length > 0));
  const [saving, setSaving] = useState(false);
  const [creationIncomplete, setCreationIncomplete] = useState(false);
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
    // Background cosmetic/profile snapshots must not erase an in-progress edit.
    if (initializedForm.current === editingId) return;
    initializedForm.current = editingId;
    setName(profile?.name ?? '');
    setAvatarId(profile?.avatarId ?? null);
    setAvatarUrl(profile?.avatarUrl ?? '');
    setColor(profile?.avatarColorHex ?? avatars[0]?.color ?? defaultColor);
    setBackgroundId(profile?.backgroundId ?? null);
    setBackgroundUrl(profile?.backgroundUrl ?? '');
    setSyncAddons(false);
    setAddonSyncProfileId(null);
    setSyncAllAddons(!isEditing && !profile?.kidsEnabled);
    setKidsEnabled(profile?.kidsEnabled ?? false);
    setKidsMaxRating(profile?.kidsMaxRating ?? 'G');
    savedProfileId.current = editingId;
  }, [snapshot, editingId, profile?.id]);

  useEffect(() => {
    setCopyLoadedSource(null); setCopyAddons([]); setCopyUrls([]); setCopyError('');
    if (!syncAddons || (!isEditing && syncAllAddons) || addonSyncProfileId === null) { setCopyLoading(false); return; }
    let cancelled = false;
    setCopyLoading(true);
    void call<CopyAddon[]>('profiles.addons.snapshot', { id: addonSyncProfileId }).then(items => {
      if (cancelled) return;
      setCopyAddons(items); setCopyUrls(items.map(item => item.url)); setCopyLoadedSource(addonSyncProfileId);
    }).catch(cause => { if (!cancelled) setCopyError(cause instanceof Error ? cause.message : 'Could not load source add-ons.'); })
      .finally(() => { if (!cancelled) setCopyLoading(false); });
    return () => { cancelled = true; };
  }, [syncAddons, syncAllAddons, addonSyncProfileId, copyRetry, isEditing]);

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
    if (!name.trim() || urlInvalid || !validAddonSource || !copyReady || saving || creationIncomplete) return;
    setSaving(true); setError('');
    const kidsChanged = kidsEnabled !== !!profile?.kidsEnabled || (kidsEnabled && (kidsMaxRating !== (profile?.kidsMaxRating ?? 'G') || kidsServiceUrl !== (profile?.kidsServiceUrl ?? kidsServiceUrl) || !!kidsApiKey.trim()));
    if (kidsEnabled && (kidsChanged || !profile?.kidsEnabled) && !kidsApiKey.trim() && (!profile?.kidsEnabled || kidsMaxRating !== profile.kidsMaxRating || kidsServiceUrl !== profile.kidsServiceUrl)) { setError('Enter your TMDB API key to set up this kids profile.'); setSaving(false); return; }
    const targetId = savedProfileId.current ?? editingId;
    const params: Record<string, unknown> = {
      ...(targetId !== null ? { id: targetId } : {}),
      name: name.trim(),
      avatarColorHex: color,
      avatarId: safeAvatarUrl ? null : avatarId,
      avatarUrl: safeAvatarUrl || null,
      backgroundId,
      backgroundUrl: backgroundUrl.trim() || null,
      usesPrimaryAddons: isEditing && !syncAddons && !kidsEnabled ? profile?.usesPrimaryAddons ?? false : false,
      ...(!isEditing || syncAddons || kidsEnabled ? { addonSyncProfileId: !isEditing && syncAddons && syncAllAddons && !kidsEnabled ? addonSyncProfileId : null } : {}),
      ...(syncAddons && (isEditing || !syncAllAddons) ? { addonCopyProfileId: addonSyncProfileId, addonCopyUrls: copyUrls } : {}),
      usesPrimaryPlugins: profile?.usesPrimaryPlugins ?? false,
      primaryAddonsAllowlist: isEditing && !syncAddons && !kidsEnabled ? profile?.primaryAddonsAllowlist ?? null : null,
    };
    try {
      const result = await run(targetId === null ? 'profiles.create' : 'profiles.update', params);
      const finalId = targetId ?? result?.items.find(item => !snapshot?.items.some(existing => existing.id === item.id))?.id;
      if (finalId != null) savedProfileId.current = finalId;
      if (kidsChanged) {
        if (finalId == null) throw new Error('Profile was saved. Open All profiles to finish kids setup.');
        await run('profiles.kids.configure', { id: finalId, enabled: kidsEnabled, maxRating: kidsMaxRating, serviceUrl: kidsServiceUrl, apiKey: kidsApiKey.trim() });
        setKidsApiKey('');
      }
      navigate('/profiles');
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'PROFILE_CREATED_ADDON_COPY_FAILED') setCreationIncomplete(true);
      setError(cause instanceof Error ? cause.message : 'Could not save profile.');
    }
    finally { setSaving(false); }
  }
  const visibleAvatarUrl = safeAvatarUrl || selectedAvatar?.url || null;

  if (loading && !snapshot) return <div className="loading-block"><span className="spin" /> Loading profile settingsâ€¦</div>;
  if (editingId !== null && snapshot && !profile) return <div className="page profiles-page"><PageHeader title="Profile not found" action={<Link className="button secondary" to="/profiles"><ArrowLeft size={15} /> Profiles</Link>} /><p className="muted">This profile may have been removed.</p></div>;

  return <div className="page profile-editor-page">
    <header className="profile-screen-header"><Link to="/profiles" className="profile-screen-back" aria-label="All profiles"><ArrowLeft size={24} /></Link><h1>{isEditing ? 'Edit Profile' : 'Add Profile'}</h1><button type="button" className="profile-screen-fullscreen" aria-label="Toggle fullscreen" onClick={() => { const appWindow = getCurrentWindow(); void appWindow.isFullscreen().then(fullscreen => appWindow.setFullscreen(!fullscreen)).catch(() => {}); }}><Maximize size={24} /></button></header>
    {error && <InlineError message={error} onRetry={() => { void refresh(); }} />}
    <form className="profile-editor-form" onSubmit={(event) => void save(event)}>
      <section className="profile-editor-identity settings-section">
        <div className="profile-identity-summary">
          <div className={`profile-identity-avatar ${visibleAvatarUrl ? 'has-image' : ''}`} style={{ '--profile-accent': color } as React.CSSProperties}>{visibleAvatarUrl ? <img src={visibleAvatarUrl} alt={name || 'Profile avatar'} /> : name.trim() ? <span>{name.trim().slice(0, 1).toUpperCase()}</span> : <UserRound size={40} />}</div>
          <div className="profile-identity-description"><strong>{name.trim() || (isEditing ? 'Unnamed profile' : 'New profile')}</strong><span>{isEditing ? `Profile ${editingId}` : 'New profile'}</span><span>{safeAvatarUrl ? 'Custom avatar selected.' : selectedAvatar ? `Avatar: ${selectedAvatar.name}` : avatars.length ? 'Choose an avatar below.' : 'Avatar options are loading.'}</span></div>
        </div>
        <input className="profile-name-input" aria-label="Profile name" autoFocus maxLength={32} value={name} onChange={(event) => setName(event.target.value)} placeholder="Profile name" required />
        {!isEditing && <>
        <div className="profile-option-row"><span className="profile-option-copy"><strong>{isEditing ? 'Import add-ons from another profile' : 'Sync add-ons with another profile'}</strong><span>{isEditing ? 'Import selected add-ons once. Keep your existing add-ons, their settings, and their order.' : kidsEnabled ? 'Copy playback providers once. KidsScreen supplies all browsing catalogs and search.' : 'Keep additions, removals, and add-on settings in sync between both profiles.'}</span></span><label className="switch" aria-label={isEditing ? 'Import add-ons from another profile' : 'Sync add-ons with another profile'}><input type="checkbox" checked={syncAddons} disabled={!availableProfiles.length} onChange={(event) => setSyncAddons(event.target.checked)} /><span /></label></div>
        {!availableProfiles.length && <p className="muted">Create another profile to {isEditing ? 'import add-ons' : 'enable add-on syncing'}.</p>}
        </>}
        <label className="profile-accent-row"><span>Accent color</span><input aria-label="Accent color" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
      </section>
      {(isEditing || syncAddons) && <section className="settings-section profile-sharing-section">
        <h2>{isEditing ? 'Import add-ons' : 'Add-on selection'}</h2>
        {isEditing && <>
        <div className="profile-option-row"><span className="profile-option-copy"><strong>{isEditing ? 'Import add-ons from another profile' : 'Sync add-ons with another profile'}</strong><span>{isEditing ? 'Import selected add-ons once. Keep your existing add-ons, their settings, and their order.' : kidsEnabled ? 'Copy playback providers once. KidsScreen supplies all browsing catalogs and search.' : 'Keep additions, removals, and add-on settings in sync between both profiles.'}</span></span><label className="switch" aria-label={isEditing ? 'Import add-ons from another profile' : 'Sync add-ons with another profile'}><input type="checkbox" checked={syncAddons} disabled={!availableProfiles.length} onChange={(event) => setSyncAddons(event.target.checked)} /><span /></label></div>
        {!availableProfiles.length && <p className="muted">Create another profile to {isEditing ? 'import add-ons' : 'enable add-on syncing'}.</p>}
        </>}
        {syncAddons && <>
        {isEditing && <p className="muted">Only new add-ons are added. Existing add-ons are never removed or overwritten.</p>}
        {isEditing && profile?.addonSyncProfileId != null && <p className="muted">Importing will keep this profile’s current add-ons and turn off its ongoing sync with {availableProfiles.find(item => item.id === profile.addonSyncProfileId)?.name ?? 'the linked profile'}.</p>}
        <button type="button" className="profile-option-row profile-source-picker" aria-haspopup="dialog" onClick={() => setSourcePickerOpen(true)}><span className="profile-option-copy"><strong>{isEditing ? 'Import from profile' : 'Sync with profile'}</strong><span>{availableProfiles.find(item => item.id === addonSyncProfileId)?.name ?? 'Select a profile'}</span></span><ChevronDown size={18} /></button>
        {!isEditing && <div className="profile-option-row"><span className="profile-option-copy"><strong>Sync all add-ons</strong><span>{kidsEnabled ? 'Kids profiles use an independent copy. Catalogs from Cinemeta, AIOMetadata and other copied providers are excluded from browsing.' : syncAllAddons ? 'Keep all add-ons and future changes in sync.' : 'Copy selected add-ons once. Future changes will not be synced.'}</span></span><label className="switch" aria-label="Sync all add-ons"><input type="checkbox" checked={syncAllAddons} disabled={kidsEnabled} onChange={event => setSyncAllAddons(event.target.checked)} /><span /></label></div>}
        {(isEditing || !syncAllAddons) && <div className="profile-addon-copy">
          <p className="muted">{isEditing ? 'Choose the add-ons to import. Existing add-ons keep their current names and enabled settings.' : 'Choose the add-ons to copy into the new profile. Future changes will not be synced.'}</p>
          {addonSyncProfileId === null ? <p className="muted">Select a source profile first.</p> : copyLoading ? <p role="status">Loading add-ons…</p> : copyError ? <InlineError message={copyError} onRetry={() => setCopyRetry(value => value + 1)} /> : <>
            {copyAddons.map(addon => <label className="profile-addon-copy-row" key={addon.url}><span><strong>{addon.name}</strong><small>{addon.enabled ? 'Enabled' : 'Disabled in source profile'}</small></span><input type="checkbox" checked={copyUrls.includes(addon.url)} onChange={event => setCopyUrls(urls => event.target.checked ? [...urls, addon.url] : urls.filter(url => url !== addon.url))} /></label>)}
            {copyLoadedSource !== null && !copyAddons.length && <p className="muted">This profile has no add-ons to {isEditing ? 'import' : 'copy'}.</p>}
          </>}
        </div>}
        </>}
      </section>}
      <section className="settings-section profile-custom-avatar-section"><h2>Custom avatar URL</h2><p>Paste an image link, or leave this empty to use the built-in avatar catalog.</p><input aria-label="Custom avatar image URL" type="url" value={avatarUrl} onChange={(event) => { setAvatarUrl(event.target.value); if (event.target.value) setAvatarId(null); }} placeholder="https://example.com/avatar.png" />{urlInvalid && <p className="form-error">Use a valid http or https image URL.</p>}</section>
      {(snapshot?.backgrounds.length ?? 0) > 0 && <section className="settings-section background-picker-section"><h2>Profile background</h2><p>Choose a backdrop from the available profile collection.</p><div className="background-choice-grid"><button type="button" className={`background-choice ${backgroundId === null ? 'selected' : ''}`} onClick={() => { setBackgroundId(null); setBackgroundUrl(''); }}><span className="background-preview plain" /><span>Use theme background</span></button>{snapshot?.backgrounds.map(background => <button type="button" key={background.id} className={`background-choice ${backgroundId === background.id ? 'selected' : ''}`} onClick={() => { setBackgroundId(background.id); setBackgroundUrl(background.url ?? ''); }}><span className="background-preview" style={background.url ? { backgroundImage: `url(${background.url})` } : undefined}><WandSparkles size={16} /></span><span>{background.name}</span></button>)}</div><label className="profile-url-field">Custom background image URL<input type="url" value={backgroundUrl} onChange={(event) => { setBackgroundUrl(event.target.value); if (event.target.value) setBackgroundId(null); }} placeholder="https://example.com/background.jpg" /></label></section>}
      <section className="settings-section avatar-picker-section"><h2>Choose an avatar</h2><p>{selectedAvatar?.name ?? (avatars.length ? 'Select an avatar for this profile.' : 'Avatar choices are not available right now.')}</p>{avatars.length > 0 && <div className="avatar-choice-grid">{avatars.map(avatar => <button key={avatar.id} type="button" aria-label={avatar.name || avatar.id} aria-pressed={avatarId === avatar.id && !safeAvatarUrl} className={`avatar-choice ${avatarId === avatar.id && !safeAvatarUrl ? 'selected' : ''} ${avatar.memberOnly ? 'member-only' : ''}`} disabled={avatar.memberOnly} onClick={() => chooseAvatar(avatar)} title={avatar.memberOnly ? `${avatar.name} is a member avatar` : avatar.name}><span className="avatar-choice-image" style={{ background: avatar.color ?? '#30343a' }}>{avatar.url ? <img src={avatar.url} alt="" /> : avatar.name.slice(0, 1).toUpperCase()}</span></button>)}</div>}</section>
      {editingId !== 1 && <section className="settings-section profile-sharing-section">
        <div className="settings-section-heading"><span className="settings-icon"><Shield size={18} /></span><div><h2>Kids profile</h2><p>Browse stories within the age limit you choose.</p></div></div>
        <div className="settings-row-card"><span className="settings-row-copy"><strong>Kids account</strong><span>Use KidsScreen for catalogs and search. Verify ratings throughout Nuvio.</span></span><label className="switch" aria-label="Kids account"><input type="checkbox" checked={kidsEnabled} onChange={event => { setKidsEnabled(event.target.checked); if (event.target.checked) setSyncAllAddons(false); }} /><span /></label></div>
        {kidsEnabled && <div className="profile-kids-fields">
          <label>Maximum Age Rating<select value={kidsMaxRating} onChange={event => setKidsMaxRating(event.target.value)}><option value="G">G — General audiences</option><option value="PG">PG — Parental guidance</option><option value="PG-13">PG-13 — Teens</option></select></label>
          <label>TMDB API key<input type="password" autoComplete="off" value={kidsApiKey} onChange={event => setKidsApiKey(event.target.value)} aria-describedby={profile?.kidsEnabled ? 'kids-api-key-status' : undefined} placeholder={profile?.kidsEnabled ? '••••••••••••••••' : 'Your personal TMDB API key'} /></label>
          {profile?.kidsEnabled && <small id="kids-api-key-status">Key already configured. Leave this field unchanged to keep it, or enter your key again when changing the age limit.</small>}
          <small>The key is validated and stored encrypted by KidsScreen. Unrated titles and TV-14/TV-MA series are hidden. Featured titles use the same rating checks.</small>
        </div>}
      </section>}


      {profile && <section className="settings-section profile-pin-section"><h2>Security</h2><p>{profile.locked ? 'This profile is protected with a PIN.' : 'Add a PIN if you want this profile locked before switching into it.'}</p><button type="button" className="button primary" onClick={() => setPinAction(profile.locked ? 'clear' : 'set')}>{profile.locked ? 'Remove PIN Lock' : 'Set PIN Lock'}</button></section>}
      <div className={`profile-editor-footer${isEditing ? ' is-editing' : ''}`}><button className="button primary" disabled={saving || creationIncomplete || !name.trim() || urlInvalid || !validAddonSource || !copyReady}>{saving ? 'Saving…' : isEditing ? 'Save changes' : 'Create Profile'}</button>{profile && profile.id > 1 && <button type="button" className="button destructive" disabled={saving || deleting} onClick={() => { setDeleteError(''); setConfirmDelete(true); }}>Delete profile</button>}</div>
    </form>
    {confirmDelete && profile && <Dialog label={`Delete ${profile.name}`} onClose={() => { if (!deleting) setConfirmDelete(false); }}><div className="dialog-head"><strong>Delete {profile.name}?</strong></div><p className="muted">This permanently removes this profile and its profile-specific settings.</p>{deleteError && <p className="form-error" role="alert">{deleteError}</p>}<div className="dialog-actions"><button type="button" className="button secondary" disabled={deleting} onClick={() => setConfirmDelete(false)}>Cancel</button><button type="button" className="button destructive" disabled={deleting} onClick={() => void removeProfile()}><Trash2 size={15} />{deleting ? 'Deleting…' : 'Delete profile'}</button></div></Dialog>}
    {sourcePickerOpen && <Dialog label={isEditing ? 'Import from profile' : 'Sync with profile'} onClose={() => setSourcePickerOpen(false)} className="settings-choice-dialog profile-source-dialog"><h2>{isEditing ? 'Import from profile' : 'Sync with profile'}</h2><div className="settings-dialog-options">{availableProfiles.map(item => <button type="button" className="settings-dialog-option" aria-pressed={item.id === addonSyncProfileId} key={item.id} onClick={() => { setAddonSyncProfileId(item.id); setSourcePickerOpen(false); }}><span>{item.name}</span><span className={`settings-radio ${item.id === addonSyncProfileId ? 'selected' : ''}`} aria-hidden="true" /></button>)}</div></Dialog>}
    {pinAction && profile && <ProfilePinManager action={pinAction} profile={profile} onClose={() => setPinAction(null)} onDone={() => setPinAction(null)} />}
  </div>;
}
