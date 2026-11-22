import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Copy, ExternalLink, Eye, EyeOff, Lock } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { InlineError } from '../../components/Status';

type PlexServer = { id: string; name: string; owned: boolean; reach: 'LOCAL' | 'REMOTE' | 'RELAY' | 'OFFLINE'; selectable: boolean };
type Person = { id: string; name: string; hasPin: boolean; admin?: boolean; restricted?: boolean; kids?: boolean };
export type GuidedSignIn = {
  provider?: 'plex' | 'silo';
  step: string;
  mode?: 'BROWSER' | 'LINK';
  codePhase?: string;
  code?: string | null;
  linkHost?: string | null;
  canOpenPage?: boolean;
  accountName?: string | null;
  serversLoading?: boolean;
  servers?: PlexServer[];
  server?: string | null;
  serverName?: string | null;
  users?: Person[];
  profiles?: Person[];
  passwordSignIn?: boolean;
  codeSignIn?: boolean;
  pinFor?: string | null;
  pinWrong?: boolean;
  busy?: boolean;
  error?: string | null;
};

const reachLabel: Record<PlexServer['reach'], string> = {
  LOCAL: 'Home network', REMOTE: 'Internet', RELAY: 'Plex Relay limits video quality', OFFLINE: 'Not reachable from this device',
};

