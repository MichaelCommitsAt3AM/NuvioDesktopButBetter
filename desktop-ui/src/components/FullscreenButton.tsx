import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';
import { Maximize, Minimize } from 'lucide-react';
import './fullscreenButton.css';

export function FullscreenButton({ onError, inline = false }: { onError?: (message: string) => void; inline?: boolean }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    const appWindow = getCurrentWindow();
    let active = true;
    let revision = 0;
    let unlisten: (() => void) | undefined;
    const refresh = async () => {
      const request = ++revision;
      try {
        const value = await appWindow.isFullscreen();
        if (active && request === revision) setFullscreen(value);
      } catch { /* Window state may be unavailable during shutdown. */ }
    };
    void appWindow.onResized(refresh).then(dispose => {
      if (active) unlisten = dispose;
      else dispose();
    }).catch(() => {});
    void refresh();
    return () => { active = false; unlisten?.(); };
  }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      const appWindow = getCurrentWindow();
      await appWindow.setFullscreen(!await appWindow.isFullscreen());
      setFullscreen(await appWindow.isFullscreen());
    } catch (error) { onError?.(String(error)); }
    finally { setBusy(false); }
  };

  const label = fullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
  const button = <button className={`fullscreen-toggle${inline ? ' fullscreen-toggle-inline' : ''}`} type="button" aria-label={label} title={label} disabled={busy} onClick={() => void toggle()}>
    {fullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
  </button>;
  return inline ? button : createPortal(button, document.body);
}
