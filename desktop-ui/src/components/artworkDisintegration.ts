import { ASH_DURATION_MS, ashGrainFrame, ashProgress, createAshField, frontWave } from './ashMotion';

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
  const backgroundPromise = artworkUrl ? loadImage(artworkUrl, true).catch(() => loadImage(artworkUrl!)) : Promise.resolve(null);
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

/** The callback runs only after the immutable snapshot exists, as in Kotlin.
 * A cancellation never invokes completion (profile/route changes own cleanup). */
export function animateArtworkDisintegration(node: HTMLElement, onStarted: () => void, onFinished: () => void) {
  let cancelled = false, frame = 0;
  let didStart = false;
  const startOnce = () => { if (!didStart) { didStart = true; onStarted(); } };
  let canvas: HTMLCanvasElement | undefined;
  let fallback: Animation | undefined;
  let timer = 0;
  const originalOpacity = [...node.children].map(child => [child as HTMLElement, (child as HTMLElement).style.opacity] as const);
  const restore = () => { canvas?.remove(); for (const [child, opacity] of originalOpacity) child.style.opacity = opacity; };
  void captureArtwork(node).then(bitmap => {
    if (cancelled) return;
    const width = bitmap.width, height = bitmap.height;
    const field = createAshField(width, height);
    canvas = document.createElement('canvas');
    // Match Compose's unclipped draw scope: ash rises above/right of the card.
    canvas.width = Math.ceil(width * 2.6); canvas.height = Math.ceil(height * 3.6);
    Object.assign(canvas.style, { position: 'absolute', left: `${-width * .2}px`, top: `${-height * 2.6}px`, width: `${canvas.width}px`, height: `${canvas.height}px`, pointerEvents: 'none' });
    canvas.setAttribute('aria-hidden', 'true');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    // Read image colors once where permitted. With non-CORS artwork, draw
    // one-pixel source samples directly; canvas taint never breaks the effect.
    let colors: string[] | undefined;
    let atlas: HTMLCanvasElement | undefined;
    try {
      const pixels = bitmap.getContext('2d')!.getImageData(0, 0, width, height).data;
      colors = field.grains.map(grain => {
        const offset = (Math.floor(grain.ny * (height - 1)) * width + Math.floor(grain.nx * (width - 1))) * 4;
        return `rgba(${Math.min(255, pixels[offset] * grain.shade)},${Math.min(255, pixels[offset + 1] * grain.shade)},${Math.min(255, pixels[offset + 2] * grain.shade)},${pixels[offset + 3] / 255})`;
      });
    } catch {
      // Prepare the tiny palette once, rather than sampling a full-size tainted
      // bitmap thousands of times per frame. Brightness matches Kotlin's shade.
      atlas = document.createElement('canvas'); atlas.width = field.cols; atlas.height = field.rows;
      const palette = atlas.getContext('2d')!;
      field.grains.forEach((grain, index) => {
        palette.filter = `brightness(${grain.shade})`;
        palette.drawImage(bitmap, Math.floor(grain.nx * (width - 1)), Math.floor(grain.ny * (height - 1)), 1, 1, index % field.cols, Math.floor(index / field.cols), 1, 1);
      });
    }
    node.appendChild(canvas);
    // LiftedCardArtwork deliberately gives every cloned descendant explicit
    // visibility:visible. Opacity hides the composited subtree, so descendants
    // cannot leave the intact card showing underneath (or after) the ash.
    for (const [child] of originalOpacity) child.style.opacity = '0';
    const start = performance.now();
    startOnce();
    const grainFrame = { x: 0, y: 0, scale: 0, alpha: 0 };
    const draw = (now: number) => {
      if (cancelled) return;
      const fraction = Math.min(1, (now - start) / ASH_DURATION_MS);
      const p = ashProgress(fraction);
      context.clearRect(0, 0, canvas!.width, canvas!.height);
      context.save(); context.translate(width * .2, height * 2.6);
      const threshold = 1 - p / .5;
      if (threshold > -.1) {
        context.save(); context.beginPath();
        for (let i = 0; i <= 28; i++) {
          const ny = i / 28;
          const boundary = (threshold - .52 * (1 - ny) - frontWave(ny, field.wavePhase)) / .48;
          const x = Math.min(width, Math.max(0, boundary * width));
          if (i === 0) context.moveTo(x, ny * height); else context.lineTo(x, ny * height);
        }
        context.lineTo(0, height); context.lineTo(0, 0); context.closePath(); context.clip();
        context.drawImage(bitmap, 0, 0); context.restore();
      }
      field.grains.forEach((grain, index) => {
        const tile = ashGrainFrame(grain, p, width, height, grainFrame);
        if (!tile) return;
        const w = (width / field.cols + .6) * tile.scale, h = (height / field.rows + .6) * tile.scale;
        context.globalAlpha = tile.alpha;
        if (colors) { context.fillStyle = colors[index]; context.fillRect(tile.x - w / 2, tile.y - h / 2, w, h); }
        else context.drawImage(atlas!, index % field.cols, Math.floor(index / field.cols), 1, 1, tile.x - w / 2, tile.y - h / 2, w, h);
      });
      context.restore();
      if (fraction < 1) frame = requestAnimationFrame(draw);
      else onFinished();
    };
    frame = requestAnimationFrame(draw);
  }).catch(() => {
    if (cancelled) return;
    restore();
    // A failed image decode must not prevent removal or strand the dialog.
    startOnce();
    fallback = node.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: ASH_DURATION_MS, fill: 'forwards' });
    timer = window.setTimeout(() => { if (!cancelled) onFinished(); }, ASH_DURATION_MS);
  });
  return () => { cancelled = true; cancelAnimationFrame(frame); clearTimeout(timer); fallback?.cancel(); restore(); };
}
