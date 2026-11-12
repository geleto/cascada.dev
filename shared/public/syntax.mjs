// Shared by the website snippets and the matrix's static and live renderers.
// Tokenize source text only; escaping happens before any HTML is returned.
const pattern = /(?<comment>\/\/[^\n]*|\/\*[\s\S]*?\*\/|\{#[\s\S]*?#\})|(?<string>"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`)|(?<delimiter>\{%[-+]?|[-+]?%\}|\{\{[-+]?|[-+]?\}\})|\b(?<keyword>function|endfunction|if|else|elif|endif|return|for|endfor|each|endeach|var|let|data|in|of|is|error|const|new|async|await|type|interface|export|import|as|from|set|macro|endmacro|block|endblock|extends|include|true|false|null|undefined|throw|try|catch|finally)\b|\b(?<number>\d+(?:\.\d+)?)\b|\b(?<function>[A-Za-z_$][\w$]*)(?=\s*\()/g;
const escape = text => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function* tokenize(source, language = '') {
  let end = 0;
  if (!['text', 'plaintext', 'txt'].includes(language)) {
    for (const match of source.matchAll(pattern)) {
      if (match.index > end) yield { text: source.slice(end, match.index), type: null };
      const type = Object.keys(match.groups).find(key => match.groups[key] !== undefined);
      yield { text: match[0], type };
      end = match.index + match[0].length;
    }
  }
  if (end < source.length) yield { text: source.slice(end), type: null };
}

export function highlight(source, language) {
  return [...tokenize(source, language)].map(({ text, type }) => type
    ? `<span class="token-${type}">${escape(text)}</span>` : escape(text)).join('');
}
