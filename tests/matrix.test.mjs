import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { components, referenceSelections, render } from '../sites/casai.run/docs/matrix/matrix.js';
import { describe } from '../sites/casai.run/docs/matrix/reference.js';
import { availableViews, basePath, referencePath, selectionUrl, restoreSelection, views } from '../sites/casai.run/reference/state.mjs';
import { createRenderer } from '../sites/casai.run/reference/render.mjs';
import { createReferenceRoutes } from '../sites/casai.run/reference/routing.mjs';

const output = 'dist/casai.run';
const read = path => readFileSync(`${output}${path}`, 'utf8');
const provenance = JSON.parse(readFileSync('sites/casai.run/docs/matrix-source.json', 'utf8'));

test('saved matrix is a verified, standalone package with upstream notices', () => {
  for (const [path, hash] of Object.entries(provenance.files)) {
    const contents = readFileSync(`sites/casai.run/docs/matrix/${path}`, 'utf8').replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(contents).digest('hex'), hash, path);
  }
  assert.match(read(`${basePath}notices/THIRD_PARTY.md`), /Vercel/);
  for (const license of ['LICENSE-Apache-2.0.txt', 'LICENSE-Cascada.txt']) assert.ok(read(`${basePath}notices/${license}`).length > 1000);
  assert.equal(existsSync('dist/cascada.dev/reference-assets'), false);
});

test('every form uses one published page and renders complete content from the shared data', async () => {
  const linkedAnchors = new Map();
  const index = JSON.parse(read(`${basePath}index.json`));
  const routes = createReferenceRoutes(referenceSelections());
  const renderer = createRenderer(provenance);
  assert.equal(index.schemaVersion, 4);
  assert.equal(index.exports.mode, 'browser');
  assert.equal(index.references.length, referenceSelections().length);
  for (const selection of referenceSelections()) {
    const url = referencePath(selection.component, selection.activeOptions);
    const reference = describe(selection.component, selection.activeOptions);
    const example = await render(selection.component, selection.activeOptions);
    const html = renderer.shell(reference, example);
    const markdown = renderer.toMarkdown(reference, example);
    assert.equal(routes.resolve(new URL(url, 'https://casai.run')).file, `${basePath.slice(1)}index.html`);
    for (const file of ['index.html', 'README.md', 'reference.json']) assert.equal(existsSync(`${output}${url}${file}`), false, 'no per-form copies');
    const entry = index.references.find(entry => entry.url === url);
    assert.equal(entry.markdown, `${url}?download=md`);
    assert.equal(entry.json, `${url}?download=json`);
    assert.ok(read(`${basePath}all/index.html`).includes(`id="ref-${selection.id.toLowerCase()}"`));
    assert.equal(reference.config.properties.promptType, undefined, `${url}: source mode belongs to modifiers`);
    assert.doesNotMatch(html, /id="property-promptType"/);
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, url);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(ids.length, new Set(ids).size, `${url}: duplicate anchors`);
    for (const property of reference.config.index) {
      assert.ok(ids.includes(`property-${property.propertyId}`), `${url}: ${property.propertyId}`);
      assert.ok(markdown.includes(`### ${property.name}`), `${url}: Markdown ${property.name}`);
    }
    for (const section of reference.config.sections) for (const method of section.methods || []) {
      assert.ok(ids.includes(`method-${method.name.replace(/[^\w-]/g, '-')}`));
      assert.ok(markdown.includes(method.signature));
    }
    for (const [, hash] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(hash), `${url}: missing #${hash}`);
    for (const [, href, kind, name] of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*data-option-(property|method)="([^"]+)"/g)) {
      const target = new URL(href.replaceAll('&amp;', '&'), 'https://casai.run');
      const selected = restoreSelection(target, { component: selection.component, options: selection.activeOptions });
      const key = `${selected.component}:${selected.options.join(',')}`;
      if (!linkedAnchors.has(key)) {
        const { config } = describe(selected.component, selected.options);
        linkedAnchors.set(key, new Set([
          ...Object.keys(config.properties).map(property => `property-${property}`),
          ...config.sections.flatMap(section => section.methods || []).map(method => `method-${method.name.replace(/[^\w-]/g, '-')}`),
        ]));
      }
      assert.equal(selected.view, 'config');
      assert.equal(target.hash, `#${kind}-${name}`);
      assert.ok(linkedAnchors.get(key).has(`${kind}-${name}`), `${url}: option link to missing ${href}`);
    }
    assert.match(read(`${basePath}index.html`), /type="text\/markdown"/);
    assert.ok(markdown.includes(`**Status:** ${reference.status}`));
    for (const file of example.files) assert.ok(markdown.includes(file.code), `${url}: complete ${file.name}`);
    // The shared renderer produces every view, not just the visible example.
    for (const view of views) {
      const pattern = new RegExp(`id="${view}" class="ref-panel" data-panel="${view}"`);
      if (availableViews(reference).includes(view)) assert.match(html, pattern);
      else assert.doesNotMatch(html, pattern, `${url}: omit empty ${view} panels`);
    }
    assert.ok(ids.includes('info'), `${url}: legacy Info anchor`);
    assert.ok(ids.includes('results'), `${url}: legacy return summary anchor`);
  }
});

