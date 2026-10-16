import { useEffect, useState, type CSSProperties } from 'react';
import './playbackSettings.css';

export function SteppedSlider({ title, value, min, max, step = 1, suffix, description, disabled = false, onSave }: { title: string; value: number; min: number; max: number; step?: number; suffix?: string; description?: string; disabled?: boolean; onSave: (value: number) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const count = Math.round((max - min) / step);
  const snap = (next: number) => Number(Math.max(min, Math.min(max, min + Math.round((next - min) / step) * step)).toFixed(6));
  const commit = (next: number) => { const snapped = snap(next); setDraft(snapped); if (snapped !== value) onSave(snapped); };
  const display = `${draft}${suffix === '%' ? '%' : suffix ? ` ${suffix}` : ''}`;
  return <div className="settings-slider-row stepped-slider-row">
    <div className="stepped-slider-heading"><span><strong>{title}</strong>{description && <small>{description}</small>}</span><span>{display}</span></div>
    <div className="stepped-slider" style={{ '--slider-position': `${(draft - min) / (max - min) * 100}%` } as CSSProperties}>
      <div className="stepped-slider-track" aria-hidden="true"><span className="stepped-slider-active" /><span className="stepped-slider-inactive" />{Array.from({ length: count + 1 }, (_, index) => <i key={index} className={min + index * step <= draft ? 'passed' : ''} style={{ left: `${index / count * 100}%` }} />)}<b /></div>
      <input disabled={disabled} aria-label={title} aria-valuetext={display} type="range" min={min} max={max} step={step} value={draft} onChange={event => setDraft(snap(Number(event.target.value)))} onPointerUp={event => commit(Number(event.currentTarget.value))} onBlur={event => commit(Number(event.currentTarget.value))} onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) commit(Number(event.currentTarget.value)); }} />
    </div>
  </div>;
}
