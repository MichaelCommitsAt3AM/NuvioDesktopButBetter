import './trackingSettings.css';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, LoaderCircle, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { call, refreshFeature, useFeatureSnapshot, useSelector } from '../../bridge';
import { Dialog } from '../../components/Dialog';
import { BottomSheetPresence } from '../../components/BottomSheetPresence';
import { InlineError } from '../../components/Status';
import { PageHeader } from '../../components/ui';
import { trackingText as t } from './trackingCopy';

type Tracking = {
  librarySourceMode: string; effectiveLibrarySourceMode: string;
  watchProgressSource: string; effectiveWatchProgressSource: string;
  moreLikeThisSource: string; effectiveMoreLikeThisSource: string;
  simklAnimeIdPreference: string; simklConnected: boolean; mdblistConnected: boolean;
  isRefreshingProgress: boolean; lastProgressRefreshSucceeded: boolean | null;
};
type Simkl = { connected: boolean; mode: string; username: string | null; credentialsConfigured: boolean; isLoading: boolean; usesPinFlow: boolean; pendingPinUserCode: string | null; pendingPinVerificationUrl: string | null; error: string | null; isSyncing: boolean; syncErrorMessage: string | null };
type MdbAccount = { connected: boolean; mode: string; username: string | null; credentialsConfigured: boolean; isBusy: boolean; userCode: string | null; error: string | null; revokeFailed: boolean; isSyncing: boolean; lastSyncedAtEpochMs: number | null };
type Option = { value: string; title: string; description: string; unavailable?: string };
type Picker = { key: string; title: string; subtitle: string; selected: string; options: Option[] };
const sourceLabel = (value: string) => ({ LOCAL: 'Nuvio Library', NUVIO_SYNC: 'Nuvio Sync', SIMKL: 'Simkl', MDBLIST: 'MDBList', TMDB: 'TMDB', TRAKT: 'Trakt' }[value] ?? value);
const animeLabel = (value: string) => t('settings_tracking_anime_id_' + value.toLowerCase());

