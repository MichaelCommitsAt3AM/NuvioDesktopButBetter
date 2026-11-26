import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Star } from 'lucide-react';
import { call, useFeatureSnapshot } from '../../bridge';
import { Dialog } from '../../components/Dialog';
import { BottomSheetPresence } from '../../components/BottomSheetPresence';
import './userRating.css';

/** Kotlin TrackingRatings.MAX: ratings are whole numbers from 1 to 10, drawn as five half-stars. */
export const RATING_MAX = 10;
const STAR_COUNT = 5;

export type UserRatingState = { available: boolean; provider: string | null; rating: number | null };
export type RatingTarget = { type: string; id: string; videoId?: string | null };

/** Kotlin formatRating: whole values without decimals, otherwise one decimal. */
export function formatRating(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * The user's own rating for a title or episode (Kotlin rememberRatingState).
 * Refetches when the Tracking settings snapshot changes, so switching the
 * ratings source or disconnecting an account hides or updates the chip.
 */
export function useUserRating(target: RatingTarget | null, scope?: string | number | null) {
  const tracking = useFeatureSnapshot<{ ratingSource?: string; effectiveRatingSource?: string }>('trackingSettings');
  const [state, setState] = useState<UserRatingState | null>(null);
  const type = target?.type ?? null;
  const id = target?.id ?? null;
  const videoId = target?.videoId ?? null;
  const key = type && id ? `${type}\u0000${id}\u0000${videoId ?? ''}` : '';
  const latest = useRef(key);
  latest.current = key;
  const refresh = useCallback(async () => {
    if (!type || !id) { setState(null); return; }
    const requested = `${type}\u0000${id}\u0000${videoId ?? ''}`;
    try {
      const result = await call<UserRatingState>('details.rating.snapshot', ratingParams({ type, id, videoId }));
      if (latest.current === requested) setState(result);
    } catch {
      if (latest.current === requested) setState(null);
    }
  }, [type, id, videoId]);
  useEffect(() => { setState(null); void refresh(); }, [refresh, tracking?.effectiveRatingSource, scope]);
  return { state, setState, refresh };
}

function ratingParams(target: RatingTarget) {
  return { type: target.type, id: target.id, ...(target.videoId ? { videoId: target.videoId } : {}) };
}

/** Kotlin RatingChip: outlined star and "Rate" until rated, then a filled star and the score. */
export function RatingChip({ rating, onClick }: { rating: number | null; onClick: () => void }) {
  const rated = rating != null;
  const label = rated ? `${formatRating(rating)} out of 10` : 'Rate';
  return <button type="button" className={`user-rating-chip ${rated ? 'rated' : ''}`} aria-label={`Your rating, ${label}`} onClick={onClick}>
    <Star key={rated ? `rated-${rating}` : 'unrated'} size={14} className="user-rating-chip-star" fill={rated ? 'currentColor' : 'none'} aria-hidden="true" />
    <span>{rated ? formatRating(rating) : 'Rate'}</span>
  </button>;
}

/** Kotlin RatingSheet + RatingPanel: score, five half-step stars, "Syncs to", Remove and Save. */
export function RatingSheet({ open, target, title, subtitle, state, onClose, onSaved, onNotice }: {
  open: boolean;
  target: RatingTarget;
  title: string;
  subtitle?: string | null;
  state: UserRatingState;
  onClose: () => void;
  onSaved: (state: UserRatingState) => void;
  onNotice: (message: string) => void;
}) {
  return <BottomSheetPresence>{open && <Dialog label="Your rating" onClose={onClose} className="episode-actions-dialog user-rating-dialog">
    <RatingPanel target={target} title={title} subtitle={subtitle} state={state} onClose={onClose} onSaved={onSaved} onNotice={onNotice} />
  </Dialog>}</BottomSheetPresence>;
}

function RatingPanel({ target, title, subtitle, state, onClose, onSaved, onNotice }: {
  target: RatingTarget; title: string; subtitle?: string | null; state: UserRatingState;
  onClose: () => void; onSaved: (state: UserRatingState) => void; onNotice: (message: string) => void;
}) {
  const current = state.rating;
  const [value, setValue] = useState(current == null ? 0 : Math.min(RATING_MAX, Math.max(0, Math.round(current))));
  const [saving, setSaving] = useState(false);
  const provider = state.provider ?? '';
  async function submit(rating: number | null) {
    setSaving(true);
    let saved = false;
    try {
      const result = await call<{ saved: boolean; rating: UserRatingState }>('details.rating.set', { ...ratingParams(target), rating });
      saved = result.saved;
      onSaved(result.rating);
    } catch {
      saved = false;
    } finally {
      setSaving(false);
    }
    onNotice(saved ? (rating == null ? 'Rating removed' : 'Rating saved') : `Couldn't update your rating on ${provider}`);
    onClose();
  }
  return <div className="user-rating-panel">
    <div className="episode-actions-handle" aria-hidden="true" />
    <span className="user-rating-eyebrow">Your rating</span>
    <h2 className="user-rating-title">{title}</h2>
    {subtitle && <span className="user-rating-subtitle">{subtitle}</span>}
    <div className={`user-rating-score ${value > 0 ? 'set' : ''}`} aria-hidden="true">
      <strong key={value}>{value > 0 ? value : '–'}</strong><span>/{RATING_MAX}</span>
    </div>
    <RatingStars value={value} onChange={setValue} />
    <p className="user-rating-syncs">Syncs to {provider}</p>
    <div className="user-rating-actions">
      {current != null && <button type="button" className="button secondary" disabled={saving} onClick={() => void submit(null)}>Remove</button>}
      <button type="button" className="button primary" disabled={saving || value <= 0 || value === current} onClick={() => void submit(value)}>{saving ? 'Saving…' : 'Save'}</button>
    </div>
  </div>;
}

/**
 * Kotlin RatingStars: pressing or dragging across the row picks a value, each
 * half-star is one point. Arrow keys step by one for keyboard users.
 */
export function RatingStars({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const row = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const valueAt = (clientX: number) => {
    const rect = row.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return value;
    const rtl = getComputedStyle(row.current!).direction === 'rtl';
    const position = Math.min(rect.width, Math.max(0, rtl ? rect.right - clientX : clientX - rect.left));
    return Math.min(RATING_MAX, Math.max(1, Math.ceil(position / rect.width * RATING_MAX)));
  };
  const select = (next: number) => { if (next !== value) onChange(next); };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    select(valueAt(event.clientX));
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => { if (dragging.current) select(valueAt(event.clientX)); };
  const stop = () => { dragging.current = false; };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
    if (event.key === 'Home') { event.preventDefault(); select(1); return; }
    if (event.key === 'End') { event.preventDefault(); select(RATING_MAX); return; }
    if (!step) return;
    event.preventDefault();
    select(Math.min(RATING_MAX, Math.max(1, value + step)));
  };
  return <div ref={row} className="user-rating-stars" role="slider" tabIndex={0} aria-label="Rating" aria-valuemin={0} aria-valuemax={RATING_MAX} aria-valuenow={value} aria-valuetext={`${value} out of 10`}
    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stop} onPointerCancel={stop} onKeyDown={onKeyDown}>
    {Array.from({ length: STAR_COUNT }, (_, index) => {
      const fraction = Math.min(1, Math.max(0, value / 2 - index));
      return <span className="user-rating-star" key={index} style={{ transitionDelay: `${index * 40}ms` }} data-fill={fraction === 1 ? 'full' : fraction > 0 ? 'half' : 'empty'}>
        <Star className="user-rating-star-empty" aria-hidden="true" fill="currentColor" strokeWidth={0} />
        <span className="user-rating-star-fill" style={{ width: `${fraction * 100}%` }}><Star aria-hidden="true" fill="currentColor" strokeWidth={0} /></span>
      </span>;
    })}
  </div>;
}
