import { useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowLeft, LockKeyhole, Pencil, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { actions, useSelector } from '../../bridge';
import { Avatar } from '../../components/ui';
import { Dialog } from '../../components/Dialog';
import { useProfiles } from './profileStore';
import './profileChooser.css';

export function ProfileChooser({ onSelected, onBack }: { onSelected?:()=>void; onBack?:()=>void }) {
  const navigate=useNavigate();
  const {snapshot}=useProfiles();
  const [editing,setEditing]=useState(false);
  const [hoverColor,setHoverColor]=useState<string|null>(null);
  const session = useSelector((state) => state.session);
  const [lockedProfile, setLockedProfile] = useState<(typeof session.profiles)[number] | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function choose(profile: (typeof session.profiles)[number], pinValue?: string) {
    setBusy(true); setError('');
    try { await actions.selectProfile(profile.id, pinValue); setLockedProfile(null); setPin(''); onSelected?.(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open this profile.'); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); if (lockedProfile) void choose(lockedProfile, pin); }
  const active=snapshot?.items.find(profile=>profile.id===session.activeProfile)??snapshot?.items[0];
  const color=hoverColor??active?.avatarColorHex??session.profiles[0]?.color??'#1E88E5';
  const backgroundUrl=active?.backgroundUrl||snapshot?.backgrounds.find(background=>background.id===active?.backgroundId)?.url;
  const style={'--profile-color':color,...(backgroundUrl?{backgroundImage:`linear-gradient(#00000047,#00000047),url("${backgroundUrl}")`}: {})} as CSSProperties;
  return <main className="profile-picker" style={style}>
    {onBack&&<button className="profile-picker-back" onClick={onBack} aria-label="Back"><ArrowLeft size={24}/></button>}
    <div className="profile-picker-content">
      <img className="profile-picker-wordmark" src="/images/nuvio-wordmark.png" alt="Nuvio"/>
      <h1>Who's watching?</h1>
      <div className="profile-picker-row">{session.profiles.map((profile,index)=>{
        const profileColor=snapshot?.items.find(item=>item.id===profile.id)?.avatarColorHex??profile.color;
        return <button key={profile.id} className="profile-picker-card" style={{'--avatar-color':profileColor,'--profile-delay':`${150+index*80}ms`} as CSSProperties} disabled={busy}
          onMouseEnter={()=>setHoverColor(profileColor)} onMouseLeave={()=>setHoverColor(null)} onFocus={()=>setHoverColor(profileColor)} onBlur={()=>setHoverColor(null)}
          onClick={()=>editing?navigate(`/profiles/${profile.id}/edit`):profile.locked?(setLockedProfile(profile),setError(''),setPin('')):void choose(profile)}>
          <span className="profile-picker-avatar"><Avatar profile={profile} size="lg"/>{editing?<span className="profile-picker-badge edit"><Pencil size={17}/></span>:profile.locked&&<span className="profile-picker-badge"><LockKeyhole size={15}/></span>}</span><strong>{profile.name}</strong>
        </button>;
      })}{editing&&session.profiles.length<6&&<Link className="profile-picker-card profile-picker-add" to="/profiles/new"><span className="profile-picker-avatar"><span className="add-avatar"><Plus size={43}/></span></span><strong>Add Profile</strong></Link>}</div>
      {!session.profiles.length&&<p className="muted">There are no profiles yet.</p>}
      {error&&!lockedProfile&&<p className="form-error" role="alert">{error}</p>}
      <button className={`profile-picker-manage ${editing?'editing':''}`} disabled={busy} onClick={()=>setEditing(value=>!value)}>{editing?'Done':'Manage Profiles'}</button>
    </div>{lockedProfile && <Dialog label={`Unlock ${lockedProfile.name}`} onClose={() => { setLockedProfile(null); setPin(''); }}><form onSubmit={submit}><div className="dialog-head"><strong>Unlock {lockedProfile.name}</strong></div><label>Profile PIN<input autoFocus inputMode="numeric" type="password" autoComplete="current-password" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} required /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setLockedProfile(null)}>Cancel</button><button className="button primary" disabled={busy || pin.length !== 4}>{busy ? 'Unlocking…' : 'Unlock'}</button></div></form></Dialog>}</main>;
}
