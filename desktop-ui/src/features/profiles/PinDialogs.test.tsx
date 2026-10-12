import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PinEntryDialog, ProfilePinManager, ProfileUnlockDialog } from './PinDialogs';

const bridge = vi.hoisted(() => ({ call: vi.fn(), selectProfile: vi.fn(), refresh: vi.fn() }));
vi.mock('../../bridge', () => ({ call: bridge.call, actions: { selectProfile: bridge.selectProfile }, refreshFeature: bridge.refresh }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function digits(pin: string) { for (const digit of pin) fireEvent.click(screen.getByRole('button', { name: digit })); }

it('submits four digits automatically and preserves leading zeroes', async () => {
  const verify = vi.fn().mockResolvedValue({ unlocked: true });
  const done = vi.fn();
  render(<PinEntryDialog profileName="Main" onVerify={verify} onVerified={done} onClose={vi.fn()} />);
  digits('012');
  expect(verify).not.toHaveBeenCalled();
  digits('3');
  await waitFor(() => expect(done).toHaveBeenCalledWith('0123'));
  expect(verify).toHaveBeenCalledTimes(1);
});

it('keeps an incorrect PIN open and never selects the profile', async () => {
  bridge.call.mockResolvedValue({ unlocked: false, message: 'Incorrect PIN.' });
  render(<ProfileUnlockDialog profile={{ id: 2, name: 'Family' }} onSelected={vi.fn()} onClose={vi.fn()} />);
  digits('1234');
  await screen.findByText('Incorrect PIN.');
  expect(bridge.selectProfile).not.toHaveBeenCalled();
  expect(screen.getByLabelText('0 of 4 digits entered')).toBeInTheDocument();
});

it('disables further attempts during the server lockout', async () => {
  render(<PinEntryDialog profileName="Main" onVerify={vi.fn().mockResolvedValue({ unlocked: false, retryAfterSeconds: 300 })} onClose={vi.fn()} />);
  digits('1234');
  await screen.findByText(/Too many attempts. Try again in/);
  expect(screen.getByRole('button', { name: '1' })).toBeDisabled();
});

it('shows failed removal without closing or claiming success', async () => {
  bridge.call.mockRejectedValue(new Error('Could not remove PIN'));
  const done = vi.fn();
  render(<ProfilePinManager profile={{ id: 2, name: 'Family', locked: true }} action="clear" onClose={vi.fn()} onDone={done} />);
  digits('1234');
  await screen.findByText('Could not remove PIN');
  expect(done).not.toHaveBeenCalled();
  expect(bridge.call).toHaveBeenCalledWith('profiles.pin.clear', { id: 2, currentPin: '1234' });
});

it('recovers with the account password and refreshes the profile state', async () => {
  bridge.call.mockResolvedValue({});
  bridge.refresh.mockResolvedValue({});
  const done = vi.fn();
  render(<ProfilePinManager profile={{ id: 2, name: 'Family' }} action="clear" passwordRecovery onClose={vi.fn()} onDone={done} />);
  fireEvent.change(screen.getByLabelText('Account password'), { target: { value: 'account-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Remove PIN' }));
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(bridge.call).toHaveBeenCalledWith('profiles.pin.clearWithPassword', { id: 2, accountPassword: 'account-password' });
  expect(bridge.refresh).toHaveBeenCalledWith('profiles');
});
