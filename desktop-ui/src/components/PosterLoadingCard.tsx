import './posterLoadingCard.css';

/** Shared shimmering placeholder for poster art and title-card rows while data or images load. */
export function PosterLoadingCard({ variant = 'card', className = '' }: { variant?: 'poster' | 'card'; className?: string }) {
  return <div className={`poster-loading-card ${variant === 'poster' ? 'poster-loading-card-poster' : ''} ${className}`} aria-hidden="true">
    <span className="poster-loading-art poster-loading-shimmer" />
    {variant === 'card' && <><span className="poster-loading-title poster-loading-shimmer" /><span className="poster-loading-meta poster-loading-shimmer" /></>}
  </div>;
}
