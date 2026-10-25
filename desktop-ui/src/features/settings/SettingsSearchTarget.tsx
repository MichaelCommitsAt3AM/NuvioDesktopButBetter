import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { settingsSearchEntries } from './SettingsSearchEntries';
import { normalizeSettingsText } from './settingsSearchMatching';
import './settingsSearch.css';

/** Wait for asynchronously loaded controls without activating or changing them. */
export function SettingsSearchTarget() {
  const location = useLocation();
  useEffect(() => {
    const key = new URLSearchParams(location.search).get('setting');
    const entry = settingsSearchEntries.find(item => item.key === key && item.route === location.pathname);
    const pane = document.querySelector<HTMLElement>('.settings-pane');
    if (!entry || !pane) return;
    let highlighted: HTMLElement | undefined;
    let previousTabIndex: string | null = null;
    let scrollFrame = 0;
    const find = () => {
      const label = [...pane.querySelectorAll<HTMLElement>('strong,h1,h2,h3,label')]
        .find(element => normalizeSettingsText(element.textContent ?? '') === normalizeSettingsText(entry.target ?? entry.title));
      if (!label) return;
      highlighted = label.closest<HTMLElement>('.settings-control-row,.settings-nav-row,.settings-row,.settings-section-heading') ?? label;
      highlighted.classList.add('settings-search-target');
      previousTabIndex = highlighted.getAttribute('tabindex');
      highlighted.setAttribute('tabindex', '-1');
      highlighted.focus({ preventScroll: true });
      // Let route scroll restoration and the destination's layout settle first.
      // Otherwise the settings pane can reset to the top after this jump.
      const target = highlighted;
      scrollFrame = window.requestAnimationFrame(() => {
        if (target.isConnected) target.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'instant' });
      });
      observer.disconnect();
    };
    const observer = new MutationObserver(find);
    observer.observe(pane, { childList: true, subtree: true });
    find();
    const expiry = window.setTimeout(() => observer.disconnect(), 15_000);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(scrollFrame);
      clearTimeout(expiry);
      if (highlighted) {
        highlighted.classList.remove('settings-search-target');
        if (previousTabIndex === null) highlighted.removeAttribute('tabindex');
        else highlighted.setAttribute('tabindex', previousTabIndex);
      }
    };
  }, [location.pathname, location.search, location.key]);
  return null;
}
