import { useState } from 'react';
import { useDecodedImage } from '../../components/useDecodedImage';

export function HeroTitle({ url, name, onOpen }: { url?: string | null; name: string; onOpen: () => void }) {
  const { ready, failed } = useDecodedImage(url);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  if (!url || failed || brokenUrl === url) return <h1>{name}</h1>;
  return <button className="hero-logo-button" onClick={onOpen} aria-label={name}>
    {ready && <img className="hero-logo hero-logo-ready" src={url} alt={name} decoding="async" onError={() => setBrokenUrl(url)} />}
  </button>;
}
