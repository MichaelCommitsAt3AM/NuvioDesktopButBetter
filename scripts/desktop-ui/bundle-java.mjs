import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const backend = path.join(root, 'desktop-ui/src-tauri/resources/backend');
const runtime = path.join(backend, 'runtime');
const jars = readdirSync(path.join(backend, 'lib')).filter(name => name.endsWith('.jar'));
if (!jars.length) throw new Error('Stage the Kotlin bridge before bundling Java.');
writeFileSync(path.join(backend, 'classpath.txt'), jars.map(name => 'lib/' + name).join(path.delimiter));
if (!process.env.JAVA_HOME) throw new Error('JAVA_HOME must point to the release JDK.');
if (!existsSync(runtime)) {
  const modules = ['java.base', 'java.desktop', 'java.instrument', 'java.logging', 'java.management', 'java.naming', 'java.net.http', 'java.prefs', 'java.sql', 'java.xml', 'jdk.accessibility', 'jdk.charsets', 'jdk.crypto.ec', 'jdk.httpserver', 'jdk.management', 'jdk.unsupported', 'jdk.zipfs'];
  const result = spawnSync(path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'jlink.exe' : 'jlink'), ['--add-modules', modules.join(','), '--strip-debug', '--no-header-files', '--no-man-pages', '--output', runtime], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('Failed to bundle Java: ' + (result.error?.message ?? result.status));
}
const java = path.join(runtime, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
const result = spawnSync(java, ['-version'], { stdio: 'inherit' });
if (result.error || result.status !== 0) throw new Error('The bundled Java runtime cannot run.');
const native = path.join(backend, 'native');
mkdirSync(native, { recursive: true });
const nativeFiles = readdirSync(native, { recursive: true }).map(String);
const expected = process.platform === 'win32' ? ['player_bridge.dll', 'libmpv-2.dll', 'WebView2Loader.dll'] : process.platform === 'darwin' ? ['libplayer_bridge.dylib', 'libmpv.2.dylib'] : [];
for (const name of expected) if (!nativeFiles.some(file => path.basename(file) === name)) throw new Error(`Packaged native runtime is missing ${name}`);
console.log(`Staged ${jars.length} backend JARs and a private Java runtime.`);
