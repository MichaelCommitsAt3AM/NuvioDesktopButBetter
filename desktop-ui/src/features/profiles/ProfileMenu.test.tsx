import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProfileMenu } from './ProfileMenu';

const bridge = vi.hoisted(() => ({ session: {} as any, select: vi.fn(), call: vi.fn() }));
vi.mock('../../bridge', () => ({ useSelector: (select: any) => select({ session: bridge.session }), useFeatureSnapshot: () => undefined, actions: { selectProfile: bridge.select }, call: bridge.call }));
beforeEach(() => {
  bridge.session = { activeProfile: 1, profiles: [{ id: 1, name: 'Michael', color: '#1e88e5' }, { id: 2, name: 'Kids', color: '#1e88e5' }, { id: 3, name: 'test', color: '#1e88e5', locked: true }] };
  bridge.select.mockReset(); bridge.select.mockResolvedValue(undefined);
  bridge.call.mockReset(); bridge.call.mockResolvedValue({ unlocked: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function menu(onClose = vi.fn()) {
  render(<MemoryRouter initialEntries={['/settings/appearance']}><Routes><Route path="/" element={<p>Home page</p>} /><Route path="/settings/appearance" element={<div><a className="nav-link">Settings</a><ProfileMenu onClose={onClose} /></div>} /><Route path="/profiles/new" element={<p>Create profile page</p>} /></Routes></MemoryRouter>);
  return onClose;
}
it('uses a two-column avatar grid with an active badge and only Add Profile', () => {
  menu();
  expect(screen.getByRole('menu')).toHaveStyle({ '--profile-columns': '2' });
  expect(screen.getByRole('menuitemradio', { name: 'Michael' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByRole('menuitem', { name: 'Add Profile' })).toBeInTheDocument();
  expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
});
it('keeps the popup mounted throughout its closing animation on outside click and Escape', () => {
  vi.useFakeTimers();
  const close = menu();
  fireEvent.click(screen.getByRole('button', { name: 'Close profile menu' }));
  expect(screen.getByRole('menu')).toHaveClass('closing');
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  act(() => vi.advanceTimersByTime(159));
  expect(close).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(close).toHaveBeenCalledTimes(1);
});
it('dismisses the active profile without selecting it again', () => {
  menu(); fireEvent.click(screen.getByRole('menuitemradio', { name: 'Michael' }));
  expect(bridge.select).not.toHaveBeenCalled();
});
it('switches a profile and requires PIN verification inside the popup for locked profiles', async () => {
  menu(); fireEvent.click(screen.getByRole('menuitemradio', { name: 'test' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(bridge.select).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Profile PIN'), { target: { value: '0123' } });
  await act(async () => {});
  expect(bridge.call).toHaveBeenCalledWith('profiles.pin.verify', { id: 3, pin: '0123' });
  expect(bridge.select).toHaveBeenCalledWith(3, '0123');
  expect(screen.getByText('Home page')).toBeInTheDocument();
});
it('allows cancelling PIN entry and opens Add Profile after the closing transition', () => {
  vi.useFakeTimers(); menu();
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'test' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Add Profile' }));
  expect(screen.queryByText('Create profile page')).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(160));
  expect(screen.getByText('Create profile page')).toBeInTheDocument();
});

it('returns Home only after profile selection succeeds', async () => {
  let finish!: () => void;
  bridge.select.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  menu();
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Kids' }));
  expect(screen.queryByText('Home page')).not.toBeInTheDocument();
  await act(async () => finish());
  expect(screen.getByText('Home page')).toBeInTheDocument();
});
it('keeps the current page when switching fails', async () => {
  bridge.select.mockRejectedValueOnce(new Error('Switch failed'));
  menu();
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Kids' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Switch failed');
  expect(screen.queryByText('Home page')).not.toBeInTheDocument();
});

it('honors the destination profile PIN and hides profile creation in a kids profile', () => {
  bridge.session.activeProfile = 2;
  bridge.session.profiles[1].kidsEnabled = true;
  bridge.session.profiles[0].locked = true;
  menu();
  expect(screen.queryByRole('menuitem', { name: 'Add Profile' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Michael' }));
  expect(screen.getByText(/Michael/)).toBeInTheDocument();
  expect(bridge.select).not.toHaveBeenCalled();
});

it('can leave a kids profile for an unlocked profile without a parent PIN', async () => {
  bridge.session.activeProfile = 2;
  bridge.session.profiles[1].kidsEnabled = true;
  bridge.session.profiles[0].locked = false;
  menu();
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Michael' }));
  await act(async () => {});
  expect(bridge.select).toHaveBeenCalledWith(1, undefined);
  expect(screen.getByText('Home page')).toBeInTheDocument();
});
