import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BottomSheet } from './BottomSheet';

afterEach(cleanup);

it('renders nothing while closed', () => {
  render(<BottomSheet label="Sheet" open={false} onClose={vi.fn()}><h2>Title</h2></BottomSheet>);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('shows a labelled modal dialog with the drag handle, title and content when open', () => {
  render(<BottomSheet label="Sheet" open onClose={vi.fn()}><h2>Title</h2><p>Body</p></BottomSheet>);
  const dialog = screen.getByRole('dialog', { name: 'Sheet' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog.querySelector('.nuvio-bottom-sheet-handle')).not.toBeNull();
  expect(dialog).toHaveTextContent('Title');
  expect(dialog.closest('.nuvio-bottom-sheet')).not.toBeNull();
});

it('closes with Escape and when the scrim is pressed', () => {
  const onClose = vi.fn();
  render(<BottomSheet label="Sheet" open onClose={onClose}><p>Body</p></BottomSheet>);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
  const scrim = screen.getByRole('dialog').parentElement!;
  fireEvent.mouseDown(scrim);
  expect(onClose).toHaveBeenCalledTimes(2);
});

it('applies an extra class for screen-specific styling', () => {
  render(<BottomSheet label="Sheet" open onClose={vi.fn()} className="my-sheet"><p>Body</p></BottomSheet>);
  expect(screen.getByRole('dialog').closest('.my-sheet')).not.toBeNull();
});
