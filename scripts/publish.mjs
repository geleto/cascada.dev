import { posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSiteArgs, projectRoot } from './sites.mjs';
import { buildSites } from './build.mjs';
import { loadPublishEnvironment, redactPublishError } from './publish-env.mjs';
import { SftpPublishClient } from './publish-sftp.mjs';
import { planUploads, describeUploads } from './publish-files.mjs';
import { routingGuard } from './publish-config.mjs';
import { verifyReferenceRelease } from './verify-reference.mjs';

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
  return (await planUploads(directory)).reduce((sum, phase) => sum + phase.files.length, 0);
}

export async function publishSite({ config, directory, client, checkOnly = false, log = console.log, uploadPlan, stateDirectory, reviewedConfigHash }) {
  try {
    const phases = uploadPlan || await planUploads(directory);
    const files = phases.reduce((sum, phase) => sum + phase.files.length, 0);
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
    const guard = phases.some(phase => phase.name === 'routing' && phase.files.length)
      ? await routingGuard({ config, directory, destination, client, stateDirectory, reviewedConfigHash }) : null;
    if (guard) await guard.inspect();
    log(describeUploads(phases));
    if (checkOnly) {
      log(`Connection and directory verified: ${destination}. ${files} files ready; nothing uploaded.`);
      return;
    }
    log(`Uploading ${files} files from ${directory} to ${destination}...`);
    // Uploads built files only, overwriting matching files without deleting other remote content.
    for (const phase of phases) {
      try {
        if (phase.name === 'routing' && guard) {
          if (!await guard.inspect()) await client.uploadFiles(directory, phase.files);
          await guard.record();
        } else await client.uploadFiles(directory, phase.files);
      } catch (error) {
        throw new Error(`Publish stopped during the ${phase.name} phase; subsequent phases were not started. ${error.message}`, { cause: error });
      }
    }
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
    'reviewed-config-sha256': { type: 'string' },
  });
  if (values.check && values['dry-run']) throw new Error('Choose either --check or --dry-run.');
  if (values['reviewed-config-sha256'] && sites.length !== 1) throw new Error('Select one website when supplying a reviewed routing-config hash.');
  // Resolve every destination, build every selected site, and inspect every
  // output before making the first connection. Never upload the parent dist/.
  const plan = createPublishPlan(sites);
  try {
    await buildSites(sites);
    for (const entry of plan) entry.uploadPlan = await planUploads(entry.directory);
    for (const { site, config, directory, uploadPlan } of plan) {
      const files = uploadPlan.reduce((sum, phase) => sum + phase.files.length, 0);
      if (values['dry-run']) {
        console.log(`[${site.id}] Dry run: ${files} files from ${site.output}/ would be uploaded to ${config.host}:${config.port}/${config.remoteDir.replace(/^\//, '')} using SFTP (SSH). No connection made.`);
        console.log(describeUploads(uploadPlan));
      } else {
        const log = (message) => console.log(`[${site.id}] ${message}`);
        await publishSite({ config, directory, client: new SftpPublishClient({ log }), checkOnly: values.check, log, uploadPlan, reviewedConfigHash: values['reviewed-config-sha256'] });
        if (!values.check && site.id === 'casai.run') await verifyReferenceRelease('https://casai.run', { log });
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
