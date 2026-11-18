import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export async function planUploads(directory) {
  if (!(await stat(join(directory, 'index.html'))).isFile()) throw new Error('Build output is missing index.html. Run npm run build first.');
  const phases = [
    { name: 'assets', files: [] }, { name: 'pages', files: [] }, { name: 'routing', files: [] },
  ];
  async function visit(relative = '') {
    for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
      if (/^\.env(?:\.|$)/i.test(entry.name) || ['.git', 'node_modules'].includes(entry.name.toLowerCase())) throw new Error(`Refusing to publish a build containing ${entry.name}.`);
      if (entry.isSymbolicLink()) throw new Error('Refusing to follow a symbolic link in the build output.');
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const asset = /^(?:reference-assets|assets)\//.test(path);
        const phase = path === '.htaccess' ? 2 : !asset && (/\.html$/.test(path) || /^(?:sitemap\.xml|feed\.xml|robots\.txt)$/.test(path)) ? 1 : 0;
        phases[phase].files.push(path);
      } else throw new Error('The build output must contain only regular files and directories.');
    }
  }
  await visit();
  for (const phase of phases) phase.files.sort();
  return phases;
}

export function describeUploads(phases) {
  return phases.map((phase, i) => `${i + 1}. ${phase.name}: ${phase.files.length} files${phase.name === 'routing' && phase.files.length ? ` (${phase.files.join(', ')} last)` : ''}`).join('\n');
}
