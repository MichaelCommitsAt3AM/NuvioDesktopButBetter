import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useMenuNav } from './useMenuNav';

afterEach(cleanup);

function Menu() {
  const onKeyDown = useMenuNav();
  return <div role="menu" onKeyDown={onKeyDown}>
    <button role="menuitem">First</button>
    <button role="menuitem" disabled>Blocked</button>
    <button role="menuitem">Second</button>
  </div>;
}

describe('menu arrow-key navigation', () => {
  it('moves focus between enabled items and wraps', () => {
    render(<Menu />);
    const first = screen.getByText('First');
    const second = screen.getByText('Second');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: 'ArrowDown' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'ArrowUp' });
    expect(second).toHaveFocus();
  });

  it('jumps to ends with Home and End', () => {
    render(<Menu />);
    const first = screen.getByText('First');
    const second = screen.getByText('Second');
    second.focus();
    fireEvent.keyDown(second, { key: 'Home' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'End' });
    expect(second).toHaveFocus();
  });
});
