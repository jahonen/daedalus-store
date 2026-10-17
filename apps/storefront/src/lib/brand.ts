/** Deterministic brand-asset URLs produced by the processFavicon function. */
export const brandAsset = (name: string): string =>
  `https://firebasestorage.googleapis.com/v0/b/daedalus-store.firebasestorage.app` +
  `/o/public%2Fbrand%2F${name}?alt=media`;
