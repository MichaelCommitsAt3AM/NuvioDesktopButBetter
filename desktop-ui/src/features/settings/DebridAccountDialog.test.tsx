import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DebridAccountDialog } from './DebridAccountDialog';

const bridge = vi.hoisted(() => ({ call: vi.fn(), refresh: vi.fn() }));
vi.mock('../../bridge', () => ({ call: (...args: unknown[]) => bridge.call(...args), refreshFeature: (...args: unknown[]) => bridge.refresh(...args) }));
const authorization = { providerId: 'premiumize', userCode: 'ABCD', verificationUrl: 'https://example.test/approve?code=ABCD', friendlyVerificationUrl: 'example.test/approve', intervalSeconds: 2, expiresAt: null, nextPollAtEpochMs: 2000 };
const provider = { id: 'premiumize', displayName: 'Premiumize', authMethod: 'DeviceCode', configured: false };
const close = vi.fn();
async function mount(overrides = {}) {
  const view = render(<StrictMode><div className="settings-page" style={{ transform: 'translateX(0)' }}><DebridAccountDialog provider={{ ...provider, ...overrides }} onClose={close} /></div></StrictMode>);
  await act(async () => {});
  return view;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  close.mockReset(); bridge.refresh.mockReset().mockResolvedValue({}); bridge.call.mockReset();
  bridge.call.mockImplementation((method: string) => Promise.resolve(method === 'debrid.device.start' ? authorization : { status: 'pending', nextPollAtEpochMs: Date.now() + 2000 }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('portals the Kotlin connect dialog outside transformed settings and starts only once in StrictMode', async () => {
  const view = await mount();
  const dialog = screen.getByRole('dialog', { name: 'Connect Premiumize' });
  expect(dialog.closest('.settings-page')).toBeNull();
  expect(view.container.querySelector('[role=dialog]')).toBeNull();
  expect(bridge.call).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Open the link and enter this code to approve Nuvio.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});

it('opens the actual verification URL and copies the code', async () => {
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Open link' }));
  expect(bridge.call).toHaveBeenCalledWith('app.openExternal', { url: authorization.verificationUrl });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy code ABCD' })); });
  expect(copy).toHaveBeenCalledWith('ABCD');
  expect(screen.getByText('Code copied.')).toBeInTheDocument();
});

it('automatically polls at the provider interval and closes on approval', async () => {
  await mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(1999); });
  expect(bridge.call).not.toHaveBeenCalledWith('debrid.device.poll', expect.anything());
  bridge.call.mockResolvedValueOnce({ status: 'authorized' });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(close).toHaveBeenCalledTimes(1);
  expect(bridge.refresh).toHaveBeenCalledWith('debrid');
});

it('shows expiry and restarts with a new authorization', async () => {
  await mount();
  bridge.call.mockResolvedValueOnce({ status: 'expired' });
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(screen.getByText('This code expired. Try again.')).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
  expect(bridge.call).toHaveBeenLastCalledWith('debrid.device.start', { providerId: 'premiumize', restart: true });
});

it('validates a pasted API key and saves through the existing Kotlin settings', async () => {
  await mount();
  bridge.call.mockResolvedValueOnce({ valid: false });
  fireEvent.change(screen.getByLabelText('Premiumize API key'), { target: { value: ' key ' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
  expect(screen.getByText('Could not validate this API key.')).toBeInTheDocument();
  expect(bridge.call).not.toHaveBeenCalledWith('debrid.set', expect.anything());
  bridge.call.mockResolvedValueOnce({ valid: true });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
  expect(bridge.call).toHaveBeenCalledWith('debrid.validateKey', { providerId: 'premiumize', apiKey: 'key' });
  expect(bridge.call).toHaveBeenCalledWith('debrid.set', { providerId: 'premiumize', key: 'providerApiKey', value: 'key' });
  expect(close).toHaveBeenCalledOnce();
});

it('shows connected Torbox confirmation and disconnects only after clicking Disconnect', async () => {
  await mount({ id: 'torbox', displayName: 'Torbox', configured: true });
  expect(bridge.call).not.toHaveBeenCalled();
  expect(screen.getByText('Torbox is connected on this device.')).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Disconnect' })); });
  expect(bridge.call).toHaveBeenCalledWith('debrid.set', { providerId: 'torbox', key: 'providerApiKey', value: '' });
  expect(close).toHaveBeenCalledOnce();
});

it('stops polling on dismissal without erasing a pending code that Kotlin can resume', async () => {
  const view = await mount();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
  expect(bridge.call).toHaveBeenCalledTimes(1);
});
