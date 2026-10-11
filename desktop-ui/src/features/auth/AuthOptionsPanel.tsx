import { useCallback, useEffect, useState } from 'react';
import { Globe2, LoaderCircle, MonitorUp, Server, ShieldAlert, X } from 'lucide-react';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';

type ServerInfo = { url: string; custom: boolean; secure: boolean; emailPassword: boolean; deviceLogin: boolean };
export type AuthOptionsSnapshot = { customServersEnabled: boolean; active: ServerInfo; discovered: ServerInfo | null; discovering: boolean; switching: boolean; error: string | null; device: { status: 'idle' | 'starting' | 'waiting' | 'failed'; code?: string | null; verificationUrl?: string | null; completing?: boolean; error?: string | null } };

export function useAuthOptions() {
  const snapshot = useFeatureSnapshot<AuthOptionsSnapshot>('authOptions');
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { await refreshFeature<AuthOptionsSnapshot>('authOptions'); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Authentication options are unavailable.'); }
  }, []);
  useEffect(() => { if (!snapshot) void refresh(); }, [snapshot, refresh]);
  const run = useCallback(async (method: string, params: Record<string, unknown> = {}) => {
    setError('');
    try { await call(method, params); await refreshFeature<AuthOptionsSnapshot>('authOptions'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update authentication options.'); throw cause; }
  }, []);
  return { snapshot, error, refresh, run, setError };
}

export function AuthOptionsPanel() {
  const { snapshot, error, run, setError } = useAuthOptions();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [officialOpen, setOfficialOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  if (!snapshot) return null;
  async function doAction(method: string, params: Record<string, unknown> = {}) {
    setBusy(true); setError('');
    try { await run(method, params); }
    catch { /* The shared error message remains visible in the current panel. */ }
    finally { setBusy(false); }
  }
  const discovered = snapshot.discovered;
  return <section className="auth-server-panel">{snapshot.customServersEnabled && <>
    <div className="auth-server-current"><span><Server size={15} /><span><strong>{snapshot.active.custom ? 'Custom server' : 'Official server'}</strong><small>{snapshot.active.url}</small></span></span><button type="button" className="text-button" onClick={() => { setSheetOpen(true); setUrl(''); setError(''); }}>Change server</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {sheetOpen && !discovered && <div className="consent-backdrop"><form className="auth-server-dialog" onSubmit={(event) => { event.preventDefault(); void doAction('authOptions.discoverServer', { url: url.trim() }); }}><div className="dialog-head"><strong>Connect to custom server</strong><button type="button" className="icon-button" onClick={() => { setSheetOpen(false); void doAction('authOptions.resetDiscovery'); }} aria-label="Close"><X size={16} /></button></div><p className="muted">Enter the Backend URL provided by your server administrator.</p><label>Backend URL<input autoFocus type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://backend.example.com" required /></label><div className="dialog-actions"><button type="button" className="button secondary" onClick={() => { setSheetOpen(false); void doAction('authOptions.resetDiscovery'); }} disabled={busy}>Cancel</button><button className="button primary" disabled={busy || !url.trim()}>{busy || snapshot.discovering ? <LoaderCircle className="spin" size={15} /> : <Globe2 size={15} />} Check server</button></div></form></div>}
    {sheetOpen && discovered && <div className="consent-backdrop"><div className="auth-server-dialog" role="dialog" aria-modal="true"><div className="dialog-head"><strong>Review custom server</strong><button type="button" className="icon-button" onClick={() => { setSheetOpen(false); void doAction('authOptions.resetDiscovery'); }} aria-label="Close"><X size={16} /></button></div><p className="muted">The discovery document is valid. Connecting will sign you out of the current server and restart the app. Confirm that this is a server you own or trust.</p><div className="auth-server-detail"><small>Discovered backend</small><code>{discovered.url}</code><small>Client configuration</small><span>Publishable key discovered automatically</span></div><div className="auth-server-warning"><strong><ShieldAlert size={15} /> Only connect to a server you trust</strong><p>{discovered.secure ? 'The app cannot verify who owns or operates this server.' : 'This server uses unencrypted HTTP. Other devices on the network may be able to read traffic, including credentials and synced data.'}</p><p>The server operator can receive your account credentials and access data you sync through this server.</p></div><div className="dialog-actions"><button className="button secondary" onClick={() => { setSheetOpen(false); void doAction('authOptions.resetDiscovery'); }} disabled={busy}>Cancel</button><button className="button primary" onClick={() => void doAction('authOptions.connectServer')} disabled={busy || snapshot.switching}>{busy || snapshot.switching ? <LoaderCircle className="spin" size={15} /> : null}I trust this server</button></div></div></div>}
    {snapshot.active.custom && <button type="button" className="auth-server-official" onClick={() => setOfficialOpen(true)}><Globe2 size={14} /> Use official server</button>}
    {officialOpen && <div className="consent-backdrop"><div className="auth-server-dialog" role="dialog" aria-modal="true"><div className="dialog-head"><strong>Use official server?</strong></div><p className="muted">You will be signed out of the custom server and the app will restart with the official service.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><button className="button secondary" onClick={() => setOfficialOpen(false)} disabled={busy}>Cancel</button><button className="button primary" onClick={() => void doAction('authOptions.useOfficialServer').then(() => setOfficialOpen(false))} disabled={busy || snapshot.switching}>{busy || snapshot.switching ? <LoaderCircle className="spin" size={15} /> : null}Use official server</button></div></div></div>}
    </>}{snapshot.active.deviceLogin && <DeviceLink snapshot={snapshot} run={run} setError={setError} />}
  </section>;
}

function DeviceLink({ snapshot, run, setError }: { snapshot: AuthOptionsSnapshot; run: (method: string, params?: Record<string, unknown>) => Promise<void>; setError: (value: string) => void }) {
  const device = snapshot.device;
  const [busy, setBusy] = useState(false);
  if (!snapshot.active.deviceLogin) return null;
  async function start() { setBusy(true); setError(''); try { await run('authOptions.deviceStart'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start device sign-in.'); } finally { setBusy(false); } }
  async function cancel() { setBusy(true); try { await run('authOptions.deviceCancel'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not cancel device sign-in.'); } finally { setBusy(false); } }
  return <div className="auth-device-link"><div className="auth-device-heading"><MonitorUp size={16} /><strong>Sign in with a device</strong></div>{device.status === 'idle' ? <button className="text-button" type="button" onClick={() => void start()} disabled={busy}>Use a device code</button> : <><p>{device.status === 'waiting' ? 'Enter this code on the verification page to sign in.' : device.status === 'starting' ? 'Requesting a device code…' : 'Device sign-in could not be completed.'}</p>{device.code && <code className="auth-device-code">{device.code}</code>}{device.verificationUrl && <button type="button" className="button secondary" onClick={() => void call('app.openExternal', { url: device.verificationUrl }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not open verification page.'))}>Open verification page</button>}{(device.error || device.status === 'failed') && <small className="form-error">{device.error || 'Try requesting a new device code.'}</small>}<button type="button" className="text-button" onClick={() => void cancel()} disabled={busy || device.completing}>Cancel device sign-in</button></>}</div>;
}
