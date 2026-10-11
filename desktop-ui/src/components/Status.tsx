import { RefreshCw } from 'lucide-react';

export function ConnectionNotice({ status }: { status: 'starting' | 'disconnected' }) {
  return <div className={`connection ${status}`} role="status"><span className="connection-dot" />{status === 'starting' ? 'Connecting to Nuvio…' : 'Connection unavailable'}</div>;
}

export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="inline-error" role="alert"><span>{message}</span>{onRetry && <button className="text-button" onClick={onRetry}><RefreshCw size={14} /> Try again</button>}</div>;
}
