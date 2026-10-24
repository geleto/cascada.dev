import { posix } from 'node:path';
import { createMarkdownRenderer } from './markdown.mjs';

const markdown = createMarkdownRenderer();
const escapeHtml = markdown.utils.escapeHtml;
const plainText = (html) => markdown.utils.unescapeAll(html.replace(/<[^>]*>/g, ''));
const routes = { script: '/cascada-script/', template: '/cascada-template/' };

// Preserve the heading URLs from Cascada's original scripts/docs-gen.js.
function slugifyHeading(value, counts) {
  const base = plainText(value).toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '') || 'section';
  const count = counts.get(base) || 0;
  counts.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

function localLink(href, revision) {
  // These two source links retain punctuation that the original generator stripped.
  if (href === '#sequential-execution-with-' || href === '#repairing-sequential-paths-with-') return href.slice(0, -1);
  const published = href.match(/^https:\/\/geleto\.github\.io\/cascada-script\/?([?#].*)?$/);
  if (published) return routes.script + (published[1] || '');
  const source = href.match(/^https:\/\/github\.com\/geleto\/cascada\/blob\/[^/]+\/docs\/cascada\/(script|template)\.md([?#].*)?$/);
  if (source) return routes[source[1]] + (source[2] || '');
  const download = href.match(/^https:\/\/raw\.githubusercontent\.com\/geleto\/cascada\/(?:refs\/heads\/)?[^/]+\/docs\/cascada\/(script|template)\.md$/);
  if (download) return routes[download[1]] + 'README.md';
  const post = href.match(/^https:\/\/geleto\.github\.io\/posts\/(cascada-script-intro|cascada-kitchen-chef|everything-everywhere-all-at-once|implicit-async-programming)\/?(#[^\s]*)?$/);
  if (post) return `/posts/${post[1]}/${post[2] || ''}`;
  if (!href || /^[#/]|^[a-z][a-z\d+.-]*:/i.test(href)) return href;
  const relative = href.match(/^(?:\.\/)?(script|template)\.md([?#].*)?$/);
  if (relative) return routes[relative[1]] + (relative[2] || '');
  const [, file, suffix = ''] = href.match(/^([^?#]*)(.*)$/);
  return `https://github.com/geleto/cascada/blob/${revision}/${posix.normalize(posix.join('docs/cascada', file))}${suffix}`;
}

// The original generator's nested H2/H3 index, using the shared renderer's tokens.
function buildSidebar(headings) {
  let html = '<ul>';
  let section = false;
  let subsection = false;
  for (const heading of headings.filter(({ level }) => level === 2 || level === 3)) {
    const label = escapeHtml(heading.text);
    const link = `<a href="#${heading.slug}" title="${label}">${label}</a>`;
    if (heading.level === 2) {
      if (subsection) { html += '</ul>'; subsection = false; }
      if (section) html += '</li>';
      html += `<li>${link}`;
      section = true;
    } else {
      if (!section) { html += '<li>'; section = true; }
      if (!subsection) { html += '<ul>'; subsection = true; }
      html += `<li>${link}</li>`;
    }
  }
  if (subsection) html += '</ul>';
  if (section) html += '</li>';
  return `${html}</ul>\n`;
}

export function renderDocumentation(source, revision = 'master') {
  // The site layout supplies the title. All Cascada template syntax stays literal.
  const tokens = markdown.parse(source.replace(/^#\s+.+\r?\n/, ''), {});
  const headings = [];
  const counts = new Map();
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === 'heading_open') {
      const inline = tokens[index + 1];
      const slug = slugifyHeading(inline.content, counts);
      token.attrSet('id', slug);
      headings.push({ level: Number(token.tag.slice(1)), slug,
        text: plainText(markdown.renderer.renderInline(inline.children, markdown.options, {})) });
    }
    for (const child of token.children || []) {
      if (child.type === 'link_open') child.attrSet('href', localLink(child.attrGet('href'), revision));
      if (child.type === 'image') child.attrSet('src', localLink(child.attrGet('src'), revision));
    }
  }
  return { html: markdown.renderer.render(tokens, markdown.options, {}), index: buildSidebar(headings), headings };
}
