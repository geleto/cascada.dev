import { posix } from 'node:path';
import { createMarkdownRenderer } from './markdown.mjs';

const markdown = createMarkdownRenderer();
const escapeHtml = markdown.utils.escapeHtml;
const plainText = (html) => markdown.utils.unescapeAll(html.replace(/<[^>]*>/g, ''));

// Preserve the heading URLs from Cascada's original scripts/docs-gen.js.
function slugifyHeading(value, counts) {
  const base = plainText(value).toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '') || 'section';
  const count = counts.get(base) || 0;
  counts.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

function localLink(href, revision, options) {
  // These two source links retain punctuation that the original generator stripped.
  if (href === '#sequential-execution-with-' || href === '#repairing-sequential-paths-with-') return href.slice(0, -1);
  const { repository, directory, documents = {}, linkAliases = {} } = options;
  const [, path, suffix = ''] = href.match(/^([^?#]*)(.*)$/);
  const alias = linkAliases[path.replace(/\/$/, '')];
  if (alias) return alias + suffix;
  const repositoryPath = repository?.replace('https://github.com/', '');
  for (const document of Object.values(documents)) {
    const source = path.startsWith(`${repository}/blob/`) && path.slice(`${repository}/blob/`.length).replace(/^[^/]+\//, '') === `${directory}/${document.file}`;
    if (source) return document.url + suffix;
    const rawPrefix = `https://raw.githubusercontent.com/${repositoryPath}/`;
    const download = path.startsWith(rawPrefix) && path.slice(rawPrefix.length).replace(/^refs\/heads\//, '').replace(/^[^/]+\//, '') === `${directory}/${document.file}`;
    if (download) return document.url + 'README.md' + suffix;
    if (path.replace(/^\.\//, '') === document.file) return document.url + suffix;
  }
  if (!href || /^[#/]|^[a-z][a-z\d+.-]*:/i.test(href)) return href;
  if (!repository || !directory) return href;
  return `${repository}/blob/${revision}/${posix.normalize(posix.join(directory, path))}${suffix}`;
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

export function renderDocumentation(source, revision = 'master', options = {}) {
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
      if (child.type === 'link_open') child.attrSet('href', localLink(child.attrGet('href'), revision, options));
      if (child.type === 'image') child.attrSet('src', localLink(child.attrGet('src'), revision, options));
    }
  }
  return { html: markdown.renderer.render(tokens, markdown.options, {}), index: buildSidebar(headings), headings };
}
