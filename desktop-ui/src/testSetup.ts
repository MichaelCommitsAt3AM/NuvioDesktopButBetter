import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom has no layout engine; desktop WebView2 provides ResizeObserver.
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});
