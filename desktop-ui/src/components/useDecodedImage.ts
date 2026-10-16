import { useEffect, useState } from 'react';

/** Reveal only a fully loaded bitmap; ignore completions for obsolete URLs. */
export function useDecodedImage(url?: string | null) {
  const [result, setResult] = useState<{ url: string; failed: boolean } | null>(null);
  useEffect(() => {
    if (!url) return;
    let active = true;
    let decoding = false;
    const image = new Image();
    image.decoding = 'async';
    const fail = () => { if (active) setResult({ url, failed: true }); };
    const reveal = async () => {
      if (decoding) return;
      decoding = true;
      try {
        if (typeof image.decode === 'function') await image.decode();
        if (active) setResult({ url, failed: false });
      } catch { fail(); }
    };
    image.onload = () => { void reveal(); };
    image.onerror = fail;
    image.src = url;
    if (image.complete && image.naturalWidth > 0) void reveal();
    return () => { active = false; image.onload = null; image.onerror = null; };
  }, [url]);
  return { ready: !!url && result?.url === url && !result.failed, failed: !!url && result?.url === url && result.failed };
}
