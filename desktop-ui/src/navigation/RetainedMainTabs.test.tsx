import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, useNavigate } from 'react-router-dom';
import { RetainedMainTabs } from './RetainedMainTabs';

const lifecycle = vi.hoisted(() => ({
  mounts: { home: 0, search: 0, library: 0, settings: 0 },
  unmounts: { home: 0, search: 0, library: 0, settings: 0 },
}));
const resetLifecycle = () => {
  for (const key of Object.keys(lifecycle.mounts) as Array<keyof typeof lifecycle.mounts>) {
    lifecycle.mounts[key] = 0;
    lifecycle.unmounts[key] = 0;
  }
};

vi.mock('../features/home/HomePage', async () => {
  const React = await import('react');
  const { useLocation } = await import('react-router-dom');
  return { HomePage: () => {
    const location = useLocation();
    const [count, setCount] = React.useState(0);
    React.useEffect(() => { lifecycle.mounts.home += 1; return () => { lifecycle.unmounts.home += 1; }; }, []);
    return <div data-testid="home"><span data-testid="home-path">{location.pathname}</span><button onClick={() => setCount(value => value + 1)}>home-state-{count}</button></div>;
  } };
});

vi.mock('../features/search/SearchPage', async () => {
  const React = await import('react');
  const { useLocation } = await import('react-router-dom');
  return { SearchPage: () => {
    const location = useLocation();
    const [count, setCount] = React.useState(0);
    React.useEffect(() => { lifecycle.mounts.search += 1; return () => { lifecycle.unmounts.search += 1; }; }, []);
    return <div data-testid="search"><span data-testid="search-path">{location.pathname}</span><button onClick={() => setCount(value => value + 1)}>search-state-{count}</button></div>;
  } };
});

vi.mock('../features/library/LibraryPage', async () => {
  const React = await import('react');
  const { useLocation } = await import('react-router-dom');
  return { LibraryPage: () => {
    const location = useLocation();
    const [count, setCount] = React.useState(0);
    React.useEffect(() => { lifecycle.mounts.library += 1; return () => { lifecycle.unmounts.library += 1; }; }, []);
    return <div data-testid="library"><span data-testid="library-path">{location.pathname}</span><button onClick={() => setCount(value => value + 1)}>library-state-{count}</button></div>;
  } };
});

vi.mock('../features/settings/SettingsPage', async () => {
  const React = await import('react');
  const { useLocation } = await import('react-router-dom');
  return { SettingsPage: () => {
    const location = useLocation();
    const [count, setCount] = React.useState(0);
    React.useEffect(() => { lifecycle.mounts.settings += 1; return () => { lifecycle.unmounts.settings += 1; }; }, []);
    return <div data-testid="settings"><span data-testid="settings-path">{location.pathname}</span><button onClick={() => setCount(value => value + 1)}>settings-state-{count}</button></div>;
  } };
});

function Fixture() {
  const [profile, setProfile] = useState(1);
  const navigate = useNavigate();
  return <>
    <Link to="/">Home</Link>
    <Link to="/search">Search</Link>
    <Link to="/library">Library</Link>
    <Link to="/settings">Settings</Link>
    <Link to="/settings/about">Settings about</Link>
    <Link to="/settings/advanced">Settings advanced</Link>
    <Link to="/library/downloads">Downloads</Link>
    <button onClick={() => setProfile(2)}>Switch profile</button>
    <button onClick={() => navigate(-1)}>Back</button>
    <RetainedMainTabs key={profile} focusRequested={false} onFocusHandled={() => {}} />
  </>;
}

const renderAt = (path = '/') => render(<MemoryRouter initialEntries={[path]}><Fixture /></MemoryRouter>);
const hidden = (testId: string) => screen.getByTestId(testId).closest('[data-retained-tab]');

afterEach(() => { cleanup(); resetLifecycle(); });

describe('retained main tabs', () => {
  it('mounts only visited tabs and keeps their component state on return', () => {
    renderAt('/');
    expect(screen.getByTestId('home')).toBeVisible();
    expect(screen.queryByTestId('search')).toBeNull();
    expect(screen.queryByTestId('library')).toBeNull();
    expect(screen.queryByTestId('settings')).toBeNull();
    expect(lifecycle.mounts).toEqual({ home: 1, search: 0, library: 0, settings: 0 });

    fireEvent.click(screen.getByRole('link', { name: 'Search' }));
    const search = screen.getByTestId('search');
    fireEvent.click(screen.getByRole('button', { name: 'search-state-0' }));
    expect(screen.getByRole('button', { name: 'search-state-1' })).toBeVisible();

    fireEvent.click(screen.getByRole('link', { name: 'Library' }));
    expect(search).not.toBeVisible();
    expect(hidden('search')).toHaveAttribute('aria-hidden', 'true');
    expect(hidden('library')).not.toHaveAttribute('aria-hidden');

    fireEvent.click(screen.getByRole('link', { name: 'Search' }));
    expect(screen.getByTestId('search')).toBe(search);
    expect(screen.getByRole('button', { name: 'search-state-1' })).toBeVisible();
    expect(lifecycle.mounts.search).toBe(1);
    expect(lifecycle.unmounts.search).toBe(0);
  });

  it('does not render Home before its first visit and disposes every tab on profile change', () => {
    renderAt('/settings');
    expect(screen.queryByTestId('home')).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Settings about' }));
    const settings = screen.getByTestId('settings');
    expect(screen.getByTestId('settings-path')).toHaveTextContent('/settings/about');
    fireEvent.click(screen.getByRole('button', { name: 'settings-state-0' }));

    fireEvent.click(screen.getByRole('button', { name: 'Switch profile' }));
    expect(screen.getByTestId('settings')).not.toBe(settings);
    expect(screen.getByTestId('settings-path')).toHaveTextContent('/settings/about');
    expect(screen.queryByRole('button', { name: 'settings-state-1' })).toBeNull();
    expect(lifecycle.unmounts.settings).toBe(1);
    expect(lifecycle.mounts.settings).toBe(2);
  });

  it('keeps a hidden tab on its last route while the active tab follows sub-routes', () => {
    renderAt('/settings');
    fireEvent.click(screen.getByRole('link', { name: 'Settings about' }));
    expect(screen.getByTestId('settings-path')).toHaveTextContent('/settings/about');
    fireEvent.click(screen.getByRole('link', { name: 'Home' }));
    expect(screen.getByTestId('settings')).not.toBeVisible();
    expect(screen.getByTestId('settings-path')).toHaveTextContent('/settings/about');

    fireEvent.click(screen.getByRole('link', { name: 'Settings' }));
    expect(screen.getByTestId('settings-path')).toHaveTextContent('/settings');
    fireEvent.click(screen.getByRole('link', { name: 'Settings advanced' }));
    expect(screen.getByTestId('settings-path')).toHaveTextContent('/settings/advanced');
  });

  it('keeps visited tab identity across Back/Forward and does not retain sub-pages', () => {
    renderAt('/');
    fireEvent.click(screen.getByRole('link', { name: 'Library' }));
    const library = screen.getByTestId('library');
    expect(lifecycle.mounts.library).toBe(1);

    fireEvent.click(screen.getByRole('link', { name: 'Downloads' }));
    // Downloads is a keyed route, not a retained root tab.
    expect(screen.getByTestId('library')).not.toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('library')).toBe(library);
    expect(screen.getByTestId('library')).toBeVisible();
    expect(lifecycle.mounts.library).toBe(1);
  });
});
