import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { renderDocumentation } from '../scripts/docs-render.mjs';
import { chapterPublication, completeDocumentation } from '../sites/casai.run/reference/documentation.mjs';
import { exportReference } from '../sites/casai.run/reference/export-reference.mjs';
import { components, referenceSelections, render } from '../sites/casai.run/docs/matrix/matrix.js';
import { describe, referenceVersions } from '../sites/casai.run/docs/matrix/reference.js';
import { introduction } from '../sites/casai.run/docs/matrix/introduction.js';
import { createRenderer } from '../sites/casai.run/reference/render.mjs';
import { basePath, referencePath, restoreSelection } from '../sites/casai.run/reference/state.mjs';
import { createReferenceRoutes } from '../sites/casai.run/reference/routing.mjs';
import { referenceLink } from '../sites/casai.run/reference/links.mjs';

const read = path => readFileSync(path, 'utf8');
const source = read('sites/casai.run/docs/matrix/documentation.md');
const provenance = JSON.parse(read('sites/casai.run/docs/matrix-source.json'));
const renderer = createRenderer(provenance);
const chapters = chapterPublication(source, provenance.commit);
const output = 'dist/casai.run';
const idsOf = html => [...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const routes = createReferenceRoutes(referenceSelections());
const readPage = path => read(`${output}/${routes.resolve(new URL(path, 'https://casai.run'))?.file || path.replace(/^\//, '') + (path.endsWith('/') ? 'index.html' : '')}`);

test('workflow articles appear immediately after every matrix and publish one checked source each', async () => {
  const articles = JSON.parse(read('sites/casai.run/docs/matrix/articles/index.json'));
  const blog = read(`${output}/blog/index.html`);
  const feed = read(`${output}/feed.xml`);
  const sitemap = read(`${output}/sitemap.xml`);
  assert.equal((blog.match(/class="post-summary"/g) || []).length, articles.length);
  assert.equal((feed.match(/<entry>/g) || []).length, articles.length);
  for (const path of [basePath, referencePath('LLMAgent'), referencePath('Template')]) {
    const dom = new JSDOM(readPage(path));
    try {
      const panel = dom.window.document.querySelector('.ref-shell').nextElementSibling;
      assert.ok(panel.matches('[data-workflow-articles]'), 'article links directly follow the matrix');
      assert.ok(panel.nextElementSibling.matches('[data-guide]'), 'chapters follow the article links');
      assert.deepEqual([...panel.querySelectorAll('a')].map(a => a.getAttribute('href')), articles.map(a => `/posts/${a.slug}/`));
    } finally { dom.window.close(); }
  }
  for (const article of articles) {
    const url = `/posts/${article.slug}/`;
    const source = read(`sites/casai.run/docs/matrix/articles/${article.slug}.md`);
    const rendered = renderDocumentation(source, provenance.commit, { resolveLink: referenceLink, highlight: true });
    const html = read(`${output}${url}index.html`);
    assert.ok(html.includes(rendered.html), 'the published article uses its canonical Markdown verbatim');
    assert.ok(html.includes(`rel="canonical" href="https://casai.run${url}"`));
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1);
    assert.ok(blog.includes(`href="${url}"`) && feed.includes(`https://casai.run${url}`) && sitemap.includes(`https://casai.run${url}`));
    assert.ok(read(`${output}${basePath}documentation.md`).includes(`https://casai.run${url}`), 'the complete download retains article links');
    for (const [, path, hash] of html.matchAll(/href="(\/documentation\/reference\/[^"#]*)(?:#([^"]+))?"/g)) {
      let target = readPage(path);
      if (hash && !target.includes(`id="${hash}"`) && routes.resolve(new URL(path, 'https://casai.run'))?.file) {
        const selected = restoreSelection(new URL(path, 'https://casai.run'), { component: 'LLMAgent', options: [] });
        target = renderer.shell(describe(selected.component, selected.options), await render(selected.component, selected.options));
      }
      if (hash) assert.ok(target.includes(`id="${hash}"`), `${url}: ${path}#${hash}`);
    }
  }
  for (const id of ['interchanging-components-in-workflows', 'text-replacements', 'output-schemas-and-structured-replacements', 'draft-review-and-revise', 'embedding-and-rag-integration']) {
    assert.ok(chapters.html.includes(`id="guide-${id}"`), 'previous chapter links remain usable');
  }
});

test('explicit chapter anchors survive title changes, work on GitHub and produce one HTML target', () => {
  const original = '<a id="guide-stable" name="guide-stable"></a>\n\n## Original title\n\n[Jump](#guide-stable)';
  for (const text of [original, original.replace('Original title', 'Better title')]) {
    const result = renderDocumentation(text, 'master', { explicitAnchors: true });
    assert.deepEqual(idsOf(result.html), ['guide-stable']);
    assert.equal(result.headings[0].slug, 'guide-stable');
    assert.match(result.index, /href="#guide-stable"/);
    assert.doesNotMatch(result.html, /<a id=/);
  }
  assert.equal(chapters.chapters.length, 14);
  assert.equal(chapters.chapters[0].slug, 'guide-first-workflow');
  assert.match(source, /name="guide-first-workflow"/);
  for (const heading of chapters.headings) assert.match(heading.slug, /^guide-/);
});

test('shared reference routes and complete publications have coherent navigation and metadata', () => {
  const main = read(`${output}${basePath}index.html`);
  const form = readPage(referencePath('LLMAgent'));
  assert.ok(main.indexOf('id="guide-first-workflow"') > main.indexOf('id="component-factories"'));
  assert.ok(main.includes(chapters.fragment));
  assert.equal(form, main, 'all form URLs share one physical page');
  assert.ok(form.includes(`href="${basePath}#guide-first-workflow"`), 'no-JS chapter links open the complete entry page');
  for (const html of [main, form]) {
    const ids = idsOf(html); assert.equal(ids.length, new Set(ids).size, 'unique IDs');
    assert.ok(html.includes(`href="${basePath}documentation.md"`));
    assert.ok(html.includes(`href="${basePath}all/"`));
  }
  assert.ok(main.includes(`rel="canonical" href="https://casai.run${basePath}"`));
  assert.ok(form.includes(`rel="canonical" href="https://casai.run${basePath}"`));
  const complete = read(`${output}${basePath}documentation.md`);
  const all = read(`${output}${basePath}all/index.html`);
  assert.doesNotMatch(all, /&amp;#124;/, 'TypeScript union pipes render correctly inside tables');
  assert.ok(all.includes(renderDocumentation(complete, provenance.commit, { explicitAnchors: true, anchorPrefix: 'ref-', highlight: true }).html));
  const ids = idsOf(all), targets = new Set(ids);
  assert.equal(ids.length, targets.size);
  for (const [, href] of all.matchAll(/href="#([^"]+)"/g)) assert.ok(targets.has(href), `Read all target ${href}`);
  assert.ok(read(`${output}/sitemap.xml`).includes('https://casai.run/documentation/reference/all/'));
  assert.ok(read(`${output}/.htaccess`).includes('RedirectMatch 301'));
  assert.doesNotMatch(read(`${output}/.htaccess`), /HTTP_USER_AGENT|Googlebot/i);
  console.log(`Complete Markdown: ${statSync(`${output}${basePath}documentation.md`).size} bytes; Read all HTML: ${statSync(`${output}${basePath}all/index.html`).size} bytes.`);
});

test('the single Markdown preserves every form contract while selecting representative examples', async () => {
  const entries = [];
  for (const selection of referenceSelections()) entries.push({ reference: describe(selection.component, selection.activeOptions), example: await render(selection.component, selection.activeOptions), url: referencePath(selection.component, selection.activeOptions) });
  const complete = completeDocumentation({ source, entries, renderer, introduction, provenance, versions: referenceVersions });
  assert.equal(complete.markdown, read(`${output}${basePath}documentation.md`));
  const normalize = text => String(text).replace(/\]\([^)]+\)/g, ']').replace(/\\\|/g, '|').replace(/\s+/g, ' ').trim();
  const normalized = normalize(complete.markdown);
  const checked = new Set();
  const contains = (value, label) => {
    if (!value || checked.has(value)) return;
    assert.ok(normalized.includes(normalize(value)), label);
    checked.add(value);
  };
  const native = (properties, label) => {
    for (const property of properties || []) {
      for (const field of ['type', 'description', 'typeDescription', 'default', 'required', 'notes', 'inheritance', 'adaptation']) contains(property[field], `${label}.${property.name}.${field}`);
      for (const tag of property.tags || []) if (['deprecated', 'default', 'defaultValue', 'returns', 'param'].includes(tag.name)) contains(tag.text, `${label}.${property.name}.${tag.name}`);
      native(property.nested, label + '.' + property.name);
      detail(property.details, label + '.' + property.name);
    }
  };
  const detail = (details, label) => {
    if (!details) return;
    contains(details.type, label + ' value type');
    for (const variant of details.variants) { contains(variant.type, label + ' alternative'); native(variant.properties, label); }
  };
  for (const { reference, example, url } of entries) {
    contains(reference.info.description, `${url} description`);
    assert.ok(complete.markdown.includes(`id="ref-${reference.canonical.id.toLowerCase()}"`), `${url} stable form anchor`);
    for (const property of Object.values(reference.config.properties)) {
      for (const field of ['description', 'type', 'typeDescription', 'default', 'override', 'inheritance', 'adaptation', 'notes', 'deprecated', 'aliasFor']) contains(property[field], `${url} ${property.id}.${field}`);
      contains(property.required.description, `${url} ${property.id} requiredness`);
      native(property.nested, `${url} ${property.id}`);
      detail(property.details, `${url} ${property.id}`);
      assert.ok(complete.targets.has(url + '#property-' + property.id), `${url} ${property.id} target`);
    }
    for (const section of reference.config.sections) for (const method of section.methods || []) {
      contains(method.signature, `${url} ${method.name} signature`);
      contains(method.description, `${url} ${method.name} behavior`);
      for (const fields of [method.arguments, method.properties, method.result, method.additionalProperties]) native(fields, `${url} ${method.name}`);
    }
    contains(reference.result.description, `${url} result behavior`);
    contains(reference.result.tool, `${url} tool return`);
    for (const shape of reference.result.shapes) native(shape.properties, `${url} ${shape.name}`);
    native(reference.result.additionalProperties, `${url} extra result fields`);
    for (const alternative of reference.config.operationAlternatives) { contains(alternative.when, `${url} operation choice`); native(alternative.properties, `${url} ${alternative.operation}`); }
    if (complete.examples.includes(reference.canonical.id)) for (const file of example.files) assert.ok(complete.markdown.includes(file.code.trimEnd()), `${url} selected ${file.name}`);
    for (const notice of reference.form.notices) assert.ok(complete.markdown.includes(notice));
  }
  for (const component of components) {
    assert.ok(complete.examples.includes(component.name), `${component.name} has a representative example`);
    const catalog = complete.markdown.slice(complete.markdown.indexOf('<a id="ref-components"'), complete.markdown.indexOf('<a id="ref-sources"'));
    assert.equal((catalog.match(new RegExp(`^### ${component.name}$`, 'gm')) || []).length, 1, 'one section per component');
  }
  assert.ok(complete.examples.length <= 25, 'select examples by teaching value, not every combination');
  assert.ok(complete.propertyNames.length < 150);
  assert.ok(complete.methodNames.length < 30);
  assert.ok(Buffer.byteLength(complete.markdown) < 750_000, 'the export must not restore the expanded form catalog');
  assert.ok(statSync(`${output}${basePath}all/index.html`).size < 1_100_000, 'the HTML is the same compact publication');
  assert.ok(entries.some(entry => !complete.examples.includes(entry.reference.canonical.id) && entry.example.files.some(file => !complete.markdown.includes(file.code.trimEnd()))), 'unselected example variants stay in the matrix');
  assert.doesNotMatch(complete.markdown, /\]\(component:/);
  assert.equal(complete.resolveLink('https://casai.run/documentation/quick-reference/llmagent/?view=config#property-model'), complete.resolveLink('https://casai.run/documentation/reference/llmagent/#property-model'));
  assert.equal(complete.resolveLink('https://casai.run/documentation/reference/llmagent/#guide-first-workflow'), '#guide-first-workflow');
});

