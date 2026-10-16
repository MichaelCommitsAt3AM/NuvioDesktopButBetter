import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { BottomSheetPresence } from './BottomSheetPresence';
import { Dialog } from './Dialog';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function Sheet({ narrowOnly = false, exited = () => {} }: { narrowOnly?: boolean; exited?: () => void }) {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Open sheet</button>
    <BottomSheetPresence narrowOnly={narrowOnly} onExitComplete={exited}>
      {open && <Dialog label="Episode actions" onClose={() => setOpen(false)}><h2>Episode title</h2><button onClick={() => setOpen(false)}>Select action</button></Dialog>}
    </BottomSheetPresence>
  </>;
}

it('retains the sheet and its title after an action, then restores focus after the exit', () => {
  const exited = vi.fn();
  render(<Sheet exited={exited} />);
  const trigger = screen.getByText('Open sheet');
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByRole('dialog').parentElement).toHaveClass('bottom-sheet-motion');
  fireEvent.click(screen.getByText('Select action'));
  expect(screen.getByRole('dialog')).toHaveAttribute('inert');
  expect(screen.getByText('Episode title')).toBeInTheDocument();
  expect(screen.getByRole('dialog').parentElement).toHaveClass('is-sheet-closing');
  act(() => vi.advanceTimersByTime(249));
  expect(exited).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(exited).toHaveBeenCalledTimes(1);
  expect(trigger).toHaveFocus();
});

it('focuses the entering sheet without scrolling its offscreen starting position', () => {
  const focus = vi.spyOn(HTMLElement.prototype, 'focus');
  render(<Sheet />);
  fireEvent.click(screen.getByText('Open sheet'));
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  focus.mockRestore();
});

it.each(['Escape', 'backdrop'])('animates dismissal through %s', method => {
  render(<Sheet />);
  fireEvent.click(screen.getByText('Open sheet'));
  if (method === 'Escape') fireEvent.keyDown(document, { key: 'Escape' });
  else fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
  expect(screen.getByRole('dialog').parentElement).toHaveClass('is-sheet-closing');
  act(() => vi.advanceTimersByTime(250));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('cancels an old exit when reopened and cleans up the timer on unmount', () => {
  const exited = vi.fn();
  const view = render(<Sheet exited={exited} />);
  fireEvent.click(screen.getByText('Open sheet'));
  fireEvent.keyDown(document, { key: 'Escape' });
  act(() => vi.advanceTimersByTime(100));
  fireEvent.click(screen.getByText('Open sheet'));
  act(() => vi.advanceTimersByTime(250));
  expect(screen.getByRole('dialog').parentElement).not.toHaveClass('is-sheet-closing');
  expect(exited).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: 'Escape' });
  view.unmount();
  act(() => vi.runAllTimers());
  expect(exited).not.toHaveBeenCalled();
});

it('dismisses immediately with reduced motion', () => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('prefers-reduced-motion') })));
  const exited = vi.fn();
  render(<Sheet exited={exited} />);
  fireEvent.click(screen.getByText('Open sheet'));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(exited).toHaveBeenCalledTimes(1);
});

it.each([false, true])('animates a responsive sheet only in a narrow window (%s)', narrow => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('max-width') && narrow })));
  render(<Sheet narrowOnly />);
  fireEvent.click(screen.getByText('Open sheet'));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(!!screen.queryByRole('dialog')).toBe(narrow);
  act(() => vi.advanceTimersByTime(250));
  expect(screen.queryByRole('dialog')).toBeNull();
});

describe('pointer drag dismissal', () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ height: 400, width: 300, x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, toJSON: () => ({}) } as DOMRect);
  });
  afterEach(() => { vi.restoreAllMocks(); });
  // jsdom does not populate clientY on synthetic PointerEvents, so drive the
  // pointer handlers with explicitly constructed events carrying coordinates.
  // fireEvent wraps dispatch in act() so state settles synchronously.
  const pointer = (node: HTMLElement, type: 'pointerdown' | 'pointermove' | 'pointerup', clientY: number) =>
    fireEvent(node, new MouseEvent(type, { bubbles: true, clientY, button: 0 }));
  const drag = (node: HTMLElement, fromY: number, toY: number) => {
    pointer(node, 'pointerdown', fromY);
    pointer(node, 'pointermove', toY);
    pointer(node, 'pointerup', toY);
  };

  it('dismisses on a long downward drag and fires exit completion once', () => {
    const exited = vi.fn();
    render(<Sheet exited={exited} />);
    fireEvent.click(screen.getByText('Open sheet'));
    const surface = screen.getByRole('dialog');
    pointer(surface, 'pointerdown', 200);
    pointer(surface, 'pointermove', 360);
    expect(surface.style.transform).toContain('translateY(160px)');
    expect(surface).toHaveClass('sheet-dragged');
    pointer(surface, 'pointerup', 360);
    expect(surface.parentElement).toHaveClass('is-sheet-closing');
    expect(surface.style.getPropertyValue('--sheet-exit-start')).toBe('160px');
    act(() => vi.advanceTimersByTime(250));
    expect(exited).toHaveBeenCalledTimes(1);
  });

  it('snaps back on a short drag without dismissing', () => {
    render(<Sheet />);
    fireEvent.click(screen.getByText('Open sheet'));
    const surface = screen.getByRole('dialog');
    drag(surface, 200, 210);
    expect(screen.getByRole('dialog').parentElement).not.toHaveClass('is-sheet-closing');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not hijack gestures starting on inner controls', () => {
    render(<Sheet />);
    fireEvent.click(screen.getByText('Open sheet'));
    const action = screen.getByText('Select action');
    drag(action, 200, 360);
    expect(screen.getByRole('dialog').parentElement).not.toHaveClass('is-sheet-closing');
  });
});
