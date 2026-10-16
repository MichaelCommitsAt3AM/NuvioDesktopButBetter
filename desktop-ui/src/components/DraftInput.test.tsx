import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DraftController, DraftInput, DraftScope, useDraftController } from './DraftInput';

afterEach(cleanup);

describe('DraftInput', () => {
  it('defers commits until the user pauses and flushes on blur', () => {
    vi.useFakeTimers();
    try {
      const onCommit = vi.fn();
      render(<DraftInput value="Weekend" onCommit={onCommit} aria-label="Name" />);
      const input = screen.getByLabelText('Name');
      fireEvent.change(input, { target: { value: 'Weekend watch' } });
      fireEvent.change(input, { target: { value: 'Weekend watchlist' } });
      expect(onCommit).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(500));
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith('Weekend watchlist');
    } finally { vi.useRealTimers(); }
  });

  it('commits once on unmount with the latest text', () => {
    vi.useFakeTimers();
    try {
      const onCommit = vi.fn();
      const view = render(<DraftInput value="a" onCommit={onCommit} aria-label="Name" />);
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'abc' } });
      view.unmount();
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith('abc');
    } finally { vi.useRealTimers(); }
  });

  it('does not clobber typing with server echoes while focused', () => {
    vi.useFakeTimers();
    try {
      const onCommit = vi.fn();
      const view = render(<DraftInput value="old" onCommit={onCommit} aria-label="Name" />);
      const input = screen.getByLabelText('Name');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'old typing' } });
      view.rerender(<DraftInput value="old echo" onCommit={onCommit} aria-label="Name" />);
      expect(screen.getByLabelText('Name')).toHaveValue('old typing');
      fireEvent.blur(input);
      expect(onCommit).toHaveBeenCalledWith('old typing');
    } finally { vi.useRealTimers(); }
  });

  it('awaits outstanding scoped commits before allowing save', async () => {
    vi.useFakeTimers();
    try {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const onCommit = vi.fn(() => gate);
      let controller!: DraftController;
      function Editor() { controller = useDraftController()!; return <DraftInput value="a" onCommit={onCommit} aria-label="Pending" />; }
      render(<DraftScope><Editor /></DraftScope>);
      fireEvent.change(screen.getByLabelText('Pending'), { target: { value: 'ab' } });
      fireEvent.blur(screen.getByLabelText('Pending'));
      let saved = false;
      const saving = controller.flush().then(() => { saved = true; });
      expect(saved).toBe(false);
      await act(async () => { release(); await saving; });
      expect(saved).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('retains failed text and reports the failure to save, then permits an explicit retry', async () => {
    let controller!: DraftController;
    const onCommit = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined);
    function Editor() { controller = useDraftController()!; return <DraftInput value="old" onCommit={onCommit} aria-label="Retry" />; }
    render(<DraftScope><Editor /></DraftScope>);
    fireEvent.change(screen.getByLabelText('Retry'), { target: { value: 'latest' } });
    await act(async () => { await expect(controller.flush()).rejects.toThrow('Offline'); });
    expect(screen.getByLabelText('Retry')).toHaveValue('latest');
    expect(screen.getByRole('alert')).toHaveTextContent('Offline');
    await act(async () => { await controller.flush(); });
    expect(onCommit).toHaveBeenLastCalledWith('latest');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('discards scoped drafts on unmount instead of committing into another editor', () => {
    const onCommit = vi.fn();
    const view = render(<DraftScope><DraftInput value="old" onCommit={onCommit} aria-label="Scoped" /></DraftScope>);
    fireEvent.change(screen.getByLabelText('Scoped'), { target: { value: 'do not transfer' } });
    view.unmount();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