test('URLs preserve examples, distinguish API forms, and normalize obsolete choices', () => {
  const initial = { component: 'LLMAgent', options: [] };
  assert.deepEqual(restoreSelection(new URL(`https://casai.run${basePath}`), { ...initial, options: ['useTools'] }).options, ['useTools']);
  const options = ['asTool', 'loadTemplate', 'useTools', 'run'];
  const restored = restoreSelection(new URL(selectionUrl('LLMAgent', options, 'config', '#property-model'), 'https://casai.run'), initial);
  assert.deepEqual(restored, { component: 'LLMAgent', options, view: 'config', dropped: [] });
  assert.equal(referencePath('LLMAgent', options), referencePath('LLMAgent', ['asTool', 'loadTemplate']));
  assert.deepEqual(restoreSelection(new URL('https://casai.run/documentation/reference/translator_asstream/'), initial).options, ['asStream']);
  const obsolete = restoreSelection(new URL('https://casai.run/documentation/reference/llmagent/?options=unknown,asTool,asStream&view=invalid'), initial);
  assert.ok(obsolete.dropped.includes('unknown'));
  assert.equal(obsolete.view, 'example');
  assert.notEqual(obsolete.options.includes('asTool'), obsolete.options.includes('asStream'));
});

test('renderer preserves work-in-progress notices, nested alternatives and all resource files', async () => {
  const renderer = createRenderer(provenance);
  const planned = renderer.shell(describe('VideoGenerator'), await render('VideoGenerator'));
  const implemented = renderer.shell(describe('Translator', ['asStream']), await render('Translator', ['asStream']));
  assert.match(planned, /Work in progress: VideoGenerator/);
  assert.match(implemented.replaceAll('<wbr>', ''), /Translator\.asStream/);
  assert.doesNotMatch(implemented, /Work in progress: Translator/);
  const reference = describe('LLMAgent', ['loadTemplate']);
  const example = await render('LLMAgent', ['loadTemplate']);
  const html = renderer.shell(reference, example);
  assert.doesNotMatch(html, /ref-about/);
  assert.equal(renderer.toMarkdown(reference, example).split(reference.info.description).length, 2, 'Export the full description once');
  for (const source of reference.info.descriptionSources) assert.ok(html.includes(source.url));
  const withUnusedSummary = { ...reference, info: { ...reference.info, shortDescription: 'Unused short summary' } };
  assert.ok(!renderer.shell(withUnusedSummary, example).includes('Unused short summary'));
  for (const file of example.files) assert.ok(html.includes(file.name));
  assert.match(renderer.config(reference), /Alternative 1/);
  assert.match(renderer.toMarkdown(reference, example), /documentation\/reference\/#guide-/);
  assert.equal(components.length, 16);
  const toolReference = describe('LLMAgent', ['asTool', 'loadTemplate']);
  assert.ok(renderer.heading(toolReference).replaceAll('<wbr>', '').includes('LLMAgent.loadsTemplate.asTool'));
  assert.ok(!renderer.heading(toolReference).includes('asTool.loadsTemplate'));
});
