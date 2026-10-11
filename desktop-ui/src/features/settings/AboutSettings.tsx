import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, ExternalLink, RefreshCw, ShieldCheck, Star, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { call, refreshFeature, useFeatureSnapshot, useSelector } from '../../bridge';
import { Dialog } from '../../components/Dialog';
import { InlineError } from '../../components/Status';
import { PageHeader } from '../../components/ui';
import './aboutSettings.css';

type AboutSnapshot = {
  account: { status: 'loading' | 'signedOut' | 'signedIn' | 'guest'; email: string | null; anonymous: boolean };
  language: string;
  languages: Array<{ code: string; label: string }>;
  membership: { loading: boolean; refreshing: boolean; error: string | null; status?: string; tier?: string | null; active?: boolean; providerConnected?: boolean; hasSubscription?: boolean; subscriptionActive?: boolean; subscriptionStatus?: string | null; billingProvider?: string | null; supporterSince?: string | null; currentPeriodEnd?: string | null; cancelsAtPeriodEnd?: boolean; hasActiveGrant?: boolean; grantIsLifetime?: boolean; grantExpiresAt?: string | null; grantKind?: string | null; grantTier?: string | null; grantSource?: string | null };
  community: { supportersEnabled: boolean; donationActionsEnabled: boolean; donationProgressEnabled: boolean; donateUrl: string; membershipUrl: string; donationsConfigured: boolean };
  updater: { supported: boolean; currentVersion: string; channel: string; singleChannel: boolean; releaseUrl: string; installSupportedInThisUi: boolean };
};
type CommunityItem = { login?: string; name?: string; key?: string; avatarUrl?: string | null; profileUrl?: string | null; totalContributions?: number; membershipLevel?: string; supporterSince?: string | null };
type DonationProgress = { progressPercent: number };

