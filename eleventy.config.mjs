import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { createMarkdownRenderer } from './scripts/markdown.mjs';
import { highlight } from './shared/public/syntax.mjs';
import { projectRoot, selectSites } from './scripts/sites.mjs';
import pluginRss from '@11ty/eleventy-plugin-rss';

export default async function (eleventyConfig) {
  const site = selectSites(process.env.WEBSITE || 'cascada.dev')[0];
  const input = site.input;
  eleventyConfig.addGlobalData('siteId', site.id);
  // Some static hosts omit a JavaScript MIME type for .mjs files. Ship the
  // shared browser code and its imports as one .js asset so navigation starts
  // without a separate module request. Hash it to refresh cached clients.
  const browser = await build({
    entryPoints: [resolve(projectRoot, 'shared/public/main.js')], bundle: true,
    write: false, format: 'esm', platform: 'browser', target: ['es2020'],
    minify: true, legalComments: 'eof',
  });
  const bytes = browser.outputFiles[0].contents;
  const filename = `main-${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.js`;
  const cache = resolve(projectRoot, '.cache/site-assets', site.id);
  mkdirSync(cache, { recursive: true });
  const asset = resolve(cache, filename);
  writeFileSync(asset, bytes);
  const mainScriptUrl = `/assets/${filename}`;
  eleventyConfig.addPassthroughCopy({ [asset]: mainScriptUrl });
  eleventyConfig.addGlobalData('mainScriptUrl', mainScriptUrl);
  for (const source of ['main.js', 'syntax.mjs']) {
    eleventyConfig.addWatchTarget(`./shared/public/${source}`, { resetConfig: true });
  }
  eleventyConfig.addPlugin(pluginRss);
  const markdown = createMarkdownRenderer();
  // Ship colored code in the page HTML, before browser enhancements run.
  markdown.set({ highlight });
  eleventyConfig.setLibrary('md', markdown);
  // Shared examples are rendered at build time, including literal template syntax.
  eleventyConfig.addShortcode('codeExample', (name, caption, label, id = '') => {
    if (!/^[\w-]+\.(?:ts|js|cas)$/.test(name)) throw new Error(`Invalid example: ${name}`);
    const source = readFileSync(new URL(`./shared/examples/${name}`, import.meta.url), 'utf8').trimEnd();
    const language = name.endsWith('.cas') ? 'cascada' : name.endsWith('.ts') ? 'typescript' : 'javascript';
    const escape = markdown.utils.escapeHtml;
    const scriptDocs = site.id === 'cascada.dev' ? '/cascada-script/' : 'https://cascada.dev/cascada-script/';
    const captionHtml = escape(caption).replace(/^CascadaScript\b/, `<a href="${scriptDocs}">CascadaScript</a>`);
    const code = '```' + language + ` {tabindex="0" aria-label="${escape(label)}"${id ? ` id="${escape(id)}"` : ''} data-language="${language}"}\n${source}\n` + '```';
    // Emit a fence for the page's Markdown pass, so blank lines and indentation
    // survive without processing already-rendered <pre> HTML a second time.
    return `<figure class="code-panel">\n<figcaption><span>${captionHtml}</span><button class="copy-button" type="button" aria-label="Copy ${escape(label)}" hidden>Copy</button></figcaption>\n\n${code}\n\n</figure>`;
  });
  eleventyConfig.addShortcode('documentation', (name) => {
    const allowed = Object.keys(site.documentation?.documents || {}).flatMap((name) => [name, `${name}-index`]);
    if (!allowed.includes(name)) throw new Error(`Unknown documentation fragment for ${site.id}: ${name}`);
    return readFileSync(new URL(`./${input}/docs/generated/${name}.html`, import.meta.url), 'utf8');
  });
  eleventyConfig.addWatchTarget('./shared/');
  eleventyConfig.addWatchTarget('./sites.json');
  eleventyConfig.addWatchTarget(`./${input}/docs/generated/`);
  for (const [name, document] of Object.entries(site.documentation?.documents || {})) {
    eleventyConfig.addPassthroughCopy({ [`${input}/docs/source/${name}.md`]: `${document.url.slice(1)}README.md` });
  }
  for (const path of ['docs/**', 'public/**', 'README.md', '.env', '.env.*']) eleventyConfig.ignores.add(`${input}/${path}`);
  eleventyConfig.addPassthroughCopy({ 'shared/public': '/', [`${input}/public`]: '/' });

  // Virtual entry points keep the generated pages shared while each build has
  // its own content, data cascade, post collection, URLs, and output directory.
  const entries = {
    'blog.njk': { title: 'Blog', layout: 'layouts/base.njk', permalink: (data) => data.site.blog ? '/blog/' : false },
    'feed.njk': { layout: false, permalink: (data) => data.site.blog ? '/feed.xml' : false, eleventyExcludeFromCollections: true },
    'sitemap.njk': { layout: false, permalink: '/sitemap.xml', eleventyExcludeFromCollections: true },
    'robots.njk': { layout: false, permalink: '/robots.txt', eleventyExcludeFromCollections: true },
    '404.njk': { title: 'Page not found', layout: 'layouts/page.njk', permalink: '/404.html', eleventyExcludeFromCollections: true },
  };
  for (const [name, data] of Object.entries(entries)) {
    eleventyConfig.addTemplate(name, `{% include "pages/${name}" %}`, data);
  }
  eleventyConfig.addCollection('posts', (collection) => collection.getFilteredByTag('posts'));

  eleventyConfig.addFilter('readableDate', (date) => new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(date));
  eleventyConfig.addFilter('isoDate', (date) => new Date(date).toISOString());
  eleventyConfig.addFilter('excerpt', (html) => {
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length <= 200) return text;
    const wordBoundary = text.lastIndexOf(' ', 200);
    return text.slice(0, wordBoundary > 0 ? wordBoundary : 200) + '…';
  });
  eleventyConfig.addFilter('readingTime', (html) => {
    const words = html.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words / 220));
  });

  eleventyConfig.setServerOptions({ port: site.port });

  return {
    dir: { input, output: site.output, includes: '../../shared/_includes', data: '_data' },
    templateFormats: ['html', 'md', 'njk'],
    // Code samples containing {{ ... }} and {% ... %} must stay literal.
    // Nunjucks still renders layouts and explicit .njk templates.
    htmlTemplateEngine: false,
    markdownTemplateEngine: false,
  };
}
