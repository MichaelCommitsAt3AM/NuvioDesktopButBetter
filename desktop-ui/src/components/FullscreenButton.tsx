import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';
import { Maximize, Minimize } from 'lucide-react';
import { useTabActive } from '../navigation/tabActivity';
import './fullscreenButton.css';

// Route changes replace the button, but do not change the native window mode.
let lastKnownFullscreen: boolean | null = null;

export function FullscreenButton({ onError, inline = false }: { onError?: (message: string) => void; inline?: boolean }) {
  const [fullscreen, setFullscreen] = useState(() => isTauri() ? lastKnownFullscreen : false);
  const [busy, setBusy] = useState(false);
  const active = useTabActive();

  useEffect(() => {
    if (!active || !isTauri()) return;
    const appWindow = getCurrentWindow();
    let listening = true;
    let revision = 0;
    let unlisten: (() => void) | undefined;
    const refresh = async () => {
      const request = ++revision;
      try {
        const value = await appWindow.isFullscreen();
        if (listening && request === revision) {
          lastKnownFullscreen = value;
          setFullscreen(value);
        }
      } catch { /* Window state may be unavailable during shutdown. */ }
    };
    void appWindow.onResized(refresh).then(dispose => {
      if (listening) unlisten = dispose;
      else dispose();
    }).catch(() => {});
    void refresh();
    return () => { listening = false; unlisten?.(); };
  }, [active]);

  const toggle = async () => {
    setBusy(true);
    try {
      const appWindow = getCurrentWindow();
      await appWindow.setFullscreen(!await appWindow.isFullscreen());
      const value = await appWindow.isFullscreen();
      lastKnownFullscreen = value;
      setFullscreen(value);
    } catch (error) { onError?.(String(error)); }
    finally { setBusy(false); }
  };

  const label = fullscreen === null ? 'Checking fullscreen state' : fullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
  if (!active) return null;
  const button = <button className={`fullscreen-toggle${inline ? ' fullscreen-toggle-inline' : ''}`} type="button" aria-label={label} title={label} disabled={busy || fullscreen === null} onClick={() => void toggle()}>
    {fullscreen !== null && (fullscreen ? <Minimize size={24} /> : <Maximize size={24} />)}
  </button>;
  return inline ? button : createPortal(button, document.body);
}
