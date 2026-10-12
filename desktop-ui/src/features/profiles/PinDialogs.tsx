import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Delete } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { actions, call, refreshFeature } from '../../bridge';
import './pinDialogs.css';

export type PinResult = { unlocked: boolean; retryAfterSeconds?: number; message?: string | null };

export function PinEntryDialog({ profileName, onVerify, onVerified, onClose, onForgotPin }: {
  profileName: string; onVerify: (pin: string) => Promise<PinResult>;
  onVerified?: (pin: string) => void | Promise<void>; onClose: () => void; onForgotPin?: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retryUntil, setRetryUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!retryUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retryUntil]);
  const seconds = Math.max(0, Math.ceil((retryUntil - now) / 1000));
  async function enter(value: string) {
    if (pending.current || seconds > 0) return;
    const next = value.replace(/\D/g, '').slice(0, 4);
    setPin(next); setError('');
    if (next.length !== 4) return;
    pending.current = true; setBusy(true);
    try {
      const result = await onVerify(next);
      if (!mounted.current) return;
      if (!result.unlocked) {
        setError(result.message || 'Incorrect PIN.'); setPin('');
        if ((result.retryAfterSeconds ?? 0) > 0) { setNow(Date.now()); setRetryUntil(Date.now() + result.retryAfterSeconds! * 1000); }
      } else await onVerified?.(next);
    } catch (cause) {
      if (mounted.current) { setError(cause instanceof Error ? cause.message : 'Could not verify the PIN.'); setPin(''); }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return <Dialog label="Enter PIN" className="profile-pin-dialog" onClose={() => { if (!pending.current) onClose(); }}>
    <section className={`pin-entry ${error ? 'has-error' : ''}`} onKeyDown={(event) => {
      if (/^[0-9]$/.test(event.key)) { event.preventDefault(); void enter(pin + event.key); }
      else if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); void enter(pin.slice(0, -1)); }
    }}>
      <h2>Enter PIN</h2><p className="pin-profile-name">{profileName}</p>
      <input className="pin-keyboard-input" aria-label="Profile PIN" autoFocus inputMode="numeric" type="password" autoComplete="off" maxLength={4} value={pin} disabled={busy || seconds > 0} onChange={(event) => void enter(event.target.value)} />
      <div className="pin-dots" aria-label={`${pin.length} of 4 digits entered`}>{[0, 1, 2, 3].map(index => <span key={index} className={pin.length > index ? 'filled' : ''} />)}</div>
      {(error || seconds > 0) && <p className="form-error" role="alert">{seconds > 0 ? `Too many attempts. Try again in ${seconds}s.` : error}</p>}
      {busy && <span className="pin-verifying" role="status">Verifying…</span>}
      <div className="pin-keypad">{['1','2','3','4','5','6','7','8','9','','0','delete'].map(key => key ? <button key={key} type="button" disabled={busy || seconds > 0} aria-label={key === 'delete' ? 'Delete digit' : key} onClick={() => void enter(key === 'delete' ? pin.slice(0, -1) : pin + key)}>{key === 'delete' ? <Delete size={24} /> : key}</button> : <span key="empty" />)}</div>
      {onForgotPin && <button type="button" className="text-button pin-forgot" disabled={busy} onClick={onForgotPin}>Forgot PIN?</button>}
    </section>
  </Dialog>;
}

export function ProfilePinManager({ profile, action, passwordRecovery = false, onClose, onDone }: {
  profile: { id: number; name: string; locked?: boolean }; action: 'set' | 'clear'; passwordRecovery?: boolean;
  onClose: () => void; onDone: () => void | Promise<void>;
}) {
  const [step, setStep] = useState(passwordRecovery ? 'password' : action === 'set' && profile.locked ? 'current' : action);
  const [currentPin, setCurrentPin] = useState<string | undefined>();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function completed() { await refreshFeature('profiles'); await onDone(); }
  async function recover(event: FormEvent) {
    event.preventDefault(); if (!password || busy) return;
    setBusy(true); setError('');
    try { await call('profiles.pin.clearWithPassword', { id: profile.id, accountPassword: password }); await completed(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove the PIN.'); }
    finally { setBusy(false); }
  }
  if (step === 'password') return <Dialog label="Remove PIN with account password" className="profile-pin-dialog" onClose={() => { if (!busy) onClose(); }}><form onSubmit={(event) => void recover(event)}><h2>Forgot PIN?</h2><p className="muted">Enter your account password to remove the PIN for {profile.name}.</p><label>Account password<input autoFocus type="password" autoComplete="current-password" value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || !password}>{busy ? 'Removing…' : 'Remove PIN'}</button></div></form></Dialog>;
  return <PinEntryDialog key={step} profileName={step === 'current' || step === 'clear' ? 'Enter current PIN' : 'Enter new PIN'} onClose={onClose} onForgotPin={step !== 'set' ? () => setStep('password') : undefined} onVerify={pin => call<PinResult>(`profiles.pin.${step === 'current' ? 'verify' : step}`, { id: profile.id, ...(step === 'clear' ? { currentPin: pin } : { pin, ...(currentPin ? { currentPin } : {}) }) })} onVerified={async pin => {
    if (step === 'current') { setCurrentPin(pin); setStep('set'); }
    else await completed();
  }} />;
}

export function ProfileUnlockDialog({ profile, onSelected, onClose }: {
  profile: { id: number; name: string }; onSelected: () => void | Promise<void>; onClose: () => void;
}) {
  const [recovering, setRecovering] = useState(false);
  return recovering ? <ProfilePinManager profile={profile} action="clear" passwordRecovery onClose={onClose} onDone={async () => { await actions.selectProfile(profile.id); await onSelected(); }} />
    : <PinEntryDialog profileName={profile.name} onClose={onClose} onForgotPin={() => setRecovering(true)} onVerify={pin => call<PinResult>('profiles.pin.verify', { id: profile.id, pin })} onVerified={async pin => { await actions.selectProfile(profile.id, pin); await onSelected(); }} />;
}
