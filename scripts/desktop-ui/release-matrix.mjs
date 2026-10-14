export const builds = [
  { platform: 'windows', runner: 'windows-2022', arch: 'x64', format: 'msi' },
  { platform: 'macos', runner: 'macos-15', arch: 'arm64', format: 'macos' },
  { platform: 'macos', runner: 'macos-15-intel', arch: 'x86_64', format: 'macos' },
  ...['appimage', 'deb', 'rpm', 'flatpak'].map(format => ({ platform: 'linux', runner: 'ubuntu-24.04', arch: 'x86_64', format })),
];
export function releaseMatrix(target) {
  if (!['all', 'windows', 'macos', 'linux'].includes(target)) throw new Error('Unknown release target');
  return { include: builds.filter(build => target === 'all' || build.platform === target) };
}
if (process.argv[2]) console.log(JSON.stringify(releaseMatrix(process.argv[2])));
