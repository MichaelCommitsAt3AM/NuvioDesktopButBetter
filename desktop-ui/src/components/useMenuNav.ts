import { useCallback, type KeyboardEvent } from 'react';

/**
 * Arrow-key navigation for popup menus, matching Kotlin `Menu.kt` rows:
 * Up/Down move between enabled items, Home/End jump to the ends. Tab order
 * and Escape/outside dismissal stay with the owning menu.
 */
export function menuItems(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return [...container.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"], button:not([disabled])')]
    .filter((item) => !item.closest('[disabled]') && (item.getClientRects().length > 0 || item instanceof HTMLButtonElement));
}

export function useMenuNav(onClose?: () => void) {
  return useCallback((event: KeyboardEvent<HTMLElement>) => {
    const container = event.currentTarget;
    if (event.key === 'Escape') { onClose?.(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = menuItems(container);
    if (!items.length) return;
    event.preventDefault();
    const active = document.activeElement instanceof HTMLElement ? items.indexOf(document.activeElement) : -1;
    const next = event.key === 'ArrowDown' ? (active + 1) % items.length
      : event.key === 'ArrowUp' ? (active - 1 + items.length) % items.length
      : event.key === 'Home' ? 0 : items.length - 1;
    items[next].focus({ preventScroll: true });
  }, [onClose]);
}