function useAbout() {
  const snapshot = useFeatureSnapshot<AboutSnapshot>('about');
  const [loading, setLoading] = useState(!snapshot);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => { setLoading(true); try { await refreshFeature<AboutSnapshot>('about'); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load About settings.'); } finally { setLoading(false); } }, []);
  useEffect(() => { if (!snapshot) void refresh(); }, [snapshot, refresh]);
  return { snapshot, loading, error, refresh, setError };
}

function SubPage({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) { return <div className={`page settings-page about-settings-page ${className}`}><Link to="/settings?category=about" className="back-button settings-page-back"><ArrowLeft size={15} /> Settings</Link><PageHeader title={title} />{children}</div>; }
function AboutError({ message, retry }: { message: string; retry: () => void }) { return message ? <InlineError message={message} onRetry={() => void retry()} /> : null; }

export function AboutSettingsPage() {
  const { snapshot, loading, error, refresh } = useAbout();
  if (loading && !snapshot) return <SubPage title="About"><div className="loading-block"><span className="spin" /> Loading About…</div></SubPage>;
  return <SubPage title="About">{error && <AboutError message={error} retry={refresh} />}<div className="settings-nav-card about-nav">
    <Link className="settings-nav-row" to="/settings/community"><span className="settings-nav-icon"><Users size={17} /></span><span className="settings-nav-copy"><strong>Supporters &amp; Contributors</strong><span>View the people who support and build Nuvio.</span></span><ArrowUpRight size={15} /></Link>
    <Link className="settings-nav-row" to="/settings/licenses"><span className="settings-nav-icon"><ShieldCheck size={17} /></span><span className="settings-nav-copy"><strong>Licenses &amp; Attribution</strong><span>Review open-source software and data sources.</span></span><ArrowUpRight size={15} /></Link>
    <Link className="settings-nav-row" to="/settings/advanced"><span className="settings-nav-icon"><Star size={17} /></span><span className="settings-nav-copy"><strong>Advanced</strong><span>Diagnostics, cache, graphics, and updates.</span></span><ArrowUpRight size={15} /></Link>
  </div>
  <section className="settings-section about-version-section"><div className="settings-section-heading"><span className="settings-icon"><ShieldCheck size={18} /></span><div><h2>Nuvio Desktop</h2><p>Version {snapshot?.updater.currentVersion ?? '—'}</p></div></div><p className="muted">This desktop interface is built for the Nuvio account and media services.</p><button className="button secondary" onClick={() => void call('app.openExternal', { url: snapshot?.updater.releaseUrl ?? 'https://github.com/MichaelCommitsAt3AM/NuvioDesktopButBetter/releases' }).catch(() => {})}><ExternalLink size={14} /> Releases</button></section>
  </SubPage>;
}

export function CommunitySettingsPage() {
  const { snapshot, loading: aboutLoading, error: aboutError, refresh: refreshAbout } = useAbout();
  const [tab, setTab] = useState<'contributors' | 'supporters'>('contributors');
  const [itemsByKind, setItemsByKind] = useState<Record<string, CommunityItem[]>>({});
  const [progressByKind, setProgressByKind] = useState<Record<string, DonationProgress | null>>({});
  const [selectedItem, setSelectedItem] = useState<CommunityItem | null>(null);
  const [selectedKind, setSelectedKind] = useState<'contributors' | 'supporters'>('contributors');
  const [membershipActionError, setMembershipActionError] = useState('');
  const [loadingKinds, setLoadingKinds] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const initialLoadsStarted = useRef(false);
  const load = useCallback(async (kind: 'contributors' | 'supporters', force = false) => {
    if (loadingKinds[kind] || (loaded[kind] && !force)) return;
    setLoadingKinds((value) => ({ ...value, [kind]: true })); setErrors((value) => ({ ...value, [kind]: '' }));
    try {
      const result = await call<{ items: CommunityItem[]; donationProgress?: DonationProgress | null }>('about.refreshCommunity', { kind });
      setItemsByKind((value) => ({ ...value, [kind]: result.items ?? [] }));
      if (kind === 'supporters') setProgressByKind((value) => ({ ...value, supporters: result.donationProgress ?? null }));
      setLoaded((value) => ({ ...value, [kind]: true }));
    } catch (cause) {
      setItemsByKind((value) => ({ ...value, [kind]: [] }));
      if (kind === 'supporters') setProgressByKind((value) => ({ ...value, supporters: null }));
      setErrors((value) => ({ ...value, [kind]: cause instanceof Error ? cause.message : `Could not load ${kind}.` }));
    } finally { setLoadingKinds((value) => ({ ...value, [kind]: false })); }
  }, [loadingKinds, loaded]);
  useEffect(() => { if (snapshot?.community.supportersEnabled && !initialLoadsStarted.current) { initialLoadsStarted.current = true; void load('contributors'); void load('supporters'); } }, [snapshot?.community.supportersEnabled, load]);
  const membership = snapshot?.membership;
  const community = snapshot?.community;
  const membershipActionUrl = membership?.subscriptionActive ? community?.membershipUrl : community?.donateUrl;
  const items = itemsByKind[tab] ?? [];
  const loading = loadingKinds[tab] ?? false;
  const error = errors[tab] ?? '';
  const donationProgress = progressByKind.supporters ?? null;
  if (aboutLoading && !snapshot) return <SubPage title="Supporters & Contributors"><div className="loading-block"><span className="spin" /> Loading…</div></SubPage>;
  return <SubPage title="Supporters & Contributors">{aboutError && <AboutError message={aboutError} retry={refreshAbout} />}
    {community?.supportersEnabled && <>
      <section className="supporter-membership-card">
        <div className="supporter-membership-main">
          {membership?.loading ? <><h2>Nuvio Supporter Membership</h2><p>Loading membership status…</p></> : membership?.error && !membership.status ? <><h2>Nuvio Supporter Membership</h2><p>Unable to load membership status. Please try again.</p></> : membership?.subscriptionActive || membership?.hasActiveGrant || membership?.active ? <><h2>You’re a {formatMembershipTier(membership.grantTier ?? membership.tier ?? membership.grantKind)}. Thank you.</h2>{membership.supporterSince && <p>Supporter since {formatCommunityDate(membership.supporterSince)}.</p>}</> : membership?.providerConnected ? <><h2>Patreon is connected</h2><p>No active Nuvio tier was found on this Patreon account. View the available options or refresh after changing your Patreon membership.</p></> : <><h2>Nuvio Supporter Membership</h2><p>Supporting Nuvio helps cover infrastructure and ongoing development while keeping the core experience free for everyone.</p></>}
        </div>
        {(membership?.error || membershipActionError) && <p className="supporter-membership-error">Unable to load membership status. Please try again.</p>}
        <div className="supporter-membership-actions">
          {(membership?.subscriptionActive || membership?.hasActiveGrant || membership?.active || membership?.providerConnected || Boolean(membership?.error) || Boolean(membershipActionError)) && <button className="button secondary" disabled={membership?.refreshing} onClick={() => void call('about.refreshMembership').then(() => refreshFeature<AboutSnapshot>('about')).then(() => setMembershipActionError('')).catch((cause) => setMembershipActionError(cause instanceof Error ? cause.message : 'Unable to load membership status. Please try again.'))}><RefreshCw size={14} className={membership?.refreshing ? 'spin' : ''} />{membership?.refreshing ? 'Refreshing' : 'Refresh'}</button>}
          {community?.donationActionsEnabled && membershipActionUrl && <button className="button primary" onClick={() => void call('app.openExternal', { url: membershipActionUrl }).catch(() => {})}>{membership?.subscriptionActive ? 'Manage membership' : 'View supporter membership'} <ExternalLink size={14} /></button>}
        </div>
      </section>
      {community?.donationProgressEnabled && <section className="donation-progress-card">{community.donationsConfigured ? <><div className="donation-progress-heading"><strong>This month's server &amp; maintenance</strong>{donationProgress && !errors.supporters && <strong>{donationProgress.progressPercent}%</strong>}</div>{donationProgress && !errors.supporters ? <progress max={100} value={donationProgress.progressPercent} /> : loading && tab === 'supporters' && !errors.supporters ? <progress /> : null}<small>{errors.supporters || (loading && tab === 'supporters' && !donationProgress ? 'Loading funding progress…' : donationProgress?.progressPercent === 100 ? 'Covered. Additional support now goes to development.' : 'After 100%, additional support goes to development.')}</small></> : <p className="supporter-membership-error">Supporters API is not configured. Add DONATIONS_BASE_URL to local.properties.</p>}</section>}
      <section className="community-tabs-card"><div className="community-tabs"><button className={tab === 'contributors' ? 'selected' : ''} onClick={() => setTab('contributors')}>Contributors</button><button className={tab === 'supporters' ? 'selected' : ''} onClick={() => setTab('supporters')}>Supporters</button></div></section>
      <section className="community-results-card">
        {loading ? <div className="loading-block"><span className="spin" /> Loading {tab}...</div> : error ? <div className="community-load-error"><h2>{tab === 'contributors' ? 'Couldn’t load contributors' : 'Couldn’t load supporters'}</h2><InlineError message={error} onRetry={() => void load(tab, true)} /></div> : !items.length ? <p className="community-empty">{tab === 'contributors' ? 'No contributors found.' : 'No supporters found.'}</p> : <div className="community-list">{items.map((item) => { const title = item.login ?? item.name ?? 'Community member'; return <button className="community-row" key={item.key ?? item.login ?? title} onClick={() => { setSelectedItem(item); setSelectedKind(tab); }}><span className="community-avatar" style={{ width: 54, height: 54 }}>{item.avatarUrl ? <img src={item.avatarUrl} alt="" /> : title.slice(0, 1).toUpperCase()}</span><span><strong>{title}</strong>{tab === 'supporters' && <><small>{formatMembershipTier(item.membershipLevel)}</small>{item.supporterSince && <small>{formatCommunityDate(item.supporterSince)}</small>}</>}</span><ExternalLink size={14} /></button>; })}</div>}
      </section>
    </>}
    {selectedItem && <CommunityMemberDialog item={selectedItem} kind={selectedKind} donationActionsEnabled={community?.donationActionsEnabled ?? false} onClose={() => setSelectedItem(null)} />}
  </SubPage>;
}

function CommunityMemberDialog({ item, kind, donationActionsEnabled, onClose }: { item: CommunityItem; kind: 'contributors' | 'supporters'; donationActionsEnabled: boolean; onClose: () => void }) {
  const name = item.login ?? item.name ?? 'Community member';
  const profileUrl = item.profileUrl;
  const supportUrl = kind === 'contributors' ? ({ skoruppa: 'https://ko-fi.com/skoruppa', whitegiso: 'https://ko-fi.com/whitegiso', edoedac0: 'https://ko-fi.com/edoedac', crisszollo: 'https://ko-fi.com/crisszollo', xrissozollo: 'https://ko-fi.com/crisszollo' }[name.toLowerCase()] ?? null) : null;
  return <Dialog label={name} onClose={onClose}>
    <h2>{name}</h2>
    {kind === 'supporters' && item.supporterSince && <p>{formatCommunityDate(item.supporterSince)}</p>}
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBlock: 16 }}><span className="community-avatar" style={{ width: 72, height: 72 }}>{item.avatarUrl ? <img src={item.avatarUrl} alt="" /> : name.slice(0, 1).toUpperCase()}</span><span>{kind === 'contributors' ? item.profileUrl ?? 'GitHub profile unavailable' : item.membershipLevel?.split('_').filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1).toLowerCase()).join(' ')}</span></div>
    <div className="dialog-actions">{kind === 'contributors' && profileUrl && <CommunityExternalAction label="Open GitHub" url={profileUrl} primary />}{donationActionsEnabled && supportUrl && <CommunityExternalAction label="Donate" url={supportUrl} />}<button className="button secondary" onClick={onClose}>Close</button></div>
  </Dialog>;
}

function CommunityExternalAction({ label, url, primary = false }: { label: string; url: string; primary?: boolean }) { return <button className={`button ${primary ? 'primary' : 'secondary'}`} onClick={() => void call('app.openExternal', { url }).catch(() => {})}>{label}</button>; }

function formatCommunityDate(rawDate: string) {
  const parts = rawDate.split('T')[0].split('-');
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return parts.length === 3 && month >= 1 && month <= 12 && Number.isFinite(day) ? `${months[month - 1]} ${day}, ${parts[0]}` : rawDate;
}

function formatMembershipTier(value?: string | null) {
  if (!value) return 'Supporter';
  if (value.toUpperCase() === 'SUPPORTER_PLUS') return 'Supporter Plus';
  return value.toLowerCase().split(/[_\s]+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
}

export function LicensesSettingsPage() {
  const links = [
    { group: 'APP LICENSE', title: 'Nuvio', body: 'Source code and license terms are available in the project repository.\nLicensed under the GNU General Public License v3.0.', url: 'https://github.com/NuvioMedia/NuvioDesktop' },
    { group: 'DATA & SERVICES', title: 'The Movie Database (TMDB)', body: 'Nuvio uses the TMDB API for movie and TV metadata, artwork, trailers, cast, production details, collections, and recommendations. This product uses the TMDB API but is not endorsed or certified by TMDB.', logo: '/images/attributions/tmdb.png', url: 'https://www.themoviedb.org' },
    { group: 'DATA & SERVICES', title: 'Trakt', body: 'Nuvio connects to Trakt for account authentication, watched history, progress sync, library data, ratings, lists, and comments. Nuvio is not affiliated with or endorsed by Trakt.', logo: '/images/attributions/trakt.svg', url: 'https://trakt.tv' },
    { group: 'DATA & SERVICES', title: 'Simkl', body: 'Nuvio connects to Simkl for account authentication, watchlists, watched history, playback progress, and scrobbling. Movie, TV, and anime tracking data is provided by Simkl. Nuvio is not affiliated with or endorsed by Simkl.', logo: '/images/attributions/simkl.svg', url: 'https://simkl.com' },
    { group: 'DATA & SERVICES', title: 'Premiumize', body: 'Nuvio connects to Premiumize for account authentication, cloud library access, cache checks, and cloud playback features. Nuvio is not affiliated with or endorsed by Premiumize.', logo: 'https://www.premiumize.me/icon_normal.svg', url: 'https://www.premiumize.me' },
    { group: 'DATA & SERVICES', title: 'TorBox', body: 'Nuvio connects to TorBox for account authentication, cloud library access, cache checks, and cloud playback features. Nuvio is not affiliated with or endorsed by TorBox.', logo: 'https://torbox.app/assets/logo-bb7a9579.svg', url: 'https://torbox.app' },
    { group: 'DATA & SERVICES', title: 'MDBList', body: 'Nuvio uses MDBList for ratings, watched history and playback tracking. Nuvio is not affiliated with or endorsed by MDBList.', logo: '/images/attributions/mdblist.svg', url: 'https://mdblist.com' },
    { group: 'DATA & SERVICES', title: 'IntroDB', body: 'Nuvio uses the IntroDB API for community-provided intro, recap, credits, and preview timestamps used by skip controls. Nuvio is not affiliated with or endorsed by IntroDB.', logo: '/images/attributions/introdb.png', url: 'https://introdb.app/' },
    { group: 'DATA & SERVICES', title: 'IMDb Non-Commercial Datasets', body: 'Nuvio uses IMDb Non-Commercial Datasets, including title.ratings.tsv.gz, for IMDb ratings and vote counts. Information courtesy of IMDb (https://www.imdb.com). Used with permission. IMDb data is for personal and non-commercial use under IMDb terms.', url: 'https://developer.imdb.com/non-commercial-datasets/' },
    { group: 'PLAYBACK LICENSE', title: 'mpv / libmpv', body: 'Used for playback on desktop builds.\nSource code and license terms are available in the mpv repository.', url: 'https://github.com/mpv-player/mpv' },
    { group: 'UI LIBRARIES', title: 'Haze 1.7.2', body: 'Used for background blur effects. Created by Chris Banes.\nLicensed under the Apache License, Version 2.0.', url: 'https://github.com/chrisbanes/haze/blob/1.7.2/LICENSE' },
  ];
  return <SubPage title="Licenses & Attribution" className="licenses-page">{['APP LICENSE', 'DATA & SERVICES', 'PLAYBACK LICENSE', 'UI LIBRARIES'].map((group) => <section className="license-group" key={group}><h2 className="license-group-heading">{group}</h2>{links.filter((item) => item.group === group).map((item) => <button className="license-attribution-row" key={item.title} onClick={() => void call('app.openExternal', { url: item.url }).catch(() => {})}>{'logo' in item && item.logo && <img src={item.logo} alt="" width="52" height="52" />}<span><strong>{item.title}</strong><small>{item.body}</small><small className="license-attribution-url">{item.url}</small></span><ExternalLink size={15} /></button>)}</section>)}</SubPage>;
}

export function LanguageSettingsControl() {
  const snapshot = useFeatureSnapshot<AboutSnapshot>('about');
  const current = useSelector((state) => state.settings);
  const language = snapshot?.language ?? 'device';
  const languages = snapshot?.languages ?? [{ code: 'device', label: 'Device language' }];
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <div className="app-language-control"><label><span><strong>App language</strong><small>This interface is currently English; this selection saves the app locale used by Kotlin services.</small></span><select value={language} onChange={(event) => { setBusy(true); setError(''); void call('about.setLanguage', { language: event.target.value }).then(() => refreshFeature<AboutSnapshot>('about')).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not save language.')).finally(() => setBusy(false)); }} disabled={busy}>{languages.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}</select></label>{error && <small className="form-error">{error}</small>}{!snapshot && !current.themes.length && <small className="muted">Language choices load from the desktop service.</small>}</div>;
}
