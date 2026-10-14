import { writeFileSync } from 'node:fs';
const encoded = process.env.LOCAL_PROPERTIES_BASE64;
if (!encoded) throw new Error('NUVIO_DESKTOP_LOCAL_PROPERTIES_BASE64 is required.');
const properties = Buffer.from(encoded, 'base64').toString('utf8').split(/\r?\n/).filter(line => !/^\s*(sdk\.dir|NUVIO_RELEASE_(STORE_FILE|STORE_PASSWORD|KEY_ALIAS|KEY_PASSWORD)|NUVIO_MACOS_(SIGNING_IDENTITY|NOTARY_APPLE_ID|NOTARY_TEAM_ID|NOTARY_PASSWORD|NOTARY_KEYCHAIN_PROFILE|NOTARY_KEYCHAIN_PATH))\s*=/.test(line)).join('\n');
for (const key of ['NUVIO_SUPABASE_URL', 'NUVIO_SUPABASE_ANON_KEY']) {
  if (!new RegExp(`^${key}=.+$`, 'm').test(properties)) throw new Error(`Required desktop configuration is missing ${key}`);
}
writeFileSync('local.properties', properties);
