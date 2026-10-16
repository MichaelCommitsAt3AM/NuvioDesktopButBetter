export type CatalogAnchor = { itemKey: string | null; index: number; offset: number };
const anchors = new Map<string, CatalogAnchor>();
export function readCatalogAnchor(context: string) { return anchors.get(context); }
export function rememberCatalogAnchor(context: string, anchor: CatalogAnchor) {
  anchors.delete(context); anchors.set(context, anchor);
  if (anchors.size > 100) anchors.delete(anchors.keys().next().value!);
}
function topOf(scroller: HTMLElement, card: HTMLElement) {
  return card.getBoundingClientRect().top - scroller.getBoundingClientRect().top - scroller.clientTop + scroller.scrollTop;
}
/** Real card coordinates include header, padding, row gaps, and responsive layout. */
export function captureCatalogAnchor(scroller: HTMLElement, grid: HTMLElement, keys: string[]): CatalogAnchor {
  if (scroller.scrollTop === 0) return { itemKey: null, index: 0, offset: 0 };
  const cards = [...grid.children] as HTMLElement[];
  const viewportTop = scroller.getBoundingClientRect().top + scroller.clientTop;
  const found = cards.findIndex(card => card.getBoundingClientRect().bottom > viewportTop);
  const index = found < 0 ? Math.max(0, cards.length - 1) : found;
  const card = cards[index];
  return { itemKey: keys[index] ?? null, index, offset: card ? scroller.scrollTop - topOf(scroller, card) : 0 };
}
export function catalogAnchorTarget(scroller: HTMLElement, grid: HTMLElement, keys: string[], anchor: CatalogAnchor): number | null {
  if (!anchor.itemKey && anchor.index === 0 && anchor.offset === 0) return 0;
  const matched = anchor.itemKey ? keys.indexOf(anchor.itemKey) : -1;
  const index = matched >= 0 ? matched : Math.min(anchor.index, keys.length - 1);
  const card = grid.children[index] as HTMLElement | undefined;
  if (!card || !card.getBoundingClientRect().height) return null;
  return Math.max(0, topOf(scroller, card) + anchor.offset);
}
