import { useState } from 'react';
import { ListPlus } from 'lucide-react';
import { call } from '../../bridge';
import { Dialog } from '../../components/Dialog';
import { InlineError } from '../../components/Status';

type Tab = { key: string; title: string; provider: string | null; membershipDestination: boolean };
type Confirmation = { provider: string; name: string; impacts: string[] };
export function ListMembershipButton({ type, id, name }: { type: string; id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [membership, setMembership] = useState<Record<string, boolean>>({});
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => { setOpen(true); setBusy(true); setError(''); try { const result = await call<{ tabs: Tab[]; membership: Record<string, boolean> }>('library.membership', { type, id }); setTabs(result.tabs.filter(tab => tab.membershipDestination)); setMembership(result.membership); setConfirmations([]); } catch(cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } };
  const save = async (confirmedProviders: string[] = []) => { setBusy(true); setError(''); try { const result = await call<{ requiresConfirmation: boolean; confirmations: Confirmation[] }>('library.setMembership', { type, id, membership, confirmedProviders }); if (result.requiresConfirmation) setConfirmations(result.confirmations); else setOpen(false); } catch(cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } };
  return <><button className="button secondary" onClick={() => void load()}><ListPlus size={17} /> Manage lists</button>{open && <Dialog label={`Lists for ${name}`} onClose={() => setOpen(false)}><h2>{name}</h2>{error && <InlineError message={error} />}{confirmations.length ? <><p>Removing this title affects data in your tracking service:</p>{confirmations.map(item => <p key={item.provider}><strong>{item.name}</strong>: {item.impacts.map(impact => impact.replaceAll('_', ' ')).join(', ')}</p>)}</> : tabs.map(tab => <label className="membership-row" key={tab.key}><input type="checkbox" disabled={busy} checked={!!membership[tab.key]} onChange={event => setMembership(current => ({ ...current, [tab.key]: event.target.checked }))} /><span>{tab.title}</span></label>)}{busy && <p>Loading…</p>}<div className="dialog-actions"><button className="button secondary" onClick={() => setOpen(false)}>Cancel</button><button className="button primary" disabled={busy} onClick={() => void save(confirmations.map(item => item.provider))}>{confirmations.length ? 'Confirm changes' : 'Save'}</button></div></Dialog>}</>;
}
