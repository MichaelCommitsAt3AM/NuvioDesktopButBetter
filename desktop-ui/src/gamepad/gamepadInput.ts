/**
 * Browser Gamepad API poller for the React shell.
 *
 * Mirrors upstream's Kotlin `DesktopControllerInput` (XInput / SDL2) so the
 * rewrite feels the same: every pad is normalized to the Xbox layout, D-pad
 * and left stick produce directional events with the same auto-repeat, the
 * left stick uses enter/exit hysteresis, triggers become buttons past 0.55 and
 * the right stick drives analog scrolling.
 */

export type GamepadButton = 'A' | 'B' | 'X' | 'Y' | 'LB' | 'RB' | 'LT' | 'RT' | 'View' | 'Menu' | 'LS' | 'RS';
export type GamepadDirection = 'Up' | 'Down' | 'Left' | 'Right';
export type GamepadEvent =
  | { type: 'button'; button: GamepadButton }
  /** A button let go; `held` is true when a hold event already fired for this press. */
  | { type: 'release'; button: GamepadButton; held: boolean }
  /** A button kept down for HOLD_MS: the controller's long press. */
  | { type: 'hold'; button: GamepadButton }
  | { type: 'navigate'; direction: GamepadDirection; repeat: boolean }
  | { type: 'scroll'; dx: number; dy: number };

// Kotlin DesktopControllerInput constants.
export const REPEAT_FIRST_DELAY_MS = 320;
export const REPEAT_INTERVAL_MS = 105;
export const STICK_ENTER_DEADZONE = 0.5;
export const STICK_EXIT_DEADZONE = 0.32;
export const ANALOG_SCROLL_DEADZONE = 0.28;
export const TRIGGER_THRESHOLD = 0.55;
/** Long press, matching the app's pointer long press (useCardHold, the Settings item). */
export const HOLD_MS = 500;

/** W3C "standard" mapping indices (what Chromium/WebView2, WebKit and Firefox expose for known pads). */
const STANDARD_BUTTONS: Array<[number, GamepadButton]> = [
  [0, 'A'], [1, 'B'], [2, 'X'], [3, 'Y'], [4, 'LB'], [5, 'RB'], [8, 'View'], [9, 'Menu'], [10, 'LS'], [11, 'RS'],
];
const DPAD: Array<[number, GamepadDirection]> = [[12, 'Up'], [13, 'Down'], [14, 'Left'], [15, 'Right']];

type PadLike = Pick<Gamepad, 'buttons' | 'axes' | 'connected' | 'mapping' | 'index'>;

export type PadLayout = 'xbox' | 'playstation';

/**
 * Button labels to show for a pad. Sony pads report vendor 054c in their id
 * (Chromium/WebView2: "... (Vendor: 054c Product: 0ce6)", Firefox/WebKit:
 * "054c-0ce6-...") or a DualShock/DualSense name; everything else uses the
 * Xbox labels upstream's Kotlin hint toolbar shows.
 */
export function padLayout(id: string | undefined | null): PadLayout {
  const value = (id ?? '').toLowerCase();
  return /vendor:\s*054c|(^|[^0-9a-f])054c-|dualsense|dualshock|playstation|sony|\bps[345]\b/.test(value) ? 'playstation' : 'xbox';
}

function hasInput(pad: PadLike): boolean {
  return pad.buttons.some(button => button.pressed || button.value > 0.5) || pad.axes.some(axis => Math.abs(axis) > STICK_ENTER_DEADZONE);
}

function pressed(pad: PadLike, index: number): boolean {
  const button = pad.buttons[index];
  return !!button && (button.pressed || button.value > 0.5);
}

function triggerValue(pad: PadLike, index: number): number {
  return pad.buttons[index]?.value ?? 0;
}

/** Left-stick directions with hysteresis: a held direction only releases below the exit deadzone. */
export function stickDirections(x: number, y: number, held: ReadonlySet<GamepadDirection>): Set<GamepadDirection> {
  const out = new Set<GamepadDirection>();
  const check = (direction: GamepadDirection, value: number) => {
    const threshold = held.has(direction) ? STICK_EXIT_DEADZONE : STICK_ENTER_DEADZONE;
    if (value > threshold) out.add(direction);
  };
  // Only the dominant axis counts, so a diagonal push does not move twice.
  if (Math.abs(x) >= Math.abs(y)) { check('Right', x); check('Left', -x); }
  else { check('Down', y); check('Up', -y); }
  return out;
}

