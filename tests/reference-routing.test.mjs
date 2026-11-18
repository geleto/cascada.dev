import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { referenceSelections } from '../sites/casai.run/docs/matrix/matrix.js';
import { createReferenceRoutes } from '../sites/casai.run/reference/routing.mjs';

const selections = referenceSelections();
const routes = createReferenceRoutes(selections);
const origin = 'https://casai.run';

test('all form URLs share one file while exports redirect to browser generation', () => {
  for (const selection of selections) {
    const path = `/documentation/reference/${selection.id.toLowerCase()}/`;
    assert.equal(routes.resolve(new URL(path, origin)).file, 'documentation/reference/index.html');
    assert.equal(routes.resolve(new URL(path + '?view=config&options=asTool#property-model', origin)).file, 'documentation/reference/index.html');
    assert.equal(routes.resolve(new URL(path + 'index.html', origin)).file, 'documentation/reference/index.html');
    assert.equal(routes.resolve(new URL(path.slice(0, -1) + '?view=config', origin)).location, path + '?view=config');
    for (const [filename, format] of [['README.md', 'md'], ['reference.json', 'json']]) {
      const redirect = routes.resolve(new URL(path + filename + '?options=useTools', origin));
      assert.equal(redirect.status, 301);
      assert.equal(redirect.location, path + `?download=${format}&options=useTools`);
    }
    assert.equal(routes.resolve(new URL(path.replace('/reference/', '/quick-reference/') + '?view=config', origin)).location, path + '?view=config');
  }
  for (const path of ['/documentation/reference/all/', '/documentation/reference/documentation.md', '/documentation/reference/not-a-form/', '/documentation/reference/llmagent/not-a-file.json', '/documentation/reference/llmagent//', '/documentation/reference/llmagent/more/']) {
    assert.equal(routes.resolve(new URL(path, origin)), null, path);
  }
});

test('Apache uses the same grouped form routes and preserves query strings', () => {
  const published = readFileSync('dist/casai.run/.htaccess', 'utf8');
  assert.ok(published.includes(routes.apache));
  const allRules = [...routes.apache.matchAll(/^RewriteRule (\S+) (\S+) (\S+)$/gm)];
  assert.equal(allRules.length, 6, 'four form rules and two grouped legacy rules');
  const rules = allRules.slice(2);
  assert.match(rules[3][3], /END/);
  for (const selection of selections) {
    const path = `documentation/reference/${selection.id.toLowerCase()}/`;
    assert.match(path, new RegExp(rules[3][1]));
    assert.match(path + 'README.md', new RegExp(rules[0][1]));
    assert.match(path + 'reference.json', new RegExp(rules[1][1]));
  }
  assert.match(rules[0][3], /QSA/);
  assert.match(rules[1][3], /QSA/);
  assert.doesNotMatch(published, /HTTP_USER_AGENT|Googlebot/i);
});

test('retired voice names and collected transcription tools retain their public URLs', () => {
  const rules = [...routes.apache.matchAll(/^RewriteRule (\S+) (\S+) (\S+)$/gm)].slice(0, 2);
  for (const [old, current] of routes.aliases) for (const suffix of ['', '/', '/index.html', '/README.md', '/reference.json']) {
    const source = `/documentation/reference/${old}${suffix}`;
    const expected = `/documentation/reference/${current}/${suffix.replace(/^\//, '')}`;
    const result = routes.resolve(new URL(source + '?view=config&options=useTools', origin));
    assert.equal(result.status, 301);
    assert.equal(result.location, expected + '?view=config&options=useTools');
    const rule = rules.find(([, pattern]) => new RegExp(pattern).test(source.slice(1)));
    assert.ok(rule, source);
    assert.equal(source.slice(1).replace(new RegExp(rule[1]), rule[2]), expected);
    assert.match(rule[3], /R=301,END/);
  }
  assert.equal(routes.resolve(new URL('/documentation/reference/voicesessionsetup_unknown/', origin)), null);
  assert.equal(routes.resolve(new URL('/documentation/reference/transcriber_withtemplate_asstream_astool/', origin)), null);
});

test('the complete website stays within a small static-file and storage budget', () => {
  const files = [];
  const visit = path => { for (const entry of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) visit(file); else files.push({ path: file, size: statSync(file).size });
  } };
  visit('dist/casai.run');
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  assert.ok(files.length < 50, `${files.length} files: do not restore per-form copies`);
  assert.ok(bytes < 12_000_000, `${bytes} bytes: check repeated reference output`);
  console.log(`Casai publication: ${files.length} files, ${bytes} bytes.`);
});
