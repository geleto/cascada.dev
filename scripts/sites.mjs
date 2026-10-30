import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function getSites() {
  const registry = JSON.parse(readFileSync(resolve(projectRoot, 'sites.json'), 'utf8'));
  const ports = new Set();
  const prefixes = new Set();
  return Object.entries(registry).map(([id, config]) => {
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(id)) throw new Error(`Invalid website name: ${id}`);
    if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 || ports.has(config.port)) {
      throw new Error(`${id}: use a unique port between 1024 and 65535.`);
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(config.envPrefix) || prefixes.has(config.envPrefix)) {
      throw new Error(`${id}: use a unique uppercase envPrefix.`);
    }
    ports.add(config.port);
    prefixes.add(config.envPrefix);
    return { ...config, id, input: `sites/${id}`, output: `dist/${id}` };
  });
}

export function selectSites(name) {
  const sites = getSites();
  if (!name) return sites;
  const site = sites.find(({ id }) => id === name);
  if (!site) throw new Error(`Unknown website "${name}". Choose ${sites.map(({ id }) => id).join(', ')}.`);
  return [site];
}

export function parseSiteArgs(args, options = {}) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options });
  if (positionals.length > 1) throw new Error('Specify one website name, or omit it to select all websites.');
  return { sites: selectSites(positionals[0]), values, explicitSite: Boolean(positionals.length) };
}
