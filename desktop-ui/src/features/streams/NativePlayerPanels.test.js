import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const controls = readFileSync('../composeApp/src/desktopMain/resources/player-ui/controls.js', 'utf8');
const originalScrollIntoView = Element.prototype.scrollIntoView;

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); Element.prototype.scrollIntoView = originalScrollIntoView; });

it('marks only the active source with the native Playing badge and selection highlight', () => {
  const source = controls.slice(controls.indexOf('const buildSourceRow ='), controls.indexOf('const renderSourceVirtualRows ='));
  const build = new Function('state', `${source}; return buildSourceRow;`)({ playingLabel: 'Playing' });
  const select = vi.fn();
  const current = { label: '1080p', index: 1, isCurrent: true };
  const activeRow = build(current, select);
  const otherRow = build({ label: '1080p', index: 2, isCurrent: false }, select);
  expect(activeRow.classList.contains('selected')).toBe(true);
  expect(activeRow.getAttribute('aria-current')).toBe('true');
  expect(activeRow.querySelector('.status-chip')?.textContent).toBe('Playing');
  expect(otherRow.classList.contains('selected')).toBe(false);
  expect(otherRow.hasAttribute('aria-current')).toBe(false);
  expect(otherRow.querySelector('.status-chip')).toBeNull();
  activeRow.click();
  expect(select).toHaveBeenCalledWith(current);
});

function panels() {
  // Execute the production panel renderers against real DOM containers. Native
  // transport and unrelated player chrome are deliberately outside this fixture.
  const nodes = {};
  for (const name of ['episodesPanelTitle', 'episodesCloseButton', 'seasonFilterList', 'episodeList', 'streamsPanelTitle', 'episodeBackButton', 'episodeReloadButton', 'episodeStreamsCloseButton', 'episodeStreamContextLabel', 'episodeStreamFilterList', 'episodeStreamList']) {
    nodes[name] = document.body.appendChild(document.createElement('div'));
  }
  const source = controls.slice(controls.indexOf('const ensureEpisodeSeason ='), controls.indexOf('const renderEpisodesModal ='));
  const nativePush = controls.slice(controls.indexOf('window.playerControls ='), controls.indexOf('\n};', controls.indexOf('window.playerControls =')) + 4)
    .replace('window.playerControls =', 'const pushNativeState =');
  const create = new Function('nodes', `
    const { ${Object.keys(nodes).join(', ')} } = nodes;
    let state = {}, selectedEpisodeSeason = null, lastRenderedEpisodeListKey = '', episodeSelectionScrollPending = false;
    let currentEpisodeItems = [], currentEpisodeStreamItems = [], episodeStreamFilterId = '', activeModal = 'episodes';
    const normalizeItems = value => Array.isArray(value) ? value : [];
    const renderFilterRow = (container, items, selected, onSelect) => {
      container.replaceChildren();
      items.forEach(item => {
        const button = document.createElement('button'); button.textContent = item.label;
        button.className = 'filter-chip' + (item.id === selected ? ' selected' : '');
        button.onclick = () => onSelect(item.id); container.appendChild(button);
      });
    };
    const row = item => { const node = document.createElement('div'); node.textContent = item.title; node.className = 'episode-row' + (item.isSelected ? ' selected' : ''); return node; };
    const appendEpisodeRow = (container, item) => container.appendChild(row(item));
    const appendEmptyTrackState = (container, label) => { container.textContent = label; };
    const buildSourceRow = item => row(item);
    const send = () => {}, closePlayerModal = () => {};
    ${source}
    let pendingIsPlaying = null, hasReceivedPlayerControls = true, preMuteVolumeLevel = 1;
    let fullscreenExitPending = false, presentationScheduled = true, pendingSettingToastCommand = '';
    const syncChromeWithPointerPolicy = () => {}, applyPartyControls = () => {}, showPlayerToast = () => {};
    const resetSubtitleSelectionState = () => {}, openPlayerModal = () => {};
    const render = opened => renderEpisodeList(opened);
    ${nativePush}
    return {
      episodes: (items, { seasons = [], opened = false } = {}) => { state = { episodeItems: items, episodeSeasons: seasons }; renderEpisodeList(opened); },
      nativeEpisodes: (items, seasons) => pushNativeState({ episodeItems: items, episodeSeasons: seasons }),
      streams: items => { state = { episodeStreamItems: items }; renderEpisodeStreams(); }
    };
  `);
  const frames = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.push(callback); return frames.length; });
  nodes.flushFrames = () => { while (frames.length) frames.shift()(); };
  nodes.scrollIntoView = vi.fn();
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = nodes.scrollIntoView;
  nodes.restoreScrollIntoView = () => { Element.prototype.scrollIntoView = originalScrollIntoView; };
  return { nodes, render: create(nodes) };
}

