import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UpdateBanner } from './UpdateBanner';
import { dismissTestBanner, showTestBanner } from './updateBannerTest';

afterEach(() => { cleanup(); vi.useRealTimers(); act(() => { dismissTestBanner(); }); });

describe('UpdateBanner preview hook', () => {
  it('shows the fake update with release notes and dismisses', async () => {
    render(<UpdateBanner />);
    expect(screen.queryByRole('region', { name: 'Preview update banner' })).toBeNull();
    act(() => { showTestBanner(); });
    expect(screen.getByRole('region', { name: 'Preview update banner' })).toBeInTheDocument();
    expect(screen.getByText('9.9.9 • 185 MB')).toBeInTheDocument();
    expect(screen.getByText('Update available')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Release notes' }));
    expect(screen.getByText(/local preview of the new update experience/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss update banner' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Preview update banner' })).toBeNull());
  });

  it('simulates the download to completion', () => {
    vi.useFakeTimers();
    render(<UpdateBanner />);
    act(() => { showTestBanner(); });
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(screen.getByText('Downloading… 0%')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3500); });
    expect(screen.getByText('Banner test complete')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
  });

  it('animates closed before unmounting on dismiss', async () => {
    render(<UpdateBanner />);
    act(() => { showTestBanner(); });
    expect(document.querySelector('.update-banner-wrap:not(.is-closing)')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss update banner' }));
    expect(document.querySelector('.update-banner-wrap.is-closing')).not.toBeNull();
    await waitFor(() => expect(document.querySelector('.update-banner-wrap')).toBeNull());
  });

  it('releases the nav offset once dismissed', async () => {
    render(<UpdateBanner />);
    act(() => { showTestBanner(); });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss update banner' }));
    await waitFor(() => expect(document.querySelector('.update-banner-wrap')).toBeNull());
    expect(document.documentElement.style.getPropertyValue('--update-banner-height')).toBe('0px');
  });
});
