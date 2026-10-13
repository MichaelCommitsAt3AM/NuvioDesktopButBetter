import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { Check, LockKeyhole, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { actions, call, useSelector } from '../../bridge';
import type { Profile } from '../../generated/contract';
import { Avatar } from '../../components/ui';
import { PinEntryDialog, type PinResult } from './PinDialogs';
import './profileMenu.css';

export function ProfileMenu({ onClose, holdGesture }: { onClose: () => void; holdGesture?: RefObject<boolean> }) {
  const session = useSelector(current => current.session);
  const navigate = useNavigate();
  const [pinProfile, setPinProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, below: true });
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  const dismissing = useRef(false);
  const focusBefore = useRef<HTMLElement | null>(null);
  const itemCount = session.profiles.length + (session.profiles.length < 6 ? 1 : 0);
  const columns = itemCount === 4 ? 2 : Math.min(3, Math.max(1, itemCount));
  function close(after?: () => void) {
    if (dismissing.current) return;
    dismissing.current = true;
    setClosing(true);
    timer.current = setTimeout(() => { onClose(); after?.(); focusBefore.current?.focus(); }, 160);
  }
  function dismiss() { if (pinProfile) { setPinProfile(null); setError(''); } else close(); }
  async function select(profile: Profile, pin?: string) {
    if (pending.current || dismissing.current) return;
    if (profile.id === session.activeProfile) { close(); return; }
    if (profile.locked && !pin) { setError(''); setPinProfile(profile); return; }
    pending.current = true;
    try { await actions.selectProfile(profile.id, pin); close(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not switch profile.'); }
    finally { pending.current = false; }
  }
  useLayoutEffect(() => {
    const updatePosition = () => {
      const bounds = anchor.current?.parentElement?.querySelector('.nav-link .avatar')?.getBoundingClientRect();
      const popup = panel.current;
      if (!bounds || !popup) return;
      const scale = Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
      const gap = 18 * scale;
      const margin = 16 * scale;
      const below = innerHeight - bounds.bottom >= bounds.top;
      setPosition({ below, left: Math.max(margin, Math.min(bounds.right - popup.offsetWidth, innerWidth - popup.offsetWidth - margin)), top: Math.max(margin, Math.min(below ? bounds.bottom + gap : bounds.top - gap - popup.offsetHeight, innerHeight - popup.offsetHeight - margin)) });
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener('resize', updatePosition);
    return () => { observer.disconnect(); window.removeEventListener('resize', updatePosition); };
  }, [pinProfile, columns]);
  useEffect(() => {
    focusBefore.current = document.activeElement as HTMLElement;
    panel.current?.querySelector<HTMLButtonElement>('[aria-checked="true"], button')?.focus();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!holdGesture?.current) return;
      const tile = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.profile-popup-tile');
      panel.current?.querySelectorAll('.profile-popup-tile').forEach(item => item.classList.toggle('held-hover', item === tile));
    };
    const release = (event: PointerEvent) => {
      if (!holdGesture?.current) return;
      const tile = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>('.profile-popup-tile');
      if (tile) { holdGesture.current = false; tile.click(); }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', release);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', release); };
  }, [holdGesture]);
  return <><span ref={anchor} />{createPortal(<>
    <button className="profile-popup-scrim" aria-label="Close profile menu" onClick={dismiss} />
    <div ref={panel} className={`profile-popup ${closing ? 'closing' : ''} ${pinProfile ? 'pin-mode' : ''}`} role="menu" aria-label="Profiles" style={{ left: position.left, top: position.top, '--profile-columns': columns, transformOrigin: `50% ${position.below ? '0%' : '100%'}` } as CSSProperties} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
      if (!pinProfile && ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(event.key)) {
        const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>('.profile-popup-tile') ?? [])];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const delta = event.key === 'ArrowDown' ? columns : event.key === 'ArrowUp' ? -columns : event.key === 'ArrowLeft' || event.shiftKey ? -1 : 1;
        event.preventDefault();
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + delta + buttons.length) % buttons.length]?.focus();
      }
    }}>
      {pinProfile ? <PinEntryDialog inline profileName={pinProfile.name} onClose={() => setPinProfile(null)} onVerify={pin => call<PinResult>('profiles.pin.verify', { id: pinProfile.id, pin })} onVerified={pin => select(pinProfile, pin)} /> : <div className="profile-popup-grid">
        {session.profiles.map(profile => <button type="button" role="menuitemradio" aria-label={profile.name || `Profile ${profile.id}`} aria-checked={profile.id === session.activeProfile} key={profile.id} className="profile-popup-tile" style={{ '--profile-color': profile.color || '#1e88e5' } as CSSProperties} onClick={() => void select(profile)}>
          <span className="profile-popup-avatar"><Avatar profile={profile} size="md" />{(profile.id === session.activeProfile || profile.locked) && <span className={`profile-popup-badge ${profile.id === session.activeProfile ? 'active' : ''}`}>{profile.id === session.activeProfile ? <Check size={11} /> : <LockKeyhole size={11} />}</span>}</span>
          <span className="profile-popup-name">{profile.name || `Profile ${profile.id}`}</span>
        </button>)}
        {session.profiles.length < 6 && <button type="button" role="menuitem" className="profile-popup-tile" onClick={() => close(() => navigate('/profiles/new'))}><span className="profile-popup-add"><Plus size={22} /></span><span className="profile-popup-name">Add Profile</span></button>}
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </>, document.body)}</>;
}
