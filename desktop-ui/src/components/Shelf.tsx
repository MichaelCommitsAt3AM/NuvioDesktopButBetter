import type { Media, Shelf as ShelfData } from '../generated/contract';
import { Poster } from './Poster';
import { PosterLoadingCard } from './PosterLoadingCard';
import { useProgressiveCount } from './ProgressiveMount';
import { mediaKey, stableKeys } from './keys';
import { ChevronRight } from 'lucide-react';
import { memo, useState } from 'react';
import { HorizontalRail } from './HorizontalRail';
import { useNavigate } from 'react-router-dom';
import { call } from '../bridge';

export const Shelf = memo(function Shelf({ shelf, onItemClick, source = 'home', className, showPosterRating = true }: { shelf: ShelfData; onItemClick?: (item: Media) => void; source?: 'home' | 'search'; className?: string; showPosterRating?: boolean; fixedPosterSize?: boolean }) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  // Paint loading cards first and fill posters in per-frame steps so tab
  // switches show the destination immediately instead of blocking on the
  // whole shelf tree. Keys are logical media IDs (duplicate-safe), so
  // reorder/filter operations keep mounted posters stable as the fill grows.
  const visibleCount = useProgressiveCount(shelf.items.length, `${source}:${shelf.key}`);
  const visibleItems = shelf.items.slice(0, visibleCount);
  const itemKeys = stableKeys(visibleItems, (item) => mediaKey(item.type, item.id));
  const pendingCount = shelf.items.length - visibleItems.length;
  const viewAll = async () => { setOpening(true); setError(''); try { await call('catalog.open', { key: shelf.key, source }); navigate(`/catalog?key=${encodeURIComponent(shelf.key)}&source=${source}`); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setOpening(false); } };
  return <section className={`shelf ${className ?? ''}`}><div className="shelf-heading"><div><h2><button className="shelf-title-button" onClick={()=>void viewAll()}>{shelf.title}</button></h2>{source !== 'search' && shelf.subtitle && <p>{shelf.subtitle}</p>}</div><div className="shelf-actions">{shelf.hasMore && <button className="text-button shelf-view-all" aria-label={`View all ${shelf.title}`} disabled={opening} onClick={() => void viewAll()}><ChevronRight size={16}/></button>}</div></div>{error && <p className="form-error" role="alert">{error}</p>}<HorizontalRail label={shelf.title}>{visibleItems.map((item, index) => <Poster key={itemKeys[index]} item={item} showRating={showPosterRating} onClick={onItemClick ? () => onItemClick(item) : undefined} />)}{Array.from({ length: pendingCount }, (_, index) => <PosterLoadingCard key={`skeleton-${index}`} />)}</HorizontalRail></section>;
})
