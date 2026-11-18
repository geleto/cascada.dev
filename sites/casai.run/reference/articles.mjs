import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderDocumentation } from '../../../scripts/docs-render.mjs';
import { escape } from './render.mjs';
import { referenceLink } from './links.mjs';

// Article prose and checked examples travel in the canonical Casai snapshot.
// The website owns their blog URLs, presentation and placement after the matrix.
export async function configureArticles(eleventy, siteRoot, revision) {
  const directory = resolve(siteRoot, 'docs/matrix/articles');
  const articles = JSON.parse(await readFile(resolve(directory, 'index.json'), 'utf8'));
  for (const article of articles) {
    const source = await readFile(resolve(directory, `${article.slug}.md`), 'utf8');
    const { html } = renderDocumentation(source, revision, { resolveLink: referenceLink, highlight: true });
    const sourceUrl = `https://github.com/geleto/casai/blob/master/docs/matrix/articles/${article.slug}.md`;
    eleventy.addTemplate(`posts/${article.slug}.html`, html + `<p class="article-source"><a href="${sourceUrl}">Article source and checked examples</a></p>`, {
      layout: 'layouts/post.njk', title: article.title, description: article.description,
      date: new Date(`${article.date}T00:00:00Z`), tags: ['posts', ...article.tags], isPost: true,
      permalink: `/posts/${article.slug}/`,
    });
  }
  return `<aside class="ref-articles" data-workflow-articles aria-labelledby="ref-articles-title"><h2 id="ref-articles-title">Workflow articles</h2><ul>${articles.map(article => `<li><a href="/posts/${article.slug}/">${escape(article.title)}</a><p>${escape(article.description)}</p></li>`).join('')}</ul></aside>`;
}
