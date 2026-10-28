// NUVIO_PLAYWRIGHT_MODULE may point at the desktop app's bundled Playwright.
// No external site, provider account, or user's watch history is used.
import { build } from 'vite';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NUVIO_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = await mkdtemp(path.join(tmpdir(), 'nuvio-ash-browser-'));
await build({ configFile: false, publicDir: false, build: { lib: { entry: path.join(root, 'scripts/ash-renderer-check-entry.ts'), name: 'AshCheck', formats: ['iife'], fileName: () => 'check.js' }, outDir: output, minify: false } });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.setContent('<body style="background:#111;margin:0"></body>');
  await page.addScriptTag({ content: await readFile(path.join(output, 'check.js'), 'utf8') });
  await page.route('https://ash-fixture.invalid/opaque.svg', route => route.fulfill({ contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': 'https://wrong.invalid' }, body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225"><rect width="400" height="225" fill="#bd5738"/></svg>' }));
  const results = await page.evaluate(async () => {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const bitmap = document.createElement('canvas'); bitmap.width = 400; bitmap.height = 225;
    const ctx = bitmap.getContext('2d');
    ctx.beginPath(); ctx.roundRect(0, 0, 400, 225, 15); ctx.clip();
    const gradient = ctx.createLinearGradient(0, 0, 400, 225); gradient.addColorStop(0, '#e7aa73'); gradient.addColorStop(.5, '#2583b9'); gradient.addColorStop(1, '#bf533a');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 400, 225); ctx.fillStyle = '#fff'; ctx.font = 'bold 25px Arial'; ctx.fillText('Particle parity', 20, 190);
    let seed = 17; const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const field = AshCheck.createAshField(400, 225, random);
    assert(field.grains.length === 9490, 'Particle density changed');
    const gpu = AshCheck.createGpuAshRenderer(bitmap, field), cpu = AshCheck.createCanvasAshRenderer(bitmap, field);
    assert(gpu, 'WebGL2 unavailable in browser verification');
    const gl = gpu.canvas.getContext('webgl2'), differences = [];
    for (const progress of [0, .15, .35, .55, .8, 1]) {
      gpu.draw(progress); cpu.draw(progress);
      const width = gpu.canvas.width, height = gpu.canvas.height;
      const actual = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, actual);
      const expected = cpu.canvas.getContext('2d').getImageData(0, 0, width, height).data;
      let difference = 0, gpuAlpha = 0, cpuAlpha = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const a = ((height - y - 1) * width + x) * 4, b = (y * width + x) * 4;
        const alpha = actual[a + 3]; gpuAlpha += alpha; cpuAlpha += expected[b + 3];
        // Compare premultiplied pixels: readPixels is premultiplied while
        // Canvas ImageData exposes unpremultiplied channels.
        for (let c = 0; c < 3; c++) difference += Math.abs(actual[a + c] - expected[b + c] * expected[b + 3] / 255);
        difference += Math.abs(alpha - expected[b + 3]);
      }
      const error = difference / expected.length;
      assert(error < 5, `GPU/Canvas visual mismatch at ${progress}: ${error}`);
      if (progress === 1) assert(gpuAlpha === 0 && cpuAlpha === 0, 'Final frame is not empty');
      differences.push({ progress, meanChannelError: error });
    }
    gpu.dispose(); cpu.dispose();
    const node = document.body.appendChild(document.createElement('div'));
    Object.assign(node.style, { position: 'relative', margin: '320px 80px', width: '400px', height: '225px', overflow: 'visible' });
    node.innerHTML = '<div style="width:100%;height:100%;visibility:visible;background-size:cover"><span style="visibility:visible">Intact clone</span></div>';
    const art = node.firstElementChild;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225"><rect width="400" height="225" fill="#2583b9"/></svg>';
    const run = async (opaque, loseContext = false) => {
      art.style.backgroundImage = `url("${opaque ? 'https://ash-fixture.invalid/opaque.svg' : 'data:image/svg+xml,' + encodeURIComponent(svg)}")`;
      let cancel, initialRenderer;
      await new Promise(resolve => { cancel = AshCheck.animateArtworkDisintegration(node, () => {
        const canvas = node.querySelector('canvas'); initialRenderer = canvas.dataset.ashRenderer;
        if (loseContext) setTimeout(() => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext(), 100);
      }, resolve); });
      const canvas = node.querySelector('canvas'); const renderer = canvas.dataset.ashRenderer;
      assert(art.style.opacity === '0', 'Intact clone reappeared');
      assert(renderer === (opaque || loseContext ? 'canvas2d' : 'webgl2'), 'Wrong renderer fallback');
      if (renderer === 'webgl2') {
        const gl = canvas.getContext('webgl2'), pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        assert(!pixels.some((v, i) => i % 4 === 3 && v), 'Visible grains remain after completion');
      }
      cancel(); assert(!node.querySelector('canvas') && art.style.opacity === '', 'Cancellation did not restore the card');
      return { opaque, loseContext, initialRenderer, finalRenderer: renderer };
    };
    const lifecycle = [await run(false), await run(true), await run(false, true)];
    let started = false, finished = false;
    const cancel = AshCheck.animateArtworkDisintegration(node, () => { started = true; }, () => { finished = true; }); cancel();
    await new Promise(resolve => setTimeout(resolve, 100));
    assert(!started && !finished && !node.querySelector('canvas'), 'Cancelled preparation ran callbacks'); node.remove();
    return { differences, lifecycle, cancellation: true };
  });
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ output, ...results }));
} finally { await browser.close(); }
