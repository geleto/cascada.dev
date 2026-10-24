import MarkdownIt from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';

// One Markdown/code-fence pipeline for Eleventy pages and imported documentation.
export function createMarkdownRenderer() {
  return new MarkdownIt({ html: true }).use(markdownItAnchor);
}
