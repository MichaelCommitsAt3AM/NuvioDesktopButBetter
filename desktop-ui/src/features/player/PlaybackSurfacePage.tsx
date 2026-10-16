import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { call, useSelector } from '../../bridge';
import './playback.css';

/** Keeps browsing content out from behind the embedded native player while it buffers. */
export function PlaybackSurfacePage() {
  const playback = useSelector(current => current.playback);
  const navigate = useNavigate();
  const [restoreError, setRestoreError] = useState(false);
  const restore = useCallback(() => {
    setRestoreError(false);
    void call('playback.restoreFromPip').catch(() => setRestoreError(true));
  }, []);

  useEffect(() => {
    if (!playback.isInPip) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        restore();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playback.isInPip, restore]);

  useEffect(() => {
    if (playback.state === 'stopped' || playback.state === 'cancelled' || playback.state === 'failed') {
      navigate(-1);
    }
  }, [navigate, playback.state]);

  return <div className="playback-surface" aria-label="Player">
    {playback.isInPip && <div className="playback-pip-placeholder">
      <p>Video playing in Picture-in-Picture</p>
      <button type="button" onClick={restore}>Restore to Main Player</button>
      {restoreError && <p role="alert">Could not restore the player. Please try again.</p>}
    </div>}
  </div>;
}
