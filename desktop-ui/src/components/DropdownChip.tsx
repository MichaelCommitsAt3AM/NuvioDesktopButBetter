import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import './dropdownChip.css';

export type DropdownChipOption = { key: string; label: string };

/**
 * Port of the Kotlin `NuvioDropdownChip` as used on desktop: a compact rounded trigger
 * showing the current value with a trailing chevron, and an anchored menu whose selected
 * row carries an accent check mark. Rendered through a portal because the library filter
 * row scrolls horizontally, which would otherwise clip an absolutely positioned menu.
 */
export function DropdownChip({ label, selectedKey, options, enabled = true, ariaLabel, onSelect }: {
  label: string;
  selectedKey?: string | null;
  options: DropdownChipOption[];
  enabled?: boolean;
  ariaLabel?: string;
  onSelect: (option: DropdownChipOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const accessibleLabel = ariaLabel ?? label;

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(360, Math.max(180, rect.width));
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setPosition({ top: rect.bottom + 4, left, width });
  };

  useLayoutEffect(() => { if (open) updatePosition(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  return <div className="dropdown-chip">
    <button ref={triggerRef} type="button" className="dropdown-chip-trigger" disabled={!enabled} aria-haspopup="listbox" aria-expanded={open} aria-label={accessibleLabel} onClick={() => setOpen(value => !value)}>
      <span className="dropdown-chip-label">{label}</span>
      <ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && enabled && position && createPortal(
      <div ref={menuRef} className="dropdown-chip-menu" role="listbox" aria-label={accessibleLabel} style={{ top: position.top, left: position.left, width: position.width }}>
        {options.map(option => <button type="button" role="option" aria-selected={option.key === selectedKey} key={option.key} className={`dropdown-chip-option ${option.key === selectedKey ? 'selected' : ''}`} onClick={() => { onSelect(option); setOpen(false); }}>
          <span>{option.label}</span>
          {option.key === selectedKey && <Check size={16} aria-hidden="true" />}
        </button>)}
      </div>,
      document.body,
    )}
  </div>;
}

export function dropdownChipOptions(options: Array<[string, string]>): DropdownChipOption[] {
  return options.map(([key, label]) => ({ key, label }));
}
