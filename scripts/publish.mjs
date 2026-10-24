import { readdir, stat } from 'node:fs/promises';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'basic-ftp';
import dotenv from 'dotenv';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, 'dist');

export function getPublishConfig(env) {
  const required = (key) => {
    if (typeof env[key] !== 'string' || !env[key].trim()) throw new Error(`Set ${key} in .env before publishing.`);
    if (/[\r\n\0]/.test(env[key])) throw new Error(`${key} must be a single line.`);
    return env[key];
  };
  const host = required('OVH_FTP_HOST').trim();
  const user = required('OVH_FTP_USER').trim();
  const password = required('OVH_FTP_PASSWORD');
  const remoteDir = required('OVH_FTP_REMOTE_DIR').trim();
  const port = Number(env.OVH_FTP_PORT || 21);
  const secure = env.OVH_FTP_SECURE ?? 'true';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('OVH_FTP_PORT must be between 1 and 65535.');
  if (!['true', 'false'].includes(secure)) throw new Error('OVH_FTP_SECURE must be true or false.');
  if (remoteDir.includes('\\') || remoteDir.split('/').includes('..') || ['/', '.'].includes(posix.normalize(remoteDir))) {
    throw new Error('OVH_FTP_REMOTE_DIR must name a website folder, not the account root or a parent directory.');
  }
  return { host, port, user, password, secure: secure === 'true', remoteDir: posix.normalize(remoteDir) };
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
    log(`Connecting to ${config.host}:${config.port} using ${config.secure ? 'FTPS (TLS)' : 'FTP (unencrypted)'}.`);
    await client.access(connection);
    const accountRoot = await client.pwd();
    // Require an existing site directory so a typo cannot create a new upload target.
    await client.cd(remoteDir);
    const destination = await client.pwd();
    if (posix.normalize(destination) === posix.normalize(accountRoot)) {
      throw new Error('Refusing to publish into the account root. Set OVH_FTP_REMOTE_DIR to the website folder.');
    }
    await client.list();
    if (checkOnly) {
      log(`Connection and directory verified: ${destination}. ${files} files ready; nothing uploaded.`);
      return;
    }
    log(`Uploading ${files} files from dist/ to ${destination}...`);
    // Uploads built files only, overwriting matching files without deleting other remote content.
    await client.uploadFromDir(directory);
    log(`Published ${files} files successfully.`);
  } finally {
    client.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && !['--check', '--dry-run'].includes(args[0]))) {
    throw new Error('Usage: npm run publish [-- --check | -- --dry-run]');
  }
  const loaded = dotenv.config({ path: join(projectRoot, '.env'), quiet: true });
  if (loaded.error && loaded.error.code !== 'ENOENT') throw loaded.error;
  const config = getPublishConfig(process.env);
  if (args[0] === '--dry-run') {
    const files = await inspectBuild(outputDirectory);
    console.log(`Dry run: ${files} files from dist/ would be uploaded to ${config.host}:${config.port}/${config.remoteDir.replace(/^\//, '')} using ${config.secure ? 'FTPS' : 'FTP (unencrypted)'}. No connection made.`);
    return;
  }
  await publishSite({ config, directory: outputDirectory, client: new Client(30000), checkOnly: args[0] === '--check' });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const password = process.env.OVH_FTP_PASSWORD;
    const message = password ? String(error.message).replaceAll(password, '[redacted]') : String(error.message);
    console.error(`Publish failed: ${message}`);
    process.exitCode = 1;
  });
}
