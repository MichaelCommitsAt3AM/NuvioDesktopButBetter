import { build } from 'vite';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NUVIO_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = await mkdtemp(path.join(tmpdir(), 'nuvio-topbar-intent-'));
await build({ configFile: false, publicDir: false, define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { lib: { entry: path.join(root, 'scripts/topbar-intent-check-entry.tsx'), name: 'TopbarCheck', formats: ['iife'], fileName: () => 'check.js' }, outDir: output, minify: false } });
const browser = await chromium.launch({ headless: true, ...(process.env.NUVIO_BROWSER_CHANNEL ? { channel: process.env.NUVIO_BROWSER_CHANNEL } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.setContent('<body style="background:#111;margin:0"></body>');
  for (const file of (await readdir(output)).filter(file => file.endsWith('.css'))) await page.addStyleTag({ content: await readFile(path.join(output, file), 'utf8') });
  await page.addScriptTag({ content: await readFile(path.join(output, 'check.js'), 'utf8') });
  const session = await page.context().newCDPSession(page);
  let layers = [];
  const filmstrip = [];
  session.on('LayerTree.layerTreeDidChange', event => { layers = event.layers ?? []; });
  session.on('Page.screencastFrame', event => {
    filmstrip.push({ timestamp: event.metadata.timestamp, data: event.data });
    void session.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
  });
  await session.send('LayerTree.enable');
  await session.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  const results = await page.evaluate(() => TopbarCheck.runChecks());
  const { root: documentRoot } = await session.send('DOM.getDocument');
  const { nodeId } = await session.send('DOM.querySelector', { nodeId: documentRoot.nodeId, selector: '.liquid-nav-native' });
  const { node } = await session.send('DOM.describeNode', { nodeId });
  const reasons = [];
  for (const layer of layers.filter(layer => layer.backendNodeId === node.backendNodeId)) {
    reasons.push(...(await session.send('LayerTree.compositingReasons', { layerId: layer.layerId })).compositingReasons);
  }
  results.bubbleCompositingReasons = reasons;
  if (!reasons.some(reason => /active accelerated transform animation/i.test(reason))) throw new Error('Bubble transform was not running on the compositor');
  await session.send('Page.stopScreencast');
  results.filmstrip = [];
  for (const [index, frame] of filmstrip.entries()) {
    const file = `frame-${String(index).padStart(3, '0')}.png`;
    await writeFile(path.join(output, file), Buffer.from(frame.data, 'base64'));
    results.filmstrip.push({ file, timestamp: frame.timestamp });
  }
  results.filmstripFramesDuringBlockingRender = results.filmstrip.filter(frame => {
    const offset = frame.timestamp * 1000 - results.timeOrigin - results.commitAt;
    return offset > 0 && offset < results.blockingRenderMs;
  }).length;
  await page.evaluate(() => TopbarCheck.dispose());
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ ...results, output }, null, 2));
} finally { await browser.close(); }
