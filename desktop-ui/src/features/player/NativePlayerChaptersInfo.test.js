import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const controls = readFileSync('../composeApp/src/desktopMain/resources/player-ui/controls.js', 'utf8');
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });

function panels() {
  const names = ['chaptersPanelTitle', 'chaptersCloseButton', 'chapterList', 'streamInfoContent'];
  const nodes = Object.fromEntries(names.map(name => [name, document.body.appendChild(document.createElement('div'))]));
  const source = controls.slice(controls.indexOf('const currentChapterIndex ='), controls.indexOf('let chapterMarksSignature ='));
  const send = vi.fn();
  const create = new Function('nodes', 'send', `
    const { ${names.join(', ')} } = nodes;
    let state = {};
    const closePlayerModal = () => {};
    const formatChapterClock = value => String(value);
    ${source}
    return snapshot => { state = snapshot; renderChaptersModal(); renderStreamInfoModal(); };
  `);
  return { ...nodes, send, update: create(nodes, send) };
}

it('tracks current chapters, sends selected index, and restores identical chapters after an empty source', () => {
  vi.useFakeTimers();
  const panel = panels();
  const snapshot = { chapters: [{ startMs: 0, title: 'Opening' }, { startMs: 10000, title: 'Main' }], durationMs: 20000, positionMs: 15000 };
  panel.update(snapshot);
  expect(panel.chapterList.querySelector('.current .chapter-row-name').textContent).toBe('Main');
  expect(panel.chapterList.querySelector('.current .chapter-row-bar > span').style.width).toBe('50%');
  panel.chapterList.children[0].click();
  expect(panel.send).toHaveBeenCalledWith('selectChapter', 0);
  panel.update({ chapters: [] });
  expect(panel.chapterList.children).toHaveLength(0);
  panel.update(snapshot);
  expect(panel.chapterList.children).toHaveLength(2);
});

it('updates stream info across sources and renders provider strings as plain text', () => {
  const panel = panels();
  const snapshot = { streamInfoSections: [{ title: 'Video', name: '<script>provider</script>', items: [{ label: 'Codec', value: 'HEVC' }] }] };
  panel.update(snapshot);
  expect(panel.streamInfoContent.textContent).toContain('HEVC');
  expect(panel.streamInfoContent.querySelector('script')).toBeNull();
  panel.update({ streamInfoSections: [] });
  expect(panel.streamInfoContent.children).toHaveLength(0);
  panel.update(snapshot);
  expect(panel.streamInfoContent.textContent).toContain('HEVC');
});
