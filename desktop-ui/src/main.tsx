import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import './parity.css';
import { initializeDesktopMetrics } from './desktopMetrics';

initializeDesktopMetrics();

const root = document.getElementById('root')!;

class StartupBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <div role="alert" style={{ padding: 32 }}>Nuvio could not display the interface. Please restart the preview.</div>
      : this.props.children;
  }
}

// Catch module initialization failures as well as React render failures.
void import('./App').then(({ default: AppRoot }) => {
  ReactDOM.createRoot(root).render(
    <React.StrictMode><StartupBoundary><AppRoot /></StartupBoundary></React.StrictMode>,
  );
}).catch(() => {
  root.textContent = 'Nuvio could not load the interface. Please restart the preview.';
  root.style.padding = '32px';
});
