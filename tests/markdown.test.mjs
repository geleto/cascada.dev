import assert from 'node:assert/strict';
import test from 'node:test';
import { createMarkdownRenderer } from '../scripts/markdown.mjs';

test('mixed Markdown and HTML preserve layout hooks and accessible code samples', () => {
  const html = createMarkdownRenderer().render([
    '<section class="feature" aria-labelledby="example-title">',
    '<div class="feature-copy">', '',
    '## Example {#example-title}', '',
    '**Important** text with a [link](/cascada-script/).', '{.lead}', '',
    '- One', '- Two', '{.feature-list}', '',
    '</div>', '<figure class="code-panel">', '',
    '```cascada {#example-code data-language="cascada" data-code-source="shared-code" tabindex="0" aria-label="Example code"}',
    '{% for item in items %}', '{{ item.name }} < & >', '{% endfor %}',
    '```', '', '</figure>', '</section>',
  ].join('\n'));
  assert.match(html, /<section class="feature" aria-labelledby="example-title">/);
  assert.match(html, /<h2 id="example-title"[^>]*>Example<\/h2>/);
  assert.match(html, /<p class="lead"><strong>Important<\/strong> text with a <a href="\/cascada-script\/">link<\/a>\.<\/p>/);
  assert.match(html, /<ul class="feature-list">/);
  assert.match(html, /<pre tabindex="0" aria-label="Example code">/);
  assert.match(html, /<code id="example-code" data-language="cascada" data-code-source="shared-code" class="language-cascada">/);
  assert.ok(html.includes('{% for item in items %}\n{{ item.name }} &lt; &amp; &gt;\n{% endfor %}'));
  assert.doesNotMatch(html, /<code[^>]*(?:tabindex|aria-label)=/);
});
