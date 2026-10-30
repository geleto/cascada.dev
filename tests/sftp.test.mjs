import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { getPublishConfig, publishSite } from '../scripts/publish.mjs';
import { SftpPublishClient } from '../scripts/publish-sftp.mjs';

const config = getPublishConfig({ OVH_SFTP_HOST: 'example.invalid', OVH_SFTP_USER: 'publisher', OVH_SFTP_PASSWORD: 'test-password', OVH_SFTP_REMOTE_DIR: 'www' });

async function fixture(t) {
  const cache = resolve('.cache');
  await mkdir(cache, { recursive: true });
  const root = await mkdtemp(join(cache, 'sftp-test-'));
  assert.equal(dirname(root), cache);
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'build');
  await mkdir(join(directory, 'about'), { recursive: true });
  await writeFile(join(directory, 'index.html'), '<h1>Home</h1>');
  await writeFile(join(directory, 'about/index.html'), '<h1>About</h1>');
  return { root, directory, keyDirectory: join(root, 'keys') };
}

function sftpDouble(key = 'first-server-key') {
  return {
    connected: false, closed: false, uploaded: [], created: [],
    paths: new Map([['/home/publisher', 'd'], ['/home/publisher/www', 'd'], ['/home/publisher/www/index.html', '-'], ['/home/publisher/www/keep.txt', '-']]),
    async connect(options) {
      this.options = options;
      if (!options.hostVerifier(Buffer.from(key))) throw new Error('Host denied verification');
      this.connected = true;
    },
    async cwd() { return '/home/publisher'; },
    async exists(path) { return this.paths.get(path) || false; },
    async realPath(path) { return path; },
    async list() { return []; },
    async mkdir(path) { this.paths.set(path, 'd'); this.created.push(path); },
    async put(source, target) { this.paths.set(target, '-'); this.uploaded.push({ target, contents: await readFile(source, 'utf8') }); },
    async end() { this.closed = true; },
  };
}

test('SFTP uploads files recursively into the existing site directory without deleting unrelated files', async (t) => {
  const { directory, keyDirectory } = await fixture(t);
  const transport = sftpDouble();
  const client = new SftpPublishClient({ client: transport, keyDirectory, log() {} });
  await publishSite({ config, directory, client, log() {} });
  assert.equal(transport.options.username, 'publisher');
  assert.equal(transport.options.port, 22);
  assert.equal(transport.closed, true);
  assert.deepEqual(transport.created, ['/home/publisher/www/about']);
  assert.deepEqual(transport.uploaded.map(({ target }) => target).sort(), ['/home/publisher/www/about/index.html', '/home/publisher/www/index.html']);
  assert.equal(transport.paths.get('/home/publisher/www/keep.txt'), '-');
});

test('SFTP checks do not create directories or upload files and preserve host key verification', async (t) => {
  const { directory, keyDirectory } = await fixture(t);
  for (let attempt = 0; attempt < 2; attempt++) {
    const transport = sftpDouble();
    await publishSite({ config, directory, client: new SftpPublishClient({ client: transport, keyDirectory, log() {} }), checkOnly: true, log() {} });
    assert.equal(transport.closed, true);
    assert.deepEqual(transport.created, []);
    assert.deepEqual(transport.uploaded, []);
  }
  assert.equal((await readdir(keyDirectory)).length, 1);
  const changed = sftpDouble('different-server-key');
  await assert.rejects(publishSite({ config, directory, client: new SftpPublishClient({ client: changed, keyDirectory, log() {} }), log() {} }), /SSH host key mismatch/);
  assert.equal(changed.connected, false);
  assert.equal(changed.closed, true);
  assert.deepEqual(changed.uploaded, []);
});

test('an explicit SFTP fingerprint rejects an unexpected first host key before authenticating', async (t) => {
  const { directory, keyDirectory } = await fixture(t);
  const expected = `SHA256:${createHash('sha256').update('trusted-server-key').digest('base64').replace(/=+$/, '')}`;
  const transport = sftpDouble('unexpected-key');
  await assert.rejects(publishSite({ config: { ...config, hostKey: expected }, directory, client: new SftpPublishClient({ client: transport, keyDirectory, log() {} }), log() {} }), /SSH host key mismatch/);
  assert.equal(transport.connected, false);
  assert.equal(transport.closed, true);
});

test('SFTP refuses missing destinations, account roots, and remote symlinks', async (t) => {
  const { directory, keyDirectory } = await fixture(t);
  for (const scenario of ['missing', 'account-root', 'symlink-directory', 'symlink-file']) {
    const transport = sftpDouble();
    if (scenario === 'missing') transport.paths.delete('/home/publisher/www');
    if (scenario === 'account-root') transport.realPath = async () => '/home/publisher';
    if (scenario === 'symlink-directory') transport.paths.set('/home/publisher/www/about', 'l');
    if (scenario === 'symlink-file') {
      transport.paths.set('/home/publisher/www/about', 'd');
      transport.paths.set('/home/publisher/www/about/index.html', 'l');
    }
    await assert.rejects(publishSite({ config, directory, client: new SftpPublishClient({ client: transport, keyDirectory, log() {} }), log() {} }), /existing directory|account root|remote link/);
    assert.equal(transport.closed, true);
    if (['missing', 'account-root'].includes(scenario)) assert.deepEqual(transport.uploaded, []);
    assert.ok(transport.uploaded.every(({ target }) => !target.startsWith('/home/publisher/www/about/')));
  }
});

test('SFTP closes connections on authentication and transfer failures', async (t) => {
  const { directory, keyDirectory } = await fixture(t);
  for (const method of ['connect', 'put']) {
    const transport = sftpDouble();
    transport[method] = async () => { throw new Error('SFTP unavailable'); };
    await assert.rejects(publishSite({ config, directory, client: new SftpPublishClient({ client: transport, keyDirectory, log() {} }), log() {} }), /SFTP unavailable/);
    assert.equal(transport.closed, true);
  }
});
