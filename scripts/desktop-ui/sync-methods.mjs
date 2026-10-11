import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const bridgeRoot = path.join(root, 'desktop-bridge/src/main/kotlin/com/nuvio/desktop/bridge');
const sources = fs.readdirSync(bridgeRoot, { recursive: true }).filter(name => name.endsWith('.kt'));
const schemaPath = path.join(root, 'desktop-bridge/contract/schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const methods = new Set(schema.$defs.Request.properties.method.enum);
for (const name of sources) {
  const text = fs.readFileSync(path.join(bridgeRoot, name), 'utf8');
  for (const match of text.matchAll(/"([a-zA-Z]+\.[\w.]+)"(?:\s*,\s*"[a-zA-Z]+\.[\w.]+")*\s*->/g)) {
    for (const method of match[0].matchAll(/"([a-zA-Z]+\.[\w.]+)"/g)) methods.add(method[1]);
  }
}
schema.$defs.Request.properties.method.enum = [...methods];
for (const topic of ['plugins', 'libraryExtras', 'cloud', 'playbackSettings', 'metadataSettings', 'p2p', 'homeExtras', 'authOptions', 'integrations', 'tmdb', 'mdblist', 'debrid', 'simkl', 'trackingSettings', 'collections', 'collectionEditor', 'folderDetail', 'about', 'advanced', 'streamSelection']) {
  if (!schema.$defs.Event.properties.topic.enum.includes(topic)) schema.$defs.Event.properties.topic.enum.push(topic);
}
fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2) + '\n');
const rustPath = path.join(root, 'desktop-ui/src-tauri/src/main.rs');
const rust = fs.readFileSync(rustPath, 'utf8').replace(/const ALLOWED_METHODS: &\[&str\] = &\[[\s\S]*?\];/,
  'const ALLOWED_METHODS: &[&str] = &[\n' + [...methods].map(method => `    "${method}",`).join('\n') + '\n];');
fs.writeFileSync(rustPath, rust);