export function TrackingSettingsPage() {
  const s = useFeatureSnapshot<Tracking>('trackingSettings');
  const profile = useSelector((state) => state.session.activeProfile);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState<Picker | null>(null);
  const [savingProgress, setSavingProgress] = useState(false);
  const refresh = useCallback(async () => {
    try { await refreshFeature('trackingSettings'); setError(''); }
    catch (cause) { setError(message(cause)); }
  }, []);
  useEffect(() => { if (!s) void refresh(); }, [s, refresh]);
  useEffect(() => { setPicker(null); setError(''); }, [profile]);
  async function save(key: string, value: string) {
    setPicker(null); setError('');
    if (key === 'watchProgressSource') setSavingProgress(true);
    try { await call('trackingSettings.set', { key, value }); await refreshFeature('trackingSettings'); }
    catch (cause) { setError(message(cause)); }
    finally { setSavingProgress(false); }
  }
  async function retryProgress() {
    setSavingProgress(true); setError('');
    try { await call('trackingSettings.refreshProgress'); await refreshFeature('trackingSettings'); }
    catch (cause) { setError(message(cause)); }
    finally { setSavingProgress(false); }
  }
  function sourcePicker(key: string, title: string, subtitle: string, selected: string, local: string, kind: 'library' | 'progress') {
    if (!s) return;
    setPicker({ key, title, subtitle, selected, options: [
      { value: local, title: sourceLabel(local), description: t('settings_tracking_nuvio_' + kind + '_description') },
      { value: 'SIMKL', title: 'Simkl', description: t('settings_tracking_simkl_' + kind + '_description'), unavailable: s.simklConnected ? undefined : t('settings_tracking_connect_first', 'Simkl') },
      { value: 'MDBLIST', title: 'MDBList', description: t('settings_mdblist_' + kind + '_description'), unavailable: s.mdblistConnected ? undefined : t('settings_tracking_connect_first', 'MDBList') },
    ] });
  }
  const fallback = (requested: string, effective: string) => requested !== effective ? t('settings_tracking_source_fallback', sourceLabel(requested), sourceLabel(effective)) : undefined;
  return <div className="page settings-page tracking-settings-page">
    <Link to="/settings?category=account" className="back-button settings-page-back" aria-label="Back to Settings"><ArrowLeft size={23} /></Link><PageHeader title="Tracking" />
    {error && <InlineError message={error} onRetry={() => void refresh()} />}
    <h2 className="settings-group-title">{t('settings_tracking_services')}</h2>
    <div className="tracking-provider-cards">
      <ProviderCard key={'simkl-' + profile} provider="simkl" />
      {/* MDBList login is hidden until this build ships MDBLIST_CLIENT_ID.
      <ProviderCard key={'mdblist-' + profile} provider="mdblist" />
      */}
    </div>
    {!s && !error && <div className="loading-block"><LoaderCircle size={18} className="spin" /> Loading settings…</div>}
    {s && <><h2 className="settings-group-title">{t('settings_tracking_data_sources')}</h2><section className="settings-section">
      <PreferenceRow title={t('trakt_library_source_title')} description={t('trakt_library_source_subtitle')} value={sourceLabel(s.effectiveLibrarySourceMode)} supporting={fallback(s.librarySourceMode, s.effectiveLibrarySourceMode)} onClick={() => sourcePicker('librarySourceMode', t('trakt_library_source_dialog_title'), t('trakt_library_source_dialog_subtitle'), s.effectiveLibrarySourceMode, 'LOCAL', 'library')} />
      <PreferenceRow title={t('trakt_watch_progress_title')} description={t('trakt_watch_progress_subtitle')} value={sourceLabel(s.effectiveWatchProgressSource)} supporting={fallback(s.watchProgressSource, s.effectiveWatchProgressSource)} loading={savingProgress || s.isRefreshingProgress} onClick={() => sourcePicker('watchProgressSource', t('trakt_watch_progress_dialog_title'), t('tracking_watch_progress_dialog_subtitle'), s.effectiveWatchProgressSource, 'NUVIO_SYNC', 'progress')} />
      {s.lastProgressRefreshSucceeded === false && !savingProgress && !s.isRefreshingProgress && <div className="tracking-progress-error"><span>{t('settings_tracking_progress_refresh_failed')}</span><button type="button" onClick={() => void retryProgress()}>Retry</button></div>}
      {s.simklConnected && <PreferenceRow title={t('trakt_more_like_this_source_title')} description={t('trakt_more_like_this_source_subtitle')} value={sourceLabel(s.effectiveMoreLikeThisSource)} supporting={fallback(s.moreLikeThisSource, s.effectiveMoreLikeThisSource)} onClick={() => setPicker({ key: 'moreLikeThisSource', title: t('trakt_more_like_this_source_dialog_title'), subtitle: t('trakt_more_like_this_source_dialog_subtitle'), selected: s.effectiveMoreLikeThisSource, options: [
        { value: 'TMDB', title: 'TMDB', description: t('settings_tracking_tmdb_recommendations_description') },
        { value: 'TRAKT', title: 'Trakt', description: t('settings_tracking_trakt_recommendations_description'), unavailable: t('settings_tracking_connect_first', 'Trakt') },
        { value: 'SIMKL', title: 'Simkl', description: t('settings_tracking_simkl_recommendations_description') },
      ] })} />}
    </section>
    {s.simklConnected && <><h2 className="settings-group-title">{t('settings_tracking_anime_section')}</h2><section className="settings-section"><PreferenceRow title={t('settings_tracking_anime_id_title')} description={t('settings_tracking_anime_id_subtitle')} value={animeLabel(s.simklAnimeIdPreference)} onClick={() => setPicker({ key: 'simklAnimeIdPreference', title: t('settings_tracking_anime_id_dialog_title'), subtitle: t('settings_tracking_anime_id_dialog_subtitle'), selected: s.simklAnimeIdPreference, options: ['IMDB', 'MAL', 'KITSU', 'TVDB'].map((value) => ({ value, title: animeLabel(value), description: t('settings_tracking_anime_id_' + value.toLowerCase() + '_description') })) })} /></section></>}
    </>}
    <BottomSheetPresence narrowOnly>{picker && <Dialog label={picker.title} className="tracking-picker" onClose={() => setPicker(null)}><h2>{picker.title}</h2><p className="tracking-picker-subtitle">{picker.subtitle}</p><div role="radiogroup" aria-label={picker.title} className="tracking-picker-options">{picker.options.map((option) => <button type="button" role="radio" aria-checked={picker.selected === option.value} disabled={!!option.unavailable} key={option.value} onClick={() => void save(picker.key, option.value)}><span><strong>{option.title}</strong><small>{option.description}{option.unavailable && <><br />{option.unavailable}</>}</small></span>{picker.selected === option.value && <Check size={22} aria-hidden="true" />}</button>)}</div><div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setPicker(null)}>Close</button></div></Dialog>}</BottomSheetPresence>
  </div>;
}

function PreferenceRow({ title, description, value, supporting, loading, onClick }: { title: string; description: string; value: string; supporting?: string; loading?: boolean; onClick: () => void }) {
  return <button type="button" className="settings-control-row tracking-preference-row" onClick={onClick}><span className="settings-control-copy"><strong>{title}</strong><span>{description}{supporting && <><br />{supporting}</>}</span></span><span className="tracking-preference-value">{loading && <LoaderCircle size={17} className="spin" aria-label="Refreshing watch progress" />}{value}</span></button>;
}

