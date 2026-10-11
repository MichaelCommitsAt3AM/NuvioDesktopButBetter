import type { CSSProperties } from 'react';
import type { Media } from '../generated/contract';
import { useFeatureSnapshot } from '../bridge';
import type { AppearanceSnapshot } from '../features/settings/appearanceStore';
import { Poster } from './Poster';

export function PosterGrid({ items }: { items: Media[] }) {
  const appearance = useFeatureSnapshot<AppearanceSnapshot>('appearance');
  const width = (appearance?.cardStyle.widthDp ?? 126) * 1.4 * (appearance?.cardStyle.catalogLandscapeModeEnabled ? 1.6 : 1);
  return <div className="poster-grid" style={{ '--grid-card-width':`calc(${width}px * var(--ui-scale,1))` } as CSSProperties}>{items.map((item,index) => <Poster key={`${item.type}:${item.id}:${index}`} item={item} />)}</div>;
}