/** Reads one normalized frame from every connected pad. */
export function readPads(pads: ReadonlyArray<PadLike | null>, held: ReadonlySet<GamepadDirection>) {
  const buttons = new Set<GamepadButton>();
  const directions = new Set<GamepadDirection>();
  let scrollX = 0; let scrollY = 0;
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    for (const [index, button] of STANDARD_BUTTONS) if (pressed(pad, index)) buttons.add(button);
    if (triggerValue(pad, 6) >= TRIGGER_THRESHOLD) buttons.add('LT');
    if (triggerValue(pad, 7) >= TRIGGER_THRESHOLD) buttons.add('RT');
    for (const [index, direction] of DPAD) if (pressed(pad, index)) directions.add(direction);
    const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes;
    for (const direction of stickDirections(lx, ly, held)) directions.add(direction);
    if (Math.hypot(rx, ry) > ANALOG_SCROLL_DEADZONE) { scrollX += rx; scrollY += ry; }
  }
  return { buttons, directions, scrollX, scrollY };
}

/**
 * Edge detection and auto-repeat across frames. `update` returns the events
 * for one poll; it holds no timers so it can be driven by any clock.
 */
export class GamepadState {
  private buttons = new Map<GamepadButton, { since: number; held: boolean }>();
  private held = new Map<GamepadDirection, number>();
  private scrolling = false;

  get heldDirections(): ReadonlySet<GamepadDirection> { return new Set(this.held.keys()); }

  update(pads: ReadonlyArray<PadLike | null>, now: number): GamepadEvent[] {
    const frame = readPads(pads, this.heldDirections);
    const events: GamepadEvent[] = [];
    for (const [button, press] of [...this.buttons]) {
      if (!frame.buttons.has(button)) { this.buttons.delete(button); events.push({ type: 'release', button, held: press.held }); }
      else if (!press.held && now - press.since >= HOLD_MS) { press.held = true; events.push({ type: 'hold', button }); }
    }
    for (const button of frame.buttons) {
      if (!this.buttons.has(button)) { this.buttons.set(button, { since: now, held: false }); events.push({ type: 'button', button }); }
    }
    for (const direction of [...this.held.keys()]) if (!frame.directions.has(direction)) this.held.delete(direction);
    for (const direction of frame.directions) {
      const repeatAt = this.held.get(direction);
      if (repeatAt === undefined) {
        this.held.set(direction, now + REPEAT_FIRST_DELAY_MS);
        events.push({ type: 'navigate', direction, repeat: false });
      } else if (now >= repeatAt) {
        this.held.set(direction, now + REPEAT_INTERVAL_MS);
        events.push({ type: 'navigate', direction, repeat: true });
      }
    }
    if (frame.scrollX !== 0 || frame.scrollY !== 0) {
      this.scrolling = true;
      events.push({ type: 'scroll', dx: frame.scrollX, dy: frame.scrollY });
    } else if (this.scrolling) {
      this.scrolling = false;
      events.push({ type: 'scroll', dx: 0, dy: 0 });
    }
    return events;
  }

  reset() { this.buttons.clear(); this.held.clear(); this.scrolling = false; }
}

/**
 * Polls `navigator.getGamepads()` every animation frame while the window is
 * focused and visible. Input is ignored while the app is in the background,
 * like a controller focused on another window.
 */
export function startGamepadPolling(onEvent: (event: GamepadEvent) => void, onConnectedChange?: (count: number) => void, onLayoutChange?: (layout: PadLayout) => void): () => void {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return () => {};
  const state = new GamepadState();
  let frame = 0;
  let connected = -1;
  let layout: PadLayout | null = null;
  let stopped = false;
  const reportLayout = (next: PadLayout) => { if (next !== layout) { layout = next; onLayoutChange?.(next); } };
  const tick = () => {
    frame = 0;
    if (stopped) return;
    let pads: ReadonlyArray<Gamepad | null> = [];
    try { pads = navigator.getGamepads?.() ?? []; } catch { pads = []; }
    const count = pads.filter(pad => pad?.connected).length;
    if (count !== connected) { connected = count; onConnectedChange?.(count); }
    // With no pad connected the loop sleeps until the next gamepadconnected event.
    if (!count) { state.reset(); return; }
    // Labels follow the pad in use; before any input, the first connected pad.
    const used = pads.find(pad => pad?.connected && hasInput(pad)) ?? (layout ? null : pads.find(pad => pad?.connected));
    if (used) reportLayout(padLayout(used.id));
    frame = requestAnimationFrame(tick);
    if (document.visibilityState !== 'visible' || !document.hasFocus()) { state.reset(); return; }
    for (const event of state.update(pads, performance.now())) onEvent(event);
  };
  // Chromium exposes a pad only after its first button press, which fires gamepadconnected.
  const wake = () => { if (!frame && !stopped) frame = requestAnimationFrame(tick); };
  window.addEventListener('gamepadconnected', wake);
  window.addEventListener('gamepaddisconnected', wake);
  wake();
  return () => {
    stopped = true;
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener('gamepadconnected', wake);
    window.removeEventListener('gamepaddisconnected', wake);
  };
}
