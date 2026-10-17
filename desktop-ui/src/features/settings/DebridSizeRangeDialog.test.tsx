import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DebridSizeRangeDialog } from './IntegrationSettings';

afterEach(cleanup);

function openOption(field: 'Minimum size' | 'Maximum size', option: string) {
  fireEvent.click(screen.getByRole('button', { name: field }));
  fireEvent.click(screen.getByRole('option', { name: option }));
}

describe('size range dialog', () => {
  it('saves the selected preset bounds', () => {
    const onSave = vi.fn();
    render(<DebridSizeRangeDialog min={0} max={0} onClose={() => {}} onSave={onSave} />);

    openOption('Minimum size', '5 GB');
    openOption('Maximum size', '20 GB');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith(5, 20);
  });

  it('shows the current bounds when reopened', () => {
    render(<DebridSizeRangeDialog min={2} max={10} onClose={() => {}} onSave={() => {}} />);

    expect(screen.getByRole('button', { name: 'Minimum size' })).toHaveTextContent('2 GB');
    expect(screen.getByRole('button', { name: 'Maximum size' })).toHaveTextContent('10 GB');
  });

  it('accepts a custom GB value and keeps the other bound at Any', () => {
    const onSave = vi.fn();
    render(<DebridSizeRangeDialog min={0} max={0} onClose={() => {}} onSave={onSave} />);

    openOption('Minimum size', 'Custom…');
    fireEvent.change(screen.getByLabelText('Minimum size in GB'), { target: { value: '3.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith(3.5, 0);
  });

  it('restores a stored custom value as a custom selection', () => {
    render(<DebridSizeRangeDialog min={7} max={0} onClose={() => {}} onSave={() => {}} />);

    expect(screen.getByLabelText('Minimum size in GB')).toHaveValue(7);
  });

  it('rejects a maximum below the minimum', () => {
    const onSave = vi.fn();
    render(<DebridSizeRangeDialog min={10} max={20} onClose={() => {}} onSave={onSave} />);

    openOption('Minimum size', '50 GB');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Maximum size must be at least the minimum size.');
  });

  it('requires a custom value to be greater than zero', () => {
    const onSave = vi.fn();
    render(<DebridSizeRangeDialog min={0} max={0} onClose={() => {}} onSave={onSave} />);

    openOption('Maximum size', 'Custom…');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a size greater than 0 GB.');
  });
});
