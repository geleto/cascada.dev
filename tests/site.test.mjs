import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const output = resolve('dist');
const read = (path) => readFileSync(join(output, path), 'utf8');
const posts = [
  'cascada-script-intro', 'cascada-kitchen-chef',
  'everything-everywhere-all-at-once', 'implicit-async-programming',
];
function htmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}
const pages = htmlFiles(output).filter((path) => !path.endsWith('headphones-animation.html'));

test('all pages share the menu, assets, and one primary heading', () => {
  const nav = JSON.parse(readFileSync('_data/site.json', 'utf8')).navigation;
  for (const path of pages) {
    const html = readFileSync(path, 'utf8');
    const menu = html.match(/<nav id="primary-nav"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(menu, path);
    for (const item of nav) assert.ok(menu.includes(`href="${item.url}"`), `${path}: ${item.title}`);
    assert.match(html, /<script src="\/main.js" defer>/);
    assert.match(html, /<link rel="stylesheet" href="\/styles.css">/);
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, path);
  }
});

test('generated pages have no broken local links or media', () => {
  for (const path of pages) {
    const html = readFileSync(path, 'utf8');
    const pageUrl = new URL(path.slice(output.length).replaceAll('\\', '/'), 'https://cascada.dev');
    for (const [, value] of html.matchAll(/<(?:a|img|script|link|iframe)\b[^>]*?\b(?:href|src)="([^"]+)"/g)) {
      const url = new URL(value.replaceAll('&amp;', '&'), pageUrl);
      if (url.origin !== pageUrl.origin || value.startsWith('#')) continue;
      const target = join(output, decodeURIComponent(url.pathname), url.pathname.endsWith('/') ? 'index.html' : '');
      assert.ok(existsSync(target), `${path}: missing ${value}`);
    }
  }
});

test('every page supplies the shared appearance control and initializes it before CSS', () => {
  assert.ok(existsSync(join(output, 'theme.js')));
  for (const path of pages) {
    const html = readFileSync(path, 'utf8');
    const initializer = html.indexOf('<script src="/theme.js"></script>');
    assert.ok(initializer > 0 && initializer < html.indexOf('<link rel="stylesheet"'), path);
    const footer = html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0];
    assert.match(footer, /<legend class="visually-hidden">Appearance<\/legend>/);
    for (const value of ['light', 'dark', 'auto']) {
      assert.match(footer, new RegExp(`type="radio" name="theme" value="${value}"`));
    }
    assert.match(footer, /value="auto" checked/);
  }
  assert.match(read('headphones-animation.html'), /<script src="\.\/theme.js"><\/script>/);
});

test('authored posts appear in the blog and feed, without the excluded imports', () => {
  const blog = read('blog/index.html');
  const feed = read('feed.xml');
  const authoredPosts = readdirSync('posts').filter((file) => file.endsWith('.md')).map((file) => file.slice(0, -3));
  assert.equal((blog.match(/class="post-summary"/g) || []).length, authoredPosts.length);
  assert.equal((feed.match(/<entry>/g) || []).length, authoredPosts.length);
  for (const slug of authoredPosts) {
    assert.ok(blog.includes(`/posts/${slug}/`), slug);
    assert.ok(feed.includes(`https://cascada.dev/posts/${slug}/`), slug);
  }
  assert.doesNotMatch(blog + feed, /cascada-ai-development|semachunk-semantic-chunking|geleto\.github\.io\/posts\//);
  assert.equal(existsSync(join(output, 'docs')), false);
  assert.equal(existsSync(join(output, 'README')), false);
});

test('articles have no header images; the Kitchen Chef image is in its body', () => {
  for (const slug of posts) {
    const html = read(`posts/${slug}/index.html`);
    const header = html.match(/<header class="article-header">[\s\S]*?<\/header>/)[0];
    assert.doesNotMatch(header, /<img/);
    assert.doesNotMatch(html, /\/images\/headers\//);
    if (slug === 'cascada-kitchen-chef') {
      assert.match(html, /<div class="prose">[\s\S]*?<img src="\/images\/posts\/kitchen-chef.png"/);
    } else {
      assert.doesNotMatch(html, /<img/);
    }
  }
});

test('homepage preserves literal Cascada templates and interactive examples', () => {
  const home = read('index.html');
  assert.ok(home.includes('{{ topic }}'));
  assert.ok(home.includes('{% for url in urls %}'));
  assert.ok(home.includes('Model: {{ product }}'));
  assert.ok(home.includes('product: z.string()'));
  assert.equal((home.match(/class="example-tablist"/g) || []).length, 2);
  assert.equal((home.match(/src="\.\/headphones-animation.html\?embedded=1"/g) || []).length, 2);
  assert.doesNotMatch(home, /href="\/content.css"/);
});
