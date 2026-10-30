import { createServer } from 'node:net';
import { eleventyProcess } from './build.mjs';
import { parseSiteArgs } from './sites.mjs';

// Check every port first. Eleventy's automatic fallback must not swap site URLs.
async function checkPort(site) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`${site.id}: port ${site.port} is unavailable. Stop the existing server or change sites.json.`)));
    server.listen(site.port, () => server.close(resolve));
  });
}

try {
  const { sites } = parseSiteArgs(process.argv.slice(2));
  for (const site of sites) await checkPort(site);
  const children = new Set();
  let stopping = false;
  function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    for (const child of children) child.kill();
  }
  process.on('SIGINT', () => stop());
  process.on('SIGTERM', () => stop());
  for (const site of sites) {
    console.log(`${site.id}: http://localhost:${site.port}`);
    const child = eleventyProcess(site, ['--serve', `--port=${site.port}`]);
    children.add(child);
    child.once('error', (error) => { console.error(`${site.id}: ${error.message}`); stop(1); });
    child.once('exit', (code) => {
      children.delete(child);
      if (!stopping) stop(code || 1);
    });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
