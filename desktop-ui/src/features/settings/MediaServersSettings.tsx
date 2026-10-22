import './mediaServersSettings.css';
import { ArrowLeft, Server, RefreshCw, LockKeyhole, Eye, EyeOff } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import jellyfinLogo from '../../assets/servers/jellyfin.png';
import embyLogo from '../../assets/servers/emby.svg';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { call, refreshFeature, useFeatureSnapshot, useSelector } from '../../bridge';
import { PageHeader } from '../../components/ui';
import { InlineError } from '../../components/Status';

type Connection = { id: string; provider?: string; name: string; address: string; username: string; enabled: boolean; useCatalogMetadata: boolean; importWatchState: boolean; libraries: { id: string; name: string; selected: boolean }[] };
type Servers = { cloudSync: boolean; providers: { id: string; name: string }[]; connections: Connection[] };

export function MediaServersSettings() {
  const snapshot = useFeatureSnapshot<Servers>('servers');
  const profileId = useSelector(state => state.session.activeProfile);
  const [provider, setProvider] = useState('jellyfin');
  const [address, setAddress] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<Connection | null>(null);
  const [signIn, setSignIn] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setPassword(''); setAddress(''); setUsername(''); setError(''); setBusy(false); setRemoving(null); setSignIn(false); setSelected(null);
    void refreshFeature('servers', 'servers.snapshot').catch(() => { if (current === generation.current) setError('Could not load media servers.'); });
    return () => { generation.current++; };
  }, [profileId]);
  const run = async (method: string, params: Record<string, unknown>) => {
    const current = generation.current;
    setBusy(true); setError('');
    try {
      await call(method, params);
      if (current === generation.current) await refreshFeature('servers', 'servers.snapshot');
      return current === generation.current;
    } catch {
      if (current === generation.current) setError('The server operation failed. Check the server address, connection and sign-in details.');
      return false;
    } finally { if (current === generation.current) setBusy(false); }
  };
  const connect = async (event: FormEvent) => {
    event.preventDefault();
    const credentials = { provider, address: address.trim(), username: username.trim(), password };
    setPassword('');
    if (await run('servers.connect', credentials)) setSignIn(false);
  };
  const openSignIn = (id: string, server?: Connection) => {
    setProvider(id); setAddress(server?.address ?? ''); setUsername(server?.username ?? '');
    setPassword(''); setShowPassword(false); setError(''); setSignIn(true);
  };
  const providerName = snapshot?.providers.find(item => item.id === provider)?.name ?? provider;
  return <div className="page settings-page media-servers-page">
    {selected && <button className="back-button settings-page-back" aria-label="Back to media servers" onClick={() => setSelected(null)}><ArrowLeft /></button>}
    <PageHeader title={selected ? 'Server' : 'Media servers'} />
    {error && !signIn && <InlineError message={error} />}
    {!snapshot && !error && <p>Loading media servers…</p>}
    {snapshot && <>
      {!selected && <>
        <h2 className="settings-group-title">SERVERS</h2>
        <section className="settings-nav-card">
          {!snapshot.connections.length && <p className="media-servers-empty">No servers connected yet.</p>}
          {snapshot.connections.map(server => <button className="settings-nav-row" key={server.id} onClick={() => setSelected(server.id)}>
            <span className="settings-nav-icon"><Server /></span><span className="settings-nav-copy"><strong>{server.name}</strong><span>{snapshot.providers.find(item => item.id === server.provider)?.name ?? server.name} · {server.username}{!server.enabled ? ' · Disabled' : ''}</span></span>
          </button>)}
        </section>
        <h2 className="settings-group-title">ADD SERVER</h2>
        <section className="settings-nav-card">
          {snapshot.providers.map(item => <button className="settings-nav-row" key={item.id} onClick={() => openSignIn(item.id)}>
            <span className="settings-nav-icon media-provider-logo">{item.id === 'jellyfin' || item.id === 'emby' ? <img src={item.id === 'jellyfin' ? jellyfinLogo : embyLogo} alt="" /> : <Server />}</span>
            <span className="settings-nav-copy"><strong>{item.name}</strong><span>Sign in with your server address and {item.name} user.</span></span>
          </button>)}
        </section>
      </>}
      {snapshot.connections.filter(server => server.id === selected).map(server => <div className="media-server-details" key={server.id}>
        <section className="settings-section media-server-identity"><strong>{server.name}</strong><span>{snapshot.providers.find(item => item.id === server.provider)?.name ?? server.name} · {server.username}</span><small>{server.address}</small>{!server.enabled && <small>Disabled</small>}</section><section className="settings-section">
        {([
          ['Enabled', 'servers.setEnabled', server.enabled],
          ['Use addon metadata', 'servers.setMetadata', server.useCatalogMetadata],
          ['Import watch progress', 'servers.setWatchState', server.importWatchState],
        ] as const).map(([label, method, checked]) => <label className="settings-control-row" key={method}><span className="settings-control-copy"><strong>{label}</strong><span>{method === 'servers.setEnabled' ? 'Show this server in Home, search, and stream results.' : method === 'servers.setMetadata' ? "Titles open with your addons' details and sync like any other catalog title, with playback and watched marks still sent to your server. Some titles may not match or play if your addons number or identify them differently." : 'Add titles you’re watching on this server to Continue watching, along with its watched marks. Playback resumes from your server either way.'}</span></span><span className="switch"><input type="checkbox" checked={checked} disabled={busy || (method !== 'servers.setEnabled' && !server.enabled)} onChange={event => void run(method, { id: server.id, enabled: event.target.checked })} /><span /></span></label>)}
        </section>
        <h2 className="settings-group-title">LIBRARIES</h2><p className="media-library-description">{server.libraries.length ? "Selected libraries appear in home rows, search, and stream results." : "No movie or series libraries are available to this user."}</p>
        <section className="settings-section">{server.libraries.map(library => <label className="settings-control-row" key={library.id}><strong>{library.name}</strong><span className="switch"><input type="checkbox" checked={library.selected} disabled={busy || !server.enabled} onChange={event => void run('servers.setLibrary', { id: server.id, libraryId: library.id, selected: event.target.checked })} /><span /></span></label>)}
        </section>
        <div className="media-server-actions settings-nav-card"><button className="settings-nav-row" disabled={busy || !server.enabled} onClick={() => void run('servers.refresh', { id: server.id })}><RefreshCw />Refresh libraries</button><button className="settings-nav-row" disabled={busy} onClick={() => openSignIn(server.provider ?? snapshot.providers[0]?.id ?? provider, server)}><LockKeyhole />Sign in again</button><button className="button secondary" disabled={busy} onClick={() => setRemoving(server)}>Remove server</button></div>
      </div>)}
    </>}
    {signIn && <Dialog label={`Sign in to ${providerName}`} className="media-server-signin" onClose={() => { if (!busy) { setSignIn(false); setPassword(''); setError(''); } }}>
      <h2>Sign in to {providerName}</h2>
      <p>Enter your server address and the {providerName} user to sign in with. Your password is only used to sign in.</p>
      <form onSubmit={event => void connect(event)}><fieldset disabled={busy}>
        <label>Server address<input aria-label="Server address" type="url" required placeholder="http://192.168.1.10:8096" value={address} onChange={event => setAddress(event.target.value)} /></label>
        <label>Username<input aria-label="Username" autoComplete="username" required value={username} onChange={event => setUsername(event.target.value)} /></label>
        <label>Password<span className="media-server-secret"><input aria-label="Password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff /> : <Eye />}</button></span></label>
        {error && <InlineError message={error} />}
        <button className="button primary" type="submit" disabled={busy || !address.trim() || !username.trim()}>{busy ? 'Connecting…' : 'Connect'}</button>
      </fieldset></form>
    </Dialog>}
    {removing && <div className="consent-backdrop"><div className="consent-card" role="dialog" aria-modal="true" aria-label="Remove server"><h2>Remove {removing.name}?</h2><div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button><button className="button primary" disabled={busy} onClick={() => void run('servers.remove', { id: removing.id }).then(ok => { if (ok) { setRemoving(null); setSelected(null); } })}>Remove</button></div></div></div>}
  </div>;
}
