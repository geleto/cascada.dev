import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

export async function configureReference(eleventy, projectRoot) {
  const siteRoot = resolve(projectRoot, 'sites/casai.run');
  const provenance = JSON.parse(await readFile(resolve(siteRoot, 'docs/matrix-source.json'), 'utf8'));
  const cache = resolve(projectRoot, '.cache/casai-reference');
  await mkdir(cache, { recursive: true });
  await build({ entryPoints: [resolve(siteRoot, 'reference/client.mjs')], outfile: resolve(cache, 'quick-reference.js'), bundle: true, format: 'esm', platform: 'browser', target: ['es2022'], minify: true, legalComments: 'eof' });
  const staticBundle = await build({ entryPoints: [resolve(siteRoot, 'reference/static.mjs')], bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', target: 'node18' });
  const staticPath = resolve(cache, 'reference.mjs');
  const contents = staticBundle.outputFiles[0].contents;
  await writeFile(staticPath, contents);
  // Node caches ESM modules. Key the complete compiled graph by content so watch
  // builds use exactly the same current data as the freshly built browser bundle.
  const revision = createHash('sha256').update(contents).digest('hex');
  const { components, referenceSelection, referenceSelections, render, concepts, describe, referenceVersions, basePath, defaultComponent, referencePath, createRenderer, escape } = await import(`${pathToFileURL(staticPath).href}?v=${revision}`);
  const renderer = createRenderer(provenance);
  eleventy.addPassthroughCopy({ [resolve(cache, 'quick-reference.js')]: '/reference-assets/quick-reference.js' });
  eleventy.addPassthroughCopy({ [resolve(siteRoot, 'docs/matrix-source.json')]: `${basePath.slice(1)}source.json` });
  for (const name of ['THIRD_PARTY.md', 'LICENSE-Apache-2.0.txt', 'LICENSE-Cascada.txt']) {
    eleventy.addPassthroughCopy({ [resolve(siteRoot, 'docs/matrix/reference', name)]: `${basePath.slice(1)}notices/${name}` });
  }
  eleventy.addWatchTarget('./sites/casai.run/reference/', { resetConfig: true });
  eleventy.addWatchTarget('./sites/casai.run/docs/matrix/', { resetConfig: true });
  eleventy.addWatchTarget('./sites/casai.run/docs/matrix-source.json', { resetConfig: true });
  const selections = referenceSelections();
  const index = [];
  for (const selection of selections) {
    const reference = describe(selection.component, selection.activeOptions);
    const example = await render(selection.component, selection.activeOptions);
    const url = referencePath(selection.component, selection.activeOptions);
    const content = renderer.shell(reference, example);
    const data = { layout: 'layouts/base.njk', title: `${reference.form.factory || reference.component} · Quick reference`, description: reference.info.description, quickReference: true, matrixExportBase: url, permalink: url };
    eleventy.addTemplate(`matrix/${selection.id}.html`, content, data);
    if (selection.id === referenceSelection(defaultComponent).id) {
      const initial = renderer.shell(describe(defaultComponent), await render(defaultComponent));
      eleventy.addTemplate('matrix/index.html', initial, { ...data, title: 'Quick reference', permalink: basePath, canonicalPath: url });
    }
    const stem = resolve(cache, selection.id);
    // Export files are emitted separately, so Eleventy never interprets Markdown/code as templates.
    await writeFile(`${stem}.md`, renderer.toMarkdown(reference, example));
    await writeFile(`${stem}.json`, JSON.stringify({ schemaVersion: 3, reference, example, provenance }, null, 2) + '\n');
    eleventy.addPassthroughCopy({ [`${stem}.md`]: `${url.slice(1)}README.md`, [`${stem}.json`]: `${url.slice(1)}reference.json` });
    index.push({ ...selection, factory: reference.form.factory, status: reference.status, url, markdown: `${url}README.md`, json: `${url}reference.json` });
  }
  eleventy.addTemplate('matrix/forms.html', `<article class="ref-shell ref-forms"><a href="${basePath}">← Quick reference</a><h1>All API forms</h1><p>Every supported reference form, available without JavaScript.</p>${components.map(component => `<section><h2>${escape(component.name)}</h2><ul>${index.filter(entry => entry.component === component.name).map(entry => `<li><a href="${entry.url}">${escape(entry.factory || entry.component)}${entry.activeOptions.length ? ` · ${escape(entry.activeOptions.join(', '))}` : ''}</a>${entry.status === 'planned' ? ' (planned)' : ''} · <a href="${entry.markdown}">Markdown</a> · <a href="${entry.json}">JSON</a></li>`).join('')}</ul></section>`).join('')}</article>`, { layout: 'layouts/base.njk', title: 'All API forms', quickReference: true, permalink: `${basePath}forms/` });
  await writeFile(resolve(cache, 'index.json'), JSON.stringify({ schemaVersion: 3, components, concepts, versions: referenceVersions, references: index, provenance }, null, 2) + '\n');
  eleventy.addPassthroughCopy({ [resolve(cache, 'index.json')]: `${basePath.slice(1)}index.json` });
}
