import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';
import { Dialog } from '../../components/Dialog';
import { PageHeader } from '../../components/ui';
import { InlineError } from '../../components/Status';

type Advanced = {
  sentrySupported: boolean;
  sentryEnabled: boolean;
  discordSupported: boolean;
  discordPresenceEnabled: boolean;
  continueWatchingCacheClearSupported: boolean;
  rendererPreferenceSupportedInThisUi: boolean;
  rendererPreferenceEnabled: boolean;
  rendererExternallyControlled: boolean;
};
type ProfilePreference = { rememberLastProfileEnabled: boolean };

export function AdvancedSettingsPage() {
  const snapshot = useFeatureSnapshot<Advanced>('advanced');
  const profilePreference = useFeatureSnapshot<ProfilePreference>('profiles');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [sentryChoice, setSentryChoice] = useState<boolean | null>(null);
  const [cacheCleared, setCacheCleared] = useState(false);

  useEffect(() => {
    void refreshFeature('advanced').catch(cause => setError(cause instanceof Error ? cause.message : String(cause)));
    void refreshFeature('profiles').catch(cause => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  const run = async (method: string, params: Record<string, unknown> = {}) => {
    setBusy(true);
    setError('');
    try {
      await call(method, params);
      await refreshFeature('advanced');
      if (method === 'advanced.clearContinueWatchingCache') setCacheCleared(true);
      setSentryChoice(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return <div className="page settings-page">
    <Link to="/settings?category=advanced" className="back-button"><ArrowLeft size={15} /> Settings</Link>
    <PageHeader title="Advanced" />
    {error && <InlineError message={error} />}
    {!snapshot && !error && <p>Loading settings…</p>}
    {snapshot && <>
      {profilePreference && <section className="settings-section">
        <div className="settings-section-heading"><div><h2>Startup</h2></div></div>
        <div className="settings-control-row"><span className="settings-control-copy"><strong>Remember Last Profile</strong><span>Remember last selected profile at startup.</span></span><label className="switch" aria-label="Remember Last Profile"><input type="checkbox" checked={profilePreference.rememberLastProfileEnabled} disabled={profileBusy} onChange={event => { setProfileBusy(true); void call('profiles.rememberLast.set', { enabled: event.target.checked }).then(() => refreshFeature('profiles')).catch(cause => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => setProfileBusy(false)); }} /><span /></label></div>
      </section>}
      {snapshot.rendererPreferenceSupportedInThisUi && <section className="settings-section">
        <div className="settings-section-heading"><div><h2>Windows Graphics</h2></div></div>
        <div className="settings-control-row"><span className="settings-control-copy"><strong>Use OpenGL renderer</strong><span>{snapshot.rendererExternallyControlled ? 'The interface renderer is controlled by SKIKO_RENDER_API or skiko.renderApi. Remove that override to change it here.' : 'May fix interface stutter or flicker with NVIDIA G-SYNC and some high-refresh-rate displays. Restart Nuvio to apply.'}</span></span><label className="switch" aria-label="Use OpenGL renderer"><input type="checkbox" checked={snapshot.rendererPreferenceEnabled} disabled={busy || snapshot.rendererExternallyControlled} onChange={event => void run('advanced.setOpenGlRenderer', { enabled: event.target.checked })} /><span /></label></div>
      </section>}
      {snapshot.sentrySupported && <section className="settings-section">
        <div className="settings-section-heading"><div><h2>Diagnostics</h2></div></div>
        <div className="settings-control-row"><span className="settings-control-copy"><strong>Sentry Crash Reports</strong><span>Send crash reports with safe diagnostic context. On by default.</span></span><label className="switch" aria-label="Sentry Crash Reports"><input type="checkbox" checked={snapshot.sentryEnabled} disabled={busy} onChange={event => setSentryChoice(event.target.checked)} /><span /></label></div>
      </section>}
      {snapshot.discordSupported && <section className="settings-section">
        <div className="settings-section-heading"><div><h2>Discord</h2></div></div>
        <div className="settings-control-row"><span className="settings-control-copy"><strong>Discord Rich Presence</strong><span>Show what you're browsing or watching on your Discord profile. Off by default.</span></span><label className="switch" aria-label="Discord Rich Presence"><input type="checkbox" checked={snapshot.discordPresenceEnabled} disabled={busy} onChange={event => void run('advanced.setDiscordPresence', { enabled: event.target.checked })} /><span /></label></div>
      </section>}
      {snapshot.continueWatchingCacheClearSupported && <section className="settings-section">
        <div className="settings-section-heading"><div><h2>Cache</h2></div></div>
        <button className="button secondary settings-cache-action" disabled={busy || cacheCleared} onClick={() => void run('advanced.clearContinueWatchingCache')}><span className="settings-control-copy"><strong>{cacheCleared ? 'Cache cleared' : 'Clear Continue Watching Cache'}</strong><small>{cacheCleared ? 'Continue Watching data and watch progress have been refreshed.' : 'Remove cached Continue Watching data and refresh watch progress.'}</small></span><span>{cacheCleared ? 'Done' : 'Clear'}</span></button>
      </section>}
    </>}
    {sentryChoice !== null && snapshot && <Dialog label={sentryChoice ? 'Turn on crash reports?' : 'Turn off crash reports?'} onClose={() => setSentryChoice(null)}>
      <h2>{sentryChoice ? 'Turn on crash reports?' : 'Turn off crash reports?'}</h2>
      <p>{sentryChoice ? 'Crash reports help identify Windows and macOS failures without asking you to collect logs manually.' : 'Future application crashes from this computer will not be reported. This can make platform-specific bugs much harder to fix.'}</p>
      <div className="settings-info-block" style={{ display: 'grid', gap: 4 }}><strong>How it helps</strong><span>Reports are grouped by app version, operating system, architecture, and stack trace so the most common real crashes can be fixed first.</span></div>
      <div className="settings-info-block" style={{ display: 'grid', gap: 4 }}><strong>Sent</strong><span>Unhandled application errors, stack traces, app version, operating system, architecture, Java runtime metadata, and safe diagnostic breadcrumbs.</span></div>
      <div className="settings-info-block" style={{ display: 'grid', gap: 4 }}><strong>Not sent</strong><span>Passwords, access tokens, refresh tokens, request and response bodies, headers, cookies, screenshots, view hierarchy, session replay, raw diagnostics, or stream URL query and fragment values.</span></div>
      <div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={() => setSentryChoice(null)}>{snapshot.sentryEnabled ? 'Keep on' : 'Cancel'}</button><button className="button primary" disabled={busy} onClick={() => void run('advanced.setSentry', { enabled: sentryChoice })}>{snapshot.sentryEnabled ? 'Turn off' : 'Turn on'}</button></div>
    </Dialog>}
  </div>;
}
