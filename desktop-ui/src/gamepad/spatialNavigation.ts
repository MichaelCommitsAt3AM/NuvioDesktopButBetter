import type { GamepadDirection } from './gamepadInput';

/**
 * Spatial focus for D-pad navigation, in the spirit of upstream's Kotlin
 * `ControllerFocusEngine`: from the focused element, pick the nearest
 * focusable element that lies in the pressed direction. Elements that share
 * the row (or column) win over closer ones that are diagonally offset.
 */

export type Box = { left: number; top: number; right: number; bottom: number };

const FOCUSABLE = [
  'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea', 'summary',
  '[tabindex]', '[role="button"]', '[role="tab"]', '[role="slider"]', '[role="radio"]', '[role="option"]', '[role="menuitem"]', '[contenteditable="true"]',
].join(',');

/**
 * Pointer-only affordances the controller skips: row titles (open "see all"),
 * the scroll arrows at a row's ends, the card ⋯ button (X opens the same menu), and
 * the Home hero's title and carousel wrapper (View Details is the hero's target; Left/Right
 * on it still flip the carousel through the wrapper's own arrow handling).
 */
export const GAMEPAD_SKIP = '.shelf-title-button, .rail-arrow, .poster-menu-button, .hero-logo-button, .home-hero, [data-gamepad-skip]';

/** Floating buttons at the top right (watch party, fullscreen); they continue the top bar's row. */
export const TOP_ACTIONS = '.party-toggle, .fullscreen-toggle';

/** Navigation chrome: the top bar or the sidebar. */
export const NAVIGATION_ZONE = '.topbar, .side-nav';
/** Content: everything the routes render. */
export const CONTENT_ZONE = 'main.main-area';

/** Score for moving from `from` to `to` in `direction`; null when `to` is not in that direction. */
export function directionalScore(from: Box, to: Box, direction: GamepadDirection): number | null {
  const fromCx = (from.left + from.right) / 2; const fromCy = (from.top + from.bottom) / 2;
  const toCx = (to.left + to.right) / 2; const toCy = (to.top + to.bottom) / 2;
  const horizontal = direction === 'Left' || direction === 'Right';
  const sign = direction === 'Right' || direction === 'Down' ? 1 : -1;
  // The candidate's centre must be past ours, and its near edge must not start behind our far edge.
  const centreDelta = horizontal ? (toCx - fromCx) * sign : (toCy - fromCy) * sign;
  if (centreDelta <= 1) return null;
  const gap = horizontal
    ? (sign > 0 ? to.left - from.right : from.left - to.right)
    : (sign > 0 ? to.top - from.bottom : from.top - to.bottom);
  const fromSize = horizontal ? from.right - from.left : from.bottom - from.top;
  if (gap < -fromSize / 2) return null;
  const overlap = horizontal
    ? Math.min(from.bottom, to.bottom) - Math.max(from.top, to.top)
    : Math.min(from.right, to.right) - Math.max(from.left, to.left);
  const perpendicular = overlap > 0 ? 0 : (horizontal ? Math.abs(toCy - fromCy) : Math.abs(toCx - fromCx));
  return Math.max(0, gap) + perpendicular * 3 + (overlap > 0 ? 0 : 400);
}

/** Index of the best candidate box, or -1. */
export function pickDirectional(from: Box, candidates: Box[], direction: GamepadDirection): number {
  let best = -1; let bestScore = Infinity;
  candidates.forEach((box, index) => {
    const score = directionalScore(from, box, direction);
    if (score !== null && score < bestScore) { best = index; bestScore = score; }
  });
  return best;
}

function isVisible(element: HTMLElement): boolean {
  // Cheapest checks first: Home can hold thousands of focusable nodes.
  if (element.getClientRects().length === 0) return false;
  if (element.closest('[inert], [aria-hidden="true"], [hidden]')) return false;
  // Collapsed or faded-out controls (e.g. the details page's folded inline actions) are not targets.
  if (typeof element.checkVisibility === 'function' && !element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
    // A native input styled invisible inside its visible control (switch, custom slider) counts as that control.
    const control = element instanceof HTMLInputElement ? element.closest<HTMLElement>('label, .switch, .stepped-slider') ?? element.parentElement : null;
    if (!control || (typeof control.checkVisibility === 'function' && !control.checkVisibility({ opacityProperty: true, visibilityProperty: true }))) return false;
  }
  const style = getComputedStyle(element);
  return style.visibility !== 'hidden' && style.display !== 'none' && style.pointerEvents !== 'none';
}

export function isFocusable(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.matches(FOCUSABLE)) return false;
  if (element.getAttribute('tabindex') === '-1') return false;
  if ((element as HTMLButtonElement).disabled || element.getAttribute('aria-disabled') === 'true') return false;
  return isVisible(element);
}

/** The topmost open dialog or menu, else the whole document. */
export function activeScope(doc: Document = document): HTMLElement {
  const layers = [...doc.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], [role="menu"]')].filter(isVisible);
  return layers[layers.length - 1] ?? doc.body;
}

export function focusables(scope: ParentNode): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(element => !element.matches(GAMEPAD_SKIP) && isFocusable(element));
}

