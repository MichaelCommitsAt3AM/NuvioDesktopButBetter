import { describe, expect, it } from 'vitest';
import { directionalScore, pickDirectional, type Box } from './spatialNavigation';
import { render, screen } from '@testing-library/react';
import { ControllerHintToolbar, hintsFor } from './ControllerHintToolbar';

const at = (left: number, top: number, width = 100, height = 150): Box => ({ left, top, right: left + width, bottom: top + height });

describe('spatial focus', () => {
  const current = at(100, 100);
  it('ignores elements behind the pressed direction', () => {
    expect(directionalScore(current, at(0, 100), 'Right')).toBeNull();
    expect(directionalScore(current, at(220, 100), 'Left')).toBeNull();
    expect(directionalScore(current, at(100, 0), 'Down')).toBeNull();
  });

  it('prefers the neighbour in the same row over a closer diagonal one', () => {
    const sameRowFar = at(400, 100);
    const diagonalNear = at(220, 300);
    expect(pickDirectional(current, [diagonalNear, sameRowFar], 'Right')).toBe(1);
  });

  it('picks the nearest element in the same column when moving down', () => {
    const below = at(100, 300);
    const belowFar = at(100, 600);
    const belowOffset = at(500, 280);
    expect(pickDirectional(current, [belowFar, belowOffset, below], 'Down')).toBe(2);
  });

  it('moves from a wide row into the item under it', () => {
    const navBar = { left: 0, top: 0, right: 1200, bottom: 60 };
    expect(pickDirectional(navBar, [at(40, 120), at(600, 120)], 'Down')).toBe(0);
  });

  it('returns -1 when nothing lies that way', () => {
    expect(pickDirectional(current, [at(0, 100)], 'Right')).toBe(-1);
  });
});

describe('Kotlin controller hint toolbar', () => {
  it('shows screen hints and dialog/navigation/text variants', () => {
    expect(hintsFor('/', false).map(hint => hint.label)).toEqual(['Options', 'Search', 'Tabs', 'Navigation']);
    expect(hintsFor('/details/movie/tt1', false).map(hint => hint.glyph)).toEqual(['X', 'LB/RB', 'B']);
    expect(hintsFor('/details/series/tt1/streams/v1', false)[0]).toEqual({ glyph: 'LB/RB', label: 'Addon Filter' });
    expect(hintsFor('/settings', false).at(-1)).toEqual({ glyph: 'B', label: 'Menu' });
    expect(hintsFor('/', true)).toEqual([{ glyph: 'B', label: 'Close' }]);
    expect(hintsFor('/', false, 'navigation')).toEqual([{ glyph: 'LB/RB', label: 'Tabs' }, { glyph: 'B', label: 'Content' }]);
    expect(hintsFor('/search', false, 'text')).toEqual([{ glyph: 'B', label: 'Close Keyboard' }]);
  });
});

describe('controller glyphs', () => {
  it('draws PlayStation symbols and L1/R1 for a PlayStation pad', () => {
    const { container } = render(<ControllerHintToolbar hints={hintsFor('/', false)} layout="playstation" />);
    expect(screen.getByRole('status', { name: 'Controller buttons' })).toHaveAttribute('data-layout', 'playstation');
    expect(container.querySelector('.controller-glyph-ps-square')).not.toBeNull();
    expect(container.querySelector('.controller-glyph-ps-triangle')).not.toBeNull();
    expect(container.querySelector('.controller-glyph-options')).not.toBeNull();
    expect([...container.querySelectorAll('.controller-glyph-bumper')].map(item => item.textContent)).toEqual(['L1', 'R1']);
    expect(container.textContent).not.toMatch(/LB|X/);
  });
  it('keeps Xbox letters by default', () => {
    const { container } = render(<ControllerHintToolbar hints={hintsFor('/details/movie/tt1', false)} />);
    expect([...container.querySelectorAll('.controller-glyph-bumper')].map(item => item.textContent)).toEqual(['LB', 'RB']);
    expect(container.querySelector('.controller-glyph-b')?.textContent).toBe('B');
  });
});