test('exported rule differences remain scoped to their form and named-call exceptions cannot disappear', () => {
  const entries = [[], ['asTool'], ['asStream']].map(options => ({
    reference: structuredClone(describe('LLMAgent', options)),
    example: { files: [], explanations: [] }, url: referencePath('LLMAgent', options),
  }));
  entries[2].reference.config.properties.maxRetries.notes = 'A streaming-only retry rule.';
  entries[2].reference.config.properties.maxRetries.default = null;
  const result = exportReference(entries, { source, basePath });
  const start = result.markdown.indexOf('<a id="ref-property-maxretries"');
  const block = result.markdown.slice(start, result.markdown.indexOf('<a id="', start + 1));
  assert.match(block, /\*\*LLMAgent \(`\.asStream`\):\*\* A streaming-only retry rule\./);
  assert.equal((block.match(/A streaming-only retry rule\./g) || []).length, 1);
  const defaults = block.slice(block.indexOf('**Default:**'), block.indexOf('**Accepted by:**'));
  assert.doesNotMatch(defaults, /All except/, 'missing metadata is not a different default');
  const run = entries[0].reference.config.sections.flatMap(section => section.methods || []).find(method => method.name === 'run');
  run.propertyIds = run.propertyIds.filter(name => name !== 'maxRetries');
  assert.throws(() => exportReference(entries, { source, basePath }), /run settings need an explicit exception: LLMAgent/);
});

