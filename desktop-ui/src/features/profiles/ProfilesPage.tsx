import { useMemo, useState, type FormEvent } from 'react';
import { Check, ChevronRight, LockKeyhole, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/ui';
import { Dialog } from '../../components/Dialog';
import { InlineError } from '../../components/Status';
import { actions, useSelector } from '../../bridge';
import { useProfiles, type ProfileRecord } from './profileStore';

function ImageAvatar({ profile, avatarUrl, size = 'lg' }: { profile: ProfileRecord; avatarUrl?: string | null; size?: string }) {
  return avatarUrl
    ? <img className={`avatar ${size}`} src={avatarUrl} alt="" />
    : <span className={`avatar placeholder ${size}`} style={{ background: profile.avatarColorHex || '#32343a' }}>{profile.name.slice(0, 1).toUpperCase() || <UserRound size={19} />}</span>;
}

export function ProfilesPage() {
  const session = useSelector((state) => state.session);
  const { snapshot, loading, error, refresh, run, setError } = useProfiles();
  const [rememberSaving, setRememberSaving] = useState(false);
  const [deleting, setDeleting] = useState<ProfileRecord | null>(null);
  const [switching, setSwitching] = useState<ProfileRecord | null>(null);
  const [switchPin, setSwitchPin] = useState('');
  const [busy, setBusy] = useState(false);
  const avatars = snapshot?.avatars ?? [];
  const profileImage = useMemo(() => (profile: ProfileRecord) => profile.avatarUrl || avatars.find((avatar) => avatar.id === profile.avatarId)?.url || null, [avatars]);
  async function remove() {
    if (!deleting) return;
    setBusy(true); setError('');
    try { await run('profiles.delete', { id: deleting.id }); setDeleting(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete profile.'); }
    finally { setBusy(false); }
  }
  async function toggleRemember(enabled: boolean) {
    setRememberSaving(true); setError('');
    try { await run('profiles.rememberLast.set', { enabled }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update profile preference.'); }
    finally { setRememberSaving(false); }
  }
  async function switchProfile(event?: FormEvent) {
    event?.preventDefault();
    if (!switching) return;
    setBusy(true); setError('');
    try { await actions.selectProfile(switching.id, switching.locked ? switchPin : undefined); await refresh(); setSwitching(null); setSwitchPin(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not switch profile.'); }
    finally { setBusy(false); }
  }
  return <div className="page profiles-page">
    <PageHeader title="Profiles" subtitle="Give everyone a space with their own library and settings." action={<button className="button secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh</button>} />
    {error && <InlineError message={error} onRetry={() => { void refresh(); }} />}
    {loading && !snapshot ? <div className="loading-block"><span className="spin" /> Loading profiles…</div> : <>
      <section className="profile-list" aria-label="Profiles">
        {(snapshot?.items ?? []).map((profile) => <article className={`profile-card ${profile.id === snapshot?.activeProfile ? 'active' : ''}`} key={profile.id}>
          <div className="profile-card-avatar"><ImageAvatar profile={profile} avatarUrl={profileImage(profile)} />{profile.id === snapshot?.activeProfile && <span className="profile-active-badge"><Check size={12} /></span>}</div>
          <div className="profile-card-copy"><div className="profile-card-title"><h2>{profile.name}</h2>{profile.locked && <span className="profile-lock-label"><LockKeyhole size={13} /> PIN protected</span>}</div><p>{profile.id === snapshot?.activeProfile ? 'Currently active' : `Profile ${profile.id}`}{profile.usesPrimaryAddons ? ' · Shared addons' : ''}</p></div>
          <div className="profile-card-actions">{profile.id !== snapshot?.activeProfile && <button className="button secondary profile-select" onClick={() => { setSwitching(profile); setSwitchPin(''); setError(''); }}>{profile.locked ? <LockKeyhole size={14} /> : null}Switch to profile</button>}<Link className="icon-button" to={`/profiles/${profile.id}/edit`} title={`Edit ${profile.name}`} aria-label={`Edit ${profile.name}`}><Pencil size={15} /></Link>{profile.id > 1 && <button className="icon-button danger" title={`Delete ${profile.name}`} aria-label={`Delete ${profile.name}`} onClick={() => setDeleting(profile)}><Trash2 size={15} /></button>}<Link className="icon-button profile-edit-arrow" to={`/profiles/${profile.id}/edit`} aria-label={`Open ${profile.name}`}><ChevronRight size={17} /></Link></div>
        </article>)}
        {!snapshot?.items.length && <div className="profile-empty"><UserRound size={26} /><strong>No profiles found</strong><span>Refresh to check your account again.</span></div>}
      </section>
      <section className="profile-preference settings-row-card"><span className="settings-icon"><ShieldCheck size={18} /></span><span className="settings-row-copy"><strong>Remember the last profile</strong><span>Open the profile you used most recently when Nuvio starts.</span></span><label className="switch" aria-label="Remember the last profile"><input type="checkbox" checked={snapshot?.rememberLastProfileEnabled ?? false} disabled={rememberSaving} onChange={(event) => void toggleRemember(event.target.checked)} /><span /></label></section>
      {(snapshot?.items.length ?? 0) < 6 && <Link to="/profiles/new" className="profile-add-card"><span><Plus size={19} /></span><strong>Add a profile</strong><small>{snapshot?.items.length ?? 0} of 6 profiles</small></Link>}
      {session.email && <p className="profile-footnote">Profiles sync with {session.email}.</p>}
    </>}
    {deleting && <Dialog label={`Delete ${deleting.name}`} onClose={() => setDeleting(null)}><div className="dialog-head"><strong>Delete {deleting.name}?</strong></div><p className="muted">This permanently removes this profile and its profile-specific settings.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><button className="button secondary" onClick={() => setDeleting(null)} disabled={busy}>Cancel</button><button className="button destructive" onClick={() => void remove()} disabled={busy}><Trash2 size={15} />{busy ? 'Deleting…' : 'Delete profile'}</button></div></Dialog>}
    {switching && <Dialog label={`Switch to ${switching.name}`} onClose={() => { setSwitching(null); setSwitchPin(''); }}><form onSubmit={(event) => void switchProfile(event)}><div className="dialog-head"><strong>Switch to {switching.name}</strong></div>{switching.locked ? <label>Profile PIN<input autoFocus inputMode="numeric" type="password" autoComplete="current-password" maxLength={4} value={switchPin} onChange={(event) => setSwitchPin(event.target.value.replace(/\D/g, ''))} required /></label> : <p className="muted">Open this profile?</p>}{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setSwitching(null)} disabled={busy}>Cancel</button><button className="button primary" disabled={busy || (switching.locked && switchPin.length !== 4)}>{busy ? 'Switching…' : switching.locked ? 'Unlock and switch' : 'Switch profile'}</button></div></form></Dialog>}
  </div>;
}
