import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { GamepadNavigation } from './GamepadNavigation';
import { GAMEPAD_SEARCH_EVENT, MAIN_TAB_EVENT } from './mainTabEvent';

vi.mock('./controllerSounds', () => ({ playControllerSound: vi.fn() }));

let pressed = new Set<number>();
let padId = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
let frames: FrameRequestCallback[] = [];
let clock = 0;

function fakePad() {
  return { id: padId, connected: true, mapping: 'standard', index: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: pressed.has(index), value: pressed.has(index) ? 1 : 0 })) };
}
function step() { const pending = frames; frames = []; clock += 16; pending.forEach(callback => callback(clock)); }
/** Presses and releases a standard-mapping button across two frames. */
function press(index: number) { act(() => { pressed.add(index); step(); pressed.delete(index); step(); }); }

function rect(element: HTMLElement, left: number, top: number, width = 100, height = 40) {
  const box = { left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) };
  element.getBoundingClientRect = () => box as DOMRect;
  element.getClientRects = () => [box] as unknown as DOMRectList;
}

function Grid() {
  return <>
    <header className="topbar"><a href="/" aria-current="page" data-rect="0,0">Home</a><a href="/search" data-rect="120,0">Search</a></header>
    <main className="main-area">
      <h2><button className="shelf-title-button" data-rect="0,70">Row title</button></h2><button className="rail-arrow" data-rect="400,100">More</button>
      <button data-rect="0,100">One</button><button data-rect="200,100">Two</button>
      <button data-rect="0,200">Three</button>
      <div data-gamepad-tabs data-rect="0,300"><button aria-pressed="true" data-rect="0,300">S1</button><button aria-pressed="false" data-rect="120,300">S2</button></div>
    </main>
  </>;
}
function Where() { return <span data-testid="path">{useLocation().pathname}</span>; }

beforeEach(() => {
  pressed = new Set(); frames = []; clock = 0; padId = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [fakePad()] });
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); delete document.documentElement.dataset.input; });

function mount(path = '/') {
  const result = render(<MemoryRouter initialEntries={['/details/movie/tt1', path]} initialIndex={1}>
    <Routes><Route path="*" element={<><Grid /><Where /><GamepadNavigation /></>} /></Routes>
  </MemoryRouter>);
  document.querySelectorAll<HTMLElement>('[data-rect]').forEach(element => { const [left, top] = element.dataset.rect!.split(',').map(Number); rect(element, left, top); });
  return result;
}

