import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { relative, resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
async function walk(directory) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) results.push(...await walk(path));
    else results.push(path);
  }
  return results;
}
const base = 'composeApp/src/commonMain/kotlin/com/nuvio/app';
const files = [
  ...await walk(resolve(root, `${base}/features`)),
  ...await walk(resolve(root, `${base}/core/ui`)),
  ...await walk(resolve(root, 'composeApp/src/desktopMain/resources/player-ui')),
  ...['navigation/Routes.kt', 'MainTabsDestination.kt', 'MainAppContent.kt', 'SettingsDestinations.kt', 'AppGate.kt']
    .map(path => resolve(root, base, path)),
  resolve(root, 'composeApp/src/desktopMain/kotlin/com/nuvio/app/core/build/AppFeaturePolicy.desktop.kt'),
];
const entries = [];
for (const path of files.sort()) {
  const name = relative(root, path).replaceAll('\\', '/');
  if (!name.includes('/core/ui/') && !name.includes('/player-ui/') && !/(Screen|Page|Sheet|Dialog|Controls|Modal|Routes|Destination|AppGate|AppFeaturePolicy)/.test(name)) continue;
  const source = await readFile(path, 'utf8');
  // The adapter reuses the original community repository; its sole source hook is visibility.
  const baselineSource = name.endsWith('/SupportersContributorsPage.kt')
    ? source.replace('internal object SupportersContributorsRepository', 'private object SupportersContributorsRepository')
    : source;
  entries.push({
    source: name,
    sha256: createHash('sha256').update(baselineSource).digest('hex'),
    composables: [...source.matchAll(/(?:internal\s+|private\s+)?fun\s+([A-Z]\w*)\s*\(/g)].map(match => match[1]),
    actions: [...new Set([...source.matchAll(/\b(on[A-Z]\w+)\s*[:=]/g)].map(match => match[1]))].sort(),
    referencedLabels: [...new Set([...source.matchAll(/Res\.string\.(\w+)/g)].map(match => match[1]))].sort(),
  });
}
const output = JSON.stringify({
  baseline: '4fe67b7b',
  description: 'Source inventory, not a reachability proof. Desktop policy/conditions must be audited in the companion checklist. Regenerate after upstream merges and review added/changed controls.',
  entries,
}, null, 2) + '\n';
const target = resolve(root, 'desktop-bridge/contract/ui-inventory.json');
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== output) throw new Error('Original UI source inventory changed; review desktop parity before regenerating.');
} else await writeFile(target, output);
console.log(`Inventoried ${entries.length} original UI source files.`);
