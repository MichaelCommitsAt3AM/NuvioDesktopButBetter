import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schema = JSON.parse(await readFile(path.join(root, 'desktop-bridge/contract/schema.json'), 'utf8'));
function typeOf(node) {
  if (node.$ref) return node.$ref.split('/').at(-1);
  if (node.enum) return node.enum.map(value => JSON.stringify(value)).join(' | ');
  if (node.anyOf || node.oneOf) return (node.anyOf ?? node.oneOf).map(typeOf).join(' | ');
  if (Array.isArray(node.type)) return node.type.map(type => typeOf({ ...node, type })).join(' | ');
  switch (node.type) {
    case 'null': return 'null';
    case 'string': return 'string';
    case 'integer': case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'array': return `Array<${typeOf(node.items)}>`;
    case 'object': {
      const entries = Object.entries(node.properties ?? {}).map(([name, value]) =>
        `${JSON.stringify(name)}${node.required?.includes(name) ? '' : '?'}: ${typeOf(value)};`);
      if (node.additionalProperties !== false) entries.push(`[key: string]: ${typeof node.additionalProperties === 'object' ? typeOf(node.additionalProperties) : 'unknown'};`);
      return `{ ${entries.join(' ')} }`;
    }
    default: return 'unknown';
  }
}
const content = '// Generated from desktop-bridge/contract/schema.json. Do not edit.\n' +
  Object.entries(schema.$defs).map(([name, value]) => `export type ${name} = ${typeOf(value)};`).join('\n') + '\n';
const target = path.join(root, 'desktop-ui/src/generated/contract.ts');
if (process.argv.includes('--check')) {
  const current = await readFile(target, 'utf8').catch(() => '');
  if (current !== content) throw new Error('Generated bridge types are stale. Run node scripts/desktop-ui/generate-contract.mjs.');
} else {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}
