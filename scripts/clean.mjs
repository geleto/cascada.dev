import { lstat, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSiteArgs, projectRoot } from './sites.mjs';

export async function cleanSite(site) {
  const root = resolve(projectRoot, 'dist');
  const target = resolve(projectRoot, site.output);
  // Verify the absolute target and its parent before any recursive deletion.
  if (dirname(target) !== root || target !== resolve(root, site.id)) throw new Error('Invalid build output directory.');
  for (const path of [root, target]) {
    const info = await lstat(path).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    if (info?.isSymbolicLink()) throw new Error(`Refusing to clean a linked output directory: ${path}`);
  }
  await rm(target, { recursive: true, force: true });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const site of parseSiteArgs(process.argv.slice(2)).sites) await cleanSite(site);
}
