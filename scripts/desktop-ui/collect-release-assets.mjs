import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { desktopVersion } from './release-config.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const version = desktopVersion(readFileSync(path.join(root, 'composeApp/Configuration/DesktopVersion.properties'), 'utf8'));
const [format, arch] = process.argv.slice(2);
const suffixes = { msi: ['.msi'], macos: ['.dmg', '.app.tar.gz'], appimage: ['.AppImage'], deb: ['.deb'], rpm: ['.rpm'], flatpak: ['.flatpak'] }[format];
if (!suffixes) throw new Error('Unknown release format');
const directory = path.join(root, 'desktop-ui/src-tauri/target/release/bundle');
function files(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]); }
const candidates = format === 'flatpak' ? [path.join(root, `Nuvio-Linux-x86_64-${version.name}.flatpak`)] : files(directory);
const output = path.join(root, 'release-assets');
mkdirSync(output, { recursive: true });
for (const suffix of suffixes) {
  const matching = candidates.filter(file => file.endsWith(suffix));
  if (matching.length !== 1 || statSync(matching[0]).size === 0) throw new Error(`Exactly one nonempty ${suffix} artifact is required`);
  const platform = format === 'msi' ? 'Windows' : format === 'macos' ? 'macOS' : 'Linux';
  const name = suffix === '.app.tar.gz' ? `Nuvio-macOS-${version.name}-${arch}${suffix}` : `Nuvio-${platform}-${arch}-${version.name}${suffix}`;
  const target = path.join(output, name);
  cpSync(matching[0], target);
  if (suffix === '.dmg' || suffix === '.flatpak') continue;
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) throw new Error('TAURI_SIGNING_PRIVATE_KEY is required');
  const result = spawnSync(process.execPath, [path.join(root, 'desktop-ui/node_modules/@tauri-apps/cli/tauri.js'), 'signer', 'sign', '--app-version', version.packageVersion, target], { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`Signing ${name} failed`);
  const signature = readFileSync(target + '.sig', 'utf8').trim();
  if (!signature) throw new Error('Signing produced an empty signature');
  writeFileSync(target + '.sig', signature + '\n');
}
