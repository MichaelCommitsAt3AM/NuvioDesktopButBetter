import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NUVIO_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = process.env.NUVIO_PLAYER_UI_DIR || path.join(root, 'composeApp/src/desktopMain/resources/player-ui');
const output = await mkdtemp(path.join(tmpdir(), 'nuvio-skip-progress-'));
const browser = await chromium.launch({ headless: true, ...(process.env.NUVIO_BROWSER_CHANNEL ? { channel: process.env.NUVIO_BROWSER_CHANNEL } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(assets, 'controls.html')).href);
  await page.waitForFunction(() => typeof window.playerControls === 'function');
  await page.evaluate(() => window.playerUpdate({ isPlaying: true, isLoading: false, durationMs: 120000 }));
  const results = [];
  for (const [index, label] of ['Skip Intro', 'Skip Recap', 'Skip Outro', 'Skip Credits', 'Skip to Post-Credits', 'Skip'].entries()) {
    await page.evaluate(({ label, index }) => window.playerControls({
      isLoading: false, isFullscreen: true, controlsVisible: false,
      skipPromptVisible: true, skipPromptDismissed: false,
      skipPromptLabel: label, skipPromptStartMs: index * 10000, skipPromptEndMs: (index + 1) * 10000,
    }), { label, index });
    await page.waitForTimeout(800);
    const geometry = await page.evaluate(() => {
      const prompt = document.getElementById('skipPrompt');
      const track = prompt.querySelector('.skip-progress-track').getBoundingClientRect();
      const fill = document.getElementById('skipPromptProgress').getBoundingClientRect();
      return { visible: prompt.classList.contains('visible'), width: fill.width, height: fill.height, trackWidth: track.width, trackHeight: track.height };
    });
    assert(geometry.visible, `${label}: prompt hidden`);
    assert.equal(geometry.trackHeight, 3, `${label}: track collapsed`);
    assert.equal(geometry.height, 3, `${label}: fill collapsed`);
    assert(geometry.width > 0 && geometry.width < geometry.trackWidth, `${label}: fill must be partway through timeout`);
    results.push({ label, ...geometry });
    if (index === 0) await page.locator('#skipPrompt').screenshot({ path: path.join(output, 'skip-intro.png') });
  }
  const before = results.at(-1).width;
  await page.waitForTimeout(1000);
  const after = await page.locator('#skipPromptProgress').evaluate(element => element.getBoundingClientRect().width);
  assert(after > before, 'fill must advance over time');
  await page.waitForTimeout(8500);
  assert.equal(await page.locator('#skipPrompt').getAttribute('aria-hidden'), 'true', 'prompt must hide after ten seconds');
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ output, variants: results.length, advancing: true, autoHidden: true }));
} finally {
  await browser.close();
}
