import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeActionDialog } from './HomeActionDialog';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('title action dialog dismissal', () => {
  it.each([false, true])('animates outside dismissal once for landscape artwork=%s', (landscape) => {
    const onClose = vi.fn();
    render(<HomeActionDialog title="Movie" poster="poster.jpg" artwork={landscape ? <div>Continue Watching artwork</div> : undefined} onClose={onClose}><button>Add to library</button></HomeActionDialog>);
    const backdrop = document.querySelector('.home-actions-dialog')!;
    fireEvent.mouseDown(backdrop);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(backdrop).toHaveClass('is-closing');
    expect(document.querySelector('.home-actions-content')).toHaveAttribute('inert');
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(160));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('cancels pending dismissal when unmounted', () => {
    const onClose = vi.fn();
    const view = render(<HomeActionDialog title="Movie" onClose={onClose}><button>Save</button></HomeActionDialog>);
    fireEvent.keyDown(document, { key: 'Escape' });
    view.unmount();
    act(() => vi.advanceTimersByTime(200));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('skips the animation delay with reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const onClose = vi.fn();
    render(<HomeActionDialog title="Movie" onClose={onClose}><button>Save</button></HomeActionDialog>);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Save' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    act(() => vi.advanceTimersByTime(0));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
