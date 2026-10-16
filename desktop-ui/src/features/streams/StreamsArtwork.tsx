import { useDecodedImage } from '../../components/useDecodedImage';

export function StreamsBackdrop({ url }: { url: string }) {
  const { ready } = useDecodedImage(url);
  return ready ? <img key={url} className="streams-backdrop-image" src={url} alt="" /> : null;
}

export function StreamsTitle({ url, title, opening = false }: { url?: string | null; title: string; opening?: boolean }) {
  const { ready, failed } = useDecodedImage(url);
  if (!url || failed) return opening ? <h1>{title}</h1> : <strong className="streams-title-text">{title}</strong>;
  return <div className={`streams-logo-slot${opening ? ' streams-opening-logo-slot' : ''}`} aria-label={title}>
    {ready && <img key={url} className={opening ? 'streams-opening-logo' : 'streams-title-logo'} src={url} alt={title} />}
  </div>;
}
