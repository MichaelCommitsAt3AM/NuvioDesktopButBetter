import { useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function useFullscreenEscape() {
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let pending = false;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat || event.isComposing || pending) return;
      pending = true;
      const exitFullscreen = async () => {
        const appWindow = getCurrentWindow();
        if (await appWindow.isFullscreen() && active) await appWindow.setFullscreen(false);
      };
      void exitFullscreen().catch(error => console.warn('Could not exit fullscreen', error)).finally(() => { pending = false; });
    };
    // Capture also reaches Escape pressed inside dialogs and menus that stop
    // propagation. Their own dismissal behavior continues to work normally.
    window.addEventListener('keydown', onKeyDown, true);
    return () => { active = false; window.removeEventListener('keydown', onKeyDown, true); };
  }, []);
}
