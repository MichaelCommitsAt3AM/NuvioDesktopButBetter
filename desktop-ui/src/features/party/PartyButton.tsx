import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, PartyPopper, Users } from 'lucide-react';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';
import { Dialog } from '../../components/Dialog';
import { useTabActive } from '../../navigation/tabActivity';
import './partyButton.css';

export type PartySnapshot = {
  available: boolean;
  canUse: boolean;
  busy: boolean;
  error: string | null;
  resumable: null | { code: string; displayCode: string; title: string };
  party: null | {
    code: string; displayCode: string; isHost: boolean; connected: boolean; memberCount: number; maxMembers: number;
    members: { id: string; name: string; isHost: boolean; isSelf: boolean }[];
    media: { type: string; metaId: string; metaType: string; videoId: string; title: string; episodeTitle: string | null; season: number | null; episode: number | null; poster: string | null };
  };
};

// Same alphabet the server issues codes from (no 0/O/1/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
export const normalizePartyCode = (input: string) => input.toUpperCase().split('').filter(char => ALPHABET.includes(char)).join('').slice(0, CODE_LENGTH);
export const formatPartyCode = (code: string) => code.length > 3 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;

export const PARTY_ERROR_MESSAGES: Record<string, string> = {
  NotFound: 'That code does not match a watch party. Check it and try again.',
  Full: 'This watch party is full.',
  Removed: 'You were removed from that watch party.',
  Ended: 'That watch party has ended.',
  RateLimited: 'Too many attempts. Wait a moment and try again.',
  SignInRequired: 'Sign in to your Nuvio account to join a watch party.',
  Unavailable: 'Watch party is unavailable right now.',
  Network: 'Could not reach the server. Check your connection.',
};

const playPath = (media: { metaType: string; metaId: string; videoId: string }) => `/details/${encodeURIComponent(media.metaType)}/${encodeURIComponent(media.metaId)}/streams/${encodeURIComponent(media.videoId)}`;

export function PartyButton() {
  const snapshot = useFeatureSnapshot<PartySnapshot>('party');
  const active = useTabActive();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!snapshot) void refreshFeature<PartySnapshot>('party').catch(() => {}); }, [snapshot]);
  if (!active || !snapshot?.available) return null;
  const inParty = snapshot.party !== null || snapshot.resumable !== null;
  const label = snapshot.party ? 'Watch party (in a party)' : snapshot.resumable ? 'Watch party (you can rejoin)' : 'Watch party';
  return <>
    {createPortal(<button className="party-toggle" type="button" aria-label={label} title={label} onClick={() => setOpen(true)}>
      <Users size={22} aria-hidden="true" />{inParty && <span className="party-toggle-dot" aria-hidden="true" />}
    </button>, document.body)}
    {open && <PartyDialog snapshot={snapshot} onClose={() => setOpen(false)} />}
  </>;
}

function PartyDialog({ snapshot, onClose }: { snapshot: PartySnapshot; onClose: () => void }) {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const party = snapshot.party;

  const run = useCallback(async <T,>(method: string, params: Record<string, unknown> = {}) => {
    setBusy(true); setError(null);
    try { const result = await call<T>(method, params); await refreshFeature<PartySnapshot>('party'); return result; }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Something went wrong.'); return null; }
    finally { setBusy(false); }
  }, []);

  const join = async (event: FormEvent) => {
    event.preventDefault();
    const result = await run<PartySnapshot>('party.join', { code });
    if (!result) return;
    if (result.error) { setError(PARTY_ERROR_MESSAGES[result.error] ?? 'Could not join that watch party.'); return; }
    if (result.party) { onClose(); navigate(playPath(result.party.media)); }
  };
  const copy = async () => {
    if (!party) return;
    try { await navigator.clipboard.writeText(party.code); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard unavailable */ }
  };
  const leave = async () => { await run<PartySnapshot>(party?.isHost ? 'party.end' : 'party.leave'); };
  const rejoin = async () => {
    const result = await run<PartySnapshot>('party.rejoin');
    if (result?.error) setError(PARTY_ERROR_MESSAGES[result.error] ?? 'Could not rejoin that watch party.');
  };

  return <Dialog label="Watch party" onClose={onClose} className="party-sheet" dragToDismiss={false}>
    <div className="party-dialog">
      <header><PartyPopper size={22} aria-hidden="true" /><h2>Watch party</h2></header>
      {!snapshot.canUse && <p className="party-note">Sign in to your Nuvio account to create or join a watch party.</p>}
      {snapshot.canUse && !party && snapshot.resumable && <div className="party-status">
        <p className="party-title">You are still in this watch party</p>
        {snapshot.resumable.title && <p className="party-note">{snapshot.resumable.title}</p>}
        <div className="party-code-row"><span>Code</span><strong>{snapshot.resumable.displayCode}</strong></div>
        {error && <p className="party-error" role="alert">{error}</p>}
        <div className="party-actions">
          <button className="button subtle-danger" type="button" disabled={busy} onClick={() => void leave()}>Leave</button>
          <button className="button" type="button" disabled={busy} onClick={() => void rejoin()}>{busy ? 'Rejoining…' : 'Rejoin'}</button>
        </div>
      </div>}
      {snapshot.canUse && !party && !snapshot.resumable && <form onSubmit={join}>
        <p className="party-note">Enter the six-character code from whoever started the party.</p>
        <input className="party-code-input" value={formatPartyCode(code)} onChange={event => setCode(normalizePartyCode(event.target.value))}
          placeholder="ABC 123" aria-label="Watch party code" autoFocus autoCapitalize="characters" autoComplete="off" spellCheck={false} />
        {error && <p className="party-error" role="alert">{error}</p>}
        <button className="button" type="submit" disabled={busy || code.length !== CODE_LENGTH}>{busy ? 'Joining…' : 'Join'}</button>
      </form>}
      {snapshot.canUse && party && <div className="party-status">
        <p className="party-title">{party.media.title}{party.media.season != null && party.media.episode != null ? ` · S${party.media.season}E${party.media.episode}` : ''}</p>
        <p className="party-note">{party.connected ? 'Connected' : 'Reconnecting…'} · {party.memberCount}/{party.maxMembers} watching</p>
        <ul className="party-members">{party.members.map(member => <li key={member.id}>{member.name}{member.isSelf ? ' (you)' : ''}{member.isHost ? ' · host' : ''}</li>)}</ul>
        <div className="party-code-row"><span>Code</span><strong>{party.displayCode}</strong>
          <button className="icon-button" type="button" aria-label="Copy code" onClick={() => void copy()}>{copied ? <Check size={18} /> : <Copy size={18} />}</button></div>
        {error && <p className="party-error" role="alert">{error}</p>}
        <div className="party-actions">
          <button className="button secondary" type="button" onClick={() => { onClose(); navigate(playPath(party.media)); }}>Watch with the party</button>
          <button className="button subtle-danger" type="button" disabled={busy} onClick={() => void leave()}>{party.isHost ? 'End party' : 'Leave'}</button>
        </div>
      </div>}
    </div>
  </Dialog>;
}
