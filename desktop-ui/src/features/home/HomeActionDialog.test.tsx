import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeActionDialog } from './HomeActionDialog';
import { POSTER_CLOSE_MS } from '../../components/posterZoomMotion';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('title action dialog dismissal', () => {
  it('fits the visible poster frame and scales the original card corner radius', () => {
    const source = document.createElement('span');
    source.dataset.sourceKey = 'rounded-source';
    source.style.borderTopLeftRadius = '13px';
    Object.defineProperty(source, 'offsetWidth', { value: 190 });
    document.body.appendChild(source);
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(260);
    try {
      render(<HomeActionDialog title="Movie" poster="poster.jpg" sourceKey="rounded-source" sourceRect={{ x: 0, y: 0, width: 190, height: 285 }} onClose={() => {}}><button>Save</button></HomeActionDialog>);
      const frame = document.querySelector<HTMLElement>('.home-actions-artwork')!;
      expect(parseFloat(frame.style.borderRadius)).toBeCloseTo(260 * 13 / 190);
      expect(Number(frame.style.getPropertyValue('--action-artwork-ratio'))).toBeCloseTo(2 / 3);
      const image = frame.querySelector('img')!;
      Object.defineProperties(image, { naturalWidth: { value: 600 }, naturalHeight: { value: 900 } });
      fireEvent.load(image);
      expect(Number(frame.style.getPropertyValue('--action-artwork-ratio'))).toBeCloseTo(600 / 900);
    } finally { width.mockRestore(); source.remove(); }
  });

  it.each([false, true])('animates outside dismissal once for landscape artwork=%s', (landscape) => {
    const onClose = vi.fn();
    render(<HomeActionDialog title="Movie" poster="poster.jpg" artwork={landscape ? <div>Continue Watching artwork</div> : undefined} onClose={onClose}><button>Add to library</button></HomeActionDialog>);
    const backdrop = document.querySelector('.home-actions-dialog')!;
    fireEvent.mouseDown(backdrop);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(backdrop).toHaveClass('is-closing');
    expect(document.querySelector('.home-actions-content')).toHaveAttribute('inert');
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(POSTER_CLOSE_MS));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('cancels pending dismissal when unmounted', () => {
    const onClose = vi.fn();
    const view = render(<HomeActionDialog title="Movie" onClose={onClose}><button>Save</button></HomeActionDialog>);
    fireEvent.keyDown(document, { key: 'Escape' });
    view.unmount();
    act(() => vi.advanceTimersByTime(POSTER_CLOSE_MS + 100));
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
