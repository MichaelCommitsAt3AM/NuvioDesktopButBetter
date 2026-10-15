import type { CSSProperties } from 'react';
import type { Media } from '../generated/contract';
import { useFeatureSnapshot } from '../bridge';
import type { AppearanceSnapshot } from '../features/settings/appearanceStore';
import { Poster } from './Poster';
import { PosterLoadingCard } from './PosterLoadingCard';
import { useProgressiveCount } from './ProgressiveMount';
import { posterMetrics } from './posterMetrics';

export function PosterGrid({ items, resetKey }: { items: Media[]; resetKey: string }) {
  const appearance = useFeatureSnapshot<AppearanceSnapshot>('appearance');
  const metrics = posterMetrics(appearance?.cardStyle);
  const visibleCount = useProgressiveCount(items.length, resetKey);
  const visibleItems = items.slice(0, visibleCount);
  const pendingCount = items.length - visibleItems.length;
  return <div className="poster-grid" style={{ '--movie-card-width':`${metrics.width}px` } as CSSProperties}>
    {visibleItems.map((item,index) => <Poster key={`${item.type}:${item.id}:${index}`} item={item} />)}
    {Array.from({ length: pendingCount }, (_, index) => <PosterLoadingCard variant="poster" key={`skeleton-${index}`} />)}
  </div>;
}