describe('gamepad navigation in the React shell', () => {
  it('wakes controller mode on the first press and then moves focus spatially', () => {
    mount();
    press(15); // D-pad right: selects the first content item
    expect(document.documentElement.dataset.input).toBe('gamepad');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'One' }));
    expect(screen.getByRole('status', { name: 'Controller buttons' })).toBeInTheDocument();
    press(15);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Two' }));
    press(13); // down: the season chip under "Two" shares its column
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'S2' }));
    press(14); press(12); // left, then up into the row above
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Three' }));
    press(12); press(12); // up twice reaches the navigation bar
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Home' }));
  });

  it('activates with A and leaves controller mode on real mouse movement', () => {
    mount();
    const one = screen.getByRole('button', { name: 'One' });
    const click = vi.fn(); one.addEventListener('click', click);
    press(15); press(0);
    expect(click).toHaveBeenCalledTimes(1);
    clock += 1000;
    act(() => { window.dispatchEvent(new MouseEvent('mousemove')); });
    // jsdom marks dispatched events untrusted, so the pointer guard keeps controller mode here.
    expect(document.documentElement.dataset.input).toBe('gamepad');
  });

  it('switches seasons with LB/RB and main tabs when no tab group exists', () => {
    mount();
    const second = screen.getByRole('button', { name: 'S2' });
    const click = vi.fn(); second.addEventListener('click', click);
    press(5);
    expect(click).toHaveBeenCalledTimes(1);
    document.querySelector('[data-gamepad-tabs]')!.remove();
    const tab = vi.fn(); window.addEventListener(MAIN_TAB_EVENT, tab);
    press(4);
    expect((tab.mock.calls[0][0] as CustomEvent).detail).toEqual({ delta: -1 });
    window.removeEventListener(MAIN_TAB_EVENT, tab);
  });

  it('opens Search with Y and goes back with B off the main tabs', () => {
    mount('/collections');
    const search = vi.fn(); window.addEventListener(GAMEPAD_SEARCH_EVENT, search);
    press(3);
    expect(search).toHaveBeenCalledTimes(1);
    window.removeEventListener(GAMEPAD_SEARCH_EVENT, search);
    press(1);
    expect(screen.getByTestId('path')).toHaveTextContent('/details/movie/tt1');
  });

  it('opens the focused item menu with X', () => {
    mount();
    const menu = vi.fn((event: Event) => event.preventDefault());
    screen.getByRole('button', { name: 'One' }).addEventListener('contextmenu', menu);
    press(15); press(2);
    expect(menu).toHaveBeenCalledTimes(1);
  });

  it('stays out of the way during playback', () => {
    mount('/playback');
    press(15);
    expect(document.documentElement.dataset.input).toBeUndefined();
    expect(document.activeElement).toBe(document.body);
  });
  it('switches the hint bar to PlayStation symbols for a DualSense', () => {
    padId = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
    mount();
    press(15);
    expect(screen.getByRole('status', { name: 'Controller buttons' })).toHaveAttribute('data-layout', 'playstation');
  });
  it('announces a newly detected controller', () => {
    mount();
    act(() => step());
    expect(screen.getByText('Controller detected')).toBeInTheDocument();
  });

  it('skips row titles and row arrows', () => {
    mount();
    press(15); press(15); // One, Two
    press(15); // nothing to the right except the skipped arrow
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Two' }));
    press(14); press(12); // back to One, then up past the row title to the navigation
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Home' }));
  });

  it('does not send Escape (which leaves fullscreen) on a page', () => {
    mount();
    const escape = vi.fn();
    window.addEventListener('keydown', escape);
    press(15); press(1);
    expect(escape).not.toHaveBeenCalled();
    window.removeEventListener('keydown', escape);
  });
  it('reaches floating page buttons such as fullscreen', () => {
    mount();
    const fullscreen = document.createElement('button');
    fullscreen.textContent = 'Fullscreen';
    document.body.append(fullscreen);
    rect(fullscreen, 900, 100);
    press(15); press(15); press(15); // One, Two, then the floating button on the same row
    expect(document.activeElement).toBe(fullscreen);
    fullscreen.remove();
  });

  it('skips collapsed, faded-out buttons', () => {
    mount();
    const hidden = document.createElement('button');
    hidden.textContent = 'Folded action';
    (hidden as HTMLElement & { checkVisibility: () => boolean }).checkVisibility = () => false;
    screen.getByRole('button', { name: 'One' }).after(hidden);
    rect(hidden, 110, 100, 20);
    press(15); press(15);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Two' }));
  });

  it('selects the first option of a sheet once its options load', async () => {
    mount();
    press(15); // controller mode on
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    rect(dialog, 300, 300, 400, 300);
    await act(async () => { await Promise.resolve(); step(); });
    const option = document.createElement('button');
    option.textContent = '4K HDR';
    rect(option, 320, 320, 360, 60);
    await act(async () => { dialog.append(option); await Promise.resolve(); step(); });
    expect(document.activeElement).toBe(option);
    dialog.remove();
  });
  it('keeps LB/RB on the main tabs when a page tab row is not focused', () => {
    mount('/library');
    document.querySelector('[data-gamepad-tabs]')!.remove();
    const pageTabs = document.createElement('div');
    pageTabs.setAttribute('role', 'tablist');
    pageTabs.innerHTML = '<button aria-selected="true">Saved</button><button aria-selected="false">Cloud</button>';
    document.querySelector('main')!.append(pageTabs);
    rect(pageTabs, 0, 400, 300); [...pageTabs.children].forEach((tab, index) => rect(tab as HTMLElement, index * 120, 400));
    const cloud = vi.fn(); pageTabs.children[1].addEventListener('click', cloud);
    const tab = vi.fn(); window.addEventListener(MAIN_TAB_EVENT, tab);
    press(15); press(5); // focus is on "One", not in the tab row
    expect(tab).toHaveBeenCalledTimes(1);
    expect(cloud).not.toHaveBeenCalled();
    act(() => { (pageTabs.children[0] as HTMLElement).focus(); });
    press(5); // now inside the Saved/Cloud row
    expect(cloud).toHaveBeenCalledTimes(1);
    window.removeEventListener(MAIN_TAB_EVENT, tab);
  });
  it('skips the Home hero title and wrapper, landing on View Details', () => {
    mount();
    const hero = document.createElement('section');
    hero.className = 'home-hero'; hero.tabIndex = 0;
    hero.innerHTML = '<button class="hero-logo-button">Ray Gunn</button><button>View Details</button>';
    document.querySelector('main')!.prepend(hero);
    rect(hero, 0, -400, 1200, 380);
    rect(hero.children[0] as HTMLElement, 0, -300, 400, 120);
    rect(hero.children[1] as HTMLElement, 0, -120, 150, 50);
    press(15); press(12); // One, then up
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'View Details' }));
  });
  it('continues the top bar row into the top-right buttons and back', () => {
    mount();
    const party = document.createElement('button'); party.className = 'party-toggle'; party.textContent = 'Watch party';
    const fullscreen = document.createElement('button'); fullscreen.className = 'fullscreen-toggle'; fullscreen.textContent = 'Fullscreen';
    document.body.append(party, fullscreen);
    rect(party, 900, 300); rect(fullscreen, 1020, 300); // lower than the bar, so plain geometry would not pick them
    press(15); act(() => screen.getByRole('link', { name: 'Search' }).focus());
    press(15);
    expect(document.activeElement).toBe(party);
    press(15);
    expect(document.activeElement).toBe(fullscreen);
    press(14); press(14);
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Search' }));
    party.remove(); fullscreen.remove();
  });
  it('long-presses with a held A (Settings profile menu, card options) instead of clicking', () => {
    mount();
    const one = screen.getByRole('button', { name: 'One' });
    const click = vi.fn(); const menu = vi.fn((event: Event) => event.preventDefault());
    one.addEventListener('click', click); one.addEventListener('contextmenu', menu);
    press(15); // focus One
    act(() => { pressed.add(0); step(); clock += 520; step(); pressed.delete(0); step(); });
    expect(menu).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();
    press(0); // a tap still clicks
    expect(click).toHaveBeenCalledTimes(1);
    expect(menu).toHaveBeenCalledTimes(1);
  });
  it('reaches switches whose native input is invisible', () => {
    mount();
    const label = document.createElement('label'); label.className = 'switch';
    const input = document.createElement('input'); input.type = 'checkbox'; input.setAttribute('aria-label', 'Enable add-on');
    (input as HTMLInputElement & { checkVisibility: () => boolean }).checkVisibility = () => false;
    label.append(input, document.createElement('span'));
    document.querySelector('main')!.append(label);
    rect(label, 400, 100, 40, 24); rect(input, 400, 100, 1, 1);
    press(15); press(15); press(15); // One, Two, then the switch on the same row
    expect(document.activeElement).toBe(input);
  });

  it('does not send ArrowDown to the top bar (it opens the profile menu)', () => {
    mount();
    const home = screen.getByRole('link', { name: 'Home' });
    const keys = vi.fn(); home.addEventListener('keydown', keys);
    press(15); act(() => home.focus());
    press(13);
    expect(keys).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'One' }));
  });

  it('grabs a slider with A, adjusts it with Left/Right and lets go with B', () => {
    mount();
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = '1'; slider.max = '5'; slider.step = '1'; slider.value = '2'; slider.setAttribute('aria-label', 'Hold speed');
    document.querySelector('main')!.append(slider);
    rect(slider, 0, 500, 300, 20);
    const saved = vi.fn(); slider.addEventListener('keyup', saved);
    press(15); act(() => slider.focus());
    press(15); // not grabbed: Right moves focus, the value stays
    expect(slider.value).toBe('2');
    act(() => slider.focus());
    press(0); // grab
    expect(slider).toHaveAttribute('data-gamepad-adjusting');
    press(15); press(15);
    expect(slider.value).toBe('4');
    expect(saved).toHaveBeenCalledTimes(2);
    press(12); // Up does not leave a grabbed slider
    expect(document.activeElement).toBe(slider);
    press(1); // B lets go and stays on the page
    expect(slider).not.toHaveAttribute('data-gamepad-adjusting');
    expect(screen.getByTestId('path')).toHaveTextContent('/');
    press(12);
    expect(document.activeElement).not.toBe(slider);
  });
});
