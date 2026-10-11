import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shuffle } from 'lucide-react';
import { call } from '../../bridge';
import { Dialog } from '../../components/Dialog';
import { InlineError } from '../../components/Status';

type ShuffleState = { available: boolean; enabled: boolean; includeWatched: boolean; allCount: number; unwatchedCount: number; watched: boolean; hideArtwork: boolean; resume: boolean; episode: { id: string; title: string; thumbnail: string | null; overview: string | null; season: number; episode: number } | null };
export function EpisodeShuffle({ type, id }: { type: string; id: string }) {
  const [state, setState] = useState<ShuffleState | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { let active = true; void call<ShuffleState>('details.shuffle.snapshot', { type,id }).then(result => { if (active && result) setState(result); }).catch(() => {}); return () => { active = false; }; }, [type,id]);
  const pick = async (includeWatched: boolean, reroll = false) => { setBusy(true); setError(''); try { const result = await call<ShuffleState>('details.shuffle.pick', { type,id,includeWatched,reroll }); if (result) setState(result); } catch(e) { setError(String(e)); } finally { setBusy(false); } };
  const play = async (manual = false, restart = false) => {
    const episode = state?.episode; if (!episode) return;
    setBusy(true); setError('');
    try {
      await call('details.shuffle.save', { type,id,enabled:true,includeWatched:state.includeWatched });
      if (restart) await call('home.continueWatching.reset', { parentMetaId:id,videoId:episode.id });
      navigate(`/details/${encodeURIComponent(type)}/${encodeURIComponent(id)}/streams/${encodeURIComponent(episode.id)}${manual ? '?manual=1' : ''}`); setOpen(false);
    } catch(e) { setError(String(e)); } finally { setBusy(false); }
  };
  if (!state?.available) return null;
  return <><button className="button secondary" onClick={() => { setOpen(true); setError(''); }}><Shuffle size={16} /> Random episode</button>{open && <Dialog label="Random episode" onClose={() => setOpen(false)}><h2>Random episode</h2>{error && <InlineError message={error} />}{!state.episode ? <><p>{state.allCount} released episodes · {state.unwatchedCount} unwatched</p><div className="dialog-actions"><button className="button primary" disabled={busy || !state.unwatchedCount} onClick={() => void pick(false)}>Unwatched episodes</button><button className="button secondary" disabled={busy || !state.allCount} onClick={() => void pick(true)}>Include watched</button></div></> : <><div className="shuffle-art">{!state.hideArtwork && state.episode.thumbnail ? <img src={state.episode.thumbnail} alt="" /> : <Shuffle size={40} />}</div><p>Season {state.episode.season} · Episode {state.episode.episode} · {state.watched ? 'Watched' : 'Unwatched'}</p><h3>{state.episode.title}</h3>{!state.hideArtwork && <p>{state.episode.overview}</p>}<div className="dialog-actions"><button className="button primary" disabled={busy} onClick={() => void play()}>{state.resume ? 'Resume' : 'Play'}</button><button className="button secondary" disabled={busy} onClick={() => void play(true)}>Choose stream</button>{state.resume && <button className="button secondary" disabled={busy} onClick={() => void play(false,true)}>Start from beginning</button>}<button className="button secondary" disabled={busy} onClick={() => void pick(state.includeWatched,true)}>Shuffle again</button></div><label><input type="checkbox" checked={state.includeWatched} disabled={busy} onChange={e => void pick(e.target.checked,true)} /> Include watched episodes</label></>}</Dialog>}</>;
}