export function isTextEntry(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable || element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file'].includes(element.type);
}

/** Visual box of an element; a visually hidden switch input uses its visible wrapper. */
export function visualElement(element: Element): Element {
  const rect = element.getBoundingClientRect();
  if (rect.width >= 4 && rect.height >= 4) return element;
  return element.closest('label, .switch') ?? element.parentElement ?? element;
}

function box(element: Element): Box {
  const rect = visualElement(element).getBoundingClientRect();
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

/** First element a fresh D-pad press should select: the top-left one on screen, content first. */
export function initialTarget(scope: HTMLElement, preferZone: string | null = CONTENT_ZONE): HTMLElement | null {
  const candidates = focusables(scope);
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const onScreen = candidates.filter(element => { const b = box(element); return b.bottom > 0 && b.right > 0 && b.top < viewport.height && b.left < viewport.width; });
  const zoned = preferZone && scope === document.body ? onScreen.filter(element => element.closest(preferZone)) : onScreen;
  const pool = zoned.length ? zoned : onScreen.length ? onScreen : candidates;
  return pool.slice().sort((a, b) => { const ba = box(a); const bb = box(b); return Math.round(ba.top - bb.top) || ba.left - bb.left; })[0] ?? null;
}

/** Moves focus one step; returns the newly focused element or null when nothing lies that way. */
export function moveFocus(direction: GamepadDirection, doc: Document = document): HTMLElement | null {
  const scope = activeScope(doc);
  const current = doc.activeElement instanceof HTMLElement && doc.activeElement !== doc.body && scope.contains(doc.activeElement) && isFocusable(doc.activeElement)
    ? doc.activeElement : null;
  if (!current) {
    const first = initialTarget(scope);
    if (first) focusElement(first);
    return first;
  }
  const candidates = focusables(scope).filter(element => element !== current && !element.contains(current));
  const from = box(current);
  const linked = scope === doc.body ? topBarRow(current, candidates, from, direction) : null;
  if (linked) { focusElement(linked); return linked; }
  // The navigation bar only wins while no page content lies that way: Up reaches the top
  // bar only at the top of the page, even though the floating bar overlaps the content.
  // Floating page buttons (mute, fullscreen, party) compete normally.
  let index = pickDirectional(from, candidates.map(box), direction);
  if (index < 0) return null;
  let target = candidates[index];
  if (scope === doc.body && target.closest(NAVIGATION_ZONE) && !current.closest(NAVIGATION_ZONE)) {
    const content = candidates.filter(element => element.closest(CONTENT_ZONE));
    index = pickDirectional(from, content.map(box), direction);
    if (index >= 0) target = content[index];
  }
  focusElement(target);
  return target;
}

export function focusElement(element: HTMLElement) {
  element.focus({ preventScroll: true });
  visualElement(element).scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}

/**
 * The top bar and the top-right buttons form one row: Right past the last top-bar item
 * reaches the buttons, Left from the first button returns to the top bar. Only for the top
 * bar layout; from the sidebar, Right still goes into the page.
 */
function topBarRow(current: HTMLElement, candidates: HTMLElement[], from: Box, direction: GamepadDirection): HTMLElement | null {
  const actions = candidates.filter(element => element.matches(TOP_ACTIONS));
  const bar = candidates.filter(element => element.closest('.topbar'));
  if (direction === 'Right' && current.closest('.topbar')) {
    if (pickDirectional(from, bar.map(box), 'Right') >= 0 || !actions.length) return null;
    return actions.slice().sort((a, b) => box(a).left - box(b).left)[0];
  }
  if (direction === 'Left' && current.matches(TOP_ACTIONS)) {
    if (pickDirectional(from, actions.map(box), 'Left') >= 0 || !bar.length) return null;
    return bar.slice().sort((a, b) => box(b).right - box(a).right)[0];
  }
  return null;
}

/** Sliders take Left/Right only after A grabs them (adjust mode); B or A lets go. */
export function isAdjustable(element: Element | null): boolean {
  return element instanceof HTMLElement && (element.matches('input[type="range"]') || element.getAttribute('role') === 'slider');
}

const valueSetter = typeof HTMLInputElement !== 'undefined' ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set : undefined;

/**
 * Moves a grabbed slider one step. A range input gets its value set natively (so React's
 * onChange sees it) and a key-up, which is when the settings sliders save, like the keyboard.
 * Custom role="slider" widgets get the arrow key itself.
 */
export function adjustSlider(element: HTMLElement, direction: 'Left' | 'Right'): boolean {
  const key = `Arrow${direction}`;
  if (!(element instanceof HTMLInputElement)) {
    const event = new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }
  const step = Number(element.step) || 1;
  const min = element.min === '' ? 0 : Number(element.min);
  const max = element.max === '' ? 100 : Number(element.max);
  const current = Number(element.value);
  const next = Number(Math.min(max, Math.max(min, current + (direction === 'Right' ? step : -step))).toFixed(6));
  if (next === current) return false;
  valueSetter?.call(element, String(next));
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, bubbles: true }));
  return true;
}
