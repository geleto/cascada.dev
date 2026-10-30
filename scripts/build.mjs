import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanSite } from './clean.mjs';
import { parseSiteArgs, projectRoot } from './sites.mjs';

export function eleventyProcess(site, args = []) {
  return spawn(process.execPath, [resolve(projectRoot, 'node_modules/@11ty/eleventy/cmd.cjs'), ...args], {
    cwd: projectRoot,
    env: { ...process.env, WEBSITE: site.id },
    stdio: 'inherit',
    windowsHide: true,
  });
}

export async function buildSites(sites, { clean = true } = {}) {
  for (const site of sites) {
    console.log(`Building ${site.id} → ${site.output}/`);
    if (clean) await cleanSite(site);
    await new Promise((resolve, reject) => {
      const child = eleventyProcess(site);
      child.once('error', reject);
      child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${site.id}: build failed (${signal || code}).`)));
    });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await buildSites(parseSiteArgs(process.argv.slice(2)).sites); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
