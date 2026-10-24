import MarkdownIt from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';
import markdownItAttrs from 'markdown-it-attrs';

// One Markdown/code-fence pipeline for Eleventy pages and imported documentation.
export function createMarkdownRenderer() {
  const markdown = new MarkdownIt({ html: true })
    .use(markdownItAttrs, { fenceAttrsOnPre: false })
    .use(markdownItAnchor);

  // Keep code IDs/data attributes on <code>, and focus/label attributes on <pre>.
  const renderFence = markdown.renderer.rules.fence;
  markdown.renderer.rules.fence = (tokens, index, options, env, renderer) => {
    const token = tokens[index];
    const attrs = token.attrs;
    const belongsOnPre = ([name]) => name === 'tabindex' || name === 'aria-label';
    const preAttrs = (attrs || []).filter(belongsOnPre);
    if (!preAttrs.length) return renderFence(tokens, index, options, env, renderer);
    token.attrs = attrs.filter((attr) => !belongsOnPre(attr));
    const html = renderFence(tokens, index, options, env, renderer);
    token.attrs = attrs;
    return html.replace('<pre>', `<pre${renderer.renderAttrs({ attrs: preAttrs })}>`);
  };
  return markdown;
}
