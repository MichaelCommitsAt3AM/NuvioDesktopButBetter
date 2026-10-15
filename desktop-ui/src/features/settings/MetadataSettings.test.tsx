import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MetadataSettingsPage } from './ExtendedSettings';

const bridge = vi.hoisted(() => ({ snapshot: {} as any, call: vi.fn(), refresh: vi.fn() }));
vi.mock('../../bridge', () => ({
  useFeatureSnapshot: () => bridge.snapshot, useSelector: () => undefined,
  call: (...args: unknown[]) => bridge.call(...args), refreshFeature: (...args: unknown[]) => bridge.refresh(...args),
}));
function section(key: string, extra = {}) { return { key, title: key, description: `Description for ${key}`, enabled: true, order: 0, tabGroup: null, canBeTabbed: true, ...extra }; }
function page() { render(<MemoryRouter><div className="settings-desktop"><MetadataSettingsPage /></div></MemoryRouter>); }
beforeEach(() => {
  bridge.snapshot = { items: [section('CAST'), section('COMMENTS', { order: 1 }), section('TRAILERS', { order: 2 }), section('EPISODES', { order: 3, canBeTabbed: false })], backgroundMode: 'normal', episodeCardStyle: 'horizontal', tabLayout: true, episodeRatingsVisibility: 'show_all' };
  bridge.call.mockReset().mockResolvedValue({}); bridge.refresh.mockReset().mockResolvedValue({});
});
afterEach(cleanup);

describe('shared Kotlin settings rows in Detail Page', () => {
  it('explains unavailable hero previews and prevents requests from the unsupported switch', () => {
    bridge.snapshot.heroTrailerPlaybackSupported = false;
    bridge.snapshot.heroTrailerPlayback = true;
    page();
    const toggle = screen.getByRole('checkbox', { name: 'Hero trailer playback' });
    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/Hero trailer previews are not available/)).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(bridge.call).not.toHaveBeenCalled();
  });
  it('uses shared rows with group chips below the summary and saves visibility', async () => {
    page();
    const row = screen.getByLabelText('Show CAST').closest('article')!;
    expect(row).toHaveClass('settings-reorder-row');
    expect(row.querySelector('.settings-reorder-summary .metadata-tab-groups')).toBeNull();
    expect(row.querySelector('.settings-reorder-detail .metadata-tab-groups')).not.toBeNull();
    expect(screen.getByLabelText('Reorder CAST').querySelector('.lucide-menu')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Show CAST'));
    await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('metadataSettings.setSectionEnabled', { section: 'CAST', enabled: false }));
  });
  it('saves keyboard and drag reordering by section keys', async () => {
    page(); fireEvent.keyDown(screen.getByLabelText('Reorder CAST'), { key: 'ArrowDown' });
    await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('metadataSettings.move', { fromSection: 'CAST', toSection: 'COMMENTS' }));
    await waitFor(() => expect(screen.getByLabelText('Reorder CAST')).toBeEnabled());
    fireEvent.dragStart(screen.getByLabelText('Reorder CAST'), { dataTransfer: { setData: vi.fn(), effectAllowed: '' } });
    const target = screen.getByLabelText('Show TRAILERS').closest('article')!;
    fireEvent.dragOver(target); expect(target).toHaveClass('drop-target'); fireEvent.drop(target);
    await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('metadataSettings.move', { fromSection: 'CAST', toSection: 'TRAILERS' }));
  });
  it('limits tab groups, lets selected sections leave, and hides chips on disabled sections', async () => {
    bridge.snapshot.items = [section('CAST', { tabGroup: 1 }), section('COMMENTS', { tabGroup: 1 }), section('TRAILERS', { tabGroup: 1 }), section('COLLECTION'), section('EPISODES', { enabled: false })];
    page();
    const collection = screen.getByLabelText('Show COLLECTION').closest('article')!;
    expect(within(collection).getByRole('button', { name: 'Group 1' })).toBeDisabled();
    const cast = screen.getByLabelText('Show CAST').closest('article')!;
    expect(within(cast).getByRole('button', { name: 'Group 1' })).toBeEnabled();
    fireEvent.click(within(cast).getByRole('button', { name: 'None' }));
    await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('metadataSettings.setTabGroup', { section: 'CAST', groupId: null }));
    expect(screen.getByLabelText('Show EPISODES').closest('article')!.querySelector('.metadata-tab-groups')).toBeNull();
  });
  it('resets through Kotlin and reports failures without keeping rows disabled', async () => {
    bridge.call.mockRejectedValueOnce(new Error('Could not save sections'));
    page(); fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(bridge.call).toHaveBeenCalledWith('metadataSettings.reset', {}));
    await waitFor(() => expect(screen.getByLabelText('Reorder CAST')).toBeEnabled());
    expect(screen.getByText('Could not save sections')).toBeInTheDocument();
  });
});
