import { ASH_DURATION_MS, ashProgress, createAshField } from './ashMotion';
import { createCanvasAshRenderer, createGpuAshRenderer, type AshRenderer } from './ashRenderer';
import { invoke, isTauri } from '@tauri-apps/api/core';

function loadImage(url: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => { image.src = ''; reject(new Error('Artwork decode timed out')); }, 1500);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('Artwork unavailable')); };
    if (crossOrigin) image.crossOrigin = 'anonymous';
    image.src = url;
  });
}

/** Rasterize the lifted card's real DOM typography, gradients and badges. The
 * artwork is drawn separately: a provider without CORS must still animate, and
 * must never force us to read a tainted canvas. Everything stays on this device. */
export async function captureArtwork(node: HTMLElement): Promise<HTMLCanvasElement> {
  const width = node.clientWidth, height = node.clientHeight;
  if (!width || !height) throw new Error('Artwork has no bounds');
  const bitmap = document.createElement('canvas');
  bitmap.width = width; bitmap.height = height;
  const context = bitmap.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  const clone = node.cloneNode(true) as HTMLElement;
  const originals = [node, ...node.querySelectorAll<HTMLElement>('*')];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')];
  let artworkUrl: string | undefined;
  for (let i = 0; i < originals.length; i++) {
    const style = getComputedStyle(originals[i]);
    const copy = copies[i];
    for (const property of Array.from(style)) {
      let value = style.getPropertyValue(property);
      if (property === 'background-image') {
        const urlPattern = /url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/g;
        const match = urlPattern.exec(value);
        artworkUrl ??= match?.[1] ?? match?.[2] ?? match?.[3];
        value = value.replace(/,?\s*url\((?:"[^"]*"|'[^']*'|[^)]*)\)/g, '').trim() || 'none';
      } else if (value.includes('url(')) value = 'none';
      copy.style.setProperty(property, value);
    }
    // The real card's fallback color sits underneath its background image.
    // Keep it from covering the separately drawn image in our text overlay.
    if (style.backgroundImage.includes('url(')) copy.style.backgroundColor = 'transparent';
    copy.style.animation = 'none'; copy.style.transition = 'none';
    copy.removeAttribute('id'); copy.removeAttribute('data-source-key');
  }
  Object.assign(clone.style, { width: `${width}px`, height: `${height}px`, position: 'relative', left: '0', top: '0', margin: '0', transform: 'none', opacity: '1' });
  const serialized = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
  // data: SVG has no external resources; foreignObject keeps the exact live
  // text layout, even when the lifted source has a scale transform.
  const overlayPromise = loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const backgroundPromise = artworkUrl ? loadImage(artworkUrl, true).catch(async () => {
    // Native preparation is only for an image already displayed by this card.
    // An origin-clean copy lets blocked-CORS providers use the same GPU batch.
    if (isTauri() && artworkUrl!.startsWith('https://')) {
      try { return await loadImage(await invoke<string>('artwork_image_data_url', { url: artworkUrl })); } catch { /* retain the browser-only path */ }
    }
    return loadImage(artworkUrl!);
  }) : Promise.resolve(null);
  const [overlay, background] = await Promise.all([overlayPromise, backgroundPromise]);
  context.save();
  const radius = parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0;
  context.beginPath(); context.roundRect(0, 0, width, height, radius); context.clip();
  if (background) {
    const cover = Math.max(width / background.naturalWidth, height / background.naturalHeight);
    const w = background.naturalWidth * cover, h = background.naturalHeight * cover;
    if (node.querySelector('.home-cw-blurred-image')) context.filter = 'blur(18px)';
    context.drawImage(background, (width - w) / 2, (height - h) / 2, w, h);
    context.filter = 'none';
  }
  context.drawImage(overlay, 0, 0, width, height);
  context.restore();
  return bitmap;
}

const prepared = new WeakMap<HTMLElement, { width: number; height: number; bitmap: Promise<HTMLCanvasElement> }>();

/** Prepare while the menu is open, so image decoding/network work does not
 * compete with the first particle frames. Entries leave with their DOM node. */
export function prepareArtworkDisintegration(node: HTMLElement): Promise<HTMLCanvasElement> {
  const existing = prepared.get(node);
  if (existing?.width === node.clientWidth && existing.height === node.clientHeight) return existing.bitmap;
  const bitmap = captureArtwork(node);
  const entry = { width: node.clientWidth, height: node.clientHeight, bitmap };
  prepared.set(node, entry);
  void bitmap.catch(() => { if (prepared.get(node) === entry) prepared.delete(node); });
  return bitmap;
}

/** Snapshot first, then run at the display's rAF cadence. Frame work consists of
 * a progress uniform and GPU submissions; field buffers/textures are immutable. */
export function animateArtworkDisintegration(node: HTMLElement, onStarted: () => void, onFinished: () => void) {
  let cancelled = false, frame = 0, didStart = false;
  const startOnce = () => { if (!didStart) { didStart = true; onStarted(); } };
  let renderer: AshRenderer | undefined;
  let fallback: Animation | undefined;
  let timer = 0;
  const originalOpacity = [...node.children].map(child => [child as HTMLElement, (child as HTMLElement).style.opacity] as const);
  const restore = () => {
    renderer?.dispose(); renderer?.canvas.remove(); renderer = undefined;
    for (const [child, opacity] of originalOpacity) child.style.opacity = opacity;
  };
  const fade = (duration = ASH_DURATION_MS) => {
    if (cancelled) return;
    restore(); startOnce();
    fallback = node.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration, fill: 'forwards' });
    timer = window.setTimeout(() => { if (!cancelled) onFinished(); }, duration);
  };
  const snapshot = prepareArtworkDisintegration(node);
  prepared.delete(node); // Consume the warm snapshot; retries must capture current artwork.
  void snapshot.then(bitmap => {
    if (cancelled) return;
    const field = createAshField(bitmap.width, bitmap.height);
    renderer = createGpuAshRenderer(bitmap, field) ?? createCanvasAshRenderer(bitmap, field);
    node.appendChild(renderer.canvas);
    // Opacity hides the entire composited clone, including descendants whose
    // frozen visibility:visible would override a visibility:hidden wrapper.
    for (const [child] of originalOpacity) child.style.opacity = '0';
    const start = performance.now();
    startOnce();
    const draw = (now: number) => {
      if (cancelled) return;
      const fraction = Math.min(1, (now - start) / ASH_DURATION_MS);
      const p = ashProgress(fraction);
      try { renderer!.draw(p); }
      catch {
        // GPU switching/context loss must not strand the popup or restart time.
        try {
          const previous = renderer!;
          renderer = createCanvasAshRenderer(bitmap, field);
          previous.canvas.replaceWith(renderer.canvas); previous.dispose(); renderer.draw(p);
        } catch { fade(Math.max(0, ASH_DURATION_MS - (now - start))); return; }
      }
      if (fraction < 1) frame = requestAnimationFrame(draw);
      else onFinished();
    };
    frame = requestAnimationFrame(draw);
  }).catch(() => fade());
  return () => { cancelled = true; cancelAnimationFrame(frame); clearTimeout(timer); fallback?.cancel(); restore(); };
}
