import type { ReactNode } from 'react';
import { BottomSheetPresence } from './BottomSheetPresence';
import { Dialog } from './Dialog';
import './bottomSheet.css';

/**
 * Reusable modal bottom sheet, the desktop counterpart of mobile's `NuvioModalBottomSheet`:
 * bottom-aligned, rounded, with a drag handle, enter/exit motion, drag-to-dismiss, scrim and
 * Escape to close. Put content inside; these classes give it the shared look:
 *
 * - `<h2>` is the sheet title and `<p>` is body text (`nuvio-bottom-sheet-note` for the muted variant)
 * - `nuvio-bottom-sheet-row` is a tappable rounded row (`<strong>` title, `<small>` subtitle, trailing text in
 *   a `.nuvio-bottom-sheet-row-end` span)
 * - `nuvio-bottom-sheet-error` is an error line
 *
 * Content is spaced by the sheet, so children should not add their own outer margins.
 */
export function BottomSheet({ label, open, onClose, onExitComplete, className = '', children }: {
  label: string;
  open: boolean;
  onClose: () => void;
  onExitComplete?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return <BottomSheetPresence onExitComplete={onExitComplete}>
    {open && <Dialog label={label} onClose={onClose} className={`nuvio-bottom-sheet ${className}`.trim()}>
      <div className="nuvio-bottom-sheet-content">
        <span className="nuvio-bottom-sheet-handle" aria-hidden="true" />
        {children}
      </div>
    </Dialog>}
  </BottomSheetPresence>;
}
