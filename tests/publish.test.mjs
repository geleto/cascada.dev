import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { getPublishConfig, inspectBuild, publishSite } from '../scripts/publish.mjs';

const environment = {
  OVH_FTP_HOST: 'example.invalid',
  OVH_FTP_USER: 'publisher',
  OVH_FTP_PASSWORD: 'test-password',
  OVH_FTP_REMOTE_DIR: 'www',
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

function ftpDouble() {
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

test('publishing requires credentials, a website directory, and an explicit TLS setting to opt out', () => {
  const config = getPublishConfig(environment);
  assert.equal(config.port, 21);
  assert.equal(config.secure, true);
  assert.equal(getPublishConfig({ ...environment, OVH_FTP_SECURE: 'false' }).secure, false);
  assert.throws(() => getPublishConfig({ ...environment, OVH_FTP_PASSWORD: '' }), /OVH_FTP_PASSWORD/);
  for (const directory of ['/', '.', '..', '../www', 'www/../other', 'www\\other']) {
    assert.throws(() => getPublishConfig({ ...environment, OVH_FTP_REMOTE_DIR: directory }), /website folder/);
  }
  assert.throws(() => getPublishConfig({ ...environment, OVH_FTP_PORT: 'invalid' }), /OVH_FTP_PORT/);
  assert.throws(() => getPublishConfig({ ...environment, OVH_FTP_SECURE: 'auto' }), /OVH_FTP_SECURE/);
});

test('builds containing environment files or symlinks are rejected before connecting', async (t) => {
  const directory = await buildFixture(t);
  assert.equal(await inspectBuild(directory), 2);
  const secretPath = join(directory, 'about', '.env.production');
  await writeFile(secretPath, 'SECRET=should-not-upload');
  const client = ftpDouble();
  await assert.rejects(publishSite({ config: getPublishConfig(environment), directory, client, log() {} }), /Refusing to publish/);
  assert.equal(client.connected, false);
  assert.equal(client.closed, true);
  await rm(secretPath);
  await symlink(join(directory, 'about'), join(directory, 'linked-content'), 'junction');
  await assert.rejects(inspectBuild(directory), /symbolic link/);
});

test('connection checks verify the existing target without uploading', async (t) => {
  const directory = await buildFixture(t);
  const client = ftpDouble();
  const messages = [];
  await publishSite({ config: getPublishConfig(environment), directory, client, checkOnly: true, log: (message) => messages.push(message) });
  assert.equal(client.connected, true);
  assert.equal(client.directory, 'www');
  assert.deepEqual(client.uploaded, []);
  assert.equal(client.closed, true);
  assert.match(messages.join('\n'), /nothing uploaded/);
  assert.ok(!messages.join('\n').includes(environment.OVH_FTP_PASSWORD));
});

test('publishing uploads the validated build and closes the connection', async (t) => {
  const directory = await buildFixture(t);
  const client = ftpDouble();
  await publishSite({ config: getPublishConfig(environment), directory, client, log() {} });
  assert.deepEqual(client.uploaded, [directory]);
  assert.equal(client.closed, true);
});

test('publishing refuses a destination that resolves to the FTP account root', async (t) => {
  const directory = await buildFixture(t);
  const client = ftpDouble();
  client.pwd = async () => '/home/publisher';
  await assert.rejects(publishSite({ config: getPublishConfig(environment), directory, client, log() {} }), /account root/);
  assert.deepEqual(client.uploaded, []);
  assert.equal(client.closed, true);
});

test('login, destination, and upload failures propagate an error and close the connection', async (t) => {
  const directory = await buildFixture(t);
  for (const method of ['access', 'cd', 'uploadFromDir']) {
    const client = ftpDouble();
    client[method] = async () => { throw new Error('Transfer unavailable'); };
    await assert.rejects(publishSite({ config: getPublishConfig(environment), directory, client, log() {} }), /Transfer unavailable/);
    assert.equal(client.closed, true);
    assert.deepEqual(client.uploaded, []);
  }
});

test('the dry-run command works outside the project directory without connecting', async (t) => {
  const directory = await buildFixture(t);
  const result = spawnSync(process.execPath, [resolve('scripts/publish.mjs'), '--dry-run'], {
    cwd: directory,
    env: { ...process.env, ...environment, OVH_FTP_PORT: '21', OVH_FTP_SECURE: 'true' },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry run: \d+ files/);
  assert.match(result.stdout, /No connection made/);
  assert.ok(!result.stdout.includes(environment.OVH_FTP_PASSWORD));
});
