import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ContinueActionHost, ContinueActionPortal, useContinueActionHost } from './ContinueActionHost';

afterEach(cleanup);
function Card() {
  const [open, setOpen] = useState(false);
  const present = useContinueActionHost();
  return <><button onClick={() => setOpen(true)}>Open card</button>{open && <ContinueActionPortal><div role="dialog">Removing title<button onClick={() => present?.(null)}>Finish fade</button></div></ContinueActionPortal>}</>;
}
function Home({ show = true, profile = 1 }: { show?: boolean; profile?: number }) {
  return <ContinueActionHost scope={profile}>{show && <Card />}</ContinueActionHost>;
}
it('keeps the popup mounted after its shelf card leaves, then releases it on completion', () => {
  const view = render(<Home />);
  fireEvent.click(screen.getByText('Open card'));
  view.rerender(<Home show={false} />);
  expect(screen.getByRole('dialog')).toHaveTextContent('Removing title');
  fireEvent.click(screen.getByText('Finish fade'));
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('does not carry an old profile removal overlay into another profile', () => {
  const view = render(<Home />);
  fireEvent.click(screen.getByText('Open card'));
  view.rerender(<Home show={false} profile={2} />);
  expect(screen.queryByRole('dialog')).toBeNull();
  view.rerender(<Home show={false} profile={1} />);
  expect(screen.queryByRole('dialog')).toBeNull();
});
