import { readFileSync } from 'node:fs';
import { createMarkdownRenderer } from './scripts/markdown.mjs';
import pluginRss from '@11ty/eleventy-plugin-rss';

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(pluginRss);
  eleventyConfig.setLibrary('md', createMarkdownRenderer());
  eleventyConfig.addShortcode('documentation', (name) => {
    if (!['script', 'script-index', 'template', 'template-index'].includes(name)) throw new Error('Unknown documentation fragment');
    return readFileSync(new URL(`./docs/generated/${name}.html`, import.meta.url), 'utf8');
  });
  eleventyConfig.addWatchTarget('./docs/generated/');
  eleventyConfig.addPassthroughCopy({
    'docs/source/script.md': 'cascada-script/README.md',
    'docs/source/template.md': 'cascada-template/README.md',
  });

  for (const path of ['README.md', 'docs/**', 'scripts/**', 'tests/**', 'headphones-animation.html']) {
    eleventyConfig.ignores.add(path);
  }
  for (const path of ['styles.css', 'content.css', 'docs.css', 'main.js', 'theme.js', 'logo.svg', 'headphones-animation.html', 'images']) {
    eleventyConfig.addPassthroughCopy(path);
  }

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

  eleventyConfig.setServerOptions({ port: 3000 });

  return {
    dir: { input: '.', output: 'dist', includes: '_includes', data: '_data' },
    templateFormats: ['html', 'md', 'njk'],
    // Code samples containing {{ ... }} and {% ... %} must stay literal.
    // Nunjucks still renders layouts and explicit .njk templates.
    htmlTemplateEngine: false,
    markdownTemplateEngine: false,
  };
}
