import { createPortal } from 'react-dom';
import { ArrowRight, Check, Plus } from 'lucide-react';
import type { Media } from '../generated/contract';

type Props = {
  item: Media;
  rect: DOMRect;
  saved: boolean;
  watched: boolean;
  onOpen: () => void;
  onToggleWatched: () => void;
  onToggleSaved: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

/** Shared expanded poster card used by Home, Search Discover, and Library. */
export function PosterHoverPreview({ item, rect, saved, watched, onOpen, onToggleWatched, onToggleSaved, onMouseEnter, onMouseLeave }: Props) {
  const width = 454;
  const height = 510;
  const left = Math.max(12, Math.min(rect.left - 40, window.innerWidth - width - 12));
  const top = Math.max(12, Math.min(rect.top, window.innerHeight - height - 12));

  return createPortal(<div className="poster-preview home-preview" style={{ left, top }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={event => event.stopPropagation()}>
    {item.background && <img className="home-preview-backdrop" src={item.background} alt="" />}
    {item.logo && <img className="home-preview-logo" src={item.logo} alt={item.name} />}
    <div className="poster-preview-copy">
      {(!item.logo) && <h3>{item.name}</h3>}
      <p>{[item.type.replace(/^./, letter => letter.toUpperCase()), item.releaseInfo, item.rating ? `IMDb ${item.rating}` : null].filter(Boolean).join(' · ')}</p>
      {!!item.genres.length && <p>{item.genres.slice(0, 3).join(' · ')}</p>}
      {item.description && <p className="home-preview-description">{item.description.slice(0, 360)}</p>}
      <div className="home-preview-actions">
        <button className="button primary" onClick={onOpen}>View Details<ArrowRight size={16} /></button>
        <button className="home-preview-round" aria-label={watched ? 'Mark as unwatched' : 'Mark as watched'} onClick={onToggleWatched}><Check size={19} /></button>
        <button className="home-preview-round" aria-label={saved ? 'Remove from library' : 'Add to library'} onClick={onToggleSaved}>{saved ? <Check size={19} /> : <Plus size={19} />}</button>
      </div>
    </div>
  </div>, document.body);
}
