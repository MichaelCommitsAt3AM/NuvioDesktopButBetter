import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RewriteWelcome, useRewriteWelcome } from './RewriteWelcome';

function WelcomeHarness() {
  const welcome = useRewriteWelcome();
  return welcome.pending ? <RewriteWelcome onClose={welcome.dismiss} /> : <p>Ready to browse</p>;
}

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('introduces the rewrite and persists acknowledgement across launches', () => {
  const first = render(<WelcomeHarness />);
  expect(screen.getByRole('dialog', { name: 'Welcome to the new Nuvio' })).toBeInTheDocument();
  expect(screen.getByText(/faster to open/)).toBeInTheDocument();
  expect(screen.getByText(/touchscreen/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: "Let's explore" }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  first.unmount();
  render(<WelcomeHarness />);
  expect(screen.getByText('Ready to browse')).toBeInTheDocument();
});

it('also welcomes existing users with saved app preferences', () => {
  localStorage.setItem('existing-preferences', 'saved');
  render(<WelcomeHarness />);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getByText('Ready to browse')).toBeInTheDocument();
  expect(localStorage.getItem('existing-preferences')).toBe('saved');
});

it('can still dismiss when device storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
  render(<WelcomeHarness />);
  fireEvent.click(screen.getByRole('button', { name: "Let's explore" }));
  expect(screen.getByText('Ready to browse')).toBeInTheDocument();
});
