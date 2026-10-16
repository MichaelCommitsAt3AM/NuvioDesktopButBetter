/**
 * Dominant-artwork-color service for the DominantColor details background.
 * CORS-safe: remote images load with `crossOrigin="anonymous"` and any
 * tainted-canvas read falls back to null (the caller keeps its surface
 * wash). Results cache by artwork URL; stale requests (route/profile
 * changes) are discarded by generation and never paint a previous title's
 * color. Resolution never blocks initial details rendering.
 */
const cache = new Map<string, string | null>();
const MAX_CACHE = 200;

export function toHex(r: number, g: number, b: number): string {
  const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase();
}

export function cachedDominantColor(url: string | null | undefined): string | null | undefined {
  if (!url) return null;
  return cache.has(url) ? cache.get(url)! : undefined;
}

export type CancelToken = { cancelled: boolean };

export async function fetchDominantColor(url: string, token: CancelToken = { cancelled: false }): Promise<string | null> {
  if (!url) return null;
  if (cache.has(url)) return cache.get(url)!;
  const color = await extract(url).catch(() => null);
  if (token.cancelled) return color;
  cache.delete(url);
  cache.set(url, color);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
  return color;
}

function extract(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const done = (color: string | null) => resolve(color);
    const timeout = window.setTimeout(() => done(null), 8000);
    try {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.onload = () => {
        window.clearTimeout(timeout);
        try {
          const size = 24;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const context = canvas.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings);
          if (!context) { done(null); return; }
          // Center-crop cover into the sample square.
          const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
          const width = image.naturalWidth * scale;
          const height = image.naturalHeight * scale;
          context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
          const data = context.getImageData(0, 0, size, size).data;
          let r = 0, g = 0, b = 0, count = 0;
          for (let index = 0; index < data.length; index += 4) {
            if (data[index + 3] < 128) continue;
            r += data[index]; g += data[index + 1]; b += data[index + 2]; count += 1;
          }
          done(count ? toHex(r / count, g / count, b / count) : null);
        } catch {
          // Tainted canvas (no CORS headers) or missing 2d support.
          done(null);
        }
      };
      image.onerror = () => { window.clearTimeout(timeout); done(null); };
      image.src = url;
    } catch {
      window.clearTimeout(timeout);
      done(null);
    }
  });
}
