import { describe, expect, it } from 'vitest';
import { GamepadState, HOLD_MS, REPEAT_FIRST_DELAY_MS, REPEAT_INTERVAL_MS, stickDirections } from './gamepadInput';

type Pad = { buttons: Array<{ pressed: boolean; value: number }>; axes: number[]; connected: boolean; mapping: GamepadMappingType; index: number };
function pad({ buttons = [] as number[], axes = [0, 0, 0, 0], triggers = [0, 0] } = {}): Pad {
  const list = Array.from({ length: 17 }, (_, index) => ({ pressed: buttons.includes(index), value: buttons.includes(index) ? 1 : 0 }));
  list[6] = { pressed: triggers[0] > 0.5, value: triggers[0] };
  list[7] = { pressed: triggers[1] > 0.5, value: triggers[1] };
  return { buttons: list, axes, connected: true, mapping: 'standard', index: 0 };
}

describe('Kotlin DesktopControllerInput parity', () => {
  it('emits a button once per press (edge detection)', () => {
    const state = new GamepadState();
    expect(state.update([pad({ buttons: [0] }) as unknown as Gamepad], 0)).toEqual([{ type: 'button', button: 'A' }]);
    expect(state.update([pad({ buttons: [0] }) as unknown as Gamepad], 16)).toEqual([]);
    state.update([pad() as unknown as Gamepad], 32);
    expect(state.update([pad({ buttons: [0] }) as unknown as Gamepad], 48)).toEqual([{ type: 'button', button: 'A' }]);
  });

  it('maps the standard layout, including triggers past 0.55', () => {
    const state = new GamepadState();
    const events = state.update([pad({ buttons: [1, 2, 3, 4, 5, 8, 9], triggers: [0.6, 0.4] }) as unknown as Gamepad], 0);
    expect(events.map(event => event.type === 'button' && event.button)).toEqual(['B', 'X', 'Y', 'LB', 'RB', 'View', 'Menu', 'LT']);
  });

  it('auto-repeats a held direction after 320 ms, then every 105 ms', () => {
    const state = new GamepadState();
    const held = [pad({ buttons: [15] }) as unknown as Gamepad];
    expect(state.update(held, 0)).toEqual([{ type: 'navigate', direction: 'Right', repeat: false }]);
    expect(state.update(held, REPEAT_FIRST_DELAY_MS - 1)).toEqual([]);
    expect(state.update(held, REPEAT_FIRST_DELAY_MS)).toEqual([{ type: 'navigate', direction: 'Right', repeat: true }]);
    expect(state.update(held, REPEAT_FIRST_DELAY_MS + REPEAT_INTERVAL_MS - 1)).toEqual([]);
    expect(state.update(held, REPEAT_FIRST_DELAY_MS + REPEAT_INTERVAL_MS)).toEqual([{ type: 'navigate', direction: 'Right', repeat: true }]);
  });

  it('uses stick hysteresis and only the dominant axis', () => {
    expect([...stickDirections(0.45, 0, new Set())]).toEqual([]);
    expect([...stickDirections(0.55, 0, new Set())]).toEqual(['Right']);
    expect([...stickDirections(0.4, 0, new Set(['Right']))]).toEqual(['Right']);
    expect([...stickDirections(0.3, 0, new Set(['Right']))]).toEqual([]);
    expect([...stickDirections(0.6, 0.7, new Set())]).toEqual(['Down']);
  });

  it('emits right-stick scrolling and a final stop', () => {
    const state = new GamepadState();
    expect(state.update([pad({ axes: [0, 0, 0, 0.8] }) as unknown as Gamepad], 0)).toEqual([{ type: 'scroll', dx: 0, dy: 0.8 }]);
    expect(state.update([pad({ axes: [0, 0, 0, 0.1] }) as unknown as Gamepad], 16)).toEqual([{ type: 'scroll', dx: 0, dy: 0 }]);
    expect(state.update([pad() as unknown as Gamepad], 32)).toEqual([]);
  });
});

describe('PlayStation pad detection', async () => {
  const { padLayout } = await import('./gamepadInput');
  it('recognises Sony pads by vendor id or name', () => {
    expect(padLayout('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('playstation');
    expect(padLayout('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)')).toBe('playstation');
    expect(padLayout('054c-05c4-Wireless Controller')).toBe('playstation');
    expect(padLayout('Sony Interactive Entertainment DualShock 4')).toBe('playstation');
    expect(padLayout('PS5 Controller')).toBe('playstation');
  });
  it('keeps Xbox labels for everything else', () => {
    expect(padLayout('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox');
    expect(padLayout('045e-0b13-Xbox Wireless Controller')).toBe('xbox');
    expect(padLayout('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)')).toBe('xbox');
    expect(padLayout('')).toBe('xbox');
  });
});

describe('long press', () => {
  it('reports a tap as press then release, and a hold after 500 ms', () => {
    const state = new GamepadState();
    const a = [pad({ buttons: [0] }) as unknown as Gamepad];
    const none = [pad() as unknown as Gamepad];
    state.update(a, 0);
    expect(state.update(none, 100)).toEqual([{ type: 'release', button: 'A', held: false }]);
    state.update(a, 200);
    expect(state.update(a, 200 + HOLD_MS - 1)).toEqual([]);
    expect(state.update(a, 200 + HOLD_MS)).toEqual([{ type: 'hold', button: 'A' }]);
    expect(state.update(a, 200 + HOLD_MS * 2)).toEqual([]);
    expect(state.update(none, 200 + HOLD_MS * 2 + 16)).toEqual([{ type: 'release', button: 'A', held: true }]);
  });
});
