import { ArrowLeft } from 'lucide-react';
import './backButton.css';

export function BackButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return <button type="button" className={`screen-back-button ${className}`} aria-label="Back" onClick={onClick}><ArrowLeft size={22} /></button>;
}
