import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { parseSiteArgs, selectSites } from '../scripts/sites.mjs';
import { cleanSite } from '../scripts/clean.mjs';
import { renderDocumentation } from '../scripts/docs-render.mjs';

const read = (site, file) => readFileSync(resolve('dist', site, file), 'utf8');
function htmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}

test('selection defaults to all sites and rejects typos, extra names, and flags', () => {
  assert.deepEqual(selectSites().map(({ id }) => id), Object.keys(JSON.parse(readFileSync('sites.json', 'utf8'))));
  assert.equal(parseSiteArgs(['casai.run']).sites[0].port, 3001);
  for (const args of [['../cascada.dev'], ['unknown'], ['casai.run', 'cascada.dev'], ['--typo']]) {
    assert.throws(() => parseSiteArgs(args));
  }
});

test('sites share components but isolate branding, content, feeds, and canonical URLs', () => {
  for (const site of selectSites()) {
    const metadata = JSON.parse(readFileSync(`${site.input}/_data/site.json`, 'utf8'));
    const output = resolve(site.output);
    for (const path of htmlFiles(output).filter((path) => !path.includes(`${join('demos', '')}`))) {
      const html = readFileSync(path, 'utf8');
      assert.match(html, new RegExp(`aria-label="${metadata.name} home"`));
      assert.match(html, new RegExp(`<link rel="canonical" href="${metadata.url}`));
      assert.match(html, /href="\/brand.css"/);
      assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, path);
      const pageUrl = new URL(path.slice(output.length).replaceAll('\\', '/'), metadata.url);
      for (const [, value] of html.matchAll(/<(?:a|img|script|link|iframe)\b[^>]*?\b(?:href|src)="([^"]+)"/g)) {
        const url = new URL(value.replaceAll('&amp;', '&'), pageUrl);
        if (url.origin !== pageUrl.origin || value.startsWith('#')) continue;
        assert.ok(existsSync(join(output, decodeURIComponent(url.pathname), url.pathname.endsWith('/') ? 'index.html' : '')), `${path}: ${value}`);
      }
    }
    const sitemap = read(site.id, 'sitemap.xml');
    for (const [, url] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) assert.equal(new URL(url).origin, metadata.url);
    assert.ok(read(site.id, 'robots.txt').includes(`${metadata.url}/sitemap.xml`));
    for (const asset of ['styles.css', 'main.js', 'content.css', 'docs.css', 'theme.js']) {
      assert.equal(read(site.id, asset), readFileSync(`shared/public/${asset}`, 'utf8'));
    }
    for (const forbidden of ['docs', 'sites.json', '.env', 'scripts', '_data', 'shared', 'sites']) {
      assert.equal(existsSync(join(output, forbidden)), false, `${site.id}: ${forbidden}`);
    }
  }
  assert.notEqual(read('cascada.dev', 'brand.css'), read('casai.run', 'brand.css'));
  assert.notEqual(read('cascada.dev', 'logo.svg'), read('casai.run', 'logo.svg'));
  for (const path of ['posts', 'blog', 'feed.xml', 'cascada-script', 'images', 'demos']) {
    assert.equal(existsSync(resolve('dist/casai.run', path)), false, path);
  }
  assert.doesNotMatch(read('casai.run', 'index.html'), /Cascada home|Cascada Blog|href="\/feed.xml"|Playground/);
  assert.match(read('cascada.dev', 'feed.xml'), /<title>Cascada Blog<\/title>/);
});

test('building one site cleans only its output, including when launched outside the repository', async (t) => {
  const other = resolve('dist/cascada.dev/build-isolation-marker.txt');
  const stale = resolve('dist/casai.run/stale-page.html');
  writeFileSync(other, 'keep');
  writeFileSync(stale, 'remove');
  t.after(() => { rmSync(other, { force: true }); rmSync(stale, { force: true }); });
  const result = spawnSync(process.execPath, [resolve('scripts/build.mjs'), 'casai.run'], { cwd: resolve('scripts'), encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(other, 'utf8'), 'keep');
  assert.equal(existsSync(stale), false);
  await assert.rejects(cleanSite({ id: 'casai.run', output: 'sites/casai.run' }), /Invalid build output/);
});

test('documentation rendering accepts another repository and route map', () => {
  const { html } = renderDocumentation('[Guide](guide.md#start)\n\n[More](other.md)\n\n[Download](https://raw.githubusercontent.com/example/docs/main/manual/guide.md)', 'abc123', {
    repository: 'https://github.com/example/docs', directory: 'manual',
    documents: { guide: { file: 'guide.md', url: '/guide/' } },
  });
  assert.match(html, /href="\/guide\/#start"/);
  assert.match(html, /href="https:\/\/github.com\/example\/docs\/blob\/abc123\/manual\/other.md"/);
  assert.match(html, /href="\/guide\/README.md"/);
});
