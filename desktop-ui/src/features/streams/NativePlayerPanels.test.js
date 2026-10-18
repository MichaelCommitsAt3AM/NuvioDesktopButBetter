import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const controls = readFileSync('../composeApp/src/desktopMain/resources/player-ui/controls.js', 'utf8');

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

function panels() {
  // Execute the production panel renderers against real DOM containers. Native
  // transport and unrelated player chrome are deliberately outside this fixture.
  const nodes = {};
  for (const name of ['episodesPanelTitle', 'episodesCloseButton', 'seasonFilterList', 'episodeList', 'streamsPanelTitle', 'episodeBackButton', 'episodeReloadButton', 'episodeStreamsCloseButton', 'episodeStreamContextLabel', 'episodeStreamFilterList', 'episodeStreamList']) {
    nodes[name] = document.body.appendChild(document.createElement('div'));
  }
  const source = controls.slice(controls.indexOf('const ensureEpisodeSeason ='), controls.indexOf('const renderEpisodesModal ='));
  const create = new Function('nodes', `
    const { ${Object.keys(nodes).join(', ')} } = nodes;
    let state = {}, selectedEpisodeSeason = null, lastRenderedEpisodeListKey = '';
    let currentEpisodeItems = [], currentEpisodeStreamItems = [], episodeStreamFilterId = '', activeModal = 'episodes';
    const normalizeItems = value => Array.isArray(value) ? value : [];
    const renderFilterRow = () => {};
    const row = item => { const node = document.createElement('div'); node.textContent = item.title; return node; };
    const appendEpisodeRow = (container, item) => container.appendChild(row(item));
    const appendEmptyTrackState = (container, label) => { container.textContent = label; };
    const buildSourceRow = item => row(item);
    const send = () => {}, closePlayerModal = () => {};
    ${source}
    return {
      episodes: items => { state = { episodeItems: items }; renderEpisodeList(); },
      streams: items => { state = { episodeStreamItems: items }; renderEpisodeStreams(); }
    };
  `);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  return { nodes, render: create(nodes) };
}

it('restores episodes after an empty/loading state returns the same items', () => {
  const { nodes, render } = panels();
  const items = [{ title: 'Episode 1', season: 1 }];
  render.episodes(items); expect(nodes.episodeList.textContent).toBe('Episode 1');
  render.episodes([]); expect(nodes.episodeList.textContent).toBe('No episodes available');
  render.episodes(items); expect(nodes.episodeList.textContent).toBe('Episode 1');
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
