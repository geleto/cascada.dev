import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { projectRoot } from './sites.mjs';

const { values } = parseArgs({ options: { source: { type: 'string' }, check: { type: 'boolean' } } });
const source = resolve(values.source || resolve(projectRoot, '../casai'));
const input = resolve(source, 'docs/matrix');
const destination = resolve(projectRoot, 'sites/casai.run/docs/matrix');
const manifestPath = resolve(projectRoot, 'sites/casai.run/docs/matrix-source.json');
const hash = text => createHash('sha256').update(text).digest('hex');

async function readTree(directory, prefix = '') {
  const files = {};
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) Object.assign(files, await readTree(resolve(directory, entry.name), `${path}/`));
    else if (entry.isFile()) files[path] = (await readFile(resolve(directory, entry.name), 'utf8')).replace(/\r\n/g, '\n');
    else throw new Error(`Unsupported matrix entry: ${path}`);
  }
  return files;
}

const files = await readTree(input);
if (JSON.parse(files['package.json']).name !== '@casai/matrix') throw new Error('Expected the @casai/matrix data package.');
const hashes = Object.fromEntries(Object.entries(files).map(([path, text]) => [path, hash(text)]));
if (values.check) {
  const saved = JSON.parse(await readFile(manifestPath, 'utf8'));
  const snapshot = await readTree(destination);
  const snapshotHashes = Object.fromEntries(Object.entries(snapshot).map(([path, text]) => [path, hash(text)]));
  if (JSON.stringify(hashes) !== JSON.stringify(saved.files) || JSON.stringify(hashes) !== JSON.stringify(snapshotHashes)) {
    throw new Error('Matrix snapshot differs from casai. Run npm run matrix:sync.');
  }
  console.log('Casai matrix snapshot is current.');
} else {
  const git = args => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', windowsHide: true }).trim();
  const manifest = {
    repository: 'https://github.com/geleto/casai',
    commit: git(['rev-parse', 'HEAD']),
    modified: Boolean(git(['status', '--porcelain', '--', 'docs/matrix'])),
    hashFormat: 'sha256 with LF line endings',
    files: hashes,
  };
  // Keep the watched directory in place: Windows watchers hold its handle open.
  // Replace each changed file atomically, then publish the matching manifest.
  // An interrupted sync is detected by --check and can be rerun safely.
  let snapshot = {};
  try { snapshot = await readTree(destination); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const stage = resolve(projectRoot, '.cache/matrix-sync');
  const within = (directory, path) => {
    const target = resolve(directory, ...path.split('/'));
    if (!target.startsWith(directory + sep)) throw new Error(`Invalid package path: ${path}`);
    return target;
  };
  for (const [path, text] of Object.entries(files)) {
    if (snapshot[path] === text) continue;
    const temporary = within(stage, path);
    const target = within(destination, path);
    await mkdir(resolve(temporary, '..'), { recursive: true });
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(temporary, text);
    await rename(temporary, target);
  }
  for (const path of Object.keys(snapshot)) if (!(path in files)) await rm(within(destination, path));
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Synchronized ${Object.keys(files).length} matrix files from ${source} (${manifest.commit.slice(0, 8)}${manifest.modified ? ', with local edits' : ''}).`);
}
