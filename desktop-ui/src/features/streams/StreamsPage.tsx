import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FullscreenButton } from '../../components/FullscreenButton';
import { Activity, ArrowLeft, Check, Copy, Download, LoaderCircle, RefreshCw, Settings2, Gauge, X } from 'lucide-react';
import { actions, BridgeError, call, refreshFeature, useFeatureSnapshot, useSelector } from '../../bridge';
import { EmptyState } from '../../components/EmptyState';
import { InlineError } from '../../components/Status';
import { Dialog } from '../../components/Dialog';
import { notifyDownloadStarted } from '../downloads/DownloadNotifications';
import type { Addons, Stream } from '../../generated/contract';
import { createPortal } from 'react-dom';
import { useMenuNav } from '../../components/useMenuNav';
import { StreamsBackdrop, StreamsTitle } from './StreamsArtwork';
import './streams.css';

type Selection = {
  selectedAddonId: string | null;
  downloadFilterMode: string;
  autoPlayStreamId: string | null;
  autoPlay: { enabled: boolean; overlayVisible: boolean; message: string | null };
  badges: { showFileSize: boolean; showAddonLogo: boolean; placement?: string; backgroundMode?: string };
};
type PlaybackSettings = { showPlayerLoadingStatus: boolean; streamAutoPlayMode?: string; streamAutoPlayRegex?: string };
type Presentation = {
  resolvingDebrid?: boolean;
  providerLogo?: string | null;
  fileSizeBytes?: number | null;
  torrent?: boolean;
  cached?: boolean;
  playable?: boolean;
  external?: boolean;
  fileName?: string | null;
  metadata?: { resolution?: string | null; quality?: string | null; codec?: string | null; hdr?: string[]; audio?: string[]; channels?: string[]; languages?: string[]; year?: number | null } | null;
  badges?: { name: string; imageUrl: string; tagColor: string; tagStyle?: string; textColor?: string; borderColor?: string }[];
};

export function streamAddonNames(addons: Addons | undefined, type: string) {
  const streamType = type.toLowerCase();
  return [...new Set((addons?.items ?? [])
    .filter(addon => addon.enabled && addon.resources?.some(resource => {
      const resourceName = resource.name.trim().toLowerCase();
      return (resourceName === 'stream' || resourceName === 'streams')
        && (!resource.types.length || resource.types.some(item => item.toLowerCase() === streamType || item.toLowerCase() === 'stream'));
    }))
    .map(addon => addon.name))];
}

export function isAutomaticStreamSelectionEnabled(mode: string | undefined, regex: string | undefined) {
  if (mode === 'FIRST_STREAM') return true;
  if (mode !== 'REGEX_MATCH') return false;
  const pattern = regex?.trim() ?? '';
  if (!pattern || !/[\p{L}\p{N}]/u.test(pattern)) return false;
  try { new RegExp(pattern, 'i'); return true; }
  catch { return false; }
}

