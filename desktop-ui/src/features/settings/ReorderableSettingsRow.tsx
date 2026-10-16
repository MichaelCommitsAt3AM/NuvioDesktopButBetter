import type { ReactNode, CSSProperties, HTMLAttributes } from 'react';
import { Lock, Menu } from 'lucide-react';
import './reorderableSettings.css';

export type SettingsRowDrag = {
  dragging: boolean; dropTarget: boolean;
  onDragStart: () => void; onDragEnd: () => void;
  onDragOver: () => void; onDrop: () => void;
  onKeyboardMove: (direction: number) => void;
};

/** Shared Kotlin HomescreenCatalogRow / MetaSectionRow presentation. */
export function ReorderableSettingsRow({ rowKey, title, description, status, enabled, busy = false, pinned = false, expanded, onExpand, onToggle, onPinned, drag, children, align = 'top', pointer }: {
  rowKey: string; title: string; description: string; status: ReactNode; enabled: boolean;
  busy?: boolean; pinned?: boolean; expanded?: boolean; onExpand?: () => void;
  onToggle: (enabled: boolean) => void; onPinned?: () => void;
  drag: SettingsRowDrag; children?: ReactNode; align?: 'top' | 'center';
  pointer?: { handle: HTMLAttributes<HTMLButtonElement>; style?: CSSProperties; active: boolean };
}) {
  const copy = <><strong>{title}</strong><span>{description}</span><small>{status}</small></>;
  return <article data-settings-row-key={rowKey} style={pointer?.style} className={`settings-reorder-row${drag.dragging || pointer?.active ? ' dragging' : ''}${drag.dropTarget ? ' drop-target' : ''}`} onDragOver={event => {
    if (!pinned && !busy) { event.preventDefault(); drag.onDragOver(); }
  }} onDrop={event => { event.preventDefault(); if (!pinned && !busy) drag.onDrop(); }}>
    <div className={`settings-reorder-summary align-${align}`}>
      {onExpand ? <button type="button" className="settings-reorder-copy home-catalog-info" aria-expanded={expanded} onClick={onExpand}>{copy}</button> : <div className="settings-reorder-copy">{copy}</div>}
      <div className="settings-reorder-actions">
        <label className="switch"><input type="checkbox" aria-label={`Show ${title}`} checked={enabled} disabled={busy} onChange={event => onToggle(event.target.checked)} /><span /></label>
        <button type="button" {...pointer?.handle} className="settings-reorder-handle" aria-label={`${pinned ? 'Pinned' : 'Reorder'} ${title}`} title={pinned ? 'Pinned' : 'Reorder (drag or use arrow keys)'} disabled={busy} draggable={!pinned && !busy} onClick={pinned ? onPinned : undefined} onDragStart={event => {
          if (pinned || busy) { event.preventDefault(); return; }
          event.dataTransfer.setData('text/plain', rowKey); event.dataTransfer.effectAllowed = 'move'; drag.onDragStart();
        }} onDragEnd={drag.onDragEnd} onKeyDown={event => {
          if (pinned || busy || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); drag.onKeyboardMove(event.key === 'ArrowUp' ? -1 : 1);
        }}>{pinned ? <Lock size={24} /> : <Menu size={24} />}</button>
      </div>
    </div>
    {children && <div className="settings-reorder-detail">{children}</div>}
  </article>;
}
