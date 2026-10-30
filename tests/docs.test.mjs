import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createMarkdownRenderer } from '../scripts/markdown.mjs';
import { renderDocumentation } from '../scripts/docs-render.mjs';

const read = (path) => readFileSync(path, 'utf8');
const config = JSON.parse(read('sites.json'))['cascada.dev'].documentation;
const manifest = JSON.parse(read('sites/cascada.dev/docs/source/source.json'));

test('docs and regular pages render fenced Cascada syntax through the same module', () => {
  const source = '```cascada\n{% for item in items %}\n{{ item.name }} < & >\n{% endfor %}\n```\n';
  const expected = createMarkdownRenderer().render(source);
  assert.equal(renderDocumentation(source).html, expected);
  assert.match(expected, /language-cascada/);
  assert.ok(expected.includes('{{ item.name }} &lt; &amp; &gt;'));
});

test('legacy heading IDs and the nested index survive the renderer migration', () => {
  const { html, index } = renderDocumentation('# Title\n\n## `foo()` &amp; Bar!\n\n### Example\n\n## `foo()` &amp; Bar!\n');
  assert.match(html, /id="foo-bar"/);
  assert.match(html, /id="foo-bar-1"/);
  assert.match(index, /<li><a href="#foo-bar"[^>]*>[^<]*<\/a><ul><li><a href="#example"/);
});

test('documentation links are migrated without altering code examples', () => {
  const { html } = renderDocumentation('[Script](script.md#api-reference)\n\n[Template](https://github.com/geleto/cascada/blob/master/docs/cascada/template.md)\n\n[Streams](streaming.md#example)\n\n```md\n[Script](script.md)\n```', 'abc123', config);
  assert.match(html, /href="\/cascada-script\/#api-reference"/);
  assert.match(html, /href="\/cascada-template\/"/);
  assert.match(html, /href="https:\/\/github.com\/geleto\/cascada\/blob\/abc123\/docs\/cascada\/streaming.md#example"/);
  assert.ok(html.includes('[Script](script.md)'));
});

for (const name of ['script', 'template']) {
  test(`${name} documentation is complete static HTML with valid anchors`, () => {
    const source = read(`sites/cascada.dev/docs/source/${name}.md`);
    assert.equal(createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex'), manifest.files[`${name}.md`]);
    const rendered = renderDocumentation(source, manifest.commit, config);
    const fragment = read(`sites/cascada.dev/docs/generated/${name}.html`);
    assert.equal(fragment.replace(/\r\n/g, '\n'), rendered.html, 'saved HTML matches the saved Markdown');
    const html = read(`dist/cascada.dev/cascada-${name}/index.html`);
    assert.ok(html.includes(fragment), 'full document exists before JavaScript executes');
    assert.doesNotMatch(html, /<iframe|docsify|<script[^>]+src="https?:/);
    assert.match(html, /href="\/docs.css"/);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, 'heading IDs are unique');
    for (const [, href] of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
      const url = new URL(href.replaceAll('&amp;', '&'), `https://cascada.dev/cascada-${name}/`);
      if (url.origin !== 'https://cascada.dev' || !url.hash) continue;
      const target = url.pathname === `/cascada-${name}/` ? html : read(`dist/cascada.dev${url.pathname}index.html`);
      assert.ok(target.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `missing anchor ${href}`);
    }
    const index = read(`sites/cascada.dev/docs/generated/${name}-index.html`);
    const sidebar = html.match(/<aside class="docs-sidebar"[\s\S]*?<\/aside>/)?.[0];
    assert.ok(sidebar?.includes(index), 'the sidebar contains the static heading index');
    assert.match(sidebar, /class="docs-index" open/);
    const indexed = [...index.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(indexed, rendered.headings.filter(({ level }) => level === 2 || level === 3).map(({ slug }) => slug));
    assert.ok(indexed.length > 0, 'index is populated');
    if (name === 'template') assert.ok(html.includes('{% set %}'));
    assert.ok(read('dist/cascada.dev/sitemap.xml').includes(`https://cascada.dev/cascada-${name}/`));
  });
}
