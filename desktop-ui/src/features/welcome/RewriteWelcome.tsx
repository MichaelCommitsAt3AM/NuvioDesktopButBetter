import { useState } from 'react';
import { Hand, Rocket } from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import './rewriteWelcome.css';

// Device-local and independent of account/profile: both existing installations
// and new users see this once, without repeating it on future app updates.
const acknowledgementKey = 'nuvio.rewrite-welcome.v1';

export function useRewriteWelcome() {
  const [pending, setPending] = useState(() => {
    try { return localStorage.getItem(acknowledgementKey) !== 'seen'; }
    catch { return true; }
  });
  const dismiss = () => {
    try { localStorage.setItem(acknowledgementKey, 'seen'); } catch { /* Still dismiss for this session. */ }
    setPending(false);
  };
  return { pending, dismiss };
}

export function RewriteWelcome({ onClose }: { onClose: () => void }) {
  return <Dialog label="Welcome to the new Nuvio" className="rewrite-welcome" onClose={onClose}>
    <span className="rewrite-welcome-eyebrow">A fresh start for Nuvio</span>
    <h2>Welcome to the new Nuvio</h2>
    <p>We've rewritten the desktop interface to make Nuvio faster to open and smoother to use.</p>
    <div className="rewrite-welcome-feature"><Rocket aria-hidden="true" size={24} /><div><h3>A faster start</h3><p>A new interface built to get you browsing sooner.</p></div></div>
    <div className="rewrite-welcome-feature"><Hand aria-hidden="true" size={24} /><div><h3>Made for touch, too</h3><p>Browse with your touchscreen, as well as your mouse and keyboard.</p></div></div>
    <div className="dialog-actions"><button className="button primary" onClick={onClose}>Let's explore</button></div>
  </Dialog>;
}
