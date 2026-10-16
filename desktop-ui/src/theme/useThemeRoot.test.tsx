import { afterEach, expect, it } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useThemeRoot } from './useThemeRoot';
afterEach(cleanup);
it('shares live theme tokens with body portals and restores prior root values on cleanup', () => {
  const root = document.documentElement;
  const previous = root.style.getPropertyValue('--app-accent');
  const view = renderHook(({ accent }) => useThemeRoot({ '--app-accent': accent } as React.CSSProperties), { initialProps: { accent: '#123456' } });
  expect(root.style.getPropertyValue('--app-accent')).toBe('#123456');
  view.rerender({ accent: '#ABCDEF' });
  expect(root.style.getPropertyValue('--app-accent')).toBe('#ABCDEF');
  view.unmount();
  expect(root.style.getPropertyValue('--app-accent')).toBe(previous);
});