export function StreamsPage() {
  const { type = '', id = '', videoId = '' } = useParams();
  const streams = useSelector(current => current.streams);
  const details = useSelector(current => current.details);
  const selection = useFeatureSnapshot<Selection>('streamSelection');
  const playbackLoadingSettings = useFeatureSnapshot<PlaybackSettings>('playbackSettings');
  const [playbackSettingsReady, setPlaybackSettingsReady] = useState(!!playbackLoadingSettings);
  const addons = useFeatureSnapshot<Addons>('addons');
  const lastAuto = useRef('');
  const cancelStartingPlayback = useRef(false);
  const pendingPlayback = useRef(false);
  const startingStreamId = useRef<string | null>(null);
  useEffect(() => () => {
    if (!pendingPlayback.current) return;
    cancelStartingPlayback.current = true;
    void call('playback.stop').catch(() => {});
  }, []);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const manual = searchParams.get('manual') === '1';
  const startFromBeginning = searchParams.get('fromStart') === '1';
  const resumePositionMs = Number(searchParams.get('resumeMs') ?? 0) || 0;
  const resumeProgress = Number(searchParams.get('resumeProgress') ?? 0) || 0;
  const routeTitle = searchParams.get('title');
  const routePoster = searchParams.get('poster');
  const routeBackground = searchParams.get('background');
  const routeLogo = searchParams.get('logo');
  const routeEpisodeTitle = searchParams.get('episodeTitle');
  const routeSeason = searchParams.get('seasonNumber');
  const routeEpisode = searchParams.get('episodeNumber');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [provider, setProvider] = useState('all');
  const [qualityOpen, setQualityOpen] = useState(false);
  const [consent, setConsent] = useState<string | null>(null);
  const [replace, setReplace] = useState<{ id: string; title: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [playbackStarting, setPlaybackStarting] = useState<{ resolvingDebrid: boolean } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ stream: Stream; x: number; y: number } | null>(null);
  const menuNav = useMenuNav();
  const playback = useSelector(current => current.playback);
  // The details snapshot survives navigation. Only use it for this title;
  // Continue Watching can start playback without loading its details first.
  const media = details.media?.id === id && details.media.type === type ? details.media : null;
  const episode = media ? details.episodes.find(item => item.id === videoId) : undefined;
  const heroArtwork = media?.background || routeBackground || media?.poster || routePoster || '';
  const title = media?.name ?? routeTitle ?? episode?.title ?? 'Available streams';
  const titleLogo = media?.logo || routeLogo;
  const episodeTitle = episode?.title || routeEpisodeTitle;
  const seasonNumber = episode?.season ?? routeSeason;
  const episodeNumber = episode?.episode ?? routeEpisode;

  useEffect(() => {
    lastAuto.current = '';
    setProvider('all');
    void actions.loadStreams(type, videoId, id, episode?.season ?? undefined, episode?.episode ?? undefined, manual);
  }, [type, id, videoId, episode?.season, episode?.episode, manual]);
  useEffect(() => {
    if (selection?.selectedAddonId) setProvider(selection.selectedAddonId);
  }, [selection?.selectedAddonId]);
  const play = async (streamId: string, enableP2p = false, automatic = false) => {
    setBusy(streamId); setError('');
    cancelStartingPlayback.current = false;
    pendingPlayback.current = true;
    startingStreamId.current = streamId;
    const selectedStream = streams.groups.flatMap(group => group.streams).find(item => item.id === streamId);
    const selectedPresentation = selectedStream?.presentation as Presentation | undefined;
    setPlaybackStarting({ resolvingDebrid: selectedPresentation?.resolvingDebrid === true });
    try {
      if (enableP2p) await call('p2p.setEnabled', { enabled: true, consentAccepted: true });
      if (cancelStartingPlayback.current) return;
      const result = await actions.playback(streamId, type, id, episodeTitle ?? title, { videoId, startFromBeginning });
      setConsent(null);
      if (cancelStartingPlayback.current) {
        startingStreamId.current = null;
        if (result.started) await call('playback.stop').catch(() => {});
        return;
      }
      if (result.started) {
        pendingPlayback.current = false;
        startingStreamId.current = null;
        if (result.host === 'tauri-window') navigate('/playback', { replace: true });
        else navigate(-1);
      }
      else { startingStreamId.current = null; setPlaybackStarting(null); }
      await call('streams.autoplay.consume').catch(() => {});
    } catch (cause) {
      if (cancelStartingPlayback.current) { startingStreamId.current = null; return; }
      startingStreamId.current = null;
      setPlaybackStarting(null);
      if (cause instanceof BridgeError && cause.code === 'P2P_CONSENT_REQUIRED') setConsent(streamId);
      else { setError(cause instanceof Error ? cause.message : String(cause)); if (automatic) await call('streams.autoplay.skip', { streamId }).catch(() => {}); }
    } finally { pendingPlayback.current = false; setBusy(''); }
  };
  useEffect(() => { void refreshFeature('streamSelection', 'streams.snapshot').catch(() => {}); }, [streams.requestId]);
  useEffect(() => {
    let active = true;
    void refreshFeature<PlaybackSettings>('playbackSettings', 'playbackSettings.snapshot')
      .catch(() => {})
      .finally(() => { if (active) setPlaybackSettingsReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    void refreshFeature<Addons>('addons', 'addons.snapshot').catch(() => {});
  }, []);
  useEffect(() => {
    const streamId = selection?.autoPlayStreamId;
    if (manual || !streamId || streamId === lastAuto.current || busy || consent) return;
    lastAuto.current = streamId; void play(streamId, false, true);
  }, [selection?.autoPlayStreamId, busy, consent, manual]);
  const prevPlaybackState = useRef(playback.state);
  useEffect(() => {
    // The playback.start RPC answer can be lost (e.g. a cancelled start tears
    // down its own request handler), which would strand the UI on "Building
    // player..." even though audio is already playing. The bridge also reports
    // playback transitions as events, so drive the handoff off those too.
    const previous = prevPlaybackState.current;
    prevPlaybackState.current = playback.state;
    if (!playbackStarting || !startingStreamId.current) return;
    // Native state and the selected stream/host arrive in separate events.
    // Match the complete snapshot even if an earlier event already said playing.
    // Clearing startingStreamId below makes the handoff run only once.
    if (playback.state === 'playing' && playback.host === 'tauri-window' && playback.streamId === startingStreamId.current) {
      startingStreamId.current = null;
      pendingPlayback.current = false;
      setPlaybackStarting(null);
      navigate('/playback', { replace: true });
      void call('streams.autoplay.consume').catch(() => {});
    } else if ((previous === 'starting' || previous === 'playing') && (playback.state === 'failed' || playback.state === 'cancelled')) {
      // The RPC rejection carries the better message and clears this same
      // state if it arrives later, so a generic message here is safe.
      startingStreamId.current = null;
      setPlaybackStarting(null);
      setError('The player stopped before playback started.');
    }
  }, [playback, playbackStarting, navigate]);
  const setFilter = async (addonId: string) => {
    setProvider(addonId);
    try { await call('streams.filter.set', { addonId: addonId === 'all' ? null : addonId }); }
    catch (cause) { setError(String(cause)); }
  };
  const setDownloadFilter = async (mode: string) => {
    try { await call('streams.downloadFilter.set', { mode }); setError(''); }
    catch (cause) { setError(String(cause)); }
  };
  const refreshStreams = () => { setError(''); void actions.loadStreams(type, videoId, id, episode?.season ?? undefined, episode?.episode ?? undefined, manual); };
  const download = async (streamId: string, replaceConfirmed = false) => {
    setBusy(streamId); setError(''); setNotice('');
    try {
      const result = await call<{ requiresConfirmation: boolean; existing?: { title: string } }>('downloads.enqueue', { streamId, replaceConfirmed });
      if (result.requiresConfirmation) setReplace({ id: streamId, title: result.existing?.title ?? 'this title' });
      else { setReplace(null); notifyDownloadStarted(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(''); }
  };
  const groups = streams.groups
    .filter(group => provider === 'all' || group.id === provider)
    .map(group => ({ ...group }));
  const groupsWithItems = groups.filter(group => group.streams.length || group.loading);
  const hasStreams = groupsWithItems.some(group => group.streams.length > 0);
  const isStreamsLoading = streams.loading || groups.some(group => group.loading);
  const autoSelectionEnabled = isAutomaticStreamSelectionEnabled(playbackLoadingSettings?.streamAutoPlayMode, playbackLoadingSettings?.streamAutoPlayRegex);
  const waitingForAutomaticSelection = !manual && (
    (!playbackSettingsReady && isStreamsLoading)
    || (autoSelectionEnabled && (isStreamsLoading || !!selection?.autoPlayStreamId || selection?.autoPlay.overlayVisible === true))
  );
  const isDataSaver = (selection?.downloadFilterMode ?? 'best_quality').toLowerCase() === 'data_saver';
  const addonLoadingNames = groupsWithItems.filter(group => group.loading).map(group => group.name);
  const expectedLoadingNames = streamAddonNames(addons, type);
  const activeScraperNames = [...new Set(addonLoadingNames.length ? addonLoadingNames : (isStreamsLoading && !groupsWithItems.length ? expectedLoadingNames : []))];
  const copyStreamLink = async (stream: Stream) => {
    if (!stream.url) return;
    try {
      await navigator.clipboard.writeText(stream.url);
      setNotice('Stream link copied.');
    } catch {
      setError('Could not copy the stream link.');
    }
    setContextMenu(null);
  };

  const loadingMessage = playback.phase === 'resolving' || playbackStarting?.resolvingDebrid && playback.phase !== 'preparing' && playback.phase !== 'buffering'
    ? 'Resolving debrid stream'
    : playback.phase === 'buffering' ? 'Buffering…' : 'Building player…';
  const isResolvingStage = playback.phase === 'resolving' || playbackStarting?.resolvingDebrid === true && playback.phase !== 'preparing' && playback.phase !== 'buffering';
  const cancelPlayerStart = () => {
    cancelStartingPlayback.current = true;
    startingStreamId.current = null;
    if (pendingPlayback.current) {
      pendingPlayback.current = false;
      void call('playback.stop').catch(() => {});
    }
    setPlaybackStarting(null);
    navigate(-1);
  };

  if (playbackStarting || waitingForAutomaticSelection) return <div className="streams-page streams-opening-page">
    <StreamsBackdrop url={heroArtwork} />
    <div className="streams-backdrop-shade" />
    <div className="streams-opening-overlay" role="status" aria-live="polite">
      {isResolvingStage || waitingForAutomaticSelection && !playbackStarting
        ? <button className="streams-opening-back" type="button" aria-label="Back" onClick={cancelPlayerStart}><ArrowLeft size={21} /></button>
        : <nav className="streams-opening-actions" aria-label="Player actions">
          <FullscreenButton inline onError={setError} />
          <button className="streams-opening-back" type="button" aria-label="Close player" onClick={cancelPlayerStart}><X size={21} /></button>
        </nav>}
      <div className={`streams-opening-content${playbackLoadingSettings?.showPlayerLoadingStatus === false ? ' no-status' : ''}`}>
        <StreamsTitle url={titleLogo} title={title} opening />
        {playbackLoadingSettings?.showPlayerLoadingStatus !== false && <p>{playbackStarting ? loadingMessage : 'Finding streams…'}</p>}
      </div>
    </div>
  </div>;

  return <div className={`streams-page${(selection?.badges.backgroundMode ?? 'normal').toLowerCase() === 'cinematic' ? ' streams-cinematic' : ''}`}>
    <StreamsBackdrop url={heroArtwork} />
    <div className="streams-backdrop-shade" />
    <div className="streams-tablet-layout">
      <section className="streams-title-panel" aria-label={title}>
        <StreamsTitle url={titleLogo} title={title} />
        {episodeTitle && <span className="streams-episode-title">{seasonNumber != null ? `S${seasonNumber} ` : ''}{episodeNumber != null ? `E${episodeNumber} · ` : ''}{episodeTitle}</span>}
      </section>
      <section className="streams-glass-panel" aria-label="Available streams">
        <div className="streams-controls-top">
          <div className="streams-resume-slot">
            {!startFromBeginning && (resumeProgress > 0 || resumePositionMs > 0) && <span className="streams-resume-banner">{resumeProgress > 0 ? `Resume from ${Math.round(resumeProgress * 100)}%` : `Resume from ${formatClock(resumePositionMs)}`}</span>}
          </div>
        </div>
        <div className="streams-provider-row" aria-label="Stream providers">
          <div className="streams-provider-filters">
            <button className="streams-filter-chip streams-refresh-chip" onClick={refreshStreams} aria-label="Refresh streams" title="Refresh streams"><RefreshCw className={streams.loading ? 'spin' : ''} size={19} /></button>
            <button className={`streams-filter-chip ${provider === 'all' ? 'selected' : ''}`} aria-pressed={provider === 'all'} onClick={() => void setFilter('all')}>All</button>
            {groupsWithItems.map(group => <button className={`streams-filter-chip ${provider === group.id ? 'selected' : ''}`} key={group.id} aria-pressed={provider === group.id} onClick={() => void setFilter(group.id)}>{group.name}</button>)}
          </div>
          <div className="streams-quality-wrap">
            <button className={`streams-filter-chip ${isDataSaver ? 'selected' : ''}`} onClick={() => setQualityOpen(value => !value)} aria-expanded={qualityOpen}>
              <Gauge size={18} /> {isDataSaver ? 'Data saver' : 'Best quality'}
            </button>
            {qualityOpen && <div className="streams-quality-menu" role="menu" onKeyDown={menuNav}>
              {['best_quality', 'data_saver'].map(mode => <button key={mode} role="menuitemradio" aria-checked={mode === (isDataSaver ? 'data_saver' : 'best_quality')} onClick={() => { void setDownloadFilter(mode); setQualityOpen(false); }}>
                {mode === (isDataSaver ? 'data_saver' : 'best_quality') && <Check size={16} />}{mode === 'best_quality' ? 'Best quality' : 'Data saver'}
              </button>)}
              <button onClick={() => { setQualityOpen(false); navigate('/settings/downloads'); }}><Settings2 size={16} /> Filter settings</button>
            </div>}
          </div>
        </div>
        {isStreamsLoading && activeScraperNames.length > 0 && <div className="streams-active-scrapers">
          <small>Active scrapers</small><div>{activeScraperNames.map(name => <span key={name}>{name}</span>)}</div>
        </div>}
        <div className="streams-results" aria-live="polite">
          {notice && <p className="streams-notice" role="status">{notice}</p>}
          {error && <InlineError message={error} />}
          {streams.error && <InlineError message={streams.error} />}
          {!hasStreams && isStreamsLoading && <div className="streams-loading-list" role="status" aria-label="Finding streams" aria-busy="true">
            <span className="streams-loading-label">Finding streams…</span>
            {Array.from({ length: 4 }, (_, index) => <div className="streams-card-skeleton" aria-hidden="true" key={index}><span /><span /></div>)}
          </div>}
          {!isStreamsLoading && !streams.error && !hasStreams && <div className="streams-empty"><EmptyState title="No streams found" message="No streams match the installed addons and current filters." icon={<Activity size={22} />} /></div>}
          {(hasStreams || !isStreamsLoading) && groups.map(group => <div className="streams-group" key={group.id}>
            {provider === 'all' && <div className="streams-group-heading">{group.name}{group.loading && <span>Fetching…</span>}</div>}
            {group.error && <p className="streams-group-error">{group.error}</p>}
            {group.streams.map(stream => <StreamCard key={stream.id} stream={stream} selection={selection} busy={busy === stream.id} disabled={!!busy} onPlay={() => void play(stream.id)} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ stream, x: event.clientX, y: event.clientY }); }} />)}
          </div>)}
        </div>
      </section>
    </div>
    <button className="streams-back" aria-label={`Back to ${title}`} onClick={() => navigate(-1)}><ArrowLeft size={20} /></button>
    {consent && <Dialog label="Enable peer-to-peer playback" onClose={() => setConsent(null)}><h2>Enable peer-to-peer playback?</h2><p>Torrent playback connects your device to other peers. Your IP address is visible to them and upload is enabled by default. You can change P2P and upload preferences in Settings.</p><div className="dialog-actions"><button className="button secondary" onClick={() => setConsent(null)}>Cancel</button><button className="button primary" disabled={!!busy} onClick={() => void play(consent, true)}>Enable and play</button></div></Dialog>}
    {replace && <Dialog label="Replace download" onClose={() => setReplace(null)}><h2>Replace {replace.title}?</h2><p>The existing download and its local file will be removed before the new download starts.</p><div className="dialog-actions"><button className="button secondary" onClick={() => setReplace(null)}>Keep existing</button><button className="button primary" disabled={!!busy} onClick={() => void download(replace.id, true)}>Replace download</button></div></Dialog>}
    {contextMenu && <StreamContextMenu stream={contextMenu.stream} x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} onCopy={() => void copyStreamLink(contextMenu.stream)} onDownload={() => { setContextMenu(null); void download(contextMenu.stream.id); }} />}
  </div>;
}

