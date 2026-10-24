import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { renderDocumentation } from './docs-render.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({ options: {
  refresh: { type: 'boolean', default: false },
  source: { type: 'string' },
} });
if (values.source && !values.refresh) throw new Error('--source requires docs:update.');
const sourceRoot = resolve(values.source || resolve(root, '../cascada'));
const names = ['script', 'template'];
const sourceDir = resolve(root, 'docs/source');
const generatedDir = resolve(root, 'docs/generated');
const inputs = await Promise.all(names.map(async (name) => {
  const path = values.refresh ? resolve(sourceRoot, `docs/cascada/${name}.md`) : resolve(sourceDir, `${name}.md`);
  const content = (await readFile(path, 'utf8')).replace(/\u2014|&mdash;|&#0*8212;|&#x0*2014;/gi, '-');
  if (!/^#\s+.+\r?\n/.test(content)) throw new Error(`Missing documentation title in ${path}`);
  return { name, content, sha256: createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex') };
}));

const manifest = values.refresh ? {
  repository: 'https://github.com/geleto/cascada',
  hashFormat: 'sha256 with LF line endings',
  textNormalization: 'em dashes replaced with hyphens',
  commit: execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  modified: Boolean(execFileSync('git', ['-C', sourceRoot, 'status', '--porcelain', '--', ...names.map((name) => `docs/cascada/${name}.md`)], { encoding: 'utf8' }).trim()),
  files: Object.fromEntries(inputs.map(({ name, sha256 }) => [`${name}.md`, sha256])),
} : JSON.parse(await readFile(resolve(sourceDir, 'source.json'), 'utf8'));

// Read and render both documents successfully before replacing saved files.
const documents = inputs.map((input) => ({ ...input, ...renderDocumentation(input.content, manifest.commit) }));
await mkdir(generatedDir, { recursive: true });
if (values.refresh) {
  await mkdir(sourceDir, { recursive: true });
  for (const { name, content } of documents) await writeFile(resolve(sourceDir, `${name}.md`), content);
  await writeFile(resolve(sourceDir, 'source.json'), JSON.stringify(manifest, null, 2) + '\n');
}
for (const { name, html, index } of documents) {
  await writeFile(resolve(generatedDir, `${name}.html`), html);
  await writeFile(resolve(generatedDir, `${name}-index.html`), index);
}
console.log(`${values.refresh ? 'Refreshed and rendered' : 'Rendered saved'} documentation. Building the local site...`);
// Build static pages locally. Do not clear dist while a dev server may be writing it.
process.chdir(root);
const { default: Eleventy } = await import('@11ty/eleventy');
await new Eleventy().write();
