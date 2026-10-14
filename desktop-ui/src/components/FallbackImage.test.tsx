import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { FallbackImage } from './FallbackImage';

afterEach(() => { cleanup(); });

describe('FallbackImage', () => {
  it('walks the source list as each URL fails and hides once all fail', () => {
    const { container } = render(<FallbackImage sources={['https://example.invalid/a.jpg', 'https://example.invalid/b.jpg']} />);
    const first = container.querySelector('img')!;
    expect(first).toHaveAttribute('src', 'https://example.invalid/a.jpg');
    fireEvent.error(first);
    const second = container.querySelector('img')!;
    expect(second).toHaveAttribute('src', 'https://example.invalid/b.jpg');
    fireEvent.error(second);
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders nothing when every source is missing', () => {
    const { container } = render(<FallbackImage sources={[null, undefined]} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('retries the primary source when the list changes', () => {
    const view = render(<FallbackImage sources={['https://example.invalid/a.jpg', 'https://example.invalid/b.jpg']} />);
    fireEvent.error(view.container.querySelector('img')!);
    expect(view.container.querySelector('img')).toHaveAttribute('src', 'https://example.invalid/b.jpg');
    view.rerender(<FallbackImage sources={['https://example.invalid/c.jpg', 'https://example.invalid/b.jpg']} />);
    expect(view.container.querySelector('img')).toHaveAttribute('src', 'https://example.invalid/c.jpg');
  });
});
