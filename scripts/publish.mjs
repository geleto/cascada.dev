import { readdir, stat } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSiteArgs, projectRoot } from './sites.mjs';
import { buildSites } from './build.mjs';
import { loadPublishEnvironment, redactPublishError } from './publish-env.mjs';
import { SftpPublishClient } from './publish-sftp.mjs';

export function getPublishConfig(env, site) {
  const required = (key) => {
    const result = env[key];
    const location = site ? `${site.input}/.env (or ${site.envPrefix}_${key} in the shell/CI environment)` : 'the site .env file';
    if (typeof result !== 'string' || !result.trim()) throw new Error(`Set ${key} in ${location} before publishing.`);
    if (/[\r\n\0]/.test(result)) throw new Error(`${key} must be a single line.`);
    return result;
  };
  const host = required('OVH_SFTP_HOST').trim();
  const user = required('OVH_SFTP_USER').trim();
  const password = required('OVH_SFTP_PASSWORD');
  const remoteDir = required('OVH_SFTP_REMOTE_DIR').trim();
  const port = Number(env.OVH_SFTP_PORT || 22);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('OVH_SFTP_PORT must be between 1 and 65535.');
  const hostKey = env.OVH_SFTP_HOST_KEY_SHA256?.trim().replace(/=+$/, '') || undefined;
  if (hostKey && !/^SHA256:[A-Za-z0-9+/]{43}$/.test(hostKey)) throw new Error('OVH_SFTP_HOST_KEY_SHA256 must be an SSH SHA-256 fingerprint (SHA256:...).');
  if (remoteDir.includes('\\') || remoteDir.split('/').includes('..') || ['/', '.'].includes(posix.normalize(remoteDir))) {
    throw new Error('OVH_SFTP_REMOTE_DIR must name a website folder, not the account root or a parent directory.');
  }
  return { host, port, user, password, hostKey, remoteDir: posix.normalize(remoteDir) };
}

export async function inspectBuild(directory) {
  if (!(await stat(join(directory, 'index.html'))).isFile()) throw new Error('Build output is missing index.html. Run npm run build first.');
  let files = 0;
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (/^\.env(?:\.|$)/i.test(entry.name) || ['.git', 'node_modules'].includes(entry.name.toLowerCase())) {
        throw new Error(`Refusing to publish a build containing ${entry.name}.`);
      }
      if (entry.isSymbolicLink()) throw new Error('Refusing to follow a symbolic link in the build output.');
      if (entry.isDirectory()) await visit(join(path, entry.name));
      else if (entry.isFile()) files += 1;
      else throw new Error('The build output must contain only regular files and directories.');
    }
  }
  await visit(directory);
  return files;
}

export async function publishSite({ config, directory, client, checkOnly = false, log = console.log }) {
  try {
    const files = await inspectBuild(directory);
    const { remoteDir, ...connection } = config;
    log(`Connecting to ${config.host}:${config.port} using SFTP (SSH).`);
    await client.access(connection);
    const accountRoot = await client.pwd();
    // Require an existing site directory so a typo cannot create a new upload target.
    await client.cd(remoteDir);
    const destination = await client.pwd();
    if (posix.normalize(destination) === posix.normalize(accountRoot)) {
      throw new Error('Refusing to publish into the account root. Set OVH_SFTP_REMOTE_DIR to the website folder.');
    }
    await client.list();
    if (checkOnly) {
      log(`Connection and directory verified: ${destination}. ${files} files ready; nothing uploaded.`);
      return;
    }
    log(`Uploading ${files} files from ${directory} to ${destination}...`);
    // Uploads built files only, overwriting matching files without deleting other remote content.
    await client.uploadFromDir(directory);
    log(`Published ${files} files successfully.`);
  } finally {
    await client.close();
  }
}

export function createPublishPlan(sites, environmentForSite = loadPublishEnvironment) {
  const plan = sites.map((site) => ({ site, config: getPublishConfig(environmentForSite(site), site), directory: resolve(projectRoot, site.output) }));
  for (let i = 0; i < plan.length; i++) {
    for (const previous of plan.slice(0, i)) {
      const a = previous.config;
      const b = plan[i].config;
      if (a.host.toLowerCase() !== b.host.toLowerCase() || a.user !== b.user) continue;
      const left = a.remoteDir.replace(/^\/+|\/+$/g, '');
      const right = b.remoteDir.replace(/^\/+|\/+$/g, '');
      if (left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)) {
        throw new Error(`Overlapping publish destinations for ${previous.site.id} and ${plan[i].site.id}. Set separate website folders.`);
      }
    }
  }
  return plan;
}

async function main() {
  const { sites, values } = parseSiteArgs(process.argv.slice(2), {
    check: { type: 'boolean' },
    'dry-run': { type: 'boolean' },
  });
  if (values.check && values['dry-run']) throw new Error('Choose either --check or --dry-run.');
  // Resolve every destination, build every selected site, and inspect every
  // output before making the first connection. Never upload the parent dist/.
  const plan = createPublishPlan(sites);
  try {
    await buildSites(sites);
    for (const entry of plan) entry.files = await inspectBuild(entry.directory);
    for (const { site, config, directory, files } of plan) {
      if (values['dry-run']) {
        console.log(`[${site.id}] Dry run: ${files} files from ${site.output}/ would be uploaded to ${config.host}:${config.port}/${config.remoteDir.replace(/^\//, '')} using SFTP (SSH). No connection made.`);
      } else {
        const log = (message) => console.log(`[${site.id}] ${message}`);
        await publishSite({ config, directory, client: new SftpPublishClient({ log }), checkOnly: values.check, log });
      }
    }
  } catch (error) {
    // File-loaded credentials do not live in process.env; redact them too.
    throw new Error(redactPublishError(error, plan.map(({ config }) => config.password)));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const passwords = Object.entries(process.env).filter(([key]) => key.endsWith('OVH_SFTP_PASSWORD')).map(([, value]) => value);
    const message = redactPublishError(error, passwords);
    console.error(`Publish failed: ${message}`);
    process.exitCode = 1;
  });
}
