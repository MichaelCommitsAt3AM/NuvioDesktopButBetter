import { describe, expect, it } from 'vitest';
import { sidebarExpanded } from './sidebarState';

describe('sidebar expansion', () => {
  it('keeps expanded and classic always open', () => {
    expect(sidebarExpanded('expanded', false, false)).toBe(true);
    expect(sidebarExpanded('classic', false, false)).toBe(true);
  });

  it('expands adaptive on hover, focus, or profile stack', () => {
    expect(sidebarExpanded('adaptive', false, false)).toBe(false);
    expect(sidebarExpanded('adaptive', true, false)).toBe(true);
    expect(sidebarExpanded('adaptive', false, true)).toBe(true);
  });

  it('expands compact only while the profile stack is open', () => {
    expect(sidebarExpanded('compact', true, false)).toBe(false);
    expect(sidebarExpanded('compact', false, true)).toBe(true);
  });
});
