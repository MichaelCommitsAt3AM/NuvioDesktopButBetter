// A hidden native parent may throttle animation frames. Bound both image decoding
// and frame scheduling so an unavailable poster cannot stall the player handoff.
window.preparePlayerPresentation = async (images, present) => {
  const bounded = (work, milliseconds) => new Promise(resolve => {
    const timeout = setTimeout(resolve, milliseconds);
    Promise.resolve(work).catch(() => {}).then(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
  await bounded(Promise.all(images.filter(image => image.getAttribute('src'))
    .map(image => image.decode().catch(() => {}))), 1500);
  await bounded(new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }), 100);
  present();
};
