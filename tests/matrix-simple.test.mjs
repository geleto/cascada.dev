import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createMatrix } from '../sites/casai.run/docs/matrix/profiles.js';
import { createRenderer } from '../sites/casai.run/reference/render.mjs';
import { selectionUrl } from '../sites/casai.run/reference/state.mjs';

const matrix = createMatrix('simple');
const provenance = JSON.parse(readFileSync('sites/casai.run/docs/matrix-source.json', 'utf8'));
const renderer = createRenderer(provenance, { profile: 'simple' });
const bundle = await build({ entryPoints: ['sites/casai.run/reference/simple-client.mjs'], bundle: true, write: false,
  format: 'iife', platform: 'browser', metafile: true, define: { 'import.meta.url': '"https://casai.run/reference-assets/simple-matrix.js"' } });

async function setup(t, query = '') {
  const example = await matrix.render('LLMAgent');
  const dom = new JSDOM(`<html><head><title>Casai</title><link rel="canonical" href="https://casai.run/"></head><body><h1>Casai</h1><section id="components">${renderer.simpleShell(example)}</section></body></html>`, {
    url: `https://casai.run/${query}`, runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  let copied, downloaded;
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async text => { copied = text; } } });
  window.Blob = Blob;
  window.URL.createObjectURL = blob => { downloaded = blob; return 'blob:example'; };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () {};
  const $ = selector => window.document.querySelector(selector);
  const settle = () => new Promise(resolve => setTimeout(resolve, 30));
  const click = async selector => { assert.ok($(selector), selector); $(selector).click(); await settle(); };
  const choose = component => click(`[data-component-choice="${component}"]`);
  window.eval(bundle.outputFiles[0].text);
  await settle();
  t.after(() => window.close());
  return { window, $, click, choose, settle, copied: () => copied, downloaded: () => downloaded };
}

test('the homepage matrix has a short overview and examples without the full reference payload', async () => {
  assert.ok(!Object.keys(bundle.metafile.inputs).some(path => /reference\/(api|details|components)\.js$/.test(path)), 'Homepage bundle excludes the full API snapshot');
  const example = await matrix.render('LLMAgent');
  const dom = new JSDOM(renderer.simpleShell(example));
  try {
    const document = dom.window.document;
    assert.equal(document.querySelector('.ref-customize').open, false);
    const buttons = [...document.querySelectorAll('.ref-component-grid [data-component-choice]')];
    assert.deepEqual(buttons.map(button => button.dataset.componentChoice), matrix.components.map(component => component.name));
    assert.ok(buttons.every(button => button.disabled && !button.closest('details')));
    assert.equal(document.querySelector('[data-component-choice][aria-pressed="true"]').dataset.componentChoice, 'LLMAgent');
    assert.equal(document.querySelector('select'), null);
    assert.equal(document.querySelector('[data-simple-example] code').textContent, example.files[0].code);
    assert.equal(document.querySelectorAll('.ref-tabs, .ref-property, .ref-introduction, .ref-build-info, [data-export]').length, 0);
    assert.equal(document.querySelectorAll('h1').length, 0);
    assert.equal(document.querySelector('[data-controls] [data-choice="loads"]'), null);
  } finally { dom.window.close(); }
});