/** Renders Kotlin's Plex/Silo sign-in state machine; every action is a `servers.signIn.*` call. */
export function GuidedServerSignIn({ state, providerName, send, onClose }: {
  state: GuidedSignIn;
  providerName: string;
  send: (method: string, params?: Record<string, unknown>) => Promise<boolean>;
  onClose: () => void;
}) {
  const [address, setAddress] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pin, setPin] = useState('');
  const [copied, setCopied] = useState(false);
  const busy = !!state.busy;
  useEffect(() => { setPin(''); }, [state.step, state.pinFor]);
  useEffect(() => { if (state.step !== 'PASSWORD') setPassword(''); }, [state.step]);
  const back = () => void send('servers.signIn.back');
  const openPage = () => void send('servers.signIn.openPage');
  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  };
  const submitPin = (event: FormEvent) => { event.preventDefault(); const value = pin; setPin(''); void send('servers.signIn.pin', { pin: value }); };
  const canGoBack = state.provider === 'silo'
    ? !['ADDRESS', 'FINDING', 'SIGNING_IN'].includes(state.step)
    : ['USERS', 'PIN'].includes(state.step);

  const code = state.code ? <div className="guided-signin-code">
    <code aria-label="Sign-in code">{state.code}</code>
    <button type="button" className="icon-button" aria-label="Copy code" onClick={() => void copy(state.code!)}><Copy size={16} /></button>
    {copied && <small role="status">Code copied</small>}
  </div> : null;

  const pinForm = <form onSubmit={submitPin}><fieldset disabled={busy}>
    <label>PIN<input aria-label="PIN" type="password" inputMode="numeric" autoComplete="off" autoFocus value={pin} onChange={event => setPin(event.target.value)} /></label>
    {state.pinWrong && <InlineError message="Wrong PIN. Try again." />}
    <button className="button primary" type="submit" disabled={busy || !pin.trim()}>{busy ? 'Signing in…' : 'Continue'}</button>
  </fieldset></form>;

  const people = (items: Person[], method: string) => <div className="guided-signin-list">
    {items.map(person => <button type="button" className="settings-nav-row" key={person.id} disabled={busy} onClick={() => void send(method, { id: person.id })}>
      <span className="settings-nav-copy"><strong>{person.name}</strong><span>{[person.admin ? 'Admin' : person.restricted ? 'Managed user' : '', person.kids ? 'Kids' : ''].filter(Boolean).join(' · ')}</span></span>
      {person.hasPin && <Lock size={16} aria-label="PIN protected" />}
    </button>)}
  </div>;

  let title = `Sign in to ${providerName}`;
  let subtitle: string | null = null;
  let body: ReactNode = null;

  if (state.provider === 'plex') {
    switch (state.step) {
      case 'CODE':
        subtitle = 'Sign in on plex.tv. Your Plex password is never entered in Nuvio.';
        body = <>
          {state.codePhase === 'STARTING' && <p className="muted">Getting ready…</p>}
          {state.codePhase === 'WAITING' && state.mode === 'BROWSER' && <>
            <button className="button primary" type="button" disabled={!state.canOpenPage} onClick={openPage}><ExternalLink size={16} /> Continue with Plex</button>
            <p className="muted">Finish signing in on plex.tv, then come back here.</p>
          </>}
          {state.codePhase === 'WAITING' && state.mode === 'LINK' && <>
            <p>On another device, open {state.linkHost ?? 'plex.tv/link'}, sign in to Plex and enter this code.</p>
            {code}
            <p className="muted">Waiting for the code to be entered…</p>
          </>}
          {state.codePhase === 'EXPIRED' && <>
            <p>This sign-in has expired.</p>
            <button className="button primary" type="button" onClick={() => void send('servers.signIn.plexMode', { mode: state.mode })}>Start again</button>
          </>}
          <button className="text-button" type="button" onClick={() => void send('servers.signIn.plexMode', { mode: state.mode === 'LINK' ? 'BROWSER' : 'LINK' })}>
            {state.mode === 'LINK' ? 'Sign in on this device' : 'Sign in on another device'}
          </button>
        </>;
        break;
      case 'SERVERS':
        title = 'Choose a server';
        subtitle = state.accountName ? `Signed in to Plex as ${state.accountName}.` : null;
        body = <>
          {state.serversLoading && <p className="muted" role="status">{state.servers?.length ? 'Checking how each server can be reached…' : 'Finding your servers…'}</p>}
          {!state.serversLoading && !state.servers?.length && <p>No Plex Media Server is available to this account.</p>}
          <div className="guided-signin-list">
            {(state.servers ?? []).map(server => <button type="button" className="settings-nav-row" key={server.id} disabled={busy || state.serversLoading || !server.selectable} onClick={() => void send('servers.signIn.plexServer', { id: server.id })}>
              <span className="settings-nav-copy"><strong>{server.name}</strong><span>{server.owned ? 'Your server' : 'Shared with you'}{state.serversLoading ? '' : ` · ${reachLabel[server.reach]}`}</span></span>
            </button>)}
          </div>
        </>;
        break;
      case 'USERS':
        title = 'Choose a Plex Home user';
        subtitle = state.server ? `Who is watching on ${state.server}?` : null;
        body = people(state.users ?? [], 'servers.signIn.plexUser');
        break;
      case 'PIN':
        title = `PIN for ${state.pinFor ?? ''}`;
        body = pinForm;
        break;
      case 'SIGNING_IN':
        body = <p className="muted" role="status">Signing in…</p>;
        break;
      case 'FAILED':
        body = <button className="button primary" type="button" onClick={() => void send('servers.signIn.plexMode', { mode: state.mode ?? 'BROWSER' })}>Start again</button>;
        break;
    }
  } else if (state.provider === 'silo') {
    switch (state.step) {
      case 'ADDRESS':
        subtitle = 'Enter the address you open Silo at in a browser.';
        body = <form onSubmit={event => { event.preventDefault(); void send('servers.signIn.siloAddress', { address: address.trim() }); }}><fieldset disabled={busy}>
          <label>Server address<input aria-label="Server address" type="url" required autoFocus placeholder="https://silo.example.com" value={address} onChange={event => setAddress(event.target.value)} /></label>
          <button className="button primary" type="submit" disabled={!address.trim()}>Continue</button>
        </fieldset></form>;
        break;
      case 'FINDING':
        body = <p className="muted" role="status">Looking for Silo…</p>;
        break;
      case 'CODE':
        subtitle = state.serverName ? `Approve this device on ${state.serverName}.` : null;
        body = <>
          {state.codePhase === 'STARTING' && <p className="muted">Getting a code…</p>}
          {state.codePhase === 'WAITING' && <>
            <button className="button primary" type="button" disabled={!state.canOpenPage} onClick={openPage}><ExternalLink size={16} /> Approve in browser</button>
            {state.linkHost && <p>Or on another device signed in to Silo, open {state.linkHost} and enter this code.</p>}
            {code}
            <p className="muted">Waiting for approval…</p>
          </>}
          {state.codePhase === 'EXPIRED' && <p>This code has expired.</p>}
          {state.codePhase === 'DENIED' && <p>This sign-in was declined.</p>}
          {state.codePhase === 'UNAVAILABLE' && <p>This server doesn't offer sign-in with a code.</p>}
          {(state.codePhase === 'EXPIRED' || state.codePhase === 'DENIED') && <button className="button primary" type="button" onClick={() => void send('servers.signIn.siloNewCode')}>New code</button>}
          {state.passwordSignIn && <button className="text-button" type="button" onClick={() => void send('servers.signIn.siloUsePassword')}>Use password</button>}
        </>;
        break;
      case 'PASSWORD':
        subtitle = state.serverName ? `Sign in with your ${state.serverName} account.` : null;
        body = <form onSubmit={event => { event.preventDefault(); const value = password; setPassword(''); void send('servers.signIn.siloPassword', { username: username.trim(), password: value }); }}><fieldset disabled={busy}>
          <label>Username<input aria-label="Username" autoComplete="username" required value={username} onChange={event => setUsername(event.target.value)} /></label>
          <label>Password<span className="media-server-secret"><input aria-label="Password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff /> : <Eye />}</button></span></label>
          <button className="button primary" type="submit" disabled={busy || !username.trim() || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
          {state.codeSignIn && <button className="text-button" type="button" onClick={() => void send('servers.signIn.siloUseCode')}>Use a code</button>}
        </fieldset></form>;
        break;
      case 'SIGNING_IN':
        body = <p className="muted" role="status">Signing in…</p>;
        break;
      case 'PROFILES':
        title = "Who's watching?";
        body = people(state.profiles ?? [], 'servers.signIn.siloProfile');
        break;
      case 'PIN':
        title = `PIN for ${state.pinFor ?? ''}`;
        body = pinForm;
        break;
      case 'FAILED':
        body = <button className="button primary" type="button" onClick={back}>Start again</button>;
        break;
    }
  }

  return <Dialog label={title} className="media-server-signin guided-server-signin" onClose={() => { if (!busy) onClose(); }}>
    {canGoBack && <button type="button" className="back-button guided-signin-back" aria-label="Back" disabled={busy} onClick={back}><ArrowLeft /></button>}
    <h2>{title}</h2>
    {subtitle && <p>{subtitle}</p>}
    {state.error && <InlineError message={state.error} />}
    <div className="guided-signin-body">{body}</div>
  </Dialog>;
}
