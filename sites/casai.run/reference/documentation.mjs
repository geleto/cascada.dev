import { renderDocumentation } from '../../../scripts/docs-render.mjs';
import { basePath } from './state.mjs';
import { escape } from './render.mjs';
import { referenceLink } from './links.mjs';
import { exportReference } from './export-reference.mjs';
export { referenceLink } from './links.mjs';

export const documentationUrl = `${basePath}documentation.md`;
export const readAllUrl = `${basePath}all/`;
const origin = 'https://casai.run';
const marker = id => `<a id="${id}" name="${id}"></a>`;
// One public-URL resolver serves chapters, reference prose and the full export.
// Authored HTTPS links continue to work directly on GitHub.
export function chapterPublication(source, revision) {
  const rendered = renderDocumentation(source, revision, {
    explicitAnchors: true, anchorPrefix: 'guide-', resolveLink: referenceLink, highlight: true,
    isReferenceLink: href => href.startsWith(basePath) && !href.includes('/all/') && !/\.(md|json)(?:#|$)/.test(href),
  });
  const chapters = rendered.headings.filter(h => h.level === 2);
  const navigation = `<details class="ref-chapter-index"><summary>Documentation chapters</summary><nav aria-label="Chapters"><ol>${chapters.map(h => `<li><a href="#${h.slug}">${escape(h.text)}</a></li>`).join('')}</ol></nav></details>`;
  const html = `<div class="container docs-layout ref-guide" data-guide-loaded><aside class="docs-sidebar"><details class="docs-index" open><summary>On this page</summary><nav aria-label="Workflow chapters">${rendered.index}</nav></details></aside><article class="docs-article prose">${rendered.html}</article></div>`;
  return { ...rendered, chapters, navigation, fragment: html };
}

export function completeDocumentation({ source, entries, introduction, provenance, versions }) {
  const reference = exportReference(entries, { source, basePath });
  const { targets } = reference;
  const link = (title, id) => `[${title}](#${id})`;
  const resolve = href => {
    const normalized = referenceLink(href);
    if (!normalized.startsWith(basePath)) return normalized.startsWith('/') ? origin + normalized : normalized;
    const url = new URL(normalized, origin);
    if (url.pathname === readAllUrl || url.pathname === documentationUrl) return url.hash || '#ref-introduction';
    if (url.hash.startsWith('#guide-')) return url.hash;
    if (url.pathname === basePath) return url.hash === '#component-factories' ? '#ref-components' : '#ref-introduction';
    const path = url.pathname.replace(/(?:README\.md|reference\.json)$/, '');
    const target = targets.get(path + url.hash) || (!url.hash ? targets.get(path) : null);
    if (target) return '#'+target;
    // Indexes, provenance and licensed source files remain public resources.
    if (/\.(?:json|md|txt)$|\/forms\/$/.test(path)) return origin+normalized;
    throw new Error(`Unresolved full-document reference: ${href}`);
  };
  const rewrite = markdown => {
    let fence = null;
    return markdown.split('\n').map(line => {
      const delimiter = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
      if (delimiter) {
        if (!fence) fence = delimiter[1];
        else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length && !delimiter[2].trim()) fence = null;
        return line;
      }
      return fence ? line : line.replace(/\]\(([^)]+)\)/g, (_, href) => `](${resolve(href)})`);
    }).join('\n');
  };
  const intro = `${marker('ref-introduction')}

## Introduction

${introduction.lead}

` + introduction.principles.map(p => `- **${p.title}:** ${p.summary}`).join('\n');
  const chapters = chapterPublication(source, provenance.commit).chapters;
  const contents = [link('Introduction', 'ref-introduction'), ...chapters.map(c => link(c.text, c.slug)), link('Component reference', 'ref-components'), link('Source modifiers', 'ref-sources'), link('Shared properties', 'ref-properties'), link('Calls and methods', 'ref-methods'), link('Types and result fields', 'ref-contracts')];
  let full = `# Casai documentation

[Interactive documentation](${origin}${basePath}) - [Read all HTML](${origin}${readAllUrl})

**Versions:** ${Object.entries(versions).map(([name, v]) => `${name} ${v}`).join(', ')}

**Source revision:** ${provenance.commit}${provenance.modified ? ' (includes local changes)' : ''}. [Exact snapshot and file hashes](${origin}${basePath}source.json).

`;
  full += contents.map(c => '- '+c).join('\n') + '\n\n' + intro + '\n\n' + source.replace(/^# .+\n+/, '') + '\n\n';
  full += reference.markdown;
  full += `

[Sources, attributions and licenses](${origin}${basePath}notices/THIRD_PARTY.md)
`;
  const publication = rewrite(full)
    .replace('[Interactive documentation](#ref-introduction)', `[Interactive documentation](${origin}${basePath})`)
    .replace('[Read all HTML](#ref-introduction)', `[Read all HTML](${origin}${readAllUrl})`);
  return { markdown: publication, targets, resolveLink: resolve, examples: reference.examples, propertyNames: reference.propertyNames, methodNames: reference.methodNames };
}
