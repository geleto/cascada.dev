import { basePath } from './state.mjs';

// The same finite route catalog drives Apache and the local preview. Form URLs
// are application state, not separately published copies of the documentation.
export function createReferenceRoutes(selections) {
  const ids = selections.map(selection => selection.id.toLowerCase());
  if (ids.some(id => !/^[a-z0-9_]+$/.test(id))) throw new Error('Invalid reference route ID.');
  const known = new Set(ids);
  const voiceSuffixes = ids.filter(id => id.startsWith('voiceagentbackend')).map(id => id.slice('voiceagentbackend'.length));
  const collectedSources = ['withscript', 'withfunction', 'loadscript'].filter(source => known.has(`transcriber_${source}_astool`));
  const aliases = new Map([
    ...voiceSuffixes.map(suffix => [`voicesessionsetup${suffix}`, `voiceagentbackend${suffix}`]),
    ...collectedSources.map(source => [`transcriber_${source}_asstream_astool`, `transcriber_${source}_astool`]),
  ]);
  const legacy = '/documentation/quick-reference';
  function resolve(url) {
    if (url.pathname === legacy || url.pathname.startsWith(legacy + '/')) {
      return { status: 301, location: basePath.slice(0, -1) + (url.pathname.slice(legacy.length) || '/') + url.search };
    }
    if (!url.pathname.startsWith(basePath)) return null;
    const [id, file = '', extra] = url.pathname.slice(basePath.length).split('/');
    if (aliases.has(id) && extra === undefined && ['', 'README.md', 'reference.json', 'index.html'].includes(file)) {
      return { status: 301, location: `${basePath}${aliases.get(id)}/${file}${url.search}` };
    }
    if (!known.has(id) || extra !== undefined) return null;
    if (file === 'README.md' || file === 'reference.json') {
      return { status: 301, location: `${basePath}${id}/?download=${file === 'README.md' ? 'md' : 'json'}${url.search ? '&' + url.search.slice(1) : ''}` };
    }
    if (file && file !== 'index.html') return null;
    if (!url.pathname.endsWith('/') && file !== 'index.html') return { status: 301, location: `${basePath}${id}/${url.search}` };
    return { file: basePath.slice(1) + 'index.html', contentType: 'text/html; charset=utf-8' };
  }
  // Exact known IDs keep unrelated files and invalid form URLs out of the app.
  const forms = `(${ids.join('|')})`;
  const prefix = basePath.slice(1);
  const aliasRules = [
    voiceSuffixes.length ? `RewriteRule ^${prefix}voicesessionsetup(${voiceSuffixes.join('|')})(?:/(index\\.html|README\\.md|reference\\.json)?)?$ ${basePath}voiceagentbackend$1/$2 [R=301,END]` : '',
    collectedSources.length ? `RewriteRule ^${prefix}transcriber_(${collectedSources.join('|')})_asstream_astool(?:/(index\\.html|README\\.md|reference\\.json)?)?$ ${basePath}transcriber_$1_astool/$2 [R=301,END]` : '',
  ].filter(Boolean).join('\n');
  const apache = `# All component forms share the reference page and data bundle.
RewriteEngine On
${aliasRules}
RewriteRule ^${prefix}${forms}/README\\.md$ ${basePath}$1/?download=md [R=301,END,QSA]
RewriteRule ^${prefix}${forms}/reference\\.json$ ${basePath}$1/?download=json [R=301,END,QSA]
RewriteRule ^${prefix}${forms}$ ${basePath}$1/ [R=301,END]
RewriteRule ^${prefix}${forms}/(?:index\\.html)?$ ${prefix}index.html [END]
`;
  return { resolve, apache, aliases };
}