function ProviderCard({ provider }: { provider: 'simkl' | 'mdblist' }) {
  const simkl = useFeatureSnapshot<Simkl>('simkl');
  const mdb = useFeatureSnapshot<{ account: MdbAccount }>('mdblist');
  const state = provider === 'simkl' ? simkl : mdb?.account;
  const brand = provider === 'simkl' ? 'Simkl' : 'MDBList';
  const prefix = 'settings_' + provider + '_';
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [disconnect, setDisconnect] = useState(false);
  const [info, setInfo] = useState(false);
  const refresh = useCallback(async () => { await refreshFeature(provider); await refreshFeature('trackingSettings'); }, [provider]);
  useEffect(() => { if (!state) void refresh().catch((cause) => setError(message(cause))); }, [state, refresh]);
  const awaiting = state?.mode === 'awaiting_approval';
  // Restoring the page resumes the repository's scoped polling job; events update the card.
  useEffect(() => { if (awaiting) void call(provider + '.resume').then(() => refresh()).catch((cause) => setError(message(cause))); }, [awaiting, provider, refresh]);
  const code = provider === 'simkl' ? simkl?.pendingPinUserCode : mdb?.account.userCode;
  useEffect(() => { setStatus(''); }, [code]);
  const loading = busy || (provider === 'simkl' ? simkl?.isLoading : mdb?.account.isBusy);
  const isSyncing = syncing || state?.isSyncing;
  async function open(url?: string | null) { if (url) await call('app.openExternal', { url }); }
  async function action(name: 'connect' | 'resume' | 'cancel' | 'disconnect' | 'sync') {
    if (name === 'sync') setSyncing(true); else setBusy(true);
    setError('');
    try {
      const result = await call<{ authorizationUrl?: string | null; verificationUrl?: string | null; success?: boolean }>(provider + '.' + name);
      if (name === 'connect' || name === 'resume') await open(result.authorizationUrl ?? result.verificationUrl);
      await refresh();
      if (name === 'sync' && result.success === false) setError(provider === 'mdblist' ? t('settings_mdblist_unavailable') : 'Simkl could not refresh all tracking data.');
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); setSyncing(false); }
  }
  async function copyCode() {
    if (!code) return;
    try { await navigator.clipboard.writeText(code); setStatus('Code copied.'); }
    catch { setError('Could not copy the code.'); }
  }
  const authError = providerError(provider, state?.error ?? null);
  const providerErrorMessage = provider === 'simkl' ? authError || simkl?.syncErrorMessage : mdb?.account.revokeFailed ? t('settings_mdblist_revoke_failed') : authError;
  const wordmark = provider === 'simkl' ? 'simkl_logo_wordmark.svg' : 'mdblist_logo.svg';
  const glyph = provider === 'simkl' ? 'simkl_logo_glyph.svg' : 'mdblist_logo.svg';
  return <section className={'tracking-provider-card ' + provider + (state?.connected ? ' connected' : '')} aria-label={brand + ' account'} aria-busy={!!loading || !!isSyncing}>
    <img className="tracking-provider-watermark" src={'/images/tracking/' + glyph} alt="" />
    <div className="tracking-provider-content"><img className="tracking-provider-wordmark" src={'/images/tracking/' + wordmark} alt={brand} />
      {!state ? <LoaderCircle size={18} className="spin" aria-label={'Loading ' + brand} /> : state.connected ? <><div className="tracking-provider-identity"><strong>{t(prefix + 'connected_as', state.username ?? t(provider === 'simkl' ? 'settings_simkl_default_user' : 'settings_mdblist_account_fallback'))}</strong><p>{t(prefix + 'connected_description')}</p></div><button type="button" className="tracking-provider-primary" disabled={!!loading || !!isSyncing} onClick={() => void action('sync')}>{isSyncing ? <LoaderCircle size={18} className="spin" /> : <RefreshCw size={18} />}{t(prefix + 'sync_now')}</button></> : awaiting ? <><strong className="tracking-approval-title">{t(provider === 'simkl' && simkl?.usesPinFlow ? 'settings_simkl_pin_finish_sign_in' : prefix + 'finish_sign_in')}</strong><p>{t(provider === 'simkl' ? simkl?.usesPinFlow ? 'settings_simkl_pin_instructions' : 'settings_tracking_approval_redirect' : 'settings_mdblist_approval_description')}</p>{code && <button type="button" className="tracking-approval-code" onClick={() => void copyCode()} aria-label={'Copy ' + brand + ' code'}><strong>{code}</strong>{provider === 'simkl' && simkl?.pendingPinVerificationUrl && <small>{simkl.pendingPinVerificationUrl}</small>}</button>}<button type="button" className="tracking-provider-primary" disabled={!!loading} onClick={() => void action('resume')}>{loading && <LoaderCircle size={18} className="spin" />}{t(provider === 'simkl' && simkl?.usesPinFlow ? 'settings_simkl_open_pin' : prefix + 'open_login')}</button><button type="button" className="tracking-provider-cancel" disabled={!!loading} onClick={() => void action('cancel')}>Cancel</button></> : <><p>{t(prefix + 'sign_in_description')}</p><button type="button" className="tracking-provider-primary" disabled={!state.credentialsConfigured || !!loading} onClick={() => void action('connect')}>{loading && <LoaderCircle size={18} className="spin" />}{t(prefix + 'connect')}</button>{!state.credentialsConfigured && <div className="tracking-provider-message error">{t(prefix + 'missing_credentials')}</div>}</>}
      {status && <div role="status" className="tracking-provider-message">{status}</div>}
      {provider === 'mdblist' && (isSyncing || (state?.connected && mdb?.account.lastSyncedAtEpochMs)) && <div role="status" className="tracking-provider-message">{isSyncing ? t('settings_mdblist_syncing') : t('settings_mdblist_last_synced', new Date(mdb!.account.lastSyncedAtEpochMs!).toLocaleString())}</div>}
      {(error || providerErrorMessage) && <div role="alert" className="tracking-provider-message error">{error || providerErrorMessage}</div>}
      <div className="tracking-provider-footer"><button type="button" onClick={() => void open('https://' + (provider === 'simkl' ? 'simkl.com' : 'mdblist.com')).catch(() => setError(t('settings_trakt_failed_open_browser')))}>{t(prefix + 'visit')}</button>{state?.connected && <><button type="button" disabled={!!loading || !!isSyncing} onClick={() => setDisconnect(true)}>{t(prefix + 'disconnect')}</button>{provider === 'simkl' && <button type="button" onClick={() => setInfo(true)}>{t('settings_simkl_sync_info_action')}</button>}</>}</div>
    </div>
    {disconnect && <Dialog label={t('settings_tracking_disconnect_title', brand)} onClose={() => setDisconnect(false)} className="tracking-dialog"><h2>{t('settings_tracking_disconnect_title', brand)}</h2><p>{t(prefix + 'disconnect_description')}</p><div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setDisconnect(false)}>Cancel</button><button type="button" className="button danger" onClick={() => { setDisconnect(false); void action('disconnect'); }}>Disconnect</button></div></Dialog>}
    {info && <Dialog label={t('settings_simkl_sync_info_title')} onClose={() => setInfo(false)} className="tracking-dialog"><h2>{t('settings_simkl_sync_info_title')}</h2>{['description', 'activity', 'manual', 'library_statuses'].map((part) => <p key={part}>{t('settings_simkl_sync_info_' + part, 15)}</p>)}{error && <p role="alert">{error}</p>}<div className="dialog-actions"><button type="button" className="button secondary" onClick={() => void open('https://api.simkl.org/guides/sync').catch(() => setError(t('settings_trakt_failed_open_browser')))}>{t('settings_simkl_sync_info_docs')}</button><button type="button" className="button primary" onClick={() => setInfo(false)}>Close</button></div></Dialog>}
  </section>;
}

