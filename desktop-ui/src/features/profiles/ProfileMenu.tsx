import { useState } from 'react';
import { Check, LockKeyhole, LogOut, Plus, Settings2, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { actions, useSelector } from '../../bridge';
import type { Profile } from '../../generated/contract';
import { Avatar } from '../../components/ui';
import { ProfileUnlockDialog } from './PinDialogs';

export function ProfileMenu({ onClose }: { onClose: () => void }) {
  const session = useSelector((current) => current.session);
  const [pinProfile, setPinProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  async function select(profile: Profile, pinValue?: string) {
    try { await actions.selectProfile(profile.id, pinValue); setPinProfile(null); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not switch profile.'); }
  }
  return <><button className="menu-scrim" aria-label="Close profile menu" onClick={onClose} /><div className="profile-menu" role="menu">
    <div className="menu-heading">Profiles</div>
    {session.profiles.map((profile) => <button key={profile.id} className={`profile-option ${profile.id === session.activeProfile ? 'selected' : ''}`} role="menuitem" onClick={() => profile.locked ? setPinProfile(profile) : void select(profile)}><Avatar profile={profile} size="sm" /><span>{profile.name}</span>{profile.locked && <LockKeyhole size={14} />}{profile.id === session.activeProfile && <Check size={15} />}</button>)}
    {!session.profiles.length && <p className="menu-empty">Profiles are not available for this session.</p>}
    <Link className="profile-menu-action" to="/profiles/choose" onClick={onClose}><UsersRound size={15}/><span>Choose profile</span></Link>
    <Link className="profile-menu-action" to="/profiles" onClick={onClose}><Settings2 size={15} /><span>Manage profiles</span></Link>
    {session.profiles.length < 6 && <Link className="profile-menu-action" to="/profiles/new" onClick={onClose}><Plus size={15} /><span>Add profile</span></Link>}
    <div className="menu-separator" />
    <div className="signed-in-as">{session.email ?? 'Guest session'}</div>
    <button className="profile-option danger-text" role="menuitem" onClick={() => void actions.signOut()}><LogOut size={15} /><span>Sign out</span></button>
  {error && <p className="form-error" role="alert">{error}</p>}</div>{pinProfile && <ProfileUnlockDialog profile={pinProfile} onClose={() => setPinProfile(null)} onSelected={() => { setPinProfile(null); onClose(); }} />}</>;
}
