import { useEffect, useRef, useState, type FormEvent } from 'react';
import { call, refreshFeature, useFeatureSnapshot, useSelector } from '../../bridge';
import { PageHeader } from '../../components/ui';
import { InlineError } from '../../components/Status';

type Connection = { id: string; name: string; address: string; username: string; enabled: boolean; useCatalogMetadata: boolean; importWatchState: boolean; libraries: { id: string; name: string; selected: boolean }[] };
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
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setPassword(''); setAddress(''); setUsername(''); setError(''); setBusy(false); setRemoving(null);
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
    await run('servers.connect', credentials);
  };
  return <div className="page settings-page"><PageHeader title="Media servers" />
    {error && <InlineError message={error} />}
    {!snapshot && !error && <p>Loading media servers…</p>}
    {snapshot && <>
      {!snapshot.cloudSync && <p>Connections are saved for this profile on this device.</p>}
      <form className="settings-section" onSubmit={event => void connect(event)}>
        <fieldset disabled={busy} style={{ border: 0, margin: 0, padding: 0 }}>
          <label className="settings-control-row">Server type<select aria-label="Server type" value={provider} onChange={event => setProvider(event.target.value)}>{snapshot.providers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="settings-control-row">Server address<input aria-label="Server address" type="url" required placeholder="https://your-server.example" value={address} onChange={event => setAddress(event.target.value)} /></label>
          <label className="settings-control-row">Username<input aria-label="Username" autoComplete="username" required value={username} onChange={event => setUsername(event.target.value)} /></label>
          <label className="settings-control-row">Password<input aria-label="Password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
          <button className="button primary" type="submit">{busy ? 'Working…' : 'Connect'}</button>
        </fieldset>
      </form>
      {snapshot.connections.map(server => <section className="settings-section" key={server.id}>
        <h2>{server.name}</h2><p>{server.address} · {server.username}</p>
        {([
          ['Enabled', 'servers.setEnabled', server.enabled],
          ['Use server metadata', 'servers.setMetadata', server.useCatalogMetadata],
          ['Import watched status', 'servers.setWatchState', server.importWatchState],
        ] as const).map(([label, method, checked]) => <label className="settings-control-row" key={method}><strong>{label}</strong><span className="switch"><input type="checkbox" checked={checked} disabled={busy} onChange={event => void run(method, { id: server.id, enabled: event.target.checked })} /><span /></span></label>)}
        {server.libraries.map(library => <label className="settings-control-row" key={library.id}><strong>{library.name}</strong><span className="switch"><input type="checkbox" checked={library.selected} disabled={busy} onChange={event => void run('servers.setLibrary', { id: server.id, libraryId: library.id, selected: event.target.checked })} /><span /></span></label>)}
        <div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={() => void run('servers.refresh', { id: server.id })}>Refresh libraries</button><button className="button secondary" disabled={busy} onClick={() => setRemoving(server)}>Remove server</button></div>
      </section>)}
    </>}
    {removing && <div className="consent-backdrop"><div className="consent-card" role="dialog" aria-modal="true" aria-label="Remove server"><h2>Remove {removing.name}?</h2><div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button><button className="button primary" disabled={busy} onClick={() => void run('servers.remove', { id: removing.id }).then(ok => { if (ok) setRemoving(null); })}>Remove</button></div></div></div>}
  </div>;
}
