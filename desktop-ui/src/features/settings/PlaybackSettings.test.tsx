import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SteppedSlider } from './SteppedSlider';
import { SkipSegmentSettings, type SkipPreferences } from './SkipSegmentSettings';

afterEach(cleanup);
const preferences: SkipPreferences = { skipIntroEnabled: true, autoSkipSegmentTypes: ['RECAP', 'INTRO'], animeSkipEnabled: true, animeSkipClientId: 'client-id', introDbApiKey: '', introSubmitEnabled: true };

describe('stepped playback sliders', () => {
  it('shows every selectable position and commits fractional steps', () => {
    const save = vi.fn();
    render(<SteppedSlider title="Threshold Percentage" value={98} min={97} max={100} step={.5} suffix="%" onSave={save} />);
    expect(document.querySelectorAll('.stepped-slider-track i')).toHaveLength(7);
    const slider = screen.getByRole('slider', { name: 'Threshold Percentage' });
    expect(slider).toHaveAttribute('step', '0.5');
    fireEvent.change(slider, { target: { value: '98.5' } });
    expect(slider).toHaveAttribute('aria-valuetext', '98.5%');
    expect(save).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider);
    expect(save).toHaveBeenCalledWith(98.5);
  });
  it('saves keyboard changes and renders outline-width stops', () => {
    const save = vi.fn();
    render(<SteppedSlider title="Outline width" value={2} min={0} max={10} onSave={save} />);
    expect(document.querySelectorAll('.stepped-slider-track i')).toHaveLength(11);
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '3' } }); fireEvent.keyUp(slider, { key: 'ArrowRight' });
    expect(save).toHaveBeenCalledWith(3);
  });
});
describe('Kotlin Skip Segments flow', () => {
  it('separates detection from automatic skipping and preserves source-ordered summary', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    render(<SkipSegmentSettings preferences={preferences} run={run} />);
    expect(screen.getByLabelText('Skip Intro')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Automatic Skipping Intro / Opening, Recap' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Automatic Skipping/ }));
    const dialog = screen.getByRole('dialog', { name: 'Automatic Skipping' });
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(4);
    expect(within(dialog).getByRole('checkbox', { name: /Intro \/ Opening/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /End Credits/ }));
    await waitFor(() => expect(run).toHaveBeenCalledWith('playbackSettings.setAutoSkipType', { type: 'MOVIE_CREDITS', enabled: true }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('disables the automatic picker when detection is off without clearing saved selections', () => {
    render(<SkipSegmentSettings preferences={{ ...preferences, skipIntroEnabled: false }} run={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Automatic Skipping/ })).toBeDisabled();
    expect(screen.getByText('Intro / Opening, Recap')).toBeInTheDocument();
  });
  it('prefills the AnimeSkip dialog and saves trimmed credentials only on Save', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    render(<SkipSegmentSettings preferences={preferences} run={run} />);
    fireEvent.click(screen.getByRole('button', { name: /AnimeSkip Client ID/ }));
    const field = screen.getByRole('textbox', { name: 'AnimeSkip Client ID' });
    expect(field).toHaveValue('client-id');
    fireEvent.change(field, { target: { value: '  new-client  ' } });
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(run).toHaveBeenCalledWith('playbackSettings.saveSkipCredential', { key: 'animeSkipClientId', value: 'new-client' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('keeps invalid IntroDB keys in the dialog for correction and permits clearing', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('Invalid API Key or connection failed')).mockResolvedValue(undefined);
    render(<SkipSegmentSettings preferences={preferences} run={run} />);
    fireEvent.click(screen.getByRole('button', { name: /IntroDB API Key/ }));
    const field = within(screen.getByRole('dialog')).getByLabelText('IntroDB API Key');
    fireEvent.change(field, { target: { value: 'invalid' } }); fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid API Key or connection failed');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.change(field, { target: { value: '' } }); fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(run).toHaveBeenLastCalledWith('playbackSettings.saveSkipCredential', { key: 'introDbApiKey', value: '' }));
  });
});
