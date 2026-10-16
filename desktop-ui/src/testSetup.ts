import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom has no scrolling implementation; navigation effects use this in WebView2.
HTMLElement.prototype.scrollTo = vi.fn();

// jsdom has no layout engine; desktop WebView2 provides ResizeObserver.
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});
