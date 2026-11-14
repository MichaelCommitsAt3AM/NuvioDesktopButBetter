import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { computeDockPosition, DockedTitle } from './DockedTitle';

afterEach(() => { cleanup(); document.body.innerHTML = ''; });

describe('computeDockPosition', () => {
  it('sits 14px right of the back button, centred on it', () => {
    expect(computeDockPosition({ right: 88, top: 25, height: 54 })).toEqual({ left: 102, centerY: 52 });
  });
  it('falls back to fixed coordinates without a back button', () => {
    expect(computeDockPosition(null)).toEqual({ left: 96, centerY: 52 });
  });
});

describe('DockedTitle', () => {
  it('renders the logo outside the page tree and only shows it when visible', () => {
    const { rerender } = render(<DockedTitle logo="https://img/logo.png" name="Movie" visible={false} />);
    const dock = document.body.querySelector('.detail-docked-title')!;
    expect(dock).not.toHaveClass('is-visible');
    expect(dock.querySelector('img')?.getAttribute('src')).toBe('https://img/logo.png');
    rerender(<DockedTitle logo="https://img/logo.png" name="Movie" visible />);
    expect(document.body.querySelector('.detail-docked-title')).toHaveClass('is-visible');
  });
  it('falls back to the title text without a logo or when the logo fails', async () => {
    const { rerender } = render(<DockedTitle logo={null} name="The Invite." visible />);
    expect(document.body.querySelector('.detail-docked-title span')?.textContent).toBe('The Invite.');
    rerender(<DockedTitle logo="https://img/bad.png" name="Broken" visible />);
    fireEvent.error(document.body.querySelector('img')!);
    await waitFor(() => expect(document.body.querySelector('.detail-docked-title span')?.textContent).toBe('Broken'));
  });
});
