import { useState } from 'react';
import { useRetainedDecodedImageState } from '../../components/useRetainedDecodedImage';

export function DetailsTitle({ url, name, owner, loading = false }: { url?: string | null; name: string; owner: string; loading?: boolean }) {
  const artwork = useRetainedDecodedImageState(url, owner);
  const [broken, setBroken] = useState<{ owner: string; url: string } | null>(null);
  if (artwork.url && !(broken?.owner === owner && broken.url === artwork.url)) {
    return <img className="detail-logo detail-logo-ready" src={artwork.url} alt={name} decoding="async" onError={() => setBroken({ owner, url: artwork.url! })} />;
  }
  if (artwork.loading || (!url && loading)) {
    return <div className="detail-logo detail-logo-loading" role="status" aria-label="Loading title artwork" aria-busy="true" />;
  }
  return <h1>{name}</h1>;
}
