import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { describe } from '../sites/casai.run/docs/matrix/reference.js';
import { render } from '../sites/casai.run/docs/matrix/matrix.js';
import { createRenderer } from '../sites/casai.run/reference/render.mjs';

const provenance = JSON.parse(readFileSync('sites/casai.run/docs/matrix-source.json', 'utf8'));
const renderer = createRenderer(provenance);
const bundle = await build({ entryPoints: ['sites/casai.run/reference/client.mjs'], bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'import.meta.url': '"https://casai.run/reference-assets/quick-reference.js"' } });

async function setup(t, { component = 'LLMAgent', options = [], query = '', compact = false } = {}) {
  const html = renderer.shell(describe(component, options), await render(component, options));
  const dom = new JSDOM(`<html><head><title>Quick reference</title><link rel="canonical" href="https://casai.run/documentation/quick-reference/"></head><body>${html}</body></html>`, { url: `https://casai.run/documentation/quick-reference/${component.toLowerCase()}/${query}`, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.matchMedia = () => ({ matches: compact, addEventListener() {} });
  window.HTMLElement.prototype.scrollIntoView = function () { this.dataset.scrolled = 'true'; };
  let copied;
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async text => { copied = text; } } });
  window.eval(bundle.outputFiles[0].text);
  const settle = async () => { await new Promise(resolve => setTimeout(resolve, 30)); };
  await settle();
  t.after(() => window.close());
  const $ = selector => window.document.querySelector(selector);
  const click = async selector => { assert.ok($(selector), selector); $(selector).click(); await settle(); };
  const change = async (selector, value) => {
    const element = $(selector); assert.ok(element, selector);
    if (element.type === 'checkbox') element.checked = value;
    else element.value = value;
    element.dispatchEvent(new window.Event('change', { bubbles: true })); await settle();
  };
  const input = (selector, value) => { $(selector).value = value; $(selector).dispatchEvent(new window.Event('input', { bubbles: true })); };
  return { window, $, click, change, input, settle, copied: () => copied };
}

test('source/loading and tool/stream transitions update examples, configuration, URL and focus together', async t => {
  const ui = await setup(t);
  await ui.click('[data-view="example"]');
  await ui.change('[data-source]', 'template');
  await ui.change('[data-choice="loads"]', true);
  assert.equal(ui.$('[data-choice="loads"]').checked, true);
  assert.match(ui.$('#example').textContent, /LLMAgent\.loadsTemplate/);
  assert.match(ui.$('#example').textContent, /LLMAgent\.cat/);
  assert.match(ui.window.location.pathname, /loadtemplate/);
  assert.equal(ui.window.document.activeElement.dataset.choice, 'loads');
  await ui.change('[data-choice="asTool"]', true);
  await ui.change('[data-choice="asStream"]', true);
  assert.equal(ui.$('[data-choice="asTool"]').checked, false);
  assert.equal(ui.$('[data-choice="asStream"]').checked, true);
  assert.match(ui.$('[data-ref-status]').textContent, /Cleared: As a tool/);
  await ui.change('[data-source]', 'function');
  assert.equal(ui.$('[data-choice="loads"]').checked, false);
  assert.equal(ui.$('[data-choice="loads"]').disabled, true);
  assert.doesNotMatch(ui.$('#example').textContent, /LLMAgent\.cat/);
  await ui.click('[data-reset]');
  assert.equal(ui.$('[data-source]').value, 'default');
  assert.equal(ui.$('[data-choice="asStream"]').checked, false);
  assert.equal(ui.$('#example').hidden, false);
});

test('tabs, search, deep links, copied code and browser history use the displayed selection', async t => {
  const ui = await setup(t);
  await ui.click('[data-view="config"]');
  ui.input('[data-property-search]', 'temperature');
  assert.equal(ui.$('#property-temperature').hidden, false);
  assert.equal(ui.$('#property-model').hidden, true);
  ui.input('[data-property-search]', 'no-such-setting-123');
  assert.match(ui.$('[data-property-status]').textContent, /0 properties/);
  ui.window.location.hash = 'property-model';
  await ui.settle();
  assert.equal(ui.$('#property-model').open, true);
  assert.equal(ui.$('#property-model').hidden, false);
  await ui.click('[data-view="example"]');
  await ui.click('[data-copy-file="0"]');
  assert.equal(ui.copied(), (await render('LLMAgent')).files[0].code);
  await ui.click('[data-component-link="Translator"]');
  assert.match(ui.$('[data-reference-heading]').textContent, /Planned/);
  await ui.change('[data-choice="asStream"]', true);
  assert.match(ui.$('#component-title').textContent, /StreamingTranslator/);
  assert.doesNotMatch(ui.$('[data-reference-heading]').textContent, /Planned/);
  await ui.click('[data-share]');
  assert.equal(ui.copied(), ui.window.location.href);
  ui.window.history.back(); await ui.settle();
  assert.match(ui.$('#component-title').textContent, /^Translator$/);
  ui.input('#ref-component-search', 'embedding');
  assert.equal(ui.$('[data-component-link="Embedder"]').hidden, false);
  ui.input('#ref-component-search', 'no-such-component');
  assert.equal(ui.$('[data-component-empty]').hidden, false);
});

test('restoration opens property anchors, explains dropped choices and collapses mobile controls', async t => {
  const ui = await setup(t, { query: '?options=unknown,loadTemplate,run&view=example#property-model', compact: true });
  assert.match(ui.$('[data-ref-status]').textContent, /Removed unavailable options: unknown/);
  assert.equal(ui.$('#config').hidden, false);
  assert.equal(ui.$('#property-model').open, true);
  assert.equal(ui.$('.ref-component-index').open, false);
  assert.equal(ui.$('[data-options-panel]').open, false);
  assert.equal(ui.$('[data-choice="run"]').checked, true);
  ui.$('[data-view="config"]').dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert.equal(ui.$('[data-view="example"]').getAttribute('aria-selected'), 'true');
  assert.equal(ui.window.document.activeElement.dataset.view, 'example');
  assert.equal(ui.window.location.hash, '');
});
