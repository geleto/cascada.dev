import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Called after every Casai publish; also usable independently for release checks.
export async function verifyReferenceRelease(origin = 'https://casai.run', { fetch: request = globalThis.fetch, log = console.log } = {}) {
  const base = new URL(origin).origin;
  const old = '/documentation/quick-reference';
  const current = '/documentation/reference';
  const cases = ['', '/', '/llmagent/?view=config&options=asTool', '/llmagent/README.md?download=1', '/llmagent/reference.json', '/index.json', '/forms/'];
  for (const suffix of cases) {
    const source = `${base}${old}${suffix}`;
    const expected = `${base}${current}${suffix || '/'}`;
    const response = await request(source, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (response.status !== 301) throw new Error(`Legacy documentation must return 301, received ${response.status}: ${source}`);
    const location = response.headers.get('location');
    if (!location || new URL(location, source).href !== expected) throw new Error(`Unexpected redirect destination for ${source}: ${location}`);
    let destination = await request(expected, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const exportUrl = new URL(expected);
    const format = exportUrl.pathname.endsWith('/README.md') ? 'md' : exportUrl.pathname.endsWith('/reference.json') ? 'json' : null;
    if (format) {
      const download = `${exportUrl.origin}${exportUrl.pathname.replace(/(?:README\.md|reference\.json)$/, '')}?download=${format}${exportUrl.search ? '&' + exportUrl.search.slice(1) : ''}`;
      if (destination.status !== 301 || new URL(destination.headers.get('location') || '', expected).href !== download) {
        throw new Error(`Legacy form export must redirect to its generated download: ${expected}`);
      }
      destination = await request(download, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    }
    if (destination.status !== 200) throw new Error(`Documentation destination returned ${destination.status}: ${expected}`);
    await destination.arrayBuffer();
  }
  for (const suffix of ['/all/', '/documentation.md']) {
    const url = `${base}${current}${suffix}`;
    const response = await request(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (response.status !== 200) throw new Error(`Complete documentation returned ${response.status}: ${url}`);
    const content = await response.text();
    if (!content.includes('guide-first-workflow') || !content.includes('ref-components')) throw new Error(`Complete documentation is missing expected chapters or API forms: ${url}`);
  }
  for (const [retired, replacement] of [
    ['voicesessionsetup_withscript_webrtc', 'voiceagentbackend_withscript_webrtc'],
    ['transcriber_withscript_asstream_astool', 'transcriber_withscript_astool'],
  ]) {
    const url = `${base}${current}/${retired}/?view=config`;
    const expected = `${base}${current}/${replacement}/?view=config`;
    const response = await request(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (response.status !== 301 || new URL(response.headers.get('location') || '', url).href !== expected) throw new Error(`Retired component URL must redirect to its replacement: ${url}`);
    const destination = await request(expected, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (destination.status !== 200) throw new Error(`Replacement component returned ${destination.status}: ${expected}`);
    await destination.arrayBuffer();
  }
  log('Verified legacy 301 redirects, shared form routes, generated-download links and complete documentation.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyReferenceRelease(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
