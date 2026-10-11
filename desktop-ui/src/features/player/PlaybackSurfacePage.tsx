import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from '../../bridge';
import './playback.css';

/** Keeps browsing content out from behind the embedded native player while it buffers. */
export function PlaybackSurfacePage() {
  const playback = useSelector(current => current.playback);
  const navigate = useNavigate();

  useEffect(() => {
    if (playback.state === 'stopped' || playback.state === 'cancelled' || playback.state === 'failed') {
      navigate(-1);
    }
  }, [navigate, playback.state]);

  return <div className="playback-surface" aria-label="Player" />;
}
