import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './toast.css';

/** Top-center, short-lived confirmation matching the native network toast. */
export function Toast({ notice, onDismiss }: { notice: { id: number; message: string } | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(onDismiss, 2500);
    return () => window.clearTimeout(timer);
  }, [notice, onDismiss]);
  if (!notice) return null;
  return createPortal(<div className="app-toast-host" role="status" aria-live="polite" aria-atomic="true">
    <div key={notice.id} className="app-toast">{notice.message}</div>
  </div>, document.body);
}
