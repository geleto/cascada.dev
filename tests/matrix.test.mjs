import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { components, referenceSelections, render } from '../sites/casai.run/docs/matrix/matrix.js';
import { describe } from '../sites/casai.run/docs/matrix/reference.js';
import { basePath, referencePath, selectionUrl, restoreSelection } from '../sites/casai.run/reference/state.mjs';
import { createRenderer } from '../sites/casai.run/reference/render.mjs';

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

test('every canonical form publishes complete HTML, Markdown and JSON with stable anchors', () => {
  const index = JSON.parse(read(`${basePath}index.json`));
  assert.equal(index.references.length, referenceSelections().length);
  for (const selection of referenceSelections()) {
    const url = referencePath(selection.component, selection.activeOptions);
    const html = read(`${url}index.html`);
    const markdown = read(`${url}README.md`);
    const exported = JSON.parse(read(`${url}reference.json`));
    const reference = describe(selection.component, selection.activeOptions);
    assert.deepEqual(exported.reference, JSON.parse(JSON.stringify(reference)));
    assert.equal(exported.provenance.commit, provenance.commit);
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
    assert.match(html, /type="text\/markdown"/);
    assert.ok(markdown.includes(`**Status:** ${reference.status}`));
    for (const file of exported.example.files) assert.ok(markdown.includes(file.code), `${url}: complete ${file.name}`);
    // The static reference remains complete before browser code chooses a tab.
    for (const view of ['info', 'example', 'config']) assert.match(html, new RegExp(`id="${view}" class="ref-panel" data-panel="${view}"`));
  }
});

test('URLs preserve examples, distinguish API forms, and normalize obsolete choices', () => {
  const initial = { component: 'LLMAgent', options: [] };
  assert.deepEqual(restoreSelection(new URL(`https://casai.run${basePath}`), { ...initial, options: ['useTools'] }).options, ['useTools']);
  const options = ['asTool', 'loadTemplate', 'useTools', 'run'];
  const restored = restoreSelection(new URL(selectionUrl('LLMAgent', options, 'config', '#property-model'), 'https://casai.run'), initial);
  assert.deepEqual(restored, { component: 'LLMAgent', options, view: 'config', dropped: [] });
  assert.equal(referencePath('LLMAgent', options), referencePath('LLMAgent', ['asTool', 'loadTemplate']));
  assert.deepEqual(restoreSelection(new URL('https://casai.run/documentation/quick-reference/translator_asstream/'), initial).options, ['asStream']);
  const obsolete = restoreSelection(new URL('https://casai.run/documentation/quick-reference/llmagent/?options=unknown,asTool,asStream&view=invalid'), initial);
  assert.ok(obsolete.dropped.includes('unknown'));
  assert.equal(obsolete.view, 'info');
  assert.notEqual(obsolete.options.includes('asTool'), obsolete.options.includes('asStream'));
});

test('renderer preserves planned status, nested alternatives and all resource files', async () => {
  const renderer = createRenderer(provenance);
  const planned = renderer.shell(describe('Translator'), await render('Translator'));
  const implemented = renderer.shell(describe('Translator', ['asStream']), await render('Translator', ['asStream']));
  assert.match(planned, /Planned API/);
  assert.match(implemented, /StreamingTranslator/);
  assert.doesNotMatch(implemented, /Planned API: complete Translator/);
  const reference = describe('LLMAgent', ['loadTemplate']);
  const example = await render('LLMAgent', ['loadTemplate']);
  const html = renderer.shell(reference, example);
  for (const file of example.files) assert.ok(html.includes(file.name));
  assert.match(renderer.config(reference), /Alternative 1/);
  assert.match(renderer.toMarkdown(reference, example), new RegExp(`${provenance.commit}/README.md#`));
  assert.equal(components.length, 14);
  const toolReference = describe('LLMAgent', ['asTool', 'loadTemplate']);
  assert.ok(renderer.heading(toolReference).includes('<code>LLMAgent.loadsTemplate.asTool</code>'));
  assert.ok(!renderer.heading(toolReference).includes('asTool.loadsTemplate'));
});
