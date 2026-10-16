import { useLayoutEffect, type CSSProperties } from 'react';

/** Portals inherit from the document root, so publish the same palette there. */
export function useThemeRoot(variables: CSSProperties) {
  const serialized = JSON.stringify(variables);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const values = JSON.parse(serialized) as Record<string, string>;
    const previous = new Map(Object.keys(values).map(key => [key, root.style.getPropertyValue(key)]));
    for (const [key, value] of Object.entries(values)) root.style.setProperty(key, value);
    return () => {
      for (const [key, value] of previous) {
        if (value) root.style.setProperty(key, value); else root.style.removeProperty(key);
      }
    };
  }, [serialized]);
}
