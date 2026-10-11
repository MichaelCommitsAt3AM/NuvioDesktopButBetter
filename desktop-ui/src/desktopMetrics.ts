// Match Compose's desktop density policy in CSS pixels. WebView already applies OS DPI.
export function initializeDesktopMetrics() {
  const update = () => {
    const scale = Math.max(1, Math.min(1.18, window.innerWidth / 1280, window.innerHeight / 820));
    document.documentElement.style.setProperty('--ui-scale', scale.toFixed(4));
    document.documentElement.style.setProperty('--desktop-font-scale', '1.08');
    document.documentElement.style.setProperty('--content-scale', '1.22');
  };
  update();
  window.addEventListener('resize', update);
  return () => window.removeEventListener('resize', update);
}
