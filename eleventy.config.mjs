import { readFileSync } from 'node:fs';
import { createMarkdownRenderer } from './scripts/markdown.mjs';
import { selectSites } from './scripts/sites.mjs';
import pluginRss from '@11ty/eleventy-plugin-rss';

export default function (eleventyConfig) {
  const site = selectSites(process.env.WEBSITE || 'cascada.dev')[0];
  const input = site.input;
  eleventyConfig.addPlugin(pluginRss);
  eleventyConfig.setLibrary('md', createMarkdownRenderer());
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
