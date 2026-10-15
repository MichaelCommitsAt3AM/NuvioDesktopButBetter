import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
  act(() => vi.advanceTimersByTime(219));
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
  act(() => vi.advanceTimersByTime(220));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('cancels an old exit when reopened and cleans up the timer on unmount', () => {
  const exited = vi.fn();
  const view = render(<Sheet exited={exited} />);
  fireEvent.click(screen.getByText('Open sheet'));
  fireEvent.keyDown(document, { key: 'Escape' });
  act(() => vi.advanceTimersByTime(100));
  fireEvent.click(screen.getByText('Open sheet'));
  act(() => vi.advanceTimersByTime(220));
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
  act(() => vi.advanceTimersByTime(220));
  expect(screen.queryByRole('dialog')).toBeNull();
});
