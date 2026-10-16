import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function desktopVersion(properties) {
  const name = properties.match(/^VERSION_NAME=(.+)$/m)?.[1].trim();
  const code = Number(properties.match(/^VERSION_CODE=(\d+)\s*$/m)?.[1]);
  if (!name || !Number.isInteger(code) || code < 1 || code > 65535) throw new Error('Invalid desktop version; MSI build number must be 1–65535.');
  return { name, code, packageVersion: `1.0.${code}` };
}
export function releaseConfig(version, format, publicKey, upgradeCode) {
  if (!publicKey?.trim()) throw new Error('NUVIO_UPDATER_PUBLIC_KEY must contain the persistent Tauri updater public key.');
  if (!/^[\da-f-]{36}$/i.test(upgradeCode)) throw new Error('The original MSI upgrade UUID is missing.');
  const targets = { msi: ['msi'], macos: ['dmg', 'app'], appimage: ['appimage'], deb: ['deb'], rpm: ['rpm'], flatpak: ['deb'] }[format];
  if (!targets) throw new Error(`Unsupported package format: ${format}`);
  return {
    version: version.packageVersion,
    identifier: 'com.nuvio.media.desktop',
    bundle: {
      active: true, targets, createUpdaterArtifacts: format !== 'flatpak', publisher: 'Nuvio Media',
      windows: { wix: { upgradeCode }, webviewInstallMode: { type: 'embedBootstrapper', silent: true } },
      macOS: { minimumSystemVersion: '11.0' },
      linux: {
        deb: { depends: ['libwebkit2gtk-4.1-0', 'libgtk-3-0', 'libmpv2', 'libx11-6', 'libxcomposite1', 'libxext6', 'policykit-1'], section: 'video' },
        rpm: { depends: ['webkit2gtk4.1', 'gtk3', 'mpv-libs', 'libX11', 'libXcomposite', 'libXext', 'polkit'] },
        appimage: { bundleMediaFramework: true, files: { '/usr/lib/libplayer_bridge.so': '../../composeApp/build/native/linux/libplayer_bridge.so', '/usr/lib/libmpv.so.2': '/usr/lib/x86_64-linux-gnu/libmpv.so.2' } },
      },
    },
    plugins: { updater: { pubkey: publicKey.trim() } },
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const version = desktopVersion(readFileSync(path.join(root, 'composeApp/Configuration/DesktopVersion.properties'), 'utf8'));
  const gradle = readFileSync(path.join(root, 'composeApp/build.gradle.kts'), 'utf8');
  const upgradeCode = gradle.match(/val windowsMsiUpgradeUuid = "([^"]+)"/)?.[1];
  const config = releaseConfig(version, process.argv[2], process.env.NUVIO_UPDATER_PUBLIC_KEY, upgradeCode);
  writeFileSync(path.join(root, 'desktop-ui/src-tauri/tauri.release.conf.json'), JSON.stringify(config, null, 2) + '\n');
  console.log(`Nuvio ${version.name}: installer/updater version ${version.packageVersion}`);
}
