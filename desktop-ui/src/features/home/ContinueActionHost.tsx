import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { HomeVisibility } from './homeVisibility';

const ContinueActionContext = createContext<((dialog: ReactNode) => void) | null>(null);

/** The overlay outlives its shelf card: Kotlin removes the shelf item after
 * 1500ms, then gives the overlay backdrop another 300ms to disappear. */
export function ContinueActionHost({ scope, children }: { scope: number | null; children: ReactNode }) {
  const active = useContext(HomeVisibility);
  const [dialog, setDialog] = useState<{ scope: number | null; node: ReactNode } | null>(null);
  const present = useCallback((node: ReactNode) => setDialog(node ? { scope, node } : null), [scope]);
  useLayoutEffect(() => { if (!active) setDialog(null); }, [active]);
  useLayoutEffect(() => { setDialog(current => current?.scope === scope ? current : null); }, [scope]);
  return <ContinueActionContext.Provider value={present}>{children}{active && dialog?.scope === scope && dialog.node}</ContinueActionContext.Provider>;
}

export function useContinueActionHost() { return useContext(ContinueActionContext); }

export function ContinueActionPortal({ children }: { children: ReactNode }) {
  const present = useContinueActionHost();
  // Present once. The host intentionally retains this node if repository data
  // unmounts the card; closing, profile changes and route visibility own cleanup.
  useLayoutEffect(() => { present?.(children); }, [present]); // eslint-disable-line react-hooks/exhaustive-deps
  return present ? null : children;
}
