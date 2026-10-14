import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { desktopVersion, releaseConfig } from './release-config.mjs';
import { manifest, updateTargets } from './release-manifest.mjs';
import { builds, releaseMatrix } from './release-matrix.mjs';

const version = desktopVersion('VERSION_NAME=0.1.27.2\r\nVERSION_CODE=34\r\n');
const upgradeCode = '395990ee-9b8a-3548-922c-e7a23a495b8d';
test('desktop build sequence drives installer and updater version', () => {
  assert.deepEqual(version, { name: '0.1.27.2', code: 34, packageVersion: '1.0.34' });
  assert.ok(desktopVersion('VERSION_NAME=0.1.28.1\nVERSION_CODE=35').packageVersion > version.packageVersion);
  for (const code of [0, 65536, 'invalid']) assert.throws(() => desktopVersion(`VERSION_NAME=0.1.27.2\nVERSION_CODE=${code}`));
});
test('all release formats retain production identity and Windows upgrade UUID', () => {
  for (const build of builds) {
    const config = releaseConfig(version, build.format, 'public-key', upgradeCode);
    assert.equal(config.version, '1.0.34');
    assert.equal(config.identifier, 'com.nuvio.media.desktop');
    assert.equal(config.bundle.windows.wix.upgradeCode, upgradeCode);
    assert.equal(config.bundle.createUpdaterArtifacts, build.format !== 'flatpak');
  }
  assert.throws(() => releaseConfig(version, 'msi', '', upgradeCode));
  assert.throws(() => releaseConfig(version, 'msi', 'public-key', undefined));
});
test('selected CI targets build only their platforms', () => {
  assert.equal(releaseMatrix('all').include.length, 7);
  assert.equal(releaseMatrix('windows').include.length, 1);
  assert.equal(releaseMatrix('macos').include.length, 2);
  assert.equal(releaseMatrix('linux').include.length, 4);
  assert.throws(() => releaseMatrix('android'));
});
const assets = Object.entries(updateTargets).map(([target, suffix]) => ({ name: `Nuvio-${target}-${version.name}${suffix}`, signature: `signed-${target}` }));
test('feed selects the signed package for each architecture and Linux format', () => {
  const feed = manifest(version, 'MichaelCommitsAt3AM/NuvioDesktopButBetter', assets, 'Release notes');
  assert.equal(feed.version, '1.0.34');
  assert.equal(Object.keys(feed.platforms).length, 6);
  for (const [target, suffix] of Object.entries(updateTargets)) {
    assert.equal(feed.platforms[target].signature, `signed-${target}`);
    assert.ok(feed.platforms[target].url.endsWith(suffix));
    assert.ok(feed.platforms[target].url.includes('/download/0.1.27.2/'));
  }
});
test('publishing rejects missing, unsigned and ambiguous platform packages', () => {
  assert.throws(() => manifest(version, 'owner/repo', assets.slice(1), 'notes'));
  assert.throws(() => manifest(version, 'owner/repo', assets.map(asset => ({ ...asset, signature: '' })), 'notes'));
  assert.throws(() => manifest(version, 'owner/repo', [...assets, assets[0]], 'notes'));
});
test('generated release config satisfies the installed Tauri CLI schema', { skip: !process.env.NUVIO_VALIDATE_TAURI_SCHEMA }, () => {
  const require = createRequire(new URL('../../desktop-ui/package.json', import.meta.url));
  const Ajv = require('ajv');
  const schema = require('@tauri-apps/cli/config.schema.json');
  const validate = new Ajv({ strict: false, allErrors: true, unicodeRegExp: false, validateFormats: false }).compile(schema);
  const base = JSON.parse(readFileSync(new URL('../../desktop-ui/src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  for (const build of builds) {
    const config = releaseConfig(version, build.format, 'public-key', upgradeCode);
    assert.ok(validate({ ...base, ...config }), JSON.stringify(validate.errors));
  }
});
