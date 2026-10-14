import { useEffect, useState, type CSSProperties } from 'react';

type Props = {
  sources: Array<string | null | undefined>;
  alt?: string;
  loading?: 'lazy' | 'eager';
  style?: CSSProperties;
};

const EMPTY: ReadonlySet<string> = new Set();

/** Image that walks a source list as each URL fails, rendering nothing once all fail. */
export function FallbackImage({ sources, alt = '', loading = 'lazy', style }: Props) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(EMPTY);
  const identity = sources.join('\0');
  useEffect(() => { setFailed(EMPTY); }, [identity]);
  const src = sources.find((source): source is string => !!source && !failed.has(source)) ?? null;
  if (!src) return null;
  return <img key={src} src={src} alt={alt} loading={loading} style={style} onError={() => setFailed((previous) => new Set(previous).add(src))} />;
}
