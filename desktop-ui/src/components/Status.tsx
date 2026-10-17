import { Info, RefreshCw } from 'lucide-react';
import { matchesReadOnlyReason, useReadOnlyReason } from './readOnlyContext';

export function ConnectionNotice({ status }: { status: 'starting' | 'disconnected' }) {
  return <div className={`connection ${status}`} role="status"><span className="connection-dot" />{status === 'starting' ? 'Connecting to Nuvio…' : 'Connection unavailable'}</div>;
}

export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const readOnlyReason = useReadOnlyReason();
  if (matchesReadOnlyReason(message, readOnlyReason)) return null;
  return <div className="inline-error" role="alert"><span>{message}</span>{onRetry && <button className="text-button" onClick={onRetry}><RefreshCw size={14} /> Try again</button>}</div>;
}

export function InlineNotice({ message, id }: { message: string; id?: string }) {
  return <div id={id} className="inline-notice" role="status"><Info size={18} aria-hidden="true" /><span>{message}</span></div>;
}
