import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { highlight } from '../shared/public/syntax.mjs';

test('shared highlighting preserves source and distinguishes code from plain text', () => {
  const source = 'export async function rankPolicies() {\n  // Rank the query\n  return await rerank("<script> & text", 2);\n}';
  const code = JSDOM.fragment(`<code>${highlight(source, 'typescript')}</code>`).firstChild;
  assert.equal(code.textContent, source);
  assert.equal(code.querySelector('script'), null);
  for (const type of ['keyword', 'function', 'string', 'number', 'comment']) assert.ok(code.querySelector(`.token-${type}`));
  const template = JSDOM.fragment(highlight('{% if ready %}Hello {{ name }}{% endif %}', 'jinja'));
  assert.ok(template.querySelector('.token-delimiter'));
  const plain = JSDOM.fragment(highlight('Return 2 < 3. {{ untouched }}', 'text'));
  assert.equal(plain.querySelector('span'), null);
  assert.equal(plain.textContent, 'Return 2 < 3. {{ untouched }}');
});

test('website enhancement and static rendering use identical syntax tokens', async () => {
  const bundle = await build({ entryPoints: ['shared/public/main.js'], bundle: true, write: false, format: 'iife', platform: 'browser' });
  const dom = new JSDOM('<header class="site-header"><button class="menu-toggle"></button><nav id="primary-nav"></nav></header><pre><code class="language-typescript"></code></pre>', { runScripts: 'outside-only' });
  try {
    dom.window.matchMedia = () => ({ matches: false, addEventListener() {} });
    const code = dom.window.document.querySelector('code');
    const source = "const result = await findPolicy('replacement');";
    code.textContent = source;
    dom.window.eval(bundle.outputFiles[0].text);
    const expected = JSDOM.fragment(`<code>${highlight(source, 'typescript')}</code>`).firstChild;
    assert.equal(code.innerHTML, expected.innerHTML);
  } finally { dom.window.close(); }
});
