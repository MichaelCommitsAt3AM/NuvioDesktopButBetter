import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronRight, RotateCcw, X } from 'lucide-react';
import { BottomSheet } from '../../components/BottomSheet';

/**
 * Pieces both the Download filter and Data Saver pages use, mirroring NuvioMobileButBetter's
 * DownloadFilterSettingsPage.kt: SettingsSection / SettingsGroup cards, SettingsSwitchRow,
 * FilterDropdownRow (an outlined chip that opens NuvioDropdownOptionsSheet), SelectableRow and
 * ResetFilterConfirmSheet.
 */
export const GB = 1024 ** 3;

export const SOURCES = [
  ['webdl', 'WEB-DL'], ['webrip', 'WEBRip'], ['hdtv', 'HDTV'], ['dvd', 'DVD'], ['cam', 'Cam / TS'], ['bluray', 'Blu-ray'], ['remux', 'Remux'],
] as const;

/** SettingsSection: the small uppercase title above a group card. */
export function SettingsSection({ title, children }: { title?: string; children: ReactNode }) {
  return <>{title && <h2 className="settings-group-title">{title}</h2>}{children}</>;
}

/** SettingsGroup: the rounded card holding a section's rows. */
export function SettingsGroup({ children, label }: { children: ReactNode; label?: string }) {
  return <section className="settings-section filter-settings-group" aria-label={label}>{children}</section>;
}

/** SettingsSwitchRow: title and description with the switch on the right. */
export function SwitchRow({ title, description, checked, disabled, onChange }: { title: string; description?: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <div className={`settings-control-row${disabled ? ' disabled' : ''}`}>
    <span className="settings-control-copy"><strong>{title}</strong>{description && <span>{description}</span>}</span>
    <label className="switch" aria-label={title}><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /><span /></label>
  </div>;
}

export type DropdownOption = { key: string; label: string };

/** NuvioDropdownOptionsSheet: a bottom sheet with the title, a divider and one row per option. */
export function OptionsSheet({ title, options, selectedKey, open, onSelect, onClose }: {
  title: string; options: DropdownOption[]; selectedKey: string; open: boolean; onSelect: (option: DropdownOption) => void; onClose: () => void;
}) {
  return <BottomSheet label={title} open={open} onClose={onClose} className="filter-options-sheet">
    <h2>{title}</h2>
    <hr className="filter-sheet-divider" />
    <div className="filter-sheet-options" role="listbox" aria-label={title}>
      {options.map(option => {
        const selected = option.key === selectedKey;
        return <button type="button" key={option.key} role="option" aria-selected={selected} className={`filter-sheet-row${selected ? ' selected' : ''}`} onClick={() => onSelect(option)}>
          <span>{option.label}</span>{selected && <Check size={22} />}
        </button>;
      })}
    </div>
  </BottomSheet>;
}

/** FilterDropdownRow: a title with an outlined chip showing the value; the chip opens the options sheet. */
export function DropdownRow({ title, selectedLabel, selectedKey, options, disabled, onSelect }: {
  title: string; selectedLabel: string; selectedKey: string; options: DropdownOption[]; disabled?: boolean; onSelect: (option: DropdownOption) => void;
}) {
  const [open, setOpen] = useState(false);
  return <div className="filter-dropdown-row">
    <span>{title}</span>
    <button type="button" className="filter-dropdown-chip" aria-label={`${title}: ${selectedLabel}`} aria-haspopup="dialog" disabled={disabled} onClick={() => setOpen(true)}>
      <span>{selectedLabel}</span><ChevronDown size={18} />
    </button>
    <OptionsSheet title={title} options={options} selectedKey={selectedKey} open={open} onClose={() => setOpen(false)} onSelect={option => { setOpen(false); onSelect(option); }} />
  </div>;
}

/** SelectableRow (multi-select): a label with a checkbox, for the allowed file types. */
export function SelectableRow({ label, selected, disabled, onToggle }: { label: string; selected: boolean; disabled?: boolean; onToggle: (selected: boolean) => void }) {
  return <label className="filter-selectable-row">
    <span>{label}</span>
    <input type="checkbox" checked={selected} disabled={disabled} onChange={event => onToggle(event.target.checked)} />
  </label>;
}

/** Maximum file size (whole GB from the page's minimum to 20) and the files-with-no-size switch. */
export function SizeSection({ maxSizeBytes, minBytes, maxBytes, showUnknown, disabled, onSize, onShowUnknown }: {
  maxSizeBytes: number; minBytes: number; maxBytes: number; showUnknown: boolean; disabled?: boolean;
  onSize: (bytes: number) => void; onShowUnknown: (enabled: boolean) => void;
}) {
  const minGb = Math.round(minBytes / GB);
  const maxGb = Math.round(maxBytes / GB);
  const currentGb = Math.min(maxGb, Math.max(minGb, Math.round(maxSizeBytes / GB)));
  const options = Array.from({ length: maxGb - minGb + 1 }, (_, index) => minGb + index).map(gb => ({ key: String(gb), label: `${gb} GB` }));
  return <SettingsSection title="Maximum size">
    <SettingsGroup>
      <DropdownRow title="Maximum file size" selectedLabel={`${currentGb} GB`} selectedKey={String(currentGb)} options={options} disabled={disabled} onSelect={option => onSize(Number(option.key) * GB)} />
      <SwitchRow title="Include files with no size" description="Files that don't report a size are left out unless this is on." checked={showUnknown} disabled={disabled} onChange={onShowUnknown} />
    </SettingsGroup>
  </SettingsSection>;
}

/** The "Reset to defaults" row and ResetFilterConfirmSheet, since a reset discards every change on the page. */
export function ResetRow({ description, confirmTitle, confirmDescription, disabled, onReset }: { description: string; confirmTitle: string; confirmDescription: string; disabled?: boolean; onReset: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return <>
    <SettingsGroup>
      <button type="button" className="settings-control-row filter-reset-row" disabled={disabled} onClick={() => setConfirming(true)}>
        <span className="settings-control-copy"><strong>Reset to defaults</strong><span>{description}</span></span><ChevronRight size={22} />
      </button>
    </SettingsGroup>
    <BottomSheet label={confirmTitle} open={confirming} onClose={() => setConfirming(false)} className="filter-reset-sheet">
      <div className="filter-reset-sheet-copy"><h2>{confirmTitle}</h2><p className="nuvio-bottom-sheet-note">{confirmDescription}</p></div>
      <button type="button" className="filter-sheet-action" onClick={() => { setConfirming(false); onReset(); }}><span className="filter-sheet-action-icon"><RotateCcw size={20} /></span><span>Reset to defaults</span></button>
      <button type="button" className="filter-sheet-action" onClick={() => setConfirming(false)}><span className="filter-sheet-action-icon"><X size={20} /></span><span>Cancel</span></button>
    </BottomSheet>
  </>;
}
