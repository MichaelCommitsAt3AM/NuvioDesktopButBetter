// Generates desktop-ui/src/generated/locales/{code}.json from the canonical
// Kotlin string resources (composeApp/.../composeResources/values*/strings.xml).
// No hand-maintained English dictionary: translations come from the same
// files the Kotlin UI uses, so the rewrite cannot drift. Run with --check in CI.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const resDir = path.join(root, 'composeApp/src/commonMain/composeResources');
const outDir = path.join(root, 'desktop-ui/src/generated/locales');

const RTL = new Set(['ar', 'he', 'ur']);

function unescapeXml(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseStrings(xml, tables) {
  for (const match of xml.matchAll(/<string name="([^"]+)">([\s\S]*?)<\/string>/g)) {
    tables.strings[match[1]] = unescapeXml(match[2].replace(/\\n/g, '\n').replace(/\\'/g, "'").trim());
  }
  for (const match of xml.matchAll(/<plurals name="([^"]+)">([\s\S]*?)<\/plurals>/g)) {
    const quantities = {};
    for (const item of match[2].matchAll(/<item quantity="([^"]+)">([\s\S]*?)<\/item>/g)) {
      quantities[item[1]] = unescapeXml(item[2].replace(/\\n/g, '\n').replace(/\\'/g, "'").trim());
    }
    tables.plurals[match[1]] = quantities;
  }
}

const entries = await readdir(resDir, { withFileTypes: true });
const locales = {};
for (const entry of entries) {
  if (!entry.isDirectory() || !entry.name.startsWith('values')) continue;
  const suffix = entry.name.slice('values'.length).replace(/^-/, '').replace(/-r([A-Z]{2})$/, (_, region) => `-${region.toLowerCase()}`);
  const code = suffix === '' ? 'en' : suffix;
  try {
    const xml = await readFile(path.join(resDir, entry.name, 'strings.xml'), 'utf8');
    const tables = (locales[code] ??= { strings: {}, plurals: {} });
    parseStrings(xml, tables);
  } catch { /* locale without strings.xml */ }
}
// pt-rBR quirk: upstream uses values-pt-rBR; normalize to pt-BR like AppLanguage.
if (locales['pt-br'] && !locales['pt-BR']) {
  locales['pt-BR'] = locales['pt-br'];
  delete locales['pt-br'];
}
if (!locales.en || Object.keys(locales.en.strings).length === 0) {
  throw new Error('English strings.xml produced no entries; refusing to write an empty catalog.');
}

await mkdir(outDir, { recursive: true });
const manifest = { locales: Object.keys(locales).sort(), rtl: [...RTL].filter((code) => locales[code]), fallback: 'en' };
const serialize = (code) => JSON.stringify(locales[code]);
if (process.argv.includes('--check')) {
  const { readFile: read } = await import('node:fs/promises');
  const current = JSON.parse(await read(path.join(outDir, 'manifest.json'), 'utf8').catch(() => '{}'));
  if (JSON.stringify(current) !== JSON.stringify(manifest)) {
    throw new Error('Locale manifest is stale. Run node scripts/desktop-ui/generate-locales.mjs.');
  }
  for (const code of manifest.locales) {
    const onDisk = await read(path.join(outDir, `${code}.json`), 'utf8').catch(() => '');
    if (onDisk !== serialize(code)) throw new Error(`Locale ${code} is stale. Run node scripts/desktop-ui/generate-locales.mjs.`);
  }
} else {
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest));
  for (const code of manifest.locales) await writeFile(path.join(outDir, `${code}.json`), serialize(code));
  const sizes = await Promise.all(manifest.locales.map(async (code) => [code, Object.keys(locales[code].strings).length]));
  console.log(`locales: ${sizes.map(([code, count]) => `${code}(${count})`).join(' ')}`);
}
