import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { call, refreshFeature } from '../../bridge';
import { Dialog } from '../../components/Dialog';
import './debridAccountDialog.css';

export type AccountProvider = { id: string; displayName: string; authMethod: string; configured: boolean };
type Authorization = { providerId: string; userCode: string; verificationUrl: string; friendlyVerificationUrl: string; intervalSeconds: number; expiresAt: string | null; nextPollAtEpochMs: number };
type Poll = { status: 'authorized' | 'pending' | 'expired' | 'failed'; nextPollAtEpochMs?: number };
const failed = 'Could not start sign-in.';
function startError(error: unknown) {
  return (error as { code?: string })?.code === 'DEVICE_AUTH_NOT_CONFIGURED' ? 'This sign-in method is not configured in this build.' : failed;
}

export function DebridAccountDialog({ provider, onClose }: { provider: AccountProvider; onClose: () => void }) {
  const deviceCode = provider.authMethod === 'DeviceCode';
  const [session, setSession] = useState<Authorization | null>(null);
  const [starting, setStarting] = useState(!provider.configured && deviceCode);
  const [polling, setPolling] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const startRequest = useRef<{ attempt: number; promise: Promise<Authorization> } | null>(null);
  const generation = useRef(0);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (provider.configured || !deviceCode) return;
    let active = true;
    setStarting(true); setSession(null); setError(''); setMessage('');
    if (!startRequest.current || startRequest.current.attempt !== attempt) {
      startRequest.current = { attempt, promise: call<Authorization>('debrid.device.start', { providerId: provider.id, restart: attempt > 0 }) };
    }
    void startRequest.current.promise.then(value => {
      if (active) { setSession(value); setMessage('Waiting for approval...'); }
    }).catch(cause => { if (active) setError(startError(cause)); }).finally(() => { if (active) setStarting(false); });
    return () => { active = false; };
  }, [provider.id, provider.configured, deviceCode, attempt]);
  useEffect(() => {
    if (!session || saving || provider.configured) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const ticket = generation.current;
    const schedule = (next?: number) => {
      const wait = Math.max(1000, (next ?? Date.now() + Math.max(1, session.intervalSeconds) * 1000) - Date.now());
      timer = setTimeout(() => void poll(), wait);
    };
    const poll = async () => {
      if (!active || ticket !== generation.current) return;
      setPolling(true);
      try {
        const result = await call<Poll>('debrid.device.poll', { providerId: provider.id });
        if (!active || ticket !== generation.current) return;
        if (result.status === 'authorized') {
          closeRef.current();
          void refreshFeature('debrid').catch(() => {});
          return;
        }
        if (result.status === 'expired' || result.status === 'failed') {
          setSession(null); setMessage('');
          setError(result.status === 'expired' ? 'This code expired. Try again.' : failed);
          return;
        }
        setMessage('Waiting for approval...');
        schedule(result.nextPollAtEpochMs);
      } catch {
        // Kotlin bounds transient connection failures; keep waiting through a browser round-trip.
        if (active && ticket === generation.current) schedule();
      } finally { if (active) setPolling(false); }
    };
    schedule(session.nextPollAtEpochMs);
    return () => { active = false; clearTimeout(timer); };
  }, [session, saving, provider.id, provider.configured]);
  useEffect(() => () => { generation.current++; }, []);
  const saveKey = async () => {
    const apiKey = draft.trim();
    if (!apiKey || saving) return;
    const ticket = ++generation.current;
    setSaving(true); setError('');
    try {
      const result = await call<{ valid: boolean }>('debrid.validateKey', { providerId: provider.id, apiKey });
      if (ticket !== generation.current) return;
      if (!result.valid) { setError('Could not validate this API key.'); return; }
      await call('debrid.set', { key: 'providerApiKey', providerId: provider.id, value: apiKey });
      if (ticket !== generation.current) return;
      await refreshFeature('debrid').catch(() => {});
      if (ticket === generation.current) closeRef.current();
    } catch { if (ticket === generation.current) setError('Could not validate this API key.'); }
    finally { if (ticket === generation.current) setSaving(false); }
  };
  const disconnect = async () => {
    const ticket = ++generation.current;
    setSaving(true); setError('');
    try {
      await call('debrid.set', { key: 'providerApiKey', providerId: provider.id, value: '' });
      await refreshFeature('debrid').catch(() => {});
      if (ticket === generation.current) closeRef.current();
    } catch { if (ticket === generation.current) setError('Could not disconnect this account.'); }
    finally { if (ticket === generation.current) setSaving(false); }
  };
  const title = `${provider.configured ? 'Disconnect' : 'Connect'} ${provider.displayName}`;
  return <Dialog label={title} onClose={onClose} className="debrid-account-dialog">
    <h2>{title}</h2>
    {provider.configured ? <p>{provider.displayName} is connected on this device.</p>
      : starting ? <div className="debrid-auth-status" role="status"><LoaderCircle className="spin" size={19} /><span>Starting secure sign-in...</span></div>
      : <>
        {session && <>
          <p>Open the link and enter this code to approve Nuvio.</p>
          <button type="button" className="debrid-auth-code" aria-label={`Copy code ${session.userCode}`} onClick={() => void navigator.clipboard.writeText(session.userCode).then(() => setMessage('Code copied.')).catch(() => setError('Could not copy the code.'))}><strong>{session.userCode}</strong><span>{session.friendlyVerificationUrl}</span></button>
          <hr />
        </>}
        {(session || !deviceCode) && <>
          <p>Enter your {provider.displayName} API key.</p>
          <input className="debrid-auth-key" type="password" aria-label={`${provider.displayName} API key`} placeholder={`Enter ${provider.displayName} API key`} autoComplete="new-password" value={draft} disabled={saving} onChange={event => { setDraft(event.target.value); setError(''); }} />
          <div className="debrid-auth-save"><button type="button" className="button primary" disabled={!draft.trim() || saving} onClick={() => void saveKey()}>{saving ? 'Saving...' : 'Save'}</button></div>
        </>}
        {message && <div className="debrid-auth-status" role="status">{polling && <LoaderCircle className="spin" size={17} />}<span>{message}</span></div>}
      </>}
    {error && <p className="debrid-auth-error" role="alert">{error}</p>}
    <div className="debrid-auth-actions">
      <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
      {provider.configured ? <button type="button" className="button danger" disabled={saving} onClick={() => void disconnect()}>Disconnect</button>
        : !starting && !session && deviceCode ? <button type="button" className="button secondary" onClick={() => setAttempt(value => value + 1)}>Retry</button>
        : session && <button type="button" className="button primary" onClick={() => void call('app.openExternal', { url: session.verificationUrl }).catch(() => setError(failed))}>Open link</button>}
    </div>
  </Dialog>;
}