it('restores episodes after an empty/loading state returns the same items', () => {
  const { nodes, render } = panels();
  const items = [{ title: 'Episode 1', season: 1 }];
  render.episodes(items); expect(nodes.episodeList.textContent).toBe('Episode 1');
  render.episodes([]); expect(nodes.episodeList.textContent).toBe('No episodes available');
  render.episodes(items); expect(nodes.episodeList.textContent).toBe('Episode 1');
});

it('preserves manual episode scrolling when playback progress updates rebuild the rows', () => {
  const { nodes, render } = panels();
  const seasons = [{ season: 5, label: 'Season 5', isSelected: true }];
  const items = [{ title: 'Playing', season: 5, isSelected: true, progress: 0.2 }];
  try {
    render.episodes(items, { seasons, opened: true }); nodes.flushFrames();
    expect(nodes.scrollIntoView).toHaveBeenCalledTimes(2);
    nodes.scrollIntoView.mockClear();
    nodes.episodeList.scrollTop = 900;
    render.episodes([{ ...items[0], progress: 0.3 }], { seasons }); nodes.flushFrames();
    expect(nodes.episodeList.scrollTop).toBe(900);
    expect(nodes.scrollIntoView).not.toHaveBeenCalled();
    render.episodes(items, { seasons, opened: true }); nodes.flushFrames();
    expect(nodes.scrollIntoView).toHaveBeenCalledTimes(2);
  } finally { nodes.restoreScrollIntoView(); }
});

it('waits for async episodes before aligning once and keeps the season chosen by the user', () => {
  const { nodes, render } = panels();
  const seasons = [{ season: 5, label: 'Season 5', isSelected: true }, { season: 6, label: 'Season 6' }];
  const items = [{ title: 'Playing', season: 5, isSelected: true }, { title: 'Next season', season: 6 }];
  try {
    render.episodes([], { seasons, opened: true }); nodes.flushFrames();
    expect(nodes.scrollIntoView).not.toHaveBeenCalled();
    render.episodes(items, { seasons }); nodes.flushFrames();
    expect(nodes.scrollIntoView).toHaveBeenCalledTimes(2);
    nodes.seasonFilterList.lastChild.click(); nodes.flushFrames();
    expect(nodes.episodeList.textContent).toBe('Next season');
    expect(nodes.seasonFilterList.querySelector('.selected').textContent).toBe('Season 6');
  } finally { nodes.restoreScrollIntoView(); }
});

it('does not reopen or recenter the episode panel during repeated native startup pushes', () => {
  const { nodes, render } = panels();
  const seasons = [{ season: 5, label: 'Season 5', isSelected: true }, { season: 6, label: 'Season 6' }];
  const items = [{ title: 'Playing', season: 5, isSelected: true }, { title: 'Other season', season: 6 }];
  render.episodes(items, { seasons, opened: true }); nodes.flushFrames();
  nodes.scrollIntoView.mockClear();
  for (const scrollTop of [900, 500, 1000, 200]) {
    nodes.episodeList.scrollTop = scrollTop;
    render.nativeEpisodes(items.map(item => ({ ...item })), seasons.map(season => ({ ...season })));
    nodes.flushFrames();
    expect(nodes.episodeList.scrollTop).toBe(scrollTop);
    expect(nodes.scrollIntoView).not.toHaveBeenCalled();
  }
  nodes.seasonFilterList.lastChild.click(); nodes.flushFrames();
  nodes.scrollIntoView.mockClear();
  nodes.episodeList.scrollTop = 350;
  render.nativeEpisodes(items, seasons); nodes.flushFrames();
  expect(nodes.episodeList.textContent).toBe('Other season');
  expect(nodes.episodeList.scrollTop).toBe(350);
  expect(nodes.scrollIntoView).not.toHaveBeenCalled();
});

it('preserves episode nodes across unchanged native state pushes', () => {
  const { nodes, render } = panels();
  const items = [{ title: 'Episode 1', season: 1 }];
  render.episodes(items); const row = nodes.episodeList.firstChild;
  render.episodes(items.map(item => ({ ...item })));
  expect(nodes.episodeList.firstChild).toBe(row);
});

it('restores episode sources after reloading returns the same streams', () => {
  const { nodes, render } = panels();
  const items = [{ title: 'Source 1', index: 0 }];
  render.streams(items); expect(nodes.episodeStreamList.textContent).toBe('Source 1');
  render.streams([]); expect(nodes.episodeStreamList.textContent).toBe('No streams found');
  render.streams(items); expect(nodes.episodeStreamList.textContent).toBe('Source 1');
});
