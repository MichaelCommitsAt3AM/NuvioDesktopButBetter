import { useEffect, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function useFullscreenEscape(onBack?: () => void) {
  const back = useRef(onBack);
  back.current = onBack;
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let pending = false;
    const fullscreenChecks = new WeakMap<KeyboardEvent, Promise<boolean>>();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat || event.isComposing || pending) return;
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      pending = true;
      const check = getCurrentWindow().isFullscreen();
      fullscreenChecks.set(event, check);
      const exitFullscreen = async () => {
        const appWindow = getCurrentWindow();
        if (await check && active) await appWindow.setFullscreen(false);
      };
      void exitFullscreen().catch(error => console.warn('Could not exit fullscreen', error)).finally(() => { pending = false; });
    };
    const navigateBack = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat || event.isComposing) return;
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input,textarea,select,[contenteditable="true"]')) return;
      void (fullscreenChecks.get(event) ?? Promise.resolve(true)).then(fullscreen => {
        if (active && !fullscreen) back.current?.();
      }).catch(() => {});
    };
    const mouseBack = (event: MouseEvent) => {
      if (event.button !== 3) return;
      event.preventDefault();
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      } else back.current?.();
    };
    // Capture also reaches Escape pressed inside dialogs and menus that stop
    // propagation. Their own dismissal behavior continues to work normally.
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keydown', navigateBack);
    window.addEventListener('mouseup', mouseBack);
    return () => {
      active = false;
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keydown', navigateBack);
      window.removeEventListener('mouseup', mouseBack);
    };
  }, []);
}
