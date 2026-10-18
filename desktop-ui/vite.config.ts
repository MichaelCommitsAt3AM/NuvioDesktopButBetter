import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The body placeholder shows before the React bundle mounts. Keep it in dev so a
// slow first paint is diagnosable, but never ship it in a release build.
const startupPlaceholder: Plugin = {
  name: 'nuvio-startup-placeholder',
  transformIndexHtml: {
    order: 'pre',
    handler: (html, ctx) => html.replace('__NUVIO_STARTUP_MESSAGE__', ctx.server ? 'Starting Nuvio…' : ''),
  },
};

export default defineConfig({
  plugins: [react(), startupPlaceholder],
  clearScreen: false,
  server: { strictPort: true },
  test: { environment: 'jsdom', setupFiles: './src/testSetup.ts' },
});
