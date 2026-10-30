import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { createPublishPlan, getPublishConfig, inspectBuild, publishSite } from '../scripts/publish.mjs';
import { loadPublishEnvironment, redactPublishError } from '../scripts/publish-env.mjs';
import { selectSites } from '../scripts/sites.mjs';

const environment = {
  OVH_SFTP_HOST: 'example.invalid',
  OVH_SFTP_USER: 'publisher',
  OVH_SFTP_PASSWORD: 'test-password',
  OVH_SFTP_REMOTE_DIR: 'www',
};

async function buildFixture(t) {
  const cache = resolve('.cache');
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(join(cache, 'publish-test-'));
  assert.equal(dirname(directory), cache);
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'about'));
  await writeFile(join(directory, 'index.html'), '<h1>Home</h1>');
  await writeFile(join(directory, 'about', 'index.html'), '<h1>About</h1>');
  return directory;
}

function publishClientDouble() {
  return {
    connected: false, uploaded: [], closed: false,
    async access(connection) { this.connected = true; this.connection = connection; },
    async cd(path) { this.directory = path; },
    async pwd() { return this.directory ? `/${this.directory}` : '/'; },
    async list() { return []; },
    async uploadFromDir(path) { this.uploaded.push(path); },
    close() { this.closed = true; },
  };
}

test('publishing requires SFTP credentials and a website directory, defaulting to SSH port 22', () => {
  const config = getPublishConfig(environment);
  assert.equal(config.port, 22);
  assert.throws(() => getPublishConfig({ ...environment, OVH_SFTP_PASSWORD: '' }), /OVH_SFTP_PASSWORD/);
  for (const directory of ['/', '.', '..', '../www', 'www/../other', 'www\\other']) {
    assert.throws(() => getPublishConfig({ ...environment, OVH_SFTP_REMOTE_DIR: directory }), /website folder/);
  }
  assert.throws(() => getPublishConfig({ ...environment, OVH_SFTP_PORT: 'invalid' }), /OVH_SFTP_PORT/);
});

test('SFTP settings accept custom SSH ports and validate optional host fingerprints', () => {
  const hostKey = 'SHA256:' + 'a'.repeat(43);
  const config = getPublishConfig({ ...environment, OVH_SFTP_PORT: '2222', OVH_SFTP_HOST_KEY_SHA256: hostKey + '=' });
  assert.equal(config.port, 2222);
  assert.equal(config.hostKey, hostKey);
  assert.throws(() => getPublishConfig({ ...environment, OVH_SFTP_HOST_KEY_SHA256: 'invalid' }), /OVH_SFTP_HOST_KEY_SHA256/);
});

test('builds containing environment files or symlinks are rejected before connecting', async (t) => {
  const directory = await buildFixture(t);
  assert.equal(await inspectBuild(directory), 2);
  const secretPath = join(directory, 'about', '.env.production');
  await writeFile(secretPath, 'SECRET=should-not-upload');
  const client = publishClientDouble();
  await assert.rejects(publishSite({ config: getPublishConfig(environment), directory, client, log() {} }), /Refusing to publish/);
  assert.equal(client.connected, false);
  assert.equal(client.closed, true);
  await rm(secretPath);
  await symlink(join(directory, 'about'), join(directory, 'linked-content'), 'junction');
  await assert.rejects(inspectBuild(directory), /symbolic link/);
});

test('connection checks verify the existing target without uploading', async (t) => {
  const directory = await buildFixture(t);
  const client = publishClientDouble();
  const messages = [];
  await publishSite({ config: getPublishConfig(environment), directory, client, checkOnly: true, log: (message) => messages.push(message) });
  assert.equal(client.connected, true);
  assert.equal(client.directory, 'www');
  assert.deepEqual(client.uploaded, []);
  assert.equal(client.closed, true);
  assert.match(messages.join('\n'), /nothing uploaded/);
  assert.ok(!messages.join('\n').includes(environment.OVH_SFTP_PASSWORD));
});

test('publishing uploads the validated build and closes the connection', async (t) => {
  const directory = await buildFixture(t);
  const client = publishClientDouble();
  await publishSite({ config: getPublishConfig(environment), directory, client, log() {} });
  assert.deepEqual(client.uploaded, [directory]);
  assert.equal(client.closed, true);
});

test('publishing refuses a destination that resolves to the SFTP account root', async (t) => {
  const directory = await buildFixture(t);
  const client = publishClientDouble();
  client.pwd = async () => '/home/publisher';
  await assert.rejects(publishSite({ config: getPublishConfig(environment), directory, client, log() {} }), /account root/);
  assert.deepEqual(client.uploaded, []);
  assert.equal(client.closed, true);
});

test('login, destination, and upload failures propagate an error and close the connection', async (t) => {
  const directory = await buildFixture(t);
  for (const method of ['access', 'cd', 'uploadFromDir']) {
    const client = publishClientDouble();
    client[method] = async () => { throw new Error('Transfer unavailable'); };
    await assert.rejects(publishSite({ config: getPublishConfig(environment), directory, client, log() {} }), /Transfer unavailable/);
    assert.equal(client.closed, true);
    assert.deepEqual(client.uploaded, []);
  }
});

