import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { RatingChip, RatingSheet, RatingStars, formatRating, useUserRating, type UserRatingState } from './UserRating';

const bridge = vi.hoisted(() => ({ snapshots: {} as Record<string, any>, call: vi.fn() }));
vi.mock('../../bridge', () => ({
  useFeatureSnapshot: (topic: string) => bridge.snapshots[topic],
  call: (...args: unknown[]) => bridge.call(...args),
}));

beforeEach(() => {
  bridge.snapshots = { trackingSettings: { effectiveRatingSource: 'MDBLIST' } };
  bridge.call.mockReset();
});
afterEach(cleanup);

describe('Kotlin user rating parity', () => {
  it('formats ratings like Kotlin formatRating', () => {
    expect(formatRating(8)).toBe('8');
    expect(formatRating(7.5)).toBe('7.5');
  });

  it('shows Rate until rated, then the score', () => {
    const { rerender } = render(<RatingChip rating={null} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Your rating, Rate' })).toHaveTextContent('Rate');
    rerender(<RatingChip rating={8} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Your rating, 8 out of 10' })).toHaveTextContent('8');
  });

  it('steps the star slider with the keyboard within 1 to 10', () => {
    function Harness() { const [value, setValue] = useState(0); return <RatingStars value={value} onChange={setValue} />; }
    render(<Harness />);
    const slider = screen.getByRole('slider', { name: 'Rating' });
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(slider).toHaveAttribute('aria-valuenow', '1');
    fireEvent.keyDown(slider, { key: 'End' });
    expect(slider).toHaveAttribute('aria-valuenow', '10');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', '10');
  });

  it('saves a new rating through the bridge and reports it', async () => {
    const saved: UserRatingState = { available: true, provider: 'MDBList', rating: 9 };
    bridge.call.mockResolvedValue({ saved: true, rating: saved });
    const onSaved = vi.fn(); const onNotice = vi.fn(); const onClose = vi.fn();
    render(<RatingSheet open target={{ type: 'series', id: 'tt1', videoId: 'tt1:1:2' }} title="Pilot" subtitle="S1 E2" state={{ available: true, provider: 'MDBList', rating: null }} onClose={onClose} onSaved={onSaved} onNotice={onNotice} />);
    expect(screen.getByText('Syncs to MDBList')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Rating' }), { key: 'End' });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Rating' }), { key: 'ArrowLeft' });
    await act(async () => { fireEvent.click(save); });
    expect(bridge.call).toHaveBeenCalledWith('details.rating.set', { type: 'series', id: 'tt1', videoId: 'tt1:1:2', rating: 9 });
    expect(onSaved).toHaveBeenCalledWith(saved);
    expect(onNotice).toHaveBeenCalledWith('Rating saved');
    expect(onClose).toHaveBeenCalled();
  });

  it('removes an existing rating and reports a failed save with the provider name', async () => {
    bridge.call.mockResolvedValue({ saved: false, rating: { available: true, provider: 'Simkl', rating: 6 } });
    const onNotice = vi.fn();
    render(<RatingSheet open target={{ type: 'movie', id: 'tt2' }} title="Movie" state={{ available: true, provider: 'Simkl', rating: 6 }} onClose={() => {}} onSaved={() => {}} onNotice={onNotice} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove' })); });
    expect(bridge.call).toHaveBeenCalledWith('details.rating.set', { type: 'movie', id: 'tt2', rating: null });
    expect(onNotice).toHaveBeenCalledWith("Couldn't update your rating on Simkl");
  });

  it('loads the rating state and refetches when the ratings source changes', async () => {
    bridge.call.mockResolvedValue({ available: true, provider: 'MDBList', rating: 7 });
    function Harness() { const { state } = useUserRating({ type: 'movie', id: 'tt3' }); return <span>{state ? `${state.provider}:${state.rating}` : 'none'}</span>; }
    const { rerender } = render(<Harness />);
    await waitFor(() => expect(screen.getByText('MDBList:7')).toBeInTheDocument());
    expect(bridge.call).toHaveBeenCalledWith('details.rating.snapshot', { type: 'movie', id: 'tt3' });
    bridge.snapshots = { trackingSettings: { effectiveRatingSource: 'OFF' } };
    bridge.call.mockResolvedValue({ available: false, provider: null, rating: null });
    rerender(<Harness />);
    await waitFor(() => expect(screen.getByText('null:null')).toBeInTheDocument());
    expect(bridge.call).toHaveBeenCalledTimes(2);
  });
});
