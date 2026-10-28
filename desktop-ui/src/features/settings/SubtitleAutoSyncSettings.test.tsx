import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SubtitleAutoSyncSettings } from './SubtitleAutoSyncSettings';

afterEach(cleanup);

it('gates auto sync on subtitle language and shows advanced controls only when enabled', () => {
  const onChange = vi.fn();
  const { rerender } = render(<SubtitleAutoSyncSettings preferences={{ enabled: false, aggressiveMode: true, toleranceMs: 0 }} preferredLanguage="none" onChange={onChange} />);
  expect(screen.getByLabelText('Subtitle auto sync')).toBeDisabled();
  expect(screen.queryByLabelText('Sync tolerance')).toBeNull();
  rerender(<SubtitleAutoSyncSettings preferences={{ enabled: false, aggressiveMode: true, toleranceMs: 0 }} preferredLanguage="en" onChange={onChange} />);
  fireEvent.click(screen.getByLabelText('Subtitle auto sync'));
  expect(onChange).toHaveBeenLastCalledWith('subtitleAutoSyncEnabled', true);
});

it('sends typed mode and tolerance preferences to Kotlin and reflects profile changes', () => {
  const onChange = vi.fn();
  const { rerender } = render(<SubtitleAutoSyncSettings preferences={{ enabled: true, aggressiveMode: true, toleranceMs: 100 }} preferredLanguage="device" onChange={onChange} />);
  fireEvent.click(screen.getByLabelText('Thorough subtitle search'));
  expect(onChange).toHaveBeenLastCalledWith('subtitleAutoSyncAggressiveMode', false);
  fireEvent.change(screen.getByLabelText('Sync tolerance'), { target: { value: '300' } });
  expect(onChange).toHaveBeenLastCalledWith('subtitleAutoSyncToleranceMs', 300);
  rerender(<SubtitleAutoSyncSettings preferences={{ enabled: false, aggressiveMode: false, toleranceMs: 0 }} preferredLanguage="forced" onChange={onChange} />);
  expect(screen.getByLabelText('Subtitle auto sync')).not.toBeChecked();
  expect(screen.getByLabelText('Subtitle auto sync')).toBeDisabled();
  expect(screen.queryByLabelText('Sync tolerance')).toBeNull();
});
