import { useCallback, useEffect, useRef, useState } from 'react';
import { Toast } from '../components/Toast';
import { useLocation, useNavigate } from 'react-router-dom';
import { mainScroller } from '../navigation/scrollStore';
import { startGamepadPolling, type GamepadDirection, type GamepadEvent, type PadLayout } from './gamepadInput';
import { CONTENT_ZONE, GAMEPAD_SKIP, NAVIGATION_ZONE, activeScope, adjustSlider, isAdjustable, focusElement, focusables, initialTarget, isFocusable, isTextEntry, moveFocus, visualElement } from './spatialNavigation';
import { ControllerHintToolbar, hintsFor, type FocusKind } from './ControllerHintToolbar';
import { playControllerSound } from './controllerSounds';
import { GAMEPAD_SEARCH_EVENT, MAIN_TAB_EVENT } from './mainTabEvent';
import './gamepad.css';

/** Kotlin ControllerManager ignores pointer input this soon after controller input (synthetic moves). */
const POINTER_GUARD_MS = 180;
/** Right-stick scroll speed in px per frame at full deflection. */
const ANALOG_SCROLL_SPEED = 22;
const MAIN_TABS = ['/', '/search', '/library', '/settings'];


function keyEvent(target: EventTarget, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function focused(): HTMLElement | null {
  const element = document.activeElement;
  return element instanceof HTMLElement && element !== document.body ? element : null;
}

function isSelected(element: Element) {
  return element.getAttribute('aria-selected') === 'true' || element.getAttribute('aria-pressed') === 'true'
    || element.getAttribute('aria-current') === 'page' || element.classList.contains('selected') || element.classList.contains('active');
}

function scrollTarget(scope: HTMLElement): HTMLElement | null {
  if (scope === document.body) return mainScroller();
  // In a dialog, scroll its own scrollable surface.
  const candidates = [scope, ...scope.querySelectorAll<HTMLElement>('*')];
  return candidates.find(element => element.scrollHeight > element.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(element).overflowY)) ?? null;
}

/**
 * Gamepad support for the React shell, following upstream's Kotlin controller:
 * D-pad / left stick move focus spatially, A selects, B goes back or closes,
 * X opens the focused item's menu, Y focuses search, LB/RB switch tabs (or
 * seasons), LT/RT scroll a page, Menu/View jump between navigation and
 * content, and the right stick scrolls. A focus ring, hidden pointer and the
 * controller hint toolbar show while the controller is in use.
 */
