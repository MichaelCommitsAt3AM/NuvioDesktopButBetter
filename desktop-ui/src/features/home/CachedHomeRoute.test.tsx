import { useEffect, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, useLocation } from 'react-router-dom';
import { CachedHomeRoute } from './CachedHomeRoute';

const lifecycle = vi.hoisted(() => ({ starts: vi.fn(), stops: vi.fn() }));
vi.mock('./HomePage', () => ({ HomePage: () => {
  const location = useLocation();
  const [count, setCount] = useState(0);
  useEffect(() => { lifecycle.starts(); return () => { lifecycle.stops(); }; }, []);
  return <div data-testid="home"><button onClick={() => setCount(count + 1)}>Hero {count}</button><span>{location.pathname}</span></div>;
} }));
function Fixture() {
  const [profile, setProfile] = useState(1);
  return <><Link to="/">Home</Link><Link to="/settings">Settings</Link><button onClick={() => setProfile(2)}>Switch profile</button><CachedHomeRoute profileId={profile} /></>;
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('reuses Home DOM and effects without restarting them on return', () => {
  render(<MemoryRouter><Fixture /></MemoryRouter>);
  const home = screen.getByTestId('home');
  fireEvent.click(screen.getByRole('button', { name: 'Hero 0' }));
  fireEvent.click(screen.getByRole('link', { name: 'Settings' }));
  expect(home).not.toBeVisible();
  expect(lifecycle.stops).not.toHaveBeenCalled();
  // The cached Home keeps its own Home route context for poster behavior.
  expect(home.textContent).toContain('/');
  fireEvent.click(screen.getByRole('link', { name: 'Home' }));
  expect(screen.getByTestId('home')).toBe(home);
  expect(screen.getByRole('button', { name: 'Hero 1' })).toBeVisible();
  expect(lifecycle.starts).toHaveBeenCalledOnce();
});

it('does not build Home before it is visited and clears it on profile changes', () => {
  render(<MemoryRouter initialEntries={['/settings']}><Fixture /></MemoryRouter>);
  expect(screen.queryByTestId('home')).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'Home' }));
  const original = screen.getByTestId('home');
  fireEvent.click(screen.getByRole('button', { name: 'Hero 0' }));
  fireEvent.click(screen.getByRole('button', { name: 'Switch profile' }));
  expect(screen.getByTestId('home')).not.toBe(original);
  expect(screen.getByRole('button', { name: 'Hero 0' })).toBeVisible();
});
