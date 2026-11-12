import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import MarkdownIt from 'markdown-it';
import { describe } from '../sites/casai.run/docs/matrix/reference.js';
import { render } from '../sites/casai.run/docs/matrix/matrix.js';
import { createRenderer } from '../sites/casai.run/reference/render.mjs';

const provenance = JSON.parse(readFileSync('sites/casai.run/docs/matrix-source.json', 'utf8'));
const renderer = createRenderer(provenance);
const markdown = new MarkdownIt({ html: false });
const bundle = await build({ entryPoints: ['sites/casai.run/reference/client.mjs'], bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'import.meta.url': '"https://casai.run/reference-assets/quick-reference.js"' } });

async function setup(t, { component = 'LLMAgent', options = [], query = '' } = {}) {
  const html = renderer.shell(describe(component, options), await render(component, options));
  const dom = new JSDOM(`<html><head><title>Quick reference</title><link rel="canonical" href="https://casai.run/documentation/quick-reference/"></head><body>${html}</body></html>`, { url: `https://casai.run/documentation/quick-reference/${component.toLowerCase()}/${query}`, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
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

test('the shared introduction stays separate from component navigation', async t => {
  const ui = await setup(t);
  const intro = ui.$('.ref-introduction').textContent;
  await ui.click('[data-component-choice="Template"]');
  assert.equal(ui.$('.ref-introduction').textContent, intro);
  await ui.click('.ref-intro-heading a');
  assert.equal(ui.$('#component-factories').dataset.scrolled, 'true');
});

test('intro component links select the named form and scroll to the matrix', { timeout: 30000 }, async t => {
  const ui = await setup(t, { query: '?view=config' });
  const cases = [
    ['llmagent_asstream', 'LLMAgent', 'LLMAgent.asStream', true],
    ['script', 'Script', 'Script', false],
    ['function', 'Function', 'Function', false],
    ['speechgenerator_asstream', 'SpeechGenerator', 'StreamingSpeechGenerator', true],
    ['transcriber_asstream', 'Transcriber', 'StreamingTranscriber', true],
    ['llmagent', 'LLMAgent', 'LLMAgent', false],
    ['template', 'Template', 'Template', false],
    ['config', 'Config', 'Config', false],
  ];
  for (const [route, component, factory, streaming] of cases) {
    const path = `/documentation/quick-reference/${route}/`;
    const heading = ui.$('#component-factories');
    const scrolled = new Promise(resolve => { heading.scrollIntoView = resolve; });
    await ui.click(`.ref-introduction a[href="${path}#component-factories"]`);
    await scrolled;
    assert.equal(ui.$(`[data-component-choice="${component}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(ui.$('#component-title').textContent, `${factory}({...})`);
    assert.equal(Boolean(ui.$('[data-choice="asStream"]')?.checked), streaming);
    assert.equal(ui.$('#example').hidden, false);
    assert.equal(ui.window.location.pathname, path);
    assert.equal(ui.window.location.hash, '#component-factories');
    assert.equal(ui.window.document.activeElement.id, 'component-title');
  }
  assert.equal(ui.$('.ref-intro-lead a[href="https://cascada.dev/cascada-script/"]').hasAttribute('data-reference-link'), false);
  const restored = new Promise(resolve => ui.window.addEventListener('popstate', resolve, { once: true }));
  ui.window.history.back();
  await restored; await ui.settle();
  assert.equal(ui.$('#component-title').textContent, 'Template({...})');
});

test('intro source-property links select the component and open its configuration property', { timeout: 30000 }, async t => {
  const ui = await setup(t, { options: ['asTool', 'withTemplate'] });
  const cases = [['LLMAgent', 'prompt'], ['Embedder', 'input'], ['Reranker', 'query'], ['SpeechGenerator', 'text'], ['Transcriber', 'audio']];
  for (const [component, property] of cases) {
    const href = `/documentation/quick-reference/${component.toLowerCase()}/?view=config#property-${property}`;
    const scrolled = new Promise(resolve => {
      ui.window.HTMLElement.prototype.scrollIntoView = function () { if (this.id === `property-${property}`) resolve(); };
    });
    assert.equal(ui.$(`.ref-introduction a[href="${href}"] code`).textContent, property);
    await ui.click(`.ref-introduction a[href="${href}"]`);
    await scrolled;
    assert.equal(ui.$(`[data-component-choice="${component}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(ui.$('#component-title').textContent, `${component}({...})`);
    assert.equal(ui.$('[data-view="config"]').getAttribute('aria-selected'), 'true');
    assert.equal(ui.$('#config').hidden, false);
    assert.equal(ui.$(`#property-${property}`).open, true);
    assert.equal(ui.$(`#property-${property}`).hidden, false);
    assert.equal(ui.window.location.pathname, `/documentation/quick-reference/${component.toLowerCase()}/`);
    assert.equal(ui.window.location.search, '?view=config');
    assert.equal(ui.window.location.hash, `#property-${property}`);
  }
  const restored = new Promise(resolve => ui.window.addEventListener('popstate', resolve, { once: true }));
  ui.window.history.back();
  await restored; await ui.settle();
  assert.equal(ui.$('#component-title').textContent, 'SpeechGenerator({...})');
  assert.equal(ui.$('#property-text').open, true);
});

test('option description links enable options, preserve compatible settings and reveal their properties', { timeout: 30000 }, async t => {
  const ui = await setup(t, { query: '?options=withTemplate,asStream&view=config' });
  await ui.click('[data-property-search-toggle]');
  ui.input('[data-property-search]', 'no-such-property');
  const follow = async (choice, property) => {
    const selector = `#hint-${choice} a[data-option-property="${property}"]`;
    const href = ui.$(selector).href;
    const scrolled = new Promise(resolve => {
      ui.window.HTMLElement.prototype.scrollIntoView = function () { if (this.id === `property-${property}`) resolve(); };
    });
    await ui.click(selector);
    await scrolled;
    assert.equal(ui.$(`[data-choice="${choice}"]`).checked, true);
    assert.equal(ui.$('#config').hidden, false);
    assert.equal(ui.$(`#property-${property}`).hidden, false);
    assert.equal(ui.$(`#property-${property}`).open, true);
    assert.equal(ui.window.document.activeElement, ui.$(`#property-${property} > summary`));
    assert.equal(ui.window.location.href, href);
    assert.equal(ui.$('[data-property-search]').value, '');
  };
  await follow('loads', 'loader');
  assert.equal(ui.$('[data-choice="asStream"]').checked, true);
  assert.match(ui.$('#component-title').textContent, /loadsTemplate\.asStream/);
  await follow('loads', 'loader'); // Following an active option's link must not turn it off.
  await follow('asTool', 'asTool');
  assert.equal(ui.$('[data-choice="asStream"]').checked, false);
  assert.equal(ui.$('[data-choice="loads"]').checked, true);
  await follow('useTools', 'tools');
  await follow('structured', 'output');
  assert.equal(ui.$('[data-choice="asTool"]').checked, true);
  assert.equal(ui.$('[data-choice="useTools"]').checked, true);
  const restored = new Promise(resolve => ui.window.addEventListener('popstate', resolve, { once: true }));
  ui.window.history.back();
  await restored; await ui.settle();
  assert.equal(ui.$('[data-choice="structured"]').checked, false);
  assert.equal(ui.$('[data-choice="useTools"]').checked, true);
  assert.equal(ui.window.location.hash, '#property-tools');
});

test('option description links target the selected component and retain native link navigation', { timeout: 30000 }, async t => {
  for (const [component, query, choice, property] of [
    ['Template', '', 'loads', 'loader'],
    ['Script', '', 'useTools', 'tools'],
    ['Transcriber', '?options=withScript', 'useTools', 'tools'],
    ['Config', '?options=withTemplate', 'loads', 'loader'],
  ]) {
    const ui = await setup(t, { component, query });
    const selector = `#hint-${choice} a[data-option-property="${property}"]`;
    const link = ui.$(selector);
    const href = link.href;
    assert.equal(link.protocol, 'https:');
    assert.equal(new URL(href).searchParams.get('view'), 'config');
    let prevented;
    ui.window.document.addEventListener('click', event => { prevented = event.defaultPrevented; event.preventDefault(); }, { once: true });
    link.dispatchEvent(new ui.window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    assert.equal(prevented, false, 'Modified clicks retain native open-in-new-tab behavior');
    assert.equal(ui.$(`[data-choice="${choice}"]`).checked, false);
    const scrolled = new Promise(resolve => {
      ui.window.HTMLElement.prototype.scrollIntoView = function () { if (this.id === `property-${property}`) resolve(); };
    });
    await ui.click(selector);
    await scrolled;
    assert.equal(ui.$(`[data-choice="${choice}"]`).checked, true);
    assert.equal(ui.$(`[data-component-choice="${component}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(ui.window.location.href, href);
    assert.equal(ui.$(`#property-${property}`).open, true);
  }
});

test('source/loading and tool/stream transitions update examples, configuration, URL and focus together', async t => {
  const ui = await setup(t);
  await ui.click('[data-view="example"]');
  await ui.click('[data-source="template"]');
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
  await ui.click('[data-source="function"]');
  assert.equal(ui.$('[data-choice="loads"]'), null);
  assert.doesNotMatch(ui.$('#example').textContent, /LLMAgent\.cat/);
  await ui.click('[data-source="default"]');
  await ui.change('[data-choice="asStream"]', false);
  assert.equal(ui.$('[data-source][aria-pressed="true"]').dataset.source, 'default');
  assert.equal(ui.$('[data-choice="asStream"]').checked, false);
  assert.equal(ui.$('#example').hidden, false);
});

test('shorthand is checked by default and toggles named calls without changing saved option meanings', async t => {
  const ui = await setup(t, { component: 'Reranker' });
  const checkbox = () => ui.$('[data-choice="run"]');
  const followMethod = async method => {
    const scrolled = new Promise(resolve => {
      ui.window.HTMLElement.prototype.scrollIntoView = function () { if (this.id === `method-${method}`) resolve(); };
    });
    await ui.click(`#hint-run a[data-option-method="${method}"]`);
    await scrolled;
    assert.equal(checkbox().checked, method === 'call');
    assert.equal(ui.$('#config').hidden, false);
    assert.equal(ui.$(`#method-${method}`).open, true);
    assert.equal(ui.window.location.hash, `#method-${method}`);
    assert.equal(ui.window.document.activeElement, ui.$(`#method-${method} > summary`));
  };
  assert.equal(checkbox().checked, true);
  assert.equal(checkbox().closest('label').querySelector('.ref-choice-name').textContent, 'Shorthand call');
  assert.equal(checkbox().closest('label').querySelector('.ref-choice-description').textContent, 'Use component(input) instead of component.run({...}).');
  assert.match(checkbox().closest('label').title, /component\(input\).*component\.run/);
  assert.match(ui.$('#example').textContent, /await findPolicy\('How do I replace a damaged mug\?'\)/);
  await ui.change('[data-choice="run"]', false);
  assert.match(ui.$('#example').textContent, /await findPolicy\.run\(\{ query:/);
  assert.equal(new URL(ui.window.location.href).searchParams.get('options'), 'run');
  assert.equal(ui.window.document.activeElement.dataset.choice, 'run');
  const restored = await setup(t, { component: 'Reranker', query: ui.window.location.search });
  assert.equal(restored.$('[data-choice="run"]').checked, false);
  assert.match(restored.$('#example').textContent, /await findPolicy\.run/);
  await ui.change('[data-choice="run"]', true);
  assert.doesNotMatch(ui.$('#example').textContent, /await findPolicy\.run/);
  assert.equal(new URL(ui.window.location.href).searchParams.has('options'), false);
  await followMethod('run');
  assert.match(ui.$('#example').textContent, /await findPolicy\.run\(\{ query:/);
  await followMethod('run'); // Reopening the docs must keep the named call selected.
  await followMethod('call');
  assert.match(ui.$('#example').textContent, /await findPolicy\('How do I replace a damaged mug\?'\)/);
  await ui.click('[data-component-choice="VoiceSessionSetup"]');
  assert.equal(checkbox().checked, true);
  await ui.change('[data-choice="prepareSession"]', true);
  assert.equal(checkbox().checked, false);
  assert.match(ui.$('#example').textContent, /voiceSupport\.prepareSessionConfig/);
  await followMethod('call');
  assert.equal(ui.$('[data-choice="prepareSession"]').checked, false);
  assert.match(ui.$('#example').textContent, /await voiceSupport\(\)/);
});

test('tabs, search, deep links, copied code and browser history use the displayed selection', async t => {
  const ui = await setup(t);
  await ui.click('[data-view="config"]');
  await ui.click('[data-property-search-toggle]');
  ui.input('[data-property-search]', 'temperature');
  assert.equal(ui.$('#property-temperature').hidden, false);
  assert.equal(ui.$('#property-model').hidden, true);
  ui.input('[data-property-search]', 'no-such-setting-123');
  assert.match(ui.$('[data-property-status]').textContent, /0 properties/);
  ui.window.location.hash = 'property-model';
  await ui.settle();
  assert.equal(ui.$('#property-model').open, true);
  assert.equal(ui.$('#property-model .ref-property-description').closest('summary'), ui.$('#property-model > summary'));
  assert.equal(ui.$('#property-model').hidden, false);
  await ui.click('[data-view="example"]');
  await ui.click('[data-copy-file="0"]');
  assert.equal(ui.copied(), (await render('LLMAgent')).files[0].code);
  assert.ok(ui.$('[data-copy-file="0"] svg'));
  assert.equal(ui.$('[data-copy-file="0"]').getAttribute('aria-label'), 'Copy LLMAgent.ts');
  assert.ok(ui.$('[data-download-file="0"] svg'));
  assert.equal(ui.$('[data-download-file="0"]').getAttribute('aria-label'), 'Download LLMAgent.ts');
  await ui.click('[data-component-choice="Translator"]');
  assert.doesNotMatch(ui.$('[data-reference-heading]').textContent, /Planned|experimental|Available/);
  await ui.change('[data-choice="asStream"]', true);
  assert.match(ui.$('#component-title').textContent, /StreamingTranslator/);
  assert.equal(ui.$('.ref-description').innerHTML, markdown.render(describe('Translator', ['asStream']).info.description));
  assert.doesNotMatch(ui.$('[data-reference-heading]').textContent, /Planned/);
  const wentBack = new Promise(resolve => ui.window.addEventListener('popstate', resolve, { once: true }));
  ui.window.history.back(); await wentBack; await ui.settle();
  assert.equal(ui.$('#component-title').textContent, 'Translator({...})');
  assert.equal(ui.$('#ref-component-search'), null);
  assert.doesNotMatch(ui.$('.ref-component-index').textContent, /Planned/);
});

test('property previews toggle useful details and omit absent defaults and source links', { timeout: 20000 }, async t => {
  const ui = await setup(t, { query: '?view=config' });
  const reference = describe('LLMAgent');
  const temperature = ui.$('#property-temperature');
  assert.equal(temperature.querySelector('.ref-property-title > code').textContent, 'temperature?:');
  assert.equal(temperature.querySelector('.ref-type').textContent, 'number');
  assert.equal(temperature.querySelector('.ref-property-description').innerHTML, markdown.render(reference.config.properties.temperature.description));
  assert.equal(temperature.querySelector('.ref-property-description').closest('summary'), temperature.querySelector('summary'));
  assert.equal(temperature.querySelector('.ref-property-header > .ref-origin').textContent, 'ai-sdk');
  assert.equal(ui.$('#property-context .ref-property-header > .ref-origin').textContent, 'casai');
  assert.equal(ui.$('#property-headers .ref-type').textContent, 'Record<string, string | undefined>');
  assert.equal(temperature.querySelector('.ref-property-default'), null);
  assert.equal(ui.$('#property-model .ref-property-default'), null);
  assert.match(ui.$('#property-debug .ref-property-default').textContent, /false/);
  assert.equal(temperature.querySelector('.ref-exact-type'), null);
  assert.equal(ui.$('#property-stopWhen .ref-exact-type pre').textContent.trim(), reference.config.properties.stopWhen.type);
  assert.equal(temperature.open, false);
  await ui.click('#property-temperature .ref-property-description');
  assert.equal(temperature.open, true);
  await ui.click('#property-temperature .ref-property-title');
  assert.equal(temperature.open, false);
  assert.doesNotMatch(ui.$('#config').textContent, /Type & behavior|Alphabetical index/);
  assert.equal(ui.$('#config .ref-attribution'), null);
  assert.ok(ui.$('#config article.ref-member'));
  assert.equal(ui.$('#config article.ref-member summary'), null);
  for (const body of ui.$('#config').querySelectorAll('.ref-property-body')) assert.ok(body.textContent.trim(), 'Every disclosure contains useful details');
  assert.equal(ui.$('#property-model .ref-optional'), null);
  const nested = ui.$('#property-prompt .ref-member');
  assert.ok(nested);
  const disclosure = nested.closest('details');
  assert.equal(disclosure.open, false);
  const scrolled = new Promise(resolve => { nested.scrollIntoView = resolve; });
  ui.window.location.hash = nested.id;
  await scrolled;
  assert.equal(disclosure.open, true);
});

test('property search expands from its icon and clears on close or Escape', async t => {
  const ui = await setup(t, { query: '?view=config' });
  const box = ui.$('[data-property-search-box]');
  const toggle = ui.$('[data-property-search-toggle]');
  assert.equal(box.hidden, true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  await ui.click('[data-property-search-toggle]');
  assert.equal(box.hidden, false);
  assert.equal(ui.window.document.activeElement, ui.$('[data-property-search]'));
  ui.input('[data-property-search]', 'temperature');
  assert.equal(ui.$('#property-model').hidden, true);
  ui.$('[data-property-search]').dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(box.hidden, true);
  assert.equal(ui.$('#property-model').hidden, false);
  assert.equal(ui.$('[data-property-search]').value, '');
  assert.equal(ui.window.document.activeElement, toggle);
  await ui.click('[data-property-search-toggle]');
  ui.input('[data-property-search]', 'no-such-property');
  await ui.click('[data-property-search-toggle]');
  assert.equal(ui.$('#property-model').hidden, false);
  assert.equal(ui.$('[data-property-status]').textContent, '');
});

test('restoration reveals property anchors and keeps the selected filters available', async t => {
  const ui = await setup(t, { query: '?options=unknown,loadTemplate,run&view=example#property-model' });
  assert.match(ui.$('[data-ref-status]').textContent, /Removed unavailable options: unknown/);
  assert.equal(ui.$('#config').hidden, false);
  assert.equal(ui.$('#property-model').hidden, false);
  assert.equal(ui.$('[data-component-choice="LLMAgent"]').getAttribute('aria-pressed'), 'true');
  assert.equal(ui.$('[data-choice="run"]').checked, false);
  ui.$('[data-view="config"]').dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert.equal(ui.$('[data-view="example"]').getAttribute('aria-selected'), 'true');
  assert.equal(ui.window.document.activeElement.dataset.view, 'example');
  assert.equal(ui.window.location.hash, '');
});

test('component buttons preserve the current selection and keep filters visible', async t => {
  const ui = await setup(t);
  assert.equal(ui.$('.ref-sidebar [data-controls]'), ui.$('[data-controls]'));
  assert.equal(ui.$('.ref-reader [data-controls]'), null);
  assert.equal(ui.$('.ref-sidebar details'), null);
  assert.equal(ui.$('[data-reset]'), null);
  assert.equal(ui.$('[data-component-choice="Context"]'), null);
  assert.equal(ui.$('.ref-matrix-title').closest('.ref-sidebar'), null);
  assert.equal(ui.$('.ref-reader .ref-description').innerHTML, markdown.render(describe('LLMAgent').info.description));
  assert.equal(ui.$('.ref-about'), null);
  await ui.click('[data-source="template"]');
  await ui.click('[data-component-choice="LLMAgent"]');
  assert.equal(ui.$('[data-component-choice="LLMAgent"]').tagName, 'BUTTON');
  assert.equal(ui.$('[data-component-choice="LLMAgent"]').hasAttribute('aria-expanded'), false);
  assert.equal(ui.$('[data-source="template"]').getAttribute('aria-pressed'), 'true');
  assert.equal(ui.$('#component-title').textContent, 'LLMAgent.withTemplate({...})');
  await ui.click('[data-choice="asTool"] + .ref-choice-text .ref-choice-description');
  assert.equal(ui.$('#component-title').textContent, 'LLMAgent.withTemplate.asTool({...})');
  assert.match(ui.$('.ref-source-summary').textContent, /prompt: Cascada Template text.*context/);
  assert.equal(ui.$('[data-choice="loads"]').closest('label').querySelector('.ref-choice-name').textContent, 'Load from file');
  assert.equal(ui.$('[data-choice="loads"]').closest('.ref-group-body'), ui.$('.ref-source-controls > .ref-group-body'));
  assert.deepEqual([...ui.window.document.querySelectorAll('[data-controls] .ref-option-group')].map(group => ui.window.document.getElementById(group.getAttribute('aria-labelledby')).textContent), ['Prompt', 'Behavior', 'Example options']);
  assert.equal(ui.$('[data-choice="asTool"]').closest('fieldset').querySelector('legend').textContent, 'Behavior');
  assert.equal(ui.$('[data-choice="run"]').closest('fieldset').querySelector('legend').textContent, 'Example options');
  await ui.click('[data-view="config"]');
  await ui.click('[data-component-choice="Embedder"]');
  assert.equal(ui.$('#config').hidden, false);
  assert.equal(ui.$('.ref-reader .ref-description').innerHTML, markdown.render(describe('Embedder').info.description));
  assert.equal(ui.window.document.activeElement.dataset.componentChoice, 'Embedder');
  assert.equal(ui.$('[data-component-choice="LLMAgent"]').getAttribute('aria-pressed'), 'false');
});

test('source segments allow direct input and preserve intrinsic component sources', async t => {
  const ui = await setup(t);
  assert.deepEqual([...ui.window.document.querySelectorAll('[data-source]')].map(button => button.textContent), ['Text', 'Template', 'Script', 'Function']);
  await ui.click('[data-source="template"]');
  await ui.change('[data-choice="loads"]', true);
  await ui.click('[data-source="template"]');
  assert.equal(ui.$('[data-source][aria-pressed="true"]').dataset.source, 'template');
  await ui.click('[data-source="default"]');
  assert.equal(ui.$('[data-source][aria-pressed="true"]').textContent, 'Text');
  assert.equal(ui.$('[data-choice="loads"]').checked, true);
  assert.doesNotMatch(ui.$('#example').textContent, /LLMAgent\.loadsTemplate/);
  assert.match(ui.$('#example').textContent, /LLMAgent\.loadsText/);
  assert.match(ui.$('#example').textContent, /LLMAgent\.txt/);
  await ui.click('[data-component-choice="Template"]');
  assert.equal(ui.$('.ref-source-summary').textContent, 'template: The template text.');
  assert.equal(ui.$('[data-source]'), null);
  assert.equal(ui.$('.ref-source-controls').tagName, 'DIV');
  assert.equal(ui.$('.ref-source-controls legend'), null);
  assert.match(ui.$('[data-choice="loads"]').closest('label').textContent, /Load template from file/);
  assert.equal(ui.$('[data-choice="loads"]').closest('label').querySelector('strong').textContent, 'template');
  await ui.change('[data-choice="loads"]', true);
  assert.equal(ui.$('#component-title').textContent, 'Template.loadsTemplate({...})');
  assert.equal(ui.$('.ref-source-summary').textContent, 'template: The template file name.');
  await ui.change('[data-choice="loads"]', false);
  assert.equal(ui.$('#component-title').textContent, 'Template({...})');
  assert.equal(ui.$('.ref-source-summary').textContent, 'template: The template text.');
  await ui.click('[data-component-choice="Script"]');
  assert.equal(ui.$('.ref-source-summary').textContent, 'script: The script source code.');
  assert.equal(ui.$('[data-source]'), null);
  assert.match(ui.$('[data-choice="loads"]').closest('label').textContent, /Load script from file/);
  assert.equal(ui.$('[data-choice="loads"]').closest('label').querySelector('strong').textContent, 'script');
  await ui.click('[data-component-choice="Transcriber"]');
  assert.equal(ui.$('[data-source="template"]'), null);
  assert.ok(ui.$('[data-source="script"]'));
  assert.equal(ui.$('[data-source="default"]').textContent, 'Direct input');
  assert.equal(ui.$('[data-choice="loads"]'), null);
  await ui.click('[data-source="script"]');
  assert.equal(ui.$('[data-choice="loads"]').closest('.ref-group-body'), ui.$('.ref-source-controls > .ref-group-body'));
  assert.equal(ui.$('[data-choice="loads"]').checked, false);
  await ui.change('[data-choice="loads"]', true);
  assert.match(ui.$('#component-title').textContent, /loadsScript/);
  await ui.click('[data-source="default"]');
  assert.equal(ui.$('[data-choice="loads"]'), null);
  assert.equal(ui.$('#component-title').textContent, 'Transcriber({...})');
});

test('direct query loading preserves grouped labels, descriptions, highlighting and copyable source', async t => {
  const ui = await setup(t, { component: 'Reranker' });
  assert.equal(ui.$('.ref-source-summary').textContent, 'query: The search text used to rank the candidate documents.');
  const loadLabel = ui.$('[data-choice="loads"]').closest('label');
  assert.equal(loadLabel.querySelector('.ref-choice-name').textContent, 'Load from file');
  assert.equal(loadLabel.querySelector('strong'), null);
  assert.equal(ui.$(`#${loadLabel.closest('fieldset').getAttribute('aria-labelledby')}`).textContent, 'Query');
  assert.equal(ui.$('[data-choice="loads"]').disabled, false);
  await ui.change('[data-choice="loads"]', true);
  assert.equal(ui.$('#component-title').textContent, 'Reranker.loadsText({...})');
  assert.equal(ui.$('.ref-source-summary').textContent, 'query: A file containing the search query used to rank the candidate documents.');
  assert.ok(ui.$('#example .token-keyword'));
  assert.ok(ui.$('#example .token-function'));
  assert.equal(ui.$('#example .language-text').textContent.trim(), 'How do I replace a damaged mug?');
  assert.equal(ui.$('#example .language-text span'), null);
  await ui.click('[data-copy-file="0"]');
  assert.equal(ui.copied(), (await render('Reranker', ['loadText'])).files[0].code);
  await ui.click('[data-source="script"]');
  assert.equal(ui.$('#component-title').textContent, 'Reranker.loadsScript({...})');
  assert.equal(ui.$('[data-choice="loads"]').checked, true);
  await ui.click('[data-source="default"]');
  await ui.change('[data-choice="loads"]', false);
  assert.equal(ui.$('#component-title').textContent, 'Reranker({...})');
  assert.match(ui.$('.ref-source-summary').textContent, /The search text used to rank the candidate documents/);
});

test('compact Input and Return rows link to their separate references', async t => {
  const ui = await setup(t);
  const reference = describe('LLMAgent');
  const properties = [...ui.$('#config').querySelectorAll('[data-property]')].map(element => element.dataset.property);
  assert.deepEqual(properties.slice(0, 2), ['prompt', 'context']);
  assert.equal(new Set(properties).size, properties.length);
  assert.equal(ui.$('[data-view="results"]'), null);
  assert.equal(ui.$('[data-view="return"]').textContent, 'Return');
  assert.equal(ui.$('#component-input').closest('[data-reference-heading]'), ui.$('[data-reference-heading]'));
  assert.equal(ui.$('#results').closest('[data-reference-heading]'), ui.$('[data-reference-heading]'));
  assert.equal(ui.$('#component-input > summary > strong').textContent, 'Input');
  assert.equal(ui.$('#results > summary > strong').textContent, 'Return');
  assert.equal(ui.$('#results > summary .ref-contract-value').textContent, reference.info.result);
  assert.equal(ui.$('#component-input').open, false);
  assert.equal(ui.$('#results').open, false);
  await ui.click('#component-input > summary');
  assert.equal(ui.$('#component-input').open, true);
  assert.match(ui.$('#component-input .ref-contract-body').textContent, /optional conversation history/);
  await ui.click('#results > summary');
  assert.equal(ui.$('#results').open, true);
  assert.match(ui.$('#results .ref-contract-body').textContent, /Casai adds messageHistory/);
  assert.equal(ui.$('.ref-source-reference').closest('[data-panel]').id, 'sources');
  assert.equal(ui.$('.ref-source-reference').tagName, 'UL');
  assert.equal(ui.$('.ref-source-reference').closest('details'), null);
  assert.equal(ui.$('.ref-source-reference').children.length, 7);
  assert.equal(ui.$('#config #section-source'), null);
  assert.equal(ui.$('#section-return').closest('[data-panel]').id, 'return');
  assert.equal(ui.$('#config #section-return'), null);
  assert.equal(ui.$('#config .ref-result-shape'), null);
  await ui.click('#results a[href="#section-return"]');
  assert.equal(ui.$('#return').hidden, false);
  assert.equal(ui.$('#config').hidden, true);
  await ui.click('#component-input a[href="#property-prompt"]');
  assert.equal(ui.$('#config').hidden, false);
  assert.equal(ui.$('#property-prompt').hidden, false);
  assert.equal(new URL(ui.window.location.href).searchParams.get('view'), 'config');
  await ui.click('[data-component-choice="Config"]');
  assert.equal(ui.$('#results').tagName, 'DIV', 'No empty return disclosure');
  assert.equal(ui.$('#section-return'), null, 'No empty fields section');
  assert.equal(ui.$('#property-promptType'), null);
  assert.match(ui.$('#example').textContent, /Config\(/);
  for (const modifier of ['withText', 'withTemplate', 'withScript', 'withFunction', 'loadsText', 'loadsTemplate', 'loadsScript', 'asTool', 'asStream']) {
    assert.ok(ui.$(`#method-${modifier}`), `Config documents ${modifier}`);
  }
  await ui.click('[data-property-search-toggle]');
  ui.input('[data-property-search]', 'toolsContext');
  assert.equal(ui.$('#property-toolsContext').hidden, false);
  assert.equal(ui.$('#property-inputSchema').hidden, true);
});

test('Config source and behavior choices update inheritance examples and compatible destinations', async t => {
  const ui = await setup(t, { component: 'Config' });
  assert.equal(ui.$('#component-title').textContent, 'Config({...})');
  assert.deepEqual([...ui.window.document.querySelectorAll('[data-source]')].map(button => button.textContent), ['Text', 'Template', 'Script', 'Function']);
  assert.equal(ui.$('[data-source][aria-pressed="true"]'), null);
  assert.doesNotMatch(ui.$('.ref-source-reference').textContent, /Inherit/);
  assert.equal(ui.$('[data-choice="loads"]'), null);
  assert.match(ui.$('.ref-control-note').textContent, /inheriting component must support/);
  assert.doesNotMatch(ui.$('#component-input').textContent, /null/);
  assert.ok(ui.$('[data-view="sources"]'));
  await ui.click('[data-source="text"]');
  assert.equal(ui.$('#component-title').textContent, 'Config.withText({...})');
  await ui.change('[data-choice="loads"]', true);
  assert.equal(ui.$('#component-title').textContent, 'Config.loadsText({...})');
  assert.match(ui.$('#example').textContent, /Config\.txt/);
  await ui.change('[data-choice="loads"]', false);
  assert.equal(ui.$('#component-title').textContent, 'Config.withText({...})');
  await ui.click('[data-source="template"]');
  await ui.change('[data-choice="asTool"]', true);
  assert.equal(ui.$('#component-title').textContent, 'Config.withTemplate.asTool({...})');
  assert.match(ui.$('#example').textContent, /const outlet = LLMAgent/);
  assert.match(ui.$('#example').textContent, /return outlet\(\{\}\)/);
  assert.ok(ui.$('.ref-config-overview a[href*="template_astool"]'));
  assert.equal(ui.$('.ref-config-overview a[href*="transcriber"]'), null);
  await ui.change('[data-choice="asStream"]', true);
  assert.equal(ui.$('[data-choice="asTool"]').checked, false);
  assert.equal(ui.$('#component-title').textContent, 'Config.withTemplate.asStream({...})');
  assert.match(ui.$('#example').textContent, /result\.textStream/);
  assert.equal(ui.$('.ref-config-overview .ref-link-grid').children.length, 1);
  await ui.click('[data-source="function"]');
  assert.equal(ui.$('[data-choice="loads"]'), null);
  assert.match(ui.$('#example').textContent, /Config\.withFunction\.asStream/);
  await ui.click('[data-source="script"]');
  await ui.change('[data-choice="loads"]', true);
  await ui.change('[data-choice="useTools"]', true);
  assert.match(ui.$('#example').textContent, /Config\.loadsScript\.asStream/);
  assert.match(ui.$('#example').textContent, /Config\.cas/);
  assert.match(ui.$('#example').textContent, /tools: \{ deliveryDay \}/);
  await ui.click('[data-source="script"]');
  assert.equal(ui.$('#component-title').textContent, 'Config.asStream({...})');
  assert.equal(ui.$('[data-source][aria-pressed="true"]'), null);
  assert.equal(ui.$('[data-choice="loads"]'), null);
  assert.equal(ui.$('[data-choice="useTools"]').checked, true);
  assert.equal(ui.$('[data-choice="asStream"]').checked, true);
  assert.match(ui.window.location.pathname, /config_asstream\/$/);
  await ui.click('[data-source="script"]');
  await ui.change('[data-choice="loads"]', true);
  await ui.click('.ref-config-overview a');
  assert.equal(ui.$('#component-title').textContent, 'LLMAgent.loadsScript.asStream({...})');
});

test('return summaries follow variants and old result field links still open', async t => {
  const ui = await setup(t, { query: '?view=results' });
  assert.equal(ui.$('#return').hidden, false);
  const member = ui.$('#section-return .ref-member');
  const scrolled = new Promise(resolve => { member.scrollIntoView = resolve; });
  ui.window.location.hash = member.id;
  await scrolled;
  assert.equal(ui.$('#return').hidden, false);
  await ui.change('[data-choice="asStream"]', true);
  assert.equal(ui.$('#results > summary .ref-contract-value').textContent, describe('LLMAgent', ['asStream']).info.result);
  assert.match(ui.$('#results .ref-contract-body').textContent, /share one native execution/);
  await ui.change('[data-choice="asTool"]', true);
  assert.match(ui.$('#results .ref-contract-body').textContent, /Tool execution/);
  assert.match(ui.$('#results .ref-contract-body').textContent, /completed parsed output/);
  assert.equal(ui.$('#results .ref-member'), null, 'Full field lists belong in Return');
  assert.match(ui.$('#return').textContent, /Tool execution/);
});

test('Return tabs follow result complexity and keyboard navigation skips unavailable tabs', async t => {
  const ui = await setup(t, { query: '?view=return' });
  assert.equal(ui.$('#return').hidden, false);
  assert.equal(ui.$('[data-view="return"]').getAttribute('aria-selected'), 'true');
  await ui.click('[data-component-choice="Template"]');
  assert.equal(ui.$('[data-view="return"]'), null);
  assert.equal(ui.$('#return'), null);
  assert.equal(ui.$('#example').hidden, false);
  assert.equal(ui.$('#results').open, true, 'Simple returns remain readable in the info panel');
  assert.equal(new URL(ui.window.location.href).searchParams.get('view'), null);
  await ui.click('[data-view="config"]');
  ui.$('[data-view="config"]').dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(ui.window.document.activeElement.dataset.view, 'sources');
  ui.$('[data-view="sources"]').dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(ui.window.document.activeElement.dataset.view, 'notes');
  for (const component of ['Script', 'Function', 'Config']) {
    await ui.click(`[data-component-choice="${component}"]`);
    assert.equal(ui.$('[data-view="return"]'), null, component);
  }
  await ui.click('[data-component-choice="Embedder"]');
  assert.ok(ui.$('[data-view="return"]'));
  await ui.click('[data-view="config"]');
  ui.$('[data-view="config"]').dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  ui.$('[data-view="sources"]').dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(ui.window.document.activeElement.dataset.view, 'return');
  assert.equal(ui.$('#return').hidden, false);
});

test('property search matches names only and hides unrelated reference blocks', async t => {
  const ui = await setup(t, { query: '?view=config' });
  await ui.click('[data-property-search-toggle]');
  ui.input('[data-property-search]', 'provider');
  const matches = [...ui.$('#config').querySelectorAll('[data-property]')].filter(property => !property.hidden);
  assert.ok(matches.length > 0);
  assert.ok(matches.every(property => property.dataset.property.includes('provider')));
  assert.equal(ui.$('#property-providerOptions').hidden, false);
  for (const name of ['temperature', 'stopSequences', 'reasoning', 'model']) assert.equal(ui.$(`#property-${name}`).hidden, true, name);
  assert.equal(ui.$('.ref-config-index'), null);
  assert.equal(ui.$('#section-essential').hidden, true);
  assert.equal(ui.$('[data-property-heading]').textContent, 'Matching properties');
  ui.input('[data-property-search]', 'PrOvIdErOpTiOnS');
  assert.match(ui.$('[data-property-status]').textContent, /1 property found/);
  ui.input('[data-property-search]', 'number');
  assert.match(ui.$('[data-property-status]').textContent, /0 properties/);
  await ui.click('[data-property-search-toggle]');
  assert.equal(ui.$('#section-essential').hidden, false);
  assert.equal(ui.$('#property-temperature').hidden, false);
  assert.equal(ui.$('[data-property-heading]').textContent, 'Input & context');
});

test('source mode links reveal an expanded list with full standalone template explanations', async t => {
  const ui = await setup(t, { component: 'Template', query: '?view=results#section-source' });
  assert.equal(ui.$('#sources').hidden, false);
  const sources = ui.$('.ref-source-reference');
  assert.equal(sources.children.length, 2);
  assert.match(sources.children[0].textContent, /template value contains Cascada Template text/);
  assert.match(sources.children[0].textContent, /context: \{ name: "Ada" \} produces Hello Ada/);
  assert.match(sources.children[1].textContent, /file name passed to the configured loader/);
  assert.equal(ui.$('.ref-source-summary').textContent, 'template: The template text.');
});

test('configuration follows source and tool applicability without duplicate setup sections', async t => {
  const ui = await setup(t, { component: 'SpeechGenerator', query: '?view=config' });
  assert.equal(ui.$('.ref-matrix-title').textContent, 'Component factories');
  assert.equal(ui.$('#section-essential > h3').textContent, 'Required settings');
  assert.equal(ui.$('#property-model').closest('.ref-config-section').id, 'section-essential');
  assert.equal(ui.$('#section-variants'), null);
  assert.equal(ui.$('#return .ref-result-shape h4'), null, 'A single result shape needs no repeated factory title');
  for (const property of ['filters', 'renderOptions', 'loader', 'toolContextSchema']) assert.equal(ui.$(`#property-${property}`), null);
  await ui.click('[data-source="template"]');
  for (const property of ['filters', 'renderOptions', 'loader']) assert.ok(ui.$(`#property-${property}`));
  await ui.change('[data-choice="loads"]', true);
  assert.equal(ui.$('#property-loader').closest('.ref-config-section').id, 'section-essential');
  await ui.change('[data-choice="asTool"]', true);
  assert.equal(ui.$('#section-variants > h3').textContent, 'Tool configuration');
  assert.ok(ui.$('#property-toolContextSchema'));
  assert.equal(ui.$('#property-inputSchema').closest('.ref-config-section').id, 'section-essential');
  await ui.click('[data-source="function"]');
  for (const property of ['filters', 'renderOptions', 'loader']) assert.equal(ui.$(`#property-${property}`), null);
  await ui.click('#component-input a[href="#section-source"]');
  assert.equal(ui.$('#sources').hidden, false);
  await ui.click('[data-component-choice="Function"]');
  assert.equal(ui.$('[data-view="sources"]'), null);
  assert.equal(ui.$('#example').hidden, false);
});

test('input help explains concrete values and how the selected source uses context', async t => {
  const ui = await setup(t);
  const input = () => ui.$('#component-input .ref-contract-body');
  assert.equal(ui.$('.ref-contract-type .ref-type').textContent, 'string | ModelMessage | ModelMessage[]');
  assert.match(input().textContent, /one message object, or an array of messages/);
  assert.match(input().textContent, /role: "user", content: "Summarize this report\."/);
  await ui.click('[data-source="template"]');
  assert.match(ui.$('.ref-source-summary').textContent, /Cascada Template text.*context object/);
  assert.match(input().textContent, /prompt value contains Cascada Template text/);
  assert.match(input().textContent, /Hello \{\{ name \}\}.*context: \{ name: "Ada" \}.*Hello Ada/);
  assert.match(input().textContent, /Images, files and other message parts are passed through unchanged/);
  await ui.change('[data-choice="loads"]', true);
  assert.equal(ui.$('.ref-contract-type .ref-type').textContent, 'string');
  assert.match(input().textContent, /file name passed to the configured loader/);
  await ui.click('[data-source="function"]');
  assert.match(ui.$('.ref-source-summary').textContent, /JavaScript function.*prompt.*context/);
  assert.match(input().textContent, /validates application values when inputSchema is configured/);
  await ui.click('[data-component-choice="Transcriber"]');
  assert.equal(ui.$('.ref-contract-type .ref-type').textContent, 'string | Uint8Array | ArrayBuffer | Buffer | URL');
  assert.match(input().textContent, /base64 string/);
  await ui.click('[data-component-choice="Decision"]');
  assert.match(input().textContent, /ordered array of text, file and JSON parts/);
  await ui.click('[data-component-choice="ImageGenerator"]');
  assert.match(input().textContent, /required images and optional text and mask/);
  assert.match(input().textContent, /base64 string or binary data/);
});

test('legacy Info URLs restore the Notes tab and retain concept anchors', async t => {
  const ui = await setup(t, { query: '?view=info#info' });
  assert.equal(ui.$('#notes').hidden, false);
  assert.equal(ui.$('#info').closest('[data-panel]').id, 'notes');
  assert.ok(ui.$('#notes .ref-concept'));
});
