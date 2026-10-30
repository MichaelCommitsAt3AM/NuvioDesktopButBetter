import { subscribeViewportResize } from './viewportResize';

// Match Compose's desktop density policy in CSS pixels. WebView already applies OS DPI.
export function initializeDesktopMetrics() {
  const style = document.documentElement.style;
  style.setProperty('--desktop-font-scale', '1.08');
  style.setProperty('--content-scale', '1.22');
  const update = () => {
    const scale = Math.max(1, Math.min(1.18, window.innerWidth / 1280, window.innerHeight / 820)).toFixed(4);
    if (style.getPropertyValue('--ui-scale') !== scale) style.setProperty('--ui-scale', scale);
  };
  update();
  return subscribeViewportResize(update);
}
