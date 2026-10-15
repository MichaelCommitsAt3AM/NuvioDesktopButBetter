import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { call, useSelector } from '../../bridge';
import { Dialog } from '../../components/Dialog';
import './launchResume.css';

export type LaunchResumeItem = {
  parentMetaId: string; parentMetaType: string; videoId: string;
  title: string; subtitle: string; poster?: string | null; imageUrl?: string | null;
  background?: string | null; logo?: string | null;
  seasonNumber?: number | null; episodeNumber?: number | null;
  episodeTitle?: string | null; episodeThumbnail?: string | null;
  resumePositionMs: number; resumeProgressFraction?: number | null; progressFraction: number;
};

export function LaunchResumePrompt() {
  const profile = useSelector(state => state.session.activeProfile);
  const navigate = useNavigate();
  const pending = useRef<{ profile: number | null; promise: Promise<LaunchResumeItem | null> } | null>(null);
  const [result, setResult] = useState<{ profile: number | null; item: LaunchResumeItem | null } | null>(null);
  useEffect(() => {
    if (profile === null) return;
    let active = true;
    // Reuse the consuming request across StrictMode's effect restart.
    if (!pending.current || pending.current.profile !== profile) {
      pending.current = { profile, promise: call<LaunchResumeItem | null>('home.resumePrompt.consume') };
    }
    void pending.current.promise.then(item => {
      if (active) setResult({ profile, item });
    }).catch(() => { if (active) setResult(null); });
    return () => { active = false; };
  }, [profile]);
  const item = result?.profile === profile ? result.item : null;
  if (!item) return null;
  const dismiss = () => setResult(null);
  const resume = () => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({
      title: item.title, poster: item.poster, background: item.background, logo: item.logo,
      episodeTitle: item.episodeTitle, episodeThumbnail: item.episodeThumbnail,
      seasonNumber: item.seasonNumber, episodeNumber: item.episodeNumber, resumeMs: item.resumePositionMs,
      resumeProgress: item.resumeProgressFraction,
    })) if (value != null && value !== '') query.set(key, String(value));
    dismiss();
    navigate(`/details/${encodeURIComponent(item.parentMetaType)}/${encodeURIComponent(item.parentMetaId)}/streams/${encodeURIComponent(item.videoId)}?${query}`);
  };
  return <Dialog label="Continue watching?" onClose={dismiss} className="launch-resume-dialog">
    {(item.poster || item.imageUrl) && <img className="launch-resume-poster" src={item.poster || item.imageUrl || undefined} alt="" />}
    <h2>Continue watching?</h2><h3>{item.title}</h3>
    {item.subtitle && <p>{item.subtitle}</p>}
    <progress aria-label="Playback progress" max={1} value={item.progressFraction} />
    <div className="launch-resume-actions"><button onClick={resume}>Resume</button><button onClick={dismiss}>Dismiss</button></div>
  </Dialog>;
}