export function GamepadNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [active, setActive] = useState(false);
  const [connected, setConnected] = useState(0);
  const [layout, setLayout] = useState<PadLayout>('xbox');
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const previousCount = useRef(0);
  const [scopeIsDialog, setScopeIsDialog] = useState(false);
  const [focusKind, setFocusKind] = useState<FocusKind>('content');
  const latest = useRef({ navigate, pathname: location.pathname, canGoBack: location.key !== 'default', active });
  latest.current = { navigate, pathname: location.pathname, canGoBack: location.key !== 'default', active };
  const lastInput = useRef(0);
  const lastContentFocus = useRef<HTMLElement | null>(null);
  const pressTarget = useRef<HTMLElement | null>(null);
  const heldTarget = useRef<HTMLElement | null>(null);
  /** The slider A grabbed: Left/Right change it until B or A lets go. */
  const adjusting = useRef<HTMLElement | null>(null);
  const [adjustingSlider, setAdjustingSlider] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (active) root.dataset.input = 'gamepad'; else delete root.dataset.input;
    return () => { delete root.dataset.input; };
  }, [active]);

  useEffect(() => {
    // Real pointer or keyboard input leaves controller mode (Kotlin notifyMouseOrKeyboardInput).
    const leave = (event: Event) => {
      if (!event.isTrusted || performance.now() - lastInput.current < POINTER_GUARD_MS) return;
      setActive(false);
    };
    const events = ['mousemove', 'mousedown', 'wheel', 'touchstart', 'keydown'] as const;
    events.forEach(name => window.addEventListener(name, leave, { capture: true, passive: true }));
    return () => events.forEach(name => window.removeEventListener(name, leave, { capture: true }));
  }, []);

  useEffect(() => {
    const handle = (event: GamepadEvent) => {
      const { navigate: go, pathname, canGoBack } = latest.current;
      // The native player overlay handles the controller itself during playback.
      if (pathname === '/playback') return;
      lastInput.current = performance.now();
      const wasActive = latest.current.active;
      if (event.type !== 'scroll' || event.dx !== 0 || event.dy !== 0) setActive(true);
      const scope = activeScope();
      setScopeIsDialog(scope !== document.body);
      const current = focused();
      const currentInScope = current && scope.contains(current) && isFocusable(current) ? current : null;
      if (currentInScope?.closest(CONTENT_ZONE)) lastContentFocus.current = currentInScope;

      if (event.type === 'scroll') {
        const target = scrollTarget(scope);
        if (target && (event.dx || event.dy)) { target.scrollTop += event.dy * ANALOG_SCROLL_SPEED; target.scrollLeft += event.dx * ANALOG_SCROLL_SPEED; }
        return;
      }

      if (event.type === 'navigate') {
        navigateFocus(event.direction, currentInScope, wasActive);
        return;
      }

      // A is a tap on release, or a long press after HOLD_MS, like a pointer long click
      // (the Settings item's profile menu, a card's options).
      if (event.type === 'hold' || event.type === 'release') {
        if (event.button !== 'A') return;
        const target = pressTarget.current;
        pressTarget.current = null;
        if (!target || !target.isConnected) return;
        if (event.type === 'hold') {
          pressTarget.current = null;
          heldTarget.current = target;
          playControllerSound('select');
          longPress(target);
          return;
        }
        if (event.held || heldTarget.current === target) { heldTarget.current = null; return; }
        playControllerSound('select');
        if (isAdjustable(target)) { setAdjusting(adjusting.current === target ? null : target); return; }
        if (target instanceof HTMLSelectElement) { try { target.showPicker(); } catch { target.click(); } return; }
        if (isTextEntry(target)) { target.focus(); return; }
        target.click();
        return;
      }

      switch (event.button) {
        case 'A': {
          heldTarget.current = null;
          if (!currentInScope) { pressTarget.current = null; const first = initialTarget(scope); if (first) { focusElement(first); playControllerSound('navigate'); } return; }
          pressTarget.current = currentInScope;
          return;
        }
        case 'B': {
          playControllerSound('back');
          if (adjusting.current) { setAdjusting(null); return; }
          // In a text field B only stops editing, like Kotlin hiding the virtual keyboard.
          if (current && isTextEntry(current) && scope === document.body) { current.blur(); return; }
          if (scope !== document.body) { keyEvent(current ?? scope, 'Escape'); return; }
          // No Escape here: on the keyboard it also leaves fullscreen, which B must not do.
          if (currentInScope?.closest(NAVIGATION_ZONE)) { focusContent(); return; }
          if (!MAIN_TABS.includes(pathname) && canGoBack) { go(-1); return; }
          // On a main tab B moves to the navigation, like Kotlin's Settings "Menu".
          focusNavigation();
          return;
        }
        case 'X': {
          if (currentInScope) longPress(currentInScope);
          return;
        }
        case 'Y': {
          const field = [...scope.querySelectorAll<HTMLInputElement>('input[type="search"]')].find(isFocusable);
          playControllerSound('select');
          if (field) { focusElement(field); return; }
          if (scope === document.body) window.dispatchEvent(new CustomEvent(GAMEPAD_SEARCH_EVENT));
          return;
        }
        case 'LB': case 'RB': {
          const delta = event.button === 'LB' ? -1 : 1;
          // A page's own tab row (Library's Saved/Cloud, settings tabs) takes the bumpers only
          // while focus is inside it; rows marked data-gamepad-tabs (season chips) always do.
          // Otherwise LB/RB move through the main tabs, from the navigation bar too.
          const groups = currentInScope?.closest(NAVIGATION_ZONE) ? [] : [...scope.querySelectorAll<HTMLElement>('[data-gamepad-tabs], [role="tablist"]')].filter(group => group.getClientRects().length > 0 && !group.closest(NAVIGATION_ZONE));
          const group = groups.find(item => currentInScope && item.contains(currentInScope)) ?? groups.find(item => item.matches('[data-gamepad-tabs]'));
          if (group) {
            const tabs = focusables(group);
            const selected = tabs.findIndex(isSelected);
            const next = tabs[Math.max(0, Math.min(tabs.length - 1, (selected < 0 ? 0 : selected) + delta))];
            if (next && next !== tabs[selected]) { playControllerSound('navigate'); next.click(); if (wasActive) focusElement(next); }
            return;
          }
          if (scope === document.body && MAIN_TABS.includes(pathname)) {
            playControllerSound('navigate');
            window.dispatchEvent(new CustomEvent(MAIN_TAB_EVENT, { detail: { delta } }));
          }
          return;
        }
        case 'LT': case 'RT': {
          const target = scrollTarget(scope);
          if (!target) return;
          const amount = target.clientHeight * 0.85 * (event.button === 'LT' ? -1 : 1);
          if (typeof target.scrollBy === 'function') target.scrollBy({ top: amount, behavior: 'smooth' }); else target.scrollTop += amount;
          return;
        }
        case 'Menu': case 'View': {
          if (scope !== document.body) return;
          if (currentInScope?.closest(NAVIGATION_ZONE)) focusContent(); else focusNavigation();
          return;
        }
        default:
      }
    };

    function setAdjusting(target: HTMLElement | null) {
      adjusting.current?.removeAttribute('data-gamepad-adjusting');
      adjusting.current = target;
      target?.setAttribute('data-gamepad-adjusting', '');
      setAdjustingSlider(!!target);
    }

    function longPress(target: HTMLElement) {
      const rect = visualElement(target).getBoundingClientRect();
      target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 2 }));
    }

    function navigateFocus(direction: GamepadDirection, current: HTMLElement | null, wasActive: boolean) {
      // The first press only wakes controller mode and shows the selection, as in Kotlin.
      if (!current) { if (moveFocus(direction)) playControllerSound('navigate'); return; }
      if (!wasActive) { focusElement(current); playControllerSound('navigate'); return; }
      if (adjusting.current && adjusting.current !== current) setAdjusting(null);
      if (adjusting.current === current) {
        // A grabbed slider keeps focus: Left/Right change it, Up/Down do nothing until B lets go.
        if ((direction === 'Left' || direction === 'Right') && adjustSlider(current, direction)) playControllerSound('navigate');
        return;
      }
      // Widgets with their own arrow handling (carousels, menus) get the key first. Not sliders
      // (they wait for A) and not the top bar, where ArrowDown would open the profile menu.
      if (!isAdjustable(current) && !current.closest(NAVIGATION_ZONE) && keyEvent(current, `Arrow${direction}`).defaultPrevented) { playControllerSound('navigate'); return; }
      if (moveFocus(direction)) playControllerSound('navigate');
    }

    function focusNavigation() {
      const nav = document.querySelector<HTMLElement>(NAVIGATION_ZONE);
      if (!nav) return;
      const items = focusables(nav);
      const target = items.find(isSelected) ?? items[0];
      if (target) { focusElement(target); playControllerSound('navigate'); }
    }

    function focusContent() {
      const remembered = lastContentFocus.current;
      const target = remembered && remembered.isConnected && isFocusable(remembered) ? remembered : initialTarget(document.body);
      if (target) { focusElement(target); playControllerSound('navigate'); }
    }

    return startGamepadPolling(handle, setConnected, setLayout);
  }, []);

  useEffect(() => {
    if (!connected) setActive(false);
    // The webview reports a pad on its first button press; announce it once per connection.
    if (connected > previousCount.current) setNotice({ id: Date.now(), message: 'Controller detected' });
    previousCount.current = connected;
  }, [connected]);

  useEffect(() => {
    if (!active) return;
    // A sheet whose options load after it opens (e.g. download qualities) gets its first option
    // selected as soon as one exists, so the controller is never left pointing outside it.
    let frame = 0;
    const check = () => {
      frame = 0;
      const scope = activeScope();
      if (scope === document.body) return;
      const current = focused();
      if (current && scope.contains(current) && isFocusable(current) && !current.matches(GAMEPAD_SKIP)) return;
      const first = initialTarget(scope, null);
      if (first) focusElement(first);
    };
    const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(check); });
    observer.observe(document.body, { childList: true, subtree: true });
    check();
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const update = () => {
      const element = focused();
      setScopeIsDialog(activeScope() !== document.body);
      setFocusKind(element && isTextEntry(element) ? 'text' : element?.closest(NAVIGATION_ZONE) ? 'navigation' : 'content');
    };
    update();
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => { document.removeEventListener('focusin', update); document.removeEventListener('focusout', update); };
  }, [active, location.pathname]);

  const show = active && connected > 0 && location.pathname !== '/playback';
  return <>
    <Toast notice={notice} onDismiss={dismissNotice} />
    {show && <ControllerHintToolbar hints={hintsFor(location.pathname, scopeIsDialog, adjustingSlider ? 'adjust' : focusKind)} layout={layout} />}
  </>;
}