const bundle = await build({ entryPoints: ['sites/casai.run/reference/client.mjs'], bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'import.meta.url': '"https://casai.run/reference-assets/test.js"' } });
async function clientFixture(t, { hash = '', initial = false, fail = false } = {}) {
  const shell = renderer.shell(describe('LLMAgent'), await render('LLMAgent'), chapters);
  const fallback = `<p><a href="${basePath}#guide-first-workflow">Open all workflow chapters</a><button data-load-guide hidden>Load</button></p>`;
  const dom = new JSDOM(`<head><link rel="canonical" href="https://casai.run${basePath}"></head><body>${shell}<section data-guide data-guide-fragment="/reference-assets/chapters-test.html">${initial ? chapters.fragment : fallback}</section></body>`, { url: `https://casai.run${initial ? basePath : referencePath('LLMAgent')}${hash}`, runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(()=>dom.window.close());
  let fetches = 0, shouldFail = fail;
  dom.window.fetch = async () => { fetches++; await new Promise(r=>setTimeout(r, 5)); return { ok: !shouldFail, status: shouldFail ? 503 : 200, text: async()=>chapters.fragment }; };
  dom.window.console.error = ()=>{};
  dom.window.HTMLElement.prototype.scrollIntoView = function() { this.dataset.scrolled = 'true'; };
  dom.window.eval(bundle.outputFiles[0].text);
  const settle = async()=>{ await new Promise(r=>setTimeout(r, 80)); await new Promise(r=>dom.window.requestAnimationFrame(r)); };
  await settle();
  return { dom, $: selector=>dom.window.document.querySelector(selector), settle, fetches: ()=>fetches, recover: ()=>{shouldFail=false;} };
}

test('direct chapter links load once, scroll after insertion, and survive matrix navigation and browser history', async t => {
  const ui = await clientFixture(t, { hash:'#guide-first-workflow' });
  assert.equal(ui.fetches(), 1);
  assert.equal(ui.$('#guide-first-workflow').dataset.scrolled, 'true');
  const host = ui.$('[data-guide-loaded]');
  ui.$('[data-component-choice="Template"]').click(); await ui.settle();
  assert.equal(ui.$('[data-guide-loaded]'), host);
  ui.dom.window.history.back(); await ui.settle();
  assert.equal(ui.dom.window.location.hash, '#guide-first-workflow');
  assert.equal(ui.fetches(), 1);
  const propertyLink = ui.$('.ref-guide a[href*="#property-inputSchema"]');
  propertyLink.click(); await ui.settle();
  assert.equal(ui.$('#property-inputSchema').open, true);
  assert.equal(ui.dom.window.location.hash, '#property-inputSchema');
});

test('the entry URL keeps its canonical, while failed fragment loads retain a working fallback and can retry', async t => {
  const initial = await clientFixture(t, { initial:true });
  assert.equal(initial.fetches(), 0);
  assert.equal(initial.dom.window.location.pathname, basePath);
  assert.equal(initial.$('link[rel="canonical"]').href, `https://casai.run${basePath}`);
  const failed = await clientFixture(t, { hash:'#guide-first-workflow', fail:true });
  assert.equal(failed.$('[data-guide-loaded]'), null);
  assert.equal(failed.$('[data-guide] a').href, `https://casai.run${basePath}#guide-first-workflow`);
  failed.recover(); failed.$('[data-load-guide]').click(); await failed.settle();
  assert.ok(failed.$('[data-guide-loaded]'));
  assert.equal(failed.fetches(), 2);
});

test('shared documentation navigation enhances chapters inserted after page load', async t => {
  const main = await build({ entryPoints:['shared/public/main.js'], bundle:true, write:false, format:'iife', platform:'browser' });
  const dom = new JSDOM('<header class="site-header"><button class="menu-toggle"></button><nav id="primary-nav"></nav></header><main></main><p id="copy-status"></p>', { runScripts:'outside-only', pretendToBeVisual:true });
  t.after(()=>dom.window.close());
  dom.window.matchMedia = ()=>({matches:true,addEventListener(){}});
  dom.window.eval(main.outputFiles[0].text);
  dom.window.document.querySelector('main').innerHTML = '<aside class="docs-sidebar"><details class="docs-index" open><summary>Contents</summary><nav><a href="#guide-test">Test chapter</a></nav></details></aside><h2 id="guide-test">Test chapter</h2>';
  dom.window.document.dispatchEvent(new dom.window.CustomEvent('documentation:loaded'));
  const index = dom.window.document.querySelector('.docs-index');
  assert.equal(index.dataset.indexEnhanced,'true');
  assert.equal(index.open,false,'mobile contents starts collapsed');
  index.open=true; index.querySelector('a').click();
  assert.equal(index.open,false,'choosing a chapter closes the mobile contents');
  dom.window.document.dispatchEvent(new dom.window.CustomEvent('documentation:loaded'));
  assert.equal(dom.window.document.querySelectorAll('[data-index-enhanced]').length,1);
});
