import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { components } from '../sites/casai.run/docs/matrix/matrix.js';

const output = resolve('dist/cascada.dev');
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
const pages = htmlFiles(output).filter((path) => !path.endsWith('headphones-workflow.html'));

test('all pages share the menu, assets, and one primary heading', () => {
  const nav = JSON.parse(readFileSync('sites/cascada.dev/_data/site.json', 'utf8')).navigation;
  for (const path of pages) {
    const html = readFileSync(path, 'utf8');
    const menu = html.match(/<nav id="primary-nav"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(menu, path);
    for (const item of nav) assert.ok(menu.includes(`href="${item.url}"`), `${path}: ${item.title}`);
    assert.match(html, /<script src="\/assets\/main-[a-f\d]{16}\.js" type="module">/);
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
  assert.match(read('demos/headphones-workflow.html'), /<script src="\/theme.js"><\/script>/);
});

test('authored posts appear in the blog and feed, without the excluded imports', () => {
  const blog = read('blog/index.html');
  const feed = read('feed.xml');
  const authoredPosts = readdirSync('sites/cascada.dev/posts').filter((file) => file.endsWith('.md')).map((file) => file.slice(0, -3));
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

test('the public contact address is absent from static pages and scripts', () => {
  const address = ['info', 'cascada.dev'].join('@');
  const scripts = readdirSync(output).filter((file) => file.endsWith('.js')).map((file) => join(output, file));
  for (const path of [...pages, ...scripts]) {
    assert.ok(!readFileSync(path, 'utf8').includes(address), `${path}: contact address exposed in plain text`);
  }
  const about = read('about/index.html');
  assert.doesNotMatch(about, /href="mailto:/);
  assert.match(about, /connect on <a href="https:\/\/www\.linkedin\.com\/in\/angel-popov\/">LinkedIn<\/a>/);
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
  assert.ok(existsSync('sites/cascada.dev/pages/index.md'), 'the homepage is authored in Markdown');
  for (const id of ['hero', 'why', 'simple', 'concurrent', 'results', 'errors', 'sequential', 'javascript', 'templates', 'casai', 'start']) {
    assert.match(home, new RegExp(`<h[12] id="${id}-title"`), `stable ${id} heading`);
  }
  assert.equal((home.match(/<pre tabindex="0" aria-label="[^"]+">/g) || []).length, 11, 'code examples keep their labels and keyboard access');
  assert.match(home, /<p class="tagline"><strong>/);
  assert.match(home, /<ol class="workflow-steps">/);
  assert.match(home, /<ul class="feature-list">/);
  const source = [...new JSDOM(home).window.document.querySelectorAll('pre code')].map(code => code.textContent).join('\n');
  assert.ok(source.includes('{{ topic }}'));
  assert.ok(source.includes('{% for url in urls %}'));
  assert.ok(source.includes('Model: {{ product }}'));
  assert.ok(source.includes('product: z.string()'));
  assert.equal((home.match(/class="example-tablist"/g) || []).length, 2);
  assert.equal((home.match(/src="\/demos\/headphones-workflow.html\?embedded=1"/g) || []).length, 2);
  assert.doesNotMatch(home, /href="\/content.css"/);
});

test('homepages share current examples and Casai publishes the canonical component summaries', () => {
  const cascada = new JSDOM(read('index.html')).window.document;
  const casai = new JSDOM(readFileSync('dist/casai.run/index.html', 'utf8')).window.document;
  for (const [id, file] of [['headphones-code', 'headphones.cas'], ['casai-components-code', 'headphones.ts']]) {
    const source = readFileSync(`shared/examples/${file}`, 'utf8').replace(/\r\n/g, '\n').trimEnd();
    for (const document of [cascada, casai]) assert.equal(document.getElementById(id).textContent.trimEnd(), source);
  }
  const entries = [...casai.querySelectorAll('[data-simple-matrix] .ref-component-grid [data-component-choice]')];
  const catalog = components.filter(component => ['configuration', 'component'].includes(component.kind));
  assert.equal(entries.length, catalog.length);
  assert.equal(entries[0].dataset.componentChoice, 'Config');
  assert.equal(casai.querySelector('.component-config'), null);
  for (const component of catalog) {
    const entry = entries.find(entry => entry.dataset.componentChoice === component.name);
    assert.ok(entry, component.name);
    assert.equal(entry.textContent, component.name);
    assert.equal(entry.title, component.shortDescription);
  }
  assert.equal(casai.querySelector('[data-simple-heading] .ref-description').textContent, catalog.find(component => component.name === 'LLMAgent').shortDescription);
  assert.equal(casai.querySelector('.ref-customize').open, false);
  assert.ok(![...casai.querySelectorAll('h3')].some(heading => heading.textContent === 'Use tools across components'));
  const toolSection = [...casai.querySelectorAll('h3')].find(heading => heading.textContent === 'Turn a component into a tool').closest('.feature-copy');
  assert.match(toolSection.textContent, /Use these tools alongside AI SDK tools and MCP tools/);
  for (const document of [cascada, casai]) {
    for (const code of document.querySelectorAll('code.language-cascada, code.language-typescript')) {
      assert.ok(code.querySelector('.token-keyword'), 'code is highlighted before JavaScript runs');
      assert.ok(code.querySelector('.token-function'), 'function calls have a distinct syntax color');
    }
    assert.doesNotMatch(document.body.textContent, /TextGenerator|headphones\.csc|\{% codeExample/);
    const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
    assert.equal(ids.length, new Set(ids).size, 'homepage IDs are unique');
    for (const link of document.querySelectorAll('a[href^="#"]')) assert.ok(document.getElementById(link.hash.slice(1)), link.href);
  }
});
