import { ArrowLeft } from 'lucide-react';
import { translateActive } from '../i18n/strings';
import './backButton.css';

export function BackButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return <button type="button" className={`screen-back-button ${className}`} aria-label={translateActive('action_back')} onClick={onClick}><ArrowLeft size={22} /></button>;
}
