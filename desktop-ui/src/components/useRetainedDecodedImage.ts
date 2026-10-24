import { useEffect, useState } from 'react';
import { useDecodedImage } from './useDecodedImage';

/** Keep this title's decoded artwork until its replacement is ready to paint. */
export function useRetainedDecodedImage(url: string | null | undefined, owner: string) {
  const decoded = useDecodedImage(url);
  const [previous, setPrevious] = useState<{ owner: string; url: string } | null>(null);
  useEffect(() => {
    if (decoded.ready && url) setPrevious({ owner, url });
  }, [decoded.ready, url, owner]);
  if (decoded.ready && url) return url;
  return previous?.owner === owner ? previous.url : null;
}
