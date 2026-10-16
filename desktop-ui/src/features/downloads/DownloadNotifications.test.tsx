import { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DownloadNotifications, notifyDownloadStarted } from './DownloadNotifications';

const bridge = vi.hoisted(() => ({ snapshot: undefined as any }));
vi.mock('../../bridge', () => ({ useFeatureSnapshot: () => bridge.snapshot }));
beforeEach(() => { vi.useFakeTimers(); bridge.snapshot = undefined; });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const host = () => <StrictMode><DownloadNotifications /></StrictMode>;

it('shows a start notification and dismisses it automatically', () => {
  render(host());
  act(() => notifyDownloadStarted());
  expect(screen.getByRole('status')).toHaveTextContent('Download has started');
  act(() => vi.advanceTimersByTime(3500));
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

it('ignores old completions and announces a new completion only once', () => {
  bridge.snapshot = { items: [{ id: 'old', title: 'Old movie', status: 'completed' }, { id: 'new', title: 'Show', status: 'downloading', seasonNumber: 2, episodeNumber: 3 }] };
  const view = render(host());
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  bridge.snapshot = { items: bridge.snapshot.items.map((item: any) => ({ ...item, status: 'completed' })) };
  view.rerender(host());
  expect(screen.getByRole('status')).toHaveTextContent('Download complete: Show · S2 E3');
  act(() => vi.advanceTimersByTime(3500));
  bridge.snapshot = { ...bridge.snapshot };
  view.rerender(host());
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

it('queues simultaneous completions behind the start notification', () => {
  bridge.snapshot = { items: ['One', 'Two'].map(title => ({ id: title, title, status: 'downloading' })) };
  const view = render(host());
  act(() => notifyDownloadStarted());
  bridge.snapshot = { items: bridge.snapshot.items.map((item: any) => ({ ...item, status: 'completed' })) };
  view.rerender(host());
  expect(screen.getByRole('status')).toHaveTextContent('Download has started');
  act(() => vi.advanceTimersByTime(3500));
  expect(screen.getByRole('status')).toHaveTextContent('Download complete: One');
  act(() => vi.advanceTimersByTime(3500));
  expect(screen.getByRole('status')).toHaveTextContent('Download complete: Two');
});