function message(cause: unknown) { return cause instanceof Error ? cause.message : 'Could not update tracking settings.'; }
function providerError(provider: 'simkl' | 'mdblist', error: string | null) {
  if (!error) return '';
  const simkl: Record<string, string> = { INVALID_CALLBACK: 'invalid_callback', INVALID_CALLBACK_STATE: 'invalid_callback', AUTHORIZATION_EXPIRED: 'authorization_expired', TOKEN_EXCHANGE_FAILED: 'sign_in_failed', INVALID_TOKEN_RESPONSE: 'sign_in_failed', AUTHORIZATION_REVOKED: 'authorization_revoked' };
  const mdb: Record<string, string> = { MISSING_CLIENT_ID: 'missing_credentials', INVALID_RESPONSE: 'invalid_response', INSUFFICIENT_SCOPE: 'write_required', CODE_EXPIRED: 'auth_expired', ACCESS_DENIED: 'auth_denied', AUTHORIZATION_REVOKED: 'auth_revoked', RATE_LIMIT: 'rate_limited', UNAVAILABLE: 'unavailable' };
  if (provider === 'simkl' && error === 'MISSING_CLIENT_ID') return '';
  const key = (provider === 'simkl' ? simkl : mdb)[error];
  return key ? t('settings_' + provider + '_' + key) : error;
}
