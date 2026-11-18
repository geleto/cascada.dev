import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createReferenceRoutes } from './routing.mjs';

export async function configureReference(eleventy, projectRoot) {
  const siteRoot = resolve(projectRoot, 'sites/casai.run');
  const provenance = JSON.parse(await readFile(resolve(siteRoot, 'docs/matrix-source.json'), 'utf8'));
  const cache = resolve(projectRoot, '.cache/casai-reference');
  await mkdir(cache, { recursive: true });
  await build({ entryPoints: { 'quick-reference': resolve(siteRoot, 'reference/client.mjs'), 'simple-matrix': resolve(siteRoot, 'reference/simple-client.mjs') }, outdir: cache, bundle: true, format: 'esm', platform: 'browser', target: ['es2022'], minify: true, legalComments: 'eof' });
  const staticBundle = await build({ entryPoints: [resolve(siteRoot, 'reference/static.mjs')], bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', target: 'node18' });
  const staticPath = resolve(cache, 'reference.mjs');
  const contents = staticBundle.outputFiles[0].contents;
  await writeFile(staticPath, contents);
  // Node caches ESM modules. Key the complete compiled graph by content so watch
  // builds use exactly the same current data as the freshly built browser bundle.
  const revision = createHash('sha256').update(contents).digest('hex');
  const {
    components, createMatrix, referenceSelections, render, concepts, describe,
    referenceVersions, basePath, defaultComponent, referencePath, createRenderer, escape, introduction,
    chapterPublication, completeDocumentation, documentationUrl, readAllUrl, configureArticles, renderDocumentation,
  } = await import(`${pathToFileURL(staticPath).href}?v=${revision}`);
  const renderer = createRenderer(provenance);
  const source = await readFile(resolve(siteRoot, 'docs/matrix/documentation.md'), 'utf8');
  const chapters = chapterPublication(source, provenance.commit);
  const articleLinks = await configureArticles(eleventy, siteRoot, provenance.commit);
  // The homepage uses the simplified shared catalog and examples.
  const simpleMatrix = createMatrix('simple');
  const simpleExample = await simpleMatrix.render(defaultComponent);
  eleventy.addGlobalData('casaiSimpleMatrix', createRenderer(provenance, { profile: 'simple' }).simpleShell(simpleExample));
  for (const name of ['quick-reference', 'simple-matrix']) {
    const bytes = await readFile(resolve(cache, `${name}.js`));
    const url = `/reference-assets/${name}-${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.js`;
    eleventy.addPassthroughCopy({ [resolve(cache, `${name}.js`)]: url });
    eleventy.addGlobalData(name === 'quick-reference' ? 'referenceClientUrl' : 'simpleMatrixClientUrl', url);
  }
  eleventy.addPassthroughCopy({ [resolve(siteRoot, 'docs/matrix-source.json')]: `${basePath.slice(1)}source.json` });
  for (const name of ['THIRD_PARTY.md', 'LICENSE-Apache-2.0.txt', 'LICENSE-Cascada.txt']) {
    eleventy.addPassthroughCopy({ [resolve(siteRoot, 'docs/matrix/reference', name)]: `${basePath.slice(1)}notices/${name}` });
  }
  eleventy.addWatchTarget('./sites/casai.run/reference/', { resetConfig: true });
  eleventy.addWatchTarget('./sites/casai.run/docs/matrix/', { resetConfig: true });
  eleventy.addWatchTarget('./sites/casai.run/docs/matrix-source.json', { resetConfig: true });
  const selections = referenceSelections();
  const routes = createReferenceRoutes(selections);
  const routingPath = resolve(cache, '.htaccess');
  await writeFile(routingPath, await readFile(resolve(siteRoot, 'redirects.htaccess'), 'utf8') + '\n' + routes.apache);
  eleventy.addPassthroughCopy({ [routingPath]: '.htaccess' });
  eleventy.addWatchTarget('./sites/casai.run/redirects.htaccess', { resetConfig: true });
  eleventy.setServerOptions({ onRequest: { '/documentation/*': async ({ url }) => {
    const route = routes.resolve(url);
    if (!route) return;
    if (route.location) return { status: route.status, headers: { location: route.location } };
    return { status: 200, headers: { 'content-type': route.contentType }, body: await readFile(resolve(projectRoot, 'dist/casai.run', route.file), 'utf8') };
  } } });
  const index = [];
  const entries = [];
  for (const selection of selections) {
    const reference = describe(selection.component, selection.activeOptions);
    const example = await render(selection.component, selection.activeOptions);
    const url = referencePath(selection.component, selection.activeOptions);
    index.push({ ...selection, factory: reference.form.factory, status: reference.status, url, markdown: `${url}?download=md`, json: `${url}?download=json`, staticHtml: `${readAllUrl}#ref-${selection.id.toLowerCase()}` });
    entries.push({ reference, example, url });
  }
  const initial = renderer.shell(describe(defaultComponent), await render(defaultComponent), chapters) + articleLinks
    + `<section data-guide aria-label="Learn to build workflows">${chapters.fragment}</section>`;
  eleventy.addTemplate('matrix/index.html', initial, { layout: 'layouts/base.njk', title: 'Documentation', quickReference: true, documentation: true, permalink: basePath, canonicalPath: basePath, completeMarkdown: documentationUrl });
  const complete = completeDocumentation({ source, entries, introduction, provenance, versions: referenceVersions });
  await writeFile(resolve(cache, 'documentation.md'), complete.markdown);
  eleventy.addPassthroughCopy({ [resolve(cache, 'documentation.md')]: documentationUrl.slice(1) });
  const all = renderDocumentation(complete.markdown, provenance.commit, { explicitAnchors: true, anchorPrefix: 'ref-', highlight: true });
  const allHtml = `<article class="container ref-read-all docs-article"><header class="article-header"><h1>Casai documentation</h1><p><a href="${basePath}">Open interactive documentation</a> · <a href="${documentationUrl}" download>Download the complete Markdown source</a></p><p>All chapters and component contracts, with shared rules and representative examples. Readable without JavaScript and rendered directly from the same Markdown download.</p></header><div class="prose">${all.html}</div></article>`;
  eleventy.addTemplate('matrix/all.html', allHtml, { layout: 'layouts/base.njk', title: 'Casai documentation - Read all', documentation: true, quickReference: false, completeMarkdown: documentationUrl, permalink: readAllUrl });
  eleventy.addTemplate('matrix/forms.html', `<article class="ref-shell ref-forms"><a href="${basePath}">← Documentation</a><h1>All API forms</h1><p>Read every form without JavaScript, or open it in the interactive reference. Individual Markdown and JSON downloads are generated in your browser. <a href="${documentationUrl}" download>Download all documentation as Markdown</a>.</p>${components.map(component => `<section><h2>${escape(component.name)}</h2><ul>${index.filter(entry => entry.component === component.name).map(entry => `<li><a href="${entry.staticHtml}">${escape(entry.factory || entry.component)}${entry.activeOptions.length ? ` · ${escape(entry.activeOptions.join(', '))}` : ''}</a>${entry.status === 'planned' ? ' (planned)' : ''} · <a href="${entry.url}">Interactive</a> · <a href="${entry.markdown}">Markdown</a> · <a href="${entry.json}">JSON</a></li>`).join('')}</ul></section>`).join('')}</article>`, { layout: 'layouts/base.njk', title: 'All API forms', quickReference: true, permalink: `${basePath}forms/` });
  await writeFile(resolve(cache, 'index.json'), JSON.stringify({ schemaVersion: 4, exports: { mode: 'browser', completeMarkdown: documentationUrl, completeHtml: readAllUrl }, components, concepts, versions: referenceVersions, references: index, provenance }) + '\n');
  eleventy.addPassthroughCopy({ [resolve(cache, 'index.json')]: `${basePath.slice(1)}index.json` });
}
