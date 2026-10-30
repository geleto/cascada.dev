import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderDocumentation } from './docs-render.mjs';
import { parseSiteArgs, projectRoot } from './sites.mjs';
import { buildSites } from './build.mjs';

const { sites, values, explicitSite } = parseSiteArgs(process.argv.slice(2), {
  refresh: { type: 'boolean', default: false },
  source: { type: 'string' },
});
if (values.source && !values.refresh) throw new Error('--source requires docs:update.');
const selected = sites.filter((site) => site.documentation);
if (!selected.length && explicitSite) throw new Error(`${sites[0].id} has no imported documentation configured in sites.json.`);
if (values.source && selected.length !== 1) throw new Error('--source requires selecting one website with imported documentation.');
for (const site of selected) await generateDocumentation(site);

async function generateDocumentation(site) {
  const config = site.documentation;
  const sourceRoot = values.source ? resolve(values.source) : resolve(projectRoot, config.source);
  const names = Object.keys(config.documents);
  const sourceDir = resolve(projectRoot, site.input, 'docs/source');
  const generatedDir = resolve(projectRoot, site.input, 'docs/generated');
  const inputs = await Promise.all(names.map(async (name) => {
    const path = values.refresh ? resolve(sourceRoot, config.directory, config.documents[name].file) : resolve(sourceDir, `${name}.md`);
    const content = (await readFile(path, 'utf8')).replace(/\u2014|&mdash;|&#0*8212;|&#x0*2014;/gi, '-');
    if (!/^#\s+.+\r?\n/.test(content)) throw new Error(`Missing documentation title in ${path}`);
    return { name, content, sha256: createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex') };
  }));

  const manifest = values.refresh ? {
    repository: config.repository,
    hashFormat: 'sha256 with LF line endings',
    textNormalization: 'em dashes replaced with hyphens',
    commit: execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    modified: Boolean(execFileSync('git', ['-C', sourceRoot, 'status', '--porcelain', '--', ...names.map((name) => `${config.directory}/${config.documents[name].file}`)], { encoding: 'utf8' }).trim()),
    files: Object.fromEntries(inputs.map(({ name, sha256 }) => [`${name}.md`, sha256])),
  } : JSON.parse(await readFile(resolve(sourceDir, 'source.json'), 'utf8'));

  // Read and render all documents successfully before replacing saved files.
  const documents = inputs.map((input) => ({ ...input, ...renderDocumentation(input.content, manifest.commit, config) }));
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
  console.log(`[${site.id}] ${values.refresh ? 'Refreshed and rendered' : 'Rendered saved'} documentation.`);
}

// Build static pages locally. Do not clear dist while a dev server may be writing it.
await buildSites(selected, { clean: false });
