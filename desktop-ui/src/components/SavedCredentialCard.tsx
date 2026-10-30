import { CheckCircle2 } from 'lucide-react';
import './savedCredentialCard.css';

export function SavedCredentialCard({ onReplace, disabled = false, service }: { onReplace: () => void; disabled?: boolean; service?: string }) {
  return <div className="saved-credential-card"><span role="status"><CheckCircle2 size={21} aria-hidden="true" />Key saved</span><button className="button secondary" type="button" disabled={disabled} aria-label={service ? `Replace key for ${service}` : undefined} onClick={onReplace}>Replace key</button></div>;
}