function StreamCard({ stream, selection, busy, disabled, onPlay, onContextMenu }: { stream: Stream; selection?: Selection; busy: boolean; disabled: boolean; onPlay: () => void; onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void }) {
  const presentation = stream.presentation as Presentation | undefined;
  const badges = presentation?.badges ?? [];
  const showBadges = badges.length > 0 || (!!selection?.badges.showFileSize && presentation?.fileSizeBytes != null);
  const metadata = presentation?.metadata;
  const metaRows = [
    [metadata?.resolution, metadata?.quality, metadata?.codec],
    [...(metadata?.hdr ?? []), ...(metadata?.audio ?? []), ...(metadata?.channels ?? [])],
    [metadata?.year ? String(metadata.year) : null],
  ].map(row => row.filter((value): value is string => !!value)).filter(row => row.length);
  const details = stream.description?.trim();
  const fileSize = presentation?.fileSizeBytes != null ? formatSize(presentation.fileSizeBytes) : null;
  const providerLogo = selection?.badges.showAddonLogo ? presentation?.providerLogo : null;
  const badgesTop = (selection?.badges.placement ?? 'bottom').toLowerCase() === 'top';
  const badgeRow = showBadges && <span className="streams-card-badges">
    {badges.map((badge, index) => badge.imageUrl ? <img key={`${badge.name}:${index}`} src={badge.imageUrl} alt={badge.name} title={badge.name} style={{ backgroundColor: badge.tagStyle?.toLowerCase() === 'filled' ? badge.tagColor || undefined : undefined, borderColor: badge.borderColor || undefined }} /> : <span key={`${badge.name}:${index}`} style={{ backgroundColor: badge.tagStyle?.toLowerCase() === 'filled' ? badge.tagColor || undefined : undefined, color: badge.textColor || undefined }}>{badge.name}</span>)}
    {selection?.badges.showFileSize && fileSize && <strong>SIZE {fileSize}</strong>}
  </span>;
  return <article className="streams-card" onContextMenu={onContextMenu}>
    <button className="streams-card-content" onClick={onPlay} disabled={disabled || !stream.playable} aria-label={`Play ${stream.name}`}>
      <span className="streams-card-copy">
        {badgesTop && badgeRow}
        <span className="streams-card-title">{stream.name}</span>
        {details && <span className="streams-card-description">{details}</span>}
        {metaRows.map((row, index) => <span className="streams-card-metadata" key={index}>{row.map((value, valueIndex) => <span key={`${value}:${valueIndex}`}>{value}</span>)}</span>)}
        {providerLogo && <img className="streams-provider-logo" src={providerLogo} alt="Provider" />}
        {!badgesTop && badgeRow}
      </span>
      {busy && <span className="streams-card-play" aria-label="Starting playback"><LoaderCircle className="spin" size={18} /></span>}
    </button>
  </article>;
}

function StreamContextMenu({ stream, x, y, onClose, onCopy, onDownload }: { stream: Stream; x: number; y: number; onClose: () => void; onCopy: () => void; onDownload: () => void }) {
  const onKeyDown = useMenuNav(onClose);
  useEffect(() => {
    const dismiss = (event: MouseEvent) => { if (!(event.target instanceof Element) || !event.target.closest('.stream-context-menu')) onClose(); };
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('mousedown', dismiss); document.removeEventListener('keydown', keydown); };
  }, [onClose]);
  const left = Math.min(x, window.innerWidth - 250);
  const top = Math.min(y, window.innerHeight - 112);
  return createPortal(<div className="stream-context-menu" role="menu" style={{ left: Math.max(8, left), top: Math.max(8, top) }} onKeyDown={onKeyDown}>
    <button role="menuitem" disabled={!stream.url} onClick={onCopy}><Copy size={17} /> Copy stream link</button>
    <button role="menuitem" disabled={!stream.downloadable} onClick={onDownload}><Download size={17} /> Download file</button>
  </div>, document.body);
}

function formatClock(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatSize(bytes: number) {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${(Math.round(gb * 10) / 10).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}
