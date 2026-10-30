// Uses synthetic cards and production row/rail components; no accounts or network.
import { build } from 'vite';
import { createRequire } from 'node:module';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NUVIO_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = await mkdtemp(path.join(tmpdir(), 'nuvio-home-rows-'));
await build({ root, configFile: false, publicDir: false, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' }, build: { lib: { entry: path.join(root, 'scripts/home-rows-check-entry.tsx'), name: 'HomeRowsCheck', cssFileName: 'fixture', formats: ['iife'], fileName: () => 'check.js' }, outDir: output, minify: false } });
const browser = await chromium.launch({ headless: true, ...(process.env.NUVIO_BROWSER_CHANNEL ? { channel: process.env.NUVIO_BROWSER_CHANNEL } : {}) });
const results = [];
try {
  for (const optimized of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent('<body style="margin:0"><div id="root"></div></body>');
    await page.addStyleTag({ content: '.shelf-track{display:flex;overflow-x:auto;gap:12px}.fixture-card{display:grid}.horizontal-rail{position:relative}' });
    await page.addStyleTag({ content: await readFile(path.join(root, 'src/features/home/homeRow.css'), 'utf8') });
    await page.addScriptTag({ content: await readFile(path.join(output, 'check.js'), 'utf8') });
    await page.evaluate(value => HomeRowsCheck.mount(value), optimized);
    await page.waitForTimeout(200);
    const initialRows = await page.locator('[data-row]').count();
    if (optimized && initialRows > 5) throw new Error('Offscreen rows mounted eagerly');
    // Visit every row, proving lazy rows reveal and remain mounted afterward.
    for (let row = 0; row < 30; row++) {
      if (optimized) await page.locator('.home-row').nth(row).scrollIntoViewIfNeeded();
      else await page.locator('[data-row]').nth(row).scrollIntoViewIfNeeded();
      await page.locator(`[data-row="${row}"]`).waitFor({ state: 'attached' });
    }
    const visitedRows = await page.locator('[data-row]').count();
    if (visitedRows !== 30) throw new Error('Some rows did not reveal');
    const finalTrack = page.locator('[data-row="29"] .shelf-track');
    await finalTrack.evaluate(node => { node.scrollLeft = 500; });
    await page.waitForTimeout(100);
    const topBefore = await page.locator('main').evaluate(node => node.scrollTop);
    await page.locator('main').evaluate(node => { node.style.display = 'none'; });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('main').evaluate(node => { node.style.display = ''; });
    await page.waitForTimeout(200);
    const topAfter = await page.locator('main').evaluate(node => node.scrollTop);
    const horizontal = await finalTrack.evaluate(node => node.scrollLeft);
    if (Math.abs(topBefore - topAfter) > 1 || horizontal !== 500) throw new Error('Retained scroll position moved');
    // Count actual rail width reads during a subsequent window resize.
    await page.evaluate(() => {
      window.railReads = 0;
      const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
      Object.defineProperty(Element.prototype, 'clientWidth', { ...descriptor, get() {
        if (this.classList?.contains('shelf-track')) window.railReads++;
        return descriptor.get.call(this);
      } });
    });
    await page.setViewportSize({ width: 1300, height: 900 });
    await page.waitForTimeout(200);
    const resizeRailReads = await page.evaluate(() => window.railReads);
    if (optimized && resizeRailReads > 10) throw new Error('Far-offscreen rails forced layout');
    results.push({ optimized, initialRows, initialCards: initialRows * 24, visitedRows, horizontal, verticalScrollPreserved: Math.abs(topBefore - topAfter) <= 1, resizeRailReads });
    await page.close();
  }
  console.log(JSON.stringify({ scope: 'Synthetic 30-row fixture; work counts, not native frame-time measurements', results }, null, 2));
} finally { await browser.close(); }
