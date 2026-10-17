import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReadOnlyBoundary } from './ReadOnlyBoundary';
import { InlineError } from './Status';

afterEach(cleanup);
const reason = 'Switch to an adult profile to change these settings.';
it('disables editing, keeps navigation available, and shows one neutral restriction notice', () => {
  const save = vi.fn();
  const change = vi.fn();
  render(<ReadOnlyBoundary readOnly reason={reason}>
    <input type="checkbox" aria-label="AMOLED Black" onChange={change} />
    <button onClick={save}>Save</button>
    <a href="#other-settings">Other settings</a>
    <InlineError message={`BridgeError: ${reason}`} onRetry={save} />
  </ReadOnlyBoundary>);
  expect(screen.getByRole('status')).toHaveTextContent(reason);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByText('Try again')).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  act(() => screen.getByRole('button', { name: 'Save' }).click());
  fireEvent.click(screen.getByRole('checkbox'));
  expect(save).not.toHaveBeenCalled();
  expect(change).not.toHaveBeenCalled();
  expect(screen.getByRole('link')).not.toHaveAttribute('aria-disabled', 'true');
});
it('retains genuine errors and restores normal editing when read-only mode ends', () => {
  const save = vi.fn();
  const view = render(<ReadOnlyBoundary readOnly reason={reason}><button onClick={save}>Save</button><InlineError message="Connection unavailable" /></ReadOnlyBoundary>);
  expect(screen.getByRole('alert')).toHaveTextContent('Connection unavailable');
  view.rerender(<ReadOnlyBoundary readOnly={false} reason={reason}><button onClick={save}>Save</button></ReadOnlyBoundary>);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByRole('button')).not.toBeDisabled();
  fireEvent.click(screen.getByRole('button'));
  expect(save).toHaveBeenCalledOnce();
});