test('component buttons select canonical descriptions and examples, retaining development notices only', async t => {
  const ui = await setup(t);
  assert.ok([...ui.window.document.querySelectorAll('[data-component-choice]')].every(button => !button.disabled));
  assert.ok(ui.$('[data-simple-matrix]').classList.contains('is-enhanced'));
  for (const component of matrix.components) {
    await ui.choose(component.name);
    assert.deepEqual([...ui.window.document.querySelectorAll('[data-component-choice][aria-pressed="true"]')].map(button => button.dataset.componentChoice), [component.name]);
    assert.equal(ui.$(`[data-component-choice="${component.name}"]`).title, component.shortDescription);
    assert.equal(ui.$('[data-simple-heading] .ref-description').textContent, component.shortDescription);
    assert.equal(ui.$('[data-simple-heading]').textContent.includes('In development'), component.workInProgress.length > 0);
    assert.equal(ui.$('[data-simple-matrix]').textContent.includes('Experimental SDK'), false);
    const example = await matrix.render(component.name);
    assert.deepEqual([...ui.window.document.querySelectorAll('[data-simple-example] pre code')].map(code => code.textContent), example.files.map(file => file.code));
    for (const id of ['loads', 'run', 'messages', 'resume', 'webRTC', 'prepareSession', 'mask', 'audioStream', 'nativeStream']) {
      assert.equal(ui.$(`[data-choice="${id}"]`), null);
    }
    assert.equal(ui.$('[data-full-reference]').getAttribute('href'), selectionUrl(component.name, example.activeOptions, 'example', '#component-factories'));
    const ids = [...ui.window.document.querySelectorAll('[id]')].map(element => element.id);
    assert.equal(ids.length, new Set(ids).size);
    assert.equal(ui.window.document.title, 'Casai');
    assert.equal(ui.$('link[rel="canonical"]').href, 'https://casai.run/');
    assert.equal(ui.window.location.pathname, '/');
  }
});

test('simple controls preserve source selection, resolve conflicts and keep customization open', async t => {
  const ui = await setup(t);
  await ui.click('.ref-customize > summary');
  await ui.click('[data-source="template"]');
  await ui.click('[data-choice="asTool"]');
  assert.match(ui.$('[data-simple-example]').textContent, /LLMAgent\.withTemplate\.asTool/);
  await ui.click('[data-choice="asStream"]');
  assert.equal(ui.$('[data-choice="asTool"]').checked, false);
  assert.equal(ui.$('[data-choice="asStream"]').checked, true);
  assert.equal(ui.$('[data-source="template"]').getAttribute('aria-pressed'), 'true');
  assert.equal(ui.$('.ref-customize').open, true);
  assert.equal(ui.window.document.activeElement.dataset.choice, 'asStream');
  assert.match(ui.$('[data-simple-example]').textContent, /LLMAgent\.withTemplate\.asStream/);
  assert.equal(ui.$('[data-full-reference]').getAttribute('href'), selectionUrl('LLMAgent', ['asStream', 'withTemplate'], 'example', '#component-factories'));
  const back = new Promise(resolve => ui.window.addEventListener('popstate', resolve, { once: true }));
  ui.window.history.back(); await back; await ui.settle();
  assert.equal(ui.$('[data-choice="asTool"]').checked, true);
  assert.equal(ui.$('[data-choice="asStream"]').checked, false);
  await ui.click('[data-reset-example]');
  assert.equal(ui.$('[data-choice="asTool"]').checked, false);
  assert.equal(ui.$('[data-source="default"]').getAttribute('aria-pressed'), 'true');
  assert.equal(ui.$('[data-reset-example]').disabled, true);
  assert.equal(ui.window.document.activeElement.dataset.componentChoice, 'LLMAgent');
  assert.equal(ui.$('.ref-customize').open, true);
  assert.equal(ui.window.location.search, '?component=LLMAgent');
});

test('restored advanced options are removed and copied/downloaded code matches the selected example', async t => {
  const ui = await setup(t, '?component=LLMAgent&options=withTemplate,useTools,messages,run');
  const options = matrix.normalizeOptions('LLMAgent', ['withTemplate', 'useTools', 'messages', 'run']).activeOptions;
  const example = await matrix.render('LLMAgent', options);
  assert.equal(ui.$('[data-choice="useTools"]').checked, true);
  assert.equal(ui.$('[data-choice="run"]'), null);
  assert.equal(ui.$('[data-full-reference]').getAttribute('href'), selectionUrl('LLMAgent', options, 'example', '#component-factories'));
  await ui.click('[data-copy-file="0"]');
  assert.equal(ui.copied(), example.files[0].code);
  await ui.click('[data-download-file="0"]');
  assert.equal(await ui.downloaded().text(), example.files[0].code);
});
