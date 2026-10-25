import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Link, useLocation } from 'react-router-dom';
import { SettingsLayout } from './SettingsLayout';
import { SettingsSearchTarget } from './SettingsSearchTarget';

vi.mock('../../bridge', () => ({
  useSelector: (select: (state: any) => unknown) => select({
    settings: { themes: [], theme: 'default' }, session: { activeProfile: 1, version: 'test' },
  }),
  useFeatureSnapshot: () => undefined,
  refreshFeature: vi.fn().mockResolvedValue({}),
}));

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
beforeEach(() => {
  frames.clear(); nextFrame = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
  HTMLElement.prototype.scrollIntoView = vi.fn(function (this: HTMLElement) {
    this.closest<HTMLElement>('.settings-pane')!.scrollTop = 700;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(function (this: HTMLElement) { this.scrollTop = 0; });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); HTMLElement.prototype.scrollIntoView = originalScrollIntoView; });
const flushFrames = () => act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); });

function Page({ loaded = true }: { loaded?: boolean }) {
  const location = useLocation();
  return <SettingsLayout>
    <Link to="/settings/integrations/debrid?setting=size-range">Find size range</Link>
    {loaded && <button className="settings-control-row"><strong>Size range</strong></button>}
    <output>{location.search}</output>
    <SettingsSearchTarget />
  </SettingsLayout>;
}

it('keeps the matching row in view after the real settings layout resets its scroll', () => {
  render(<MemoryRouter initialEntries={['/settings/integrations/debrid']}><Page /></MemoryRouter>);
  const pane = document.querySelector<HTMLElement>('.settings-pane')!;
  pane.scrollTop = 1200;
  fireEvent.click(screen.getByRole('link', { name: 'Find size range' }));
  flushFrames();
  expect(pane.scrollTop).toBe(700);
  const row = screen.getByRole('button', { name: 'Size range' });
  expect(row).toHaveClass('settings-search-target');
  expect(row).toHaveFocus();
  expect(row.scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'nearest', behavior: 'instant' });
  // Selecting the same result again should jump even though its URL is unchanged.
  pane.scrollTop = 0;
  fireEvent.click(screen.getByRole('link', { name: 'Find size range' }));
  flushFrames();
  expect(pane.scrollTop).toBe(700);
});

it('waits for asynchronously loaded controls and cancels a jump when leaving the page', async () => {
  const view = render(<MemoryRouter initialEntries={['/settings/integrations/debrid?setting=size-range']}><Page loaded={false} /></MemoryRouter>);
  flushFrames();
  expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  view.rerender(<MemoryRouter initialEntries={['/settings/integrations/debrid?setting=size-range']}><Page /></MemoryRouter>);
  await act(async () => {});
  flushFrames();
  expect(document.querySelector('.settings-pane')!.scrollTop).toBe(700);
  fireEvent.click(screen.getByRole('link', { name: 'Find size range' }));
  const row = screen.getByRole('button', { name: 'Size range' });
  view.unmount();
  expect(frames.size).toBe(0);
  expect(row).not.toHaveClass('settings-search-target');
});
