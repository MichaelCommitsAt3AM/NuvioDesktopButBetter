// Run with NUVIO_PLAYWRIGHT_MODULE pointing to an available Playwright installation.
import { build } from 'vite';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NUVIO_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = await mkdtemp(path.join(tmpdir(), 'nuvio-navigation-check-'));
await build({ configFile: false, publicDir: false, define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { lib: { entry: path.join(root, 'scripts/navigation-performance-entry.tsx'), name: 'NavigationCheck', formats: ['iife'], fileName: () => 'check.js' }, outDir: output, minify: false } });
const browser = await chromium.launch({ headless: true, ...(process.env.NUVIO_BROWSER_CHANNEL ? { channel: process.env.NUVIO_BROWSER_CHANNEL } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const session = await page.context().newCDPSession(page);
  await session.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing', transferMode: 'ReturnAsStream' });
  await page.setContent('<body style="margin:0;background:#111"></body>');
  await page.addScriptTag({ content: await readFile(path.join(output, 'check.js'), 'utf8') });
  const result = await page.evaluate(() => NavigationCheck.runChecks());
  const completed = new Promise(resolve => session.once('Tracing.tracingComplete', resolve));
  await session.send('Tracing.end');
  const { stream } = await completed;
  let trace = '';
  while (true) {
    const part = await session.send('IO.read', { handle: stream });
    trace += part.base64Encoded ? Buffer.from(part.data, 'base64').toString('utf8') : part.data;
    if (part.eof) break;
  }
  await session.send('IO.close', { handle: stream });
  await writeFile(path.join(output, 'trace.json'), trace);
  await writeFile(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, output }, null, 2));
} finally { await browser.close(); }
