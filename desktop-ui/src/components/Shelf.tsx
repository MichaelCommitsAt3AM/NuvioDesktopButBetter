import type { Media, Shelf as ShelfData } from '../generated/contract';
import { Poster } from './Poster';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { HorizontalRail } from './HorizontalRail';
import { useNavigate } from 'react-router-dom';
import { call } from '../bridge';

export function Shelf({ shelf, onItemClick, source = 'home', className, posterSizeScale = 1, showPosterRating = true, fixedPosterSize = false }: { shelf: ShelfData; onItemClick?: (item: Media) => void; source?: 'home' | 'search'; className?: string; posterSizeScale?: number; showPosterRating?: boolean; fixedPosterSize?: boolean }) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const viewAll = async () => { setOpening(true); setError(''); try { await call('catalog.open', { key: shelf.key, source }); navigate(`/catalog?key=${encodeURIComponent(shelf.key)}&source=${source}`); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setOpening(false); } };
  return <section className={`shelf ${className ?? ''}`}><div className="shelf-heading"><div><h2><button className="shelf-title-button" onClick={()=>void viewAll()}>{shelf.title}</button></h2>{source !== 'search' && shelf.subtitle && <p>{shelf.subtitle}</p>}</div><div className="shelf-actions">{shelf.hasMore && <button className="text-button shelf-view-all" aria-label={`View all ${shelf.title}`} disabled={opening} onClick={() => void viewAll()}><ChevronRight size={16}/></button>}</div></div>{error && <p className="form-error" role="alert">{error}</p>}<HorizontalRail label={shelf.title}>{shelf.items.map((item, index) => <Poster key={`${item.type}-${item.id}-${index}`} item={item} sizeScale={posterSizeScale} fixedDisplaySize={fixedPosterSize} showRating={showPosterRating} onClick={onItemClick ? () => onItemClick(item) : undefined} />)}</HorizontalRail></section>;
}
