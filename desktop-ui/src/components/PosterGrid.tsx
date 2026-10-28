import { memo, type CSSProperties } from 'react';
import type { Media } from '../generated/contract';
import { useFeatureSnapshot } from '../bridge';
import type { AppearanceSnapshot } from '../features/settings/appearanceStore';
import { Poster } from './Poster';
import { PosterLoadingCard } from './PosterLoadingCard';
import { PROGRESSIVE_MOUNT_STEP, useProgressiveCount } from './ProgressiveMount';
import { mediaKey, stableKeys } from './keys';
import { posterMetrics } from './posterMetrics';

export const PosterGrid = memo(function PosterGrid({ items, resetKey, initialVisibleCount = 0 }: { items: Media[]; resetKey: string; initialVisibleCount?: number }) {
  const appearance = useFeatureSnapshot<AppearanceSnapshot>('appearance');
  const metrics = posterMetrics(appearance?.cardStyle);
  const visibleCount = useProgressiveCount(items.length, resetKey, PROGRESSIVE_MOUNT_STEP, initialVisibleCount);
  const visibleItems = items.slice(0, visibleCount);
  const itemKeys = stableKeys(visibleItems, (item) => mediaKey(item.type, item.id));
  const pendingCount = items.length - visibleItems.length;
  return <div className="poster-grid" data-rendered-count={visibleCount} style={{ '--movie-card-width':`${metrics.width}px` } as CSSProperties}>
    {visibleItems.map((item,index) => <Poster key={itemKeys[index]} item={item} />)}
    {Array.from({ length: pendingCount }, (_, index) => <PosterLoadingCard variant="poster" key={`skeleton-${index}`} />)}
  </div>;
});