test('the dry-run command works outside the project directory without connecting', async (t) => {
  const directory = await buildFixture(t);
  const result = spawnSync(process.execPath, [resolve('scripts/publish.mjs'), 'cascada.dev', '--dry-run'], {
    cwd: directory,
    env: { ...process.env, ...environment, ...Object.fromEntries(Object.entries(environment).map(([key, value]) => [`CASCADA_${key}`, value])), CASCADA_OVH_SFTP_PORT: '22' },
    encoding: 'utf8',
    timeout: 60000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry run: \d+ files/);
  assert.match(result.stdout, /No connection made/);
  assert.ok(!result.stdout.includes(environment.OVH_SFTP_PASSWORD));
});

test('site files load independently, ignoring root and unprefixed shell defaults', async (t) => {
  const root = await buildFixture(t);
  const cascada = selectSites('cascada.dev')[0];
  const casai = selectSites('casai.run')[0];
  await mkdir(join(root, cascada.input), { recursive: true });
  await mkdir(join(root, casai.input), { recursive: true });
  await writeFile(join(root, '.env'), 'OVH_SFTP_PASSWORD=root-password\nCASAI_OVH_SFTP_USER=root-user\n');
  await writeFile(join(root, cascada.input, '.env'), 'OVH_SFTP_HOST=cascada.invalid\nOVH_SFTP_USER=cascada-user\nOVH_SFTP_PASSWORD="cascada#password"\nOVH_SFTP_REMOTE_DIR=www\n');
  await writeFile(join(root, casai.input, '.env'), 'OVH_SFTP_HOST=casai.invalid\nOVH_SFTP_USER=casai-user\nOVH_SFTP_PASSWORD=casai-password\nOVH_SFTP_REMOTE_DIR=casai\n');
  const env = Object.freeze({ OVH_SFTP_HOST: 'shell.invalid', OVH_SFTP_PASSWORD: 'shared-password', OVH_SFTP_REMOTE_DIR: 'shared-target', CASAI_OVH_SFTP_PASSWORD: 'ci-password' });
  const cascadaConfig = getPublishConfig(loadPublishEnvironment(cascada, { root, env }), cascada);
  const casaiConfig = getPublishConfig(loadPublishEnvironment(casai, { root, env }), casai);
  assert.equal(cascadaConfig.host, 'cascada.invalid');
  assert.equal(cascadaConfig.password, 'cascada#password');
  assert.equal(cascadaConfig.remoteDir, 'www');
  assert.equal(casaiConfig.host, 'casai.invalid');
  assert.equal(casaiConfig.user, 'casai-user');
  assert.equal(casaiConfig.password, 'ci-password');
  assert.equal(casaiConfig.remoteDir, 'casai');
  assert.deepEqual(getPublishConfig(loadPublishEnvironment(cascada, { root, env }), cascada), cascadaConfig);
});

test('a missing site file requires its own CI configuration and names the correct file on failure', async (t) => {
  const root = await buildFixture(t);
  const casai = selectSites('casai.run')[0];
  const env = Object.fromEntries(Object.entries(environment).map(([key, value]) => [`CASAI_${key}`, value]));
  assert.equal(getPublishConfig(loadPublishEnvironment(casai, { root, env }), casai).password, 'test-password');
  assert.throws(() => getPublishConfig(loadPublishEnvironment(casai, { root, env: environment }), casai), /sites\/casai\.run\/\.env/);
  assert.throws(() => getPublishConfig(loadPublishEnvironment(casai, { root, env: { CASAI_OVH_SFTP_HOST: 'example.invalid' } }), casai), /OVH_SFTP_USER/);
});

test('publishing error messages redact passwords loaded from site files', () => {
  const message = redactPublishError(new Error('SFTP rejected longer-secret and secret'), ['secret', 'longer-secret', '', 'secret']);
  assert.equal(message, 'SFTP rejected [redacted] and [redacted]');
});

test('publishing all validates every target and rejects overlapping destinations', () => {
  const sites = ['cascada.dev', 'casai.run'].flatMap(selectSites);
  assert.throws(() => createPublishPlan(sites, (site) => site.id === 'cascada.dev' ? environment : {}), /sites\/casai\.run\/\.env/);
  for (const remoteDir of ['www', '/www/', 'www/casai']) {
    assert.throws(() => createPublishPlan(sites, (site) => ({ ...environment, OVH_SFTP_REMOTE_DIR: site.id === 'cascada.dev' ? 'www' : remoteDir })), /Overlapping/);
  }
  const plan = createPublishPlan(sites, (site) => ({ ...environment, OVH_SFTP_REMOTE_DIR: site.id === 'cascada.dev' ? 'www' : 'casai' }));
  assert.deepEqual(plan.map(({ directory }) => directory), sites.map(({ id }) => resolve('dist', id)));
  assert.deepEqual(plan.map(({ config }) => config.remoteDir), ['www', 'casai']);
});

test('omitting the website builds and dry-runs every registered site without connecting', () => {
  const env = { ...process.env };
  for (const site of selectSites()) {
    for (const [key, value] of Object.entries({ ...environment, OVH_SFTP_PORT: '22', OVH_SFTP_REMOTE_DIR: site.id })) {
      env[`${site.envPrefix}_${key}`] = value;
    }
  }
  const result = spawnSync(process.execPath, [resolve('scripts/publish.mjs'), '--dry-run'], { env, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stderr);
  for (const site of selectSites()) assert.ok(result.stdout.includes(`[${site.id}] Dry run:`), site.id);
  assert.equal((result.stdout.match(/No connection made/g) || []).length, selectSites().length);
  assert.equal((result.stdout.match(/using SFTP \(SSH\)/g) || []).length, selectSites().length);
  assert.ok(!result.stdout.includes(environment.OVH_SFTP_PASSWORD));
});
