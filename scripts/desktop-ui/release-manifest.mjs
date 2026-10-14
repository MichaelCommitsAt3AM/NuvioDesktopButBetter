import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { desktopVersion } from './release-config.mjs';

export const updateTargets = {
  'windows-x86_64': '.msi', 'darwin-aarch64': '-arm64.app.tar.gz', 'darwin-x86_64': '-x86_64.app.tar.gz',
  'linux-x86_64': '.AppImage', 'linux-x86_64-deb': '.deb', 'linux-x86_64-rpm': '.rpm',
};
export function manifest(version, repository, assets, notes, date = new Date().toISOString()) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid release repository');
  const platforms = {};
  for (const [target, suffix] of Object.entries(updateTargets)) {
    const matches = assets.filter(asset => asset.name.endsWith(suffix));
    if (matches.length !== 1 || !matches[0].signature?.trim()) throw new Error(`Exactly one signed update is required for ${target}`);
    const asset = matches[0];
    platforms[target] = { signature: asset.signature.trim(), url: `https://github.com/${repository}/releases/download/${encodeURIComponent(version.name)}/${encodeURIComponent(asset.name)}` };
  }
  return { version: version.packageVersion, marketingVersion: version.name, notes, pub_date: date, platforms };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = path.resolve(process.argv[2] ?? 'release');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const version = desktopVersion(readFileSync(path.join(root, 'composeApp/Configuration/DesktopVersion.properties'), 'utf8'));
  const assets = readdirSync(directory).filter(name => !name.endsWith('.sig') && statSync(path.join(directory, name)).isFile()).map(name => ({ name, signature: (() => { try { return readFileSync(path.join(directory, name + '.sig'), 'utf8'); } catch { return null; } })() }));
  const result = manifest(version, process.env.GITHUB_REPOSITORY ?? 'MichaelCommitsAt3AM/NuvioDesktopButBetter', assets, readFileSync(path.join(directory, 'release-notes.md'), 'utf8'));
  writeFileSync(path.join(directory, 'latest.json'), JSON.stringify(result, null, 2) + '\n');
}
