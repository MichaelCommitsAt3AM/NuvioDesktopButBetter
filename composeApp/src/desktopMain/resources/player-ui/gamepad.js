"use strict";
/*
 * Fork-only: gamepad support for the native player overlay when it is hosted by
 * the React/Tauri desktop app. Buttons are translated into the keyboard
 * shortcuts controls.js already handles, with upstream's Kotlin controller
 * layout: D-pad seeks/volume (or moves in panels), A plays/pauses or picks the
 * focused row, B goes back, LB/RB seek, X audio, Y subtitles, Menu episodes and
 * View sources. The legacy Compose app polls the controller natively and sets
 * state.nativeControllerInput, so this stays off there to avoid double input.
 */
(() => {
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return;

  // Kotlin DesktopControllerInput tuning.
  const REPEAT_FIRST_DELAY_MS = 320;
  const REPEAT_INTERVAL_MS = 105;
  const STICK_ENTER = 0.5;
  const STICK_EXIT = 0.32;
  const BUTTON_KEYS = { 4: "ArrowLeft", 5: "ArrowRight", 2: "KeyA", 3: "KeyS", 9: "KeyE", 8: "KeyQ" };
  const DPAD = { 12: "ArrowUp", 13: "ArrowDown", 14: "ArrowLeft", 15: "ArrowRight" };

  const pressedButtons = new Set();
  const heldDirections = new Map();
  let frame = 0;

  const nativeInputActive = () => {
    try { return typeof state !== "undefined" && state && state.nativeControllerInput === true; } catch (_) { return false; }
  };
  const target = () => document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
  const key = (type, code) => {
    const keyName = code.startsWith("Key") ? code.slice(3).toLowerCase() : code === "Space" ? " " : code;
    const event = new KeyboardEvent(type, { key: keyName, code, bubbles: true, cancelable: true });
    target().dispatchEvent(event);
    return event;
  };
  const tap = code => { key("keydown", code); key("keyup", code); };
  const modalOpen = () => {
    try { return typeof activeModal !== "undefined" && Boolean(activeModal); } catch (_) { return false; }
  };

  const pressA = () => {
    const focused = document.activeElement;
    // In a panel, A picks the focused row or button like a click.
    if (focused && focused !== document.body && focused.matches && focused.matches("button, [role='button'], .track-row, .subtitle-language-row, input[type='checkbox']")) {
      focused.click();
      return;
    }
    if (modalOpen()) return;
    tap("Space");
  };

  // B closes a panel or goes back, but never leaves fullscreen (Escape on the keyboard still does).
  const pressB = () => {
    let canSend = false;
    try { canSend = typeof send === "function"; } catch (_) { canSend = false; }
    let fullscreen = false; let pip = false; let confirmOpen = false;
    try { fullscreen = Boolean(state && state.isFullscreen); pip = Boolean(state && state.isInPip); } catch (_) { /* no state yet */ }
    try { confirmOpen = typeof isPartyConfirmOpen === "function" && isPartyConfirmOpen(); } catch (_) { confirmOpen = false; }
    if (fullscreen && !pip && !confirmOpen && !modalOpen() && canSend) {
      try { if (typeof clearSpaceHoldTimerAndStopSpeedBoost === "function") clearSpaceHoldTimerAndStopSpeedBoost(); } catch (_) { /* optional */ }
      send("back", 0);
      return;
    }
    key("keydown", "Escape");
  };

  const pressed = (pad, index) => {
    const button = pad.buttons[index];
    return Boolean(button && (button.pressed || button.value > 0.5));
  };

  const stickDirection = (x, y) => {
    const out = [];
    const check = (code, value) => { if (value > (heldDirections.has(code) ? STICK_EXIT : STICK_ENTER)) out.push(code); };
    if (Math.abs(x) >= Math.abs(y)) { check("ArrowRight", x); check("ArrowLeft", -x); }
    else { check("ArrowDown", y); check("ArrowUp", -y); }
    return out;
  };

  const tick = () => {
    frame = 0;
    let pads = [];
    try { pads = Array.from(navigator.getGamepads() || []); } catch (_) { pads = []; }
    const connected = pads.filter(pad => pad && pad.connected);
    if (!connected.length) { pressedButtons.clear(); heldDirections.clear(); return; }
    frame = requestAnimationFrame(tick);
    if (nativeInputActive() || document.visibilityState !== "visible" || !document.hasFocus()) {
      pressedButtons.clear(); heldDirections.clear(); return;
    }
    const now = performance.now();
    const buttons = new Set();
    const directions = new Set();
    for (const pad of connected) {
      for (let index = 0; index < pad.buttons.length; index += 1) if (pressed(pad, index)) buttons.add(index);
      for (const [index, code] of Object.entries(DPAD)) if (pressed(pad, Number(index))) directions.add(code);
      for (const code of stickDirection(pad.axes[0] || 0, pad.axes[1] || 0)) directions.add(code);
    }
    for (const index of buttons) {
      if (pressedButtons.has(index)) continue;
      if (index === 0) pressA();
      else if (index === 1) pressB();
      else if (BUTTON_KEYS[index]) key("keydown", BUTTON_KEYS[index]);
    }
    pressedButtons.clear();
    buttons.forEach(index => pressedButtons.add(index));
    for (const code of Array.from(heldDirections.keys())) if (!directions.has(code)) heldDirections.delete(code);
    for (const code of directions) {
      const repeatAt = heldDirections.get(code);
      if (repeatAt === undefined) { heldDirections.set(code, now + REPEAT_FIRST_DELAY_MS); key("keydown", code); }
      else if (now >= repeatAt) { heldDirections.set(code, now + REPEAT_INTERVAL_MS); key("keydown", code); }
    }
  };

  const wake = () => { if (!frame) frame = requestAnimationFrame(tick); };
  window.addEventListener("gamepadconnected", wake);
  window.addEventListener("gamepaddisconnected", wake);
  wake();
})();
