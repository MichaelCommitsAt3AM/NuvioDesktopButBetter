// A hidden native parent may throttle animation frames. Bound both image decoding
// and frame scheduling so an unavailable poster cannot stall the player handoff.
// Breadcrumbs contain stage numbers and source line numbers only, never media data.
const reportPlayerPresentation = (type, value = 0) => {
  const bridge = window.chrome?.webview ?? window.webkit?.messageHandlers?.player;
  bridge?.postMessage({ type, value });
};
window.addEventListener('error', event => reportPlayerPresentation('bridgeControlsScriptError', event.lineno || 0));
window.addEventListener('unhandledrejection', () => reportPlayerPresentation('bridgeControlsPromiseError'));
reportPlayerPresentation('bridgeControlsScriptLoaded');
window.preparePlayerPresentation = async (images, present) => {
  reportPlayerPresentation('bridgeControlsPresentationStage', 1);
  const bounded = (work, milliseconds) => new Promise(resolve => {
    const timeout = setTimeout(resolve, milliseconds);
    Promise.resolve(work).catch(() => {}).then(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
  await bounded(Promise.all(images.filter(image => image.getAttribute('src'))
    .map(image => image.decode().catch(() => {}))), 1500);
  reportPlayerPresentation('bridgeControlsPresentationStage', 2);
  await bounded(new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }), 100);
  reportPlayerPresentation('bridgeControlsPresentationStage', 3);
  present();
};
