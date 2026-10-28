import { createContext, useContext, useEffect, useRef } from 'react';
import { NavigationType } from 'react-router-dom';

/**
 * `true` while the surrounding root tab is the visible one. Retained tabs stay
 * mounted while hidden, so lifecycle-only work (scroll listeners, paging,
 * focus, portals) must read this instead of relying on a mount effect.
 */
export const TabActivity = createContext(true);

export function useTabActive(): boolean {
  return useContext(TabActivity);
}

/**
 * The navigation type (PUSH/REPLACE/POP) at the last render where this tab was
 * visible. Retained screens must not subscribe to React Router's global
 * NavigationContext: every unrelated route change would otherwise rerender
 * their hidden trees. The provider updates this value only while the tab is
 * active, so scroll restoration still sees Back/Forward on entry.
 */
export const TabNavigationType = createContext<NavigationType>(NavigationType.Push);

export function useTabNavigationType(): NavigationType {
  return useContext(TabNavigationType);
}

/**
 * Runs `onActivate` when a retained tab becomes visible again. The first mount
 * is deliberately excluded: that is still a normal mount and its own effects
 * already run. The callback is read from a ref so pages can pass a fresh
 * closure without re-arming the transition.
 */
export function useTabActivated(onActivate: () => void): void {
  const active = useTabActive();
  const previous = useRef(active);
  const callback = useRef(onActivate);
  callback.current = onActivate;
  useEffect(() => {
    if (!active) {
      previous.current = false;
      return;
    }
    if (previous.current) return;
    previous.current = true;
    callback.current();
  }, [active]);
}
