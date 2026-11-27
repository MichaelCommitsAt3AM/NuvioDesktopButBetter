import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HorizontalRail } from './HorizontalRail';

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });

describe('HorizontalRail', () => {
  it('returns to the first item when the reset key changes', () => {
    const view = render(<HorizontalRail label="Movie" scrollResetKey="added_desc"><span>items</span></HorizontalRail>);
    const track = view.container.querySelector('.shelf-track') as HTMLDivElement;
    track.scrollLeft = 640;
    view.rerender(<HorizontalRail label="Movie" scrollResetKey="added_desc"><span>items</span></HorizontalRail>);
    expect(track.scrollLeft).toBe(640);
    view.rerender(<HorizontalRail label="Movie" scrollResetKey="title_asc"><span>items</span></HorizontalRail>);
    expect(track.scrollLeft).toBe(0);
  });
});
