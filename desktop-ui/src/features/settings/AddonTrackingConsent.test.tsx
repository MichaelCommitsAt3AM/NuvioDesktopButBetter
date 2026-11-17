import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AddonsSettings } from './SettingsPage';

const bridge = vi.hoisted(() => ({ installAddon: vi.fn() }));
vi.mock('../../bridge', () => ({
  actions: { installAddon: (...args: unknown[]) => bridge.installAddon(...args), toggleAddon: vi.fn(), removeAddon: vi.fn() },
  call: vi.fn(), refreshFeature: vi.fn(), useFeatureSnapshot: () => undefined,
  useSelector: (select: (state: unknown) => unknown) => select({ addons: [] }),
}));

const url = 'https://tracker.example/manifest.json';
function installFlow() {
  render(<MemoryRouter><AddonsSettings /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Addon URL'), { target: { value: url } });
  fireEvent.click(screen.getByRole('button', { name: 'Install Addon' }));
}
beforeEach(() => bridge.installAddon.mockReset());
afterEach(cleanup);

describe('tracking add-on consent', () => {
  it('holds the install until the user agrees, then repeats it with consent', async () => {
    bridge.installAddon
      .mockResolvedValueOnce({ items: [], trackingConsent: { name: 'Tracker', manifestUrl: url } })
      .mockResolvedValueOnce({ items: [{ id: url, name: 'Tracker', manifestUrl: url, enabled: true }] });
    installFlow();
    expect(await screen.findByText(/Tracker is a tracking addon/)).toBeInTheDocument();
    expect(bridge.installAddon).toHaveBeenCalledWith(url, false);
    const confirm = screen.getAllByRole('button', { name: 'Install Addon' }).at(-1)!;
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(confirm);
    await waitFor(() => expect(bridge.installAddon).toHaveBeenLastCalledWith(url, true));
    expect(await screen.findByText(/Tracker was validated and added successfully/)).toBeInTheDocument();
  });

  it('does not install when the consent dialog is cancelled', async () => {
    bridge.installAddon.mockResolvedValueOnce({ items: [], trackingConsent: { name: 'Tracker', manifestUrl: url } });
    installFlow();
    await screen.findByText(/Tracker is a tracking addon/);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText(/Tracker is a tracking addon/)).not.toBeInTheDocument());
    expect(bridge.installAddon).toHaveBeenCalledTimes(1);
  });
});
