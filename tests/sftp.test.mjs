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

test('an empty remote file is returned as an empty Buffer', async t => {
  const { keyDirectory } = await fixture(t);
  const transport = sftpDouble();
  transport.paths.set('/home/publisher/www/.htaccess', '-');
  transport.get = async () => [];
  const client = new SftpPublishClient({ client: transport, keyDirectory, log() {} });
  try {
    await client.access(config);
    await client.cd('www');
    const content = await client.readRemoteFile('.htaccess');
    assert.ok(Buffer.isBuffer(content));
    assert.equal(content.length, 0);
  } finally { await client.close(); }
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

function ambiguousMkdirError(path) {
  return Object.assign(new Error(`mkdir: _doMkdir: Bad path: ${path} permission denied`), { code: 'ERR_BAD_PATH' });
}

test('the misleading mkdir permission error is retried without resending completed files', async t => {
  const { directory, keyDirectory } = await fixture(t);
  await writeFile(join(directory, 'main.js'), 'ready');
  const transport = sftpDouble();
  const mkdir = transport.mkdir.bind(transport);
  let attempts = 0;
  transport.mkdir = async path => {
    if (++attempts < 3) throw ambiguousMkdirError(path);
    return mkdir(path);
  };
  const waits = [], messages = [];
  const client = new SftpPublishClient({ client: transport, keyDirectory, sleep: async ms => waits.push(ms), log: message => messages.push(message) });
  await publishSite({ config, directory, client, log() {} });
  assert.deepEqual(waits, [1000, 2000]);
  assert.equal(attempts, 3);
  assert.equal(messages.filter(message => /Retrying/.test(message)).length, 2);
  assert.match(messages.at(-1), /attempt 3\/4/);
  assert.deepEqual(transport.uploaded.map(file => file.target), [
    '/home/publisher/www/main.js', '/home/publisher/www/about/index.html', '/home/publisher/www/index.html',
  ]);
});

test('a mkdir that succeeded before returning an error is recognized on retry', async t => {
  const { directory, keyDirectory } = await fixture(t);
  const transport = sftpDouble();
  let attempts = 0;
  transport.mkdir = async path => {
    attempts++;
    transport.paths.set(path, 'd');
    throw ambiguousMkdirError(path);
  };
  const waits = [];
  const client = new SftpPublishClient({ client: transport, keyDirectory, sleep: async ms => waits.push(ms), log() {} });
  await publishSite({ config, directory, client, log() {} });
  assert.equal(attempts, 1);
  assert.deepEqual(waits, [1000]);
  assert.equal(transport.uploaded.length, 2);
});

test('exhausted mkdir retries stop the asset phase before pages or routing are uploaded', async t => {
  const { directory, keyDirectory } = await fixture(t);
  await writeFile(join(directory, 'about/reference.json'), '{}');
  await writeFile(join(directory, '.htaccess'), 'routing');
  const transport = sftpDouble();
  let attempts = 0;
  transport.mkdir = async path => { attempts++; throw ambiguousMkdirError(path); };
  const waits = [];
  const client = new SftpPublishClient({ client: transport, keyDirectory, sleep: async ms => waits.push(ms), log() {} });
  await assert.rejects(publishSite({ config, directory, client, log() {} }), error => {
    assert.match(error.message, /stopped during the assets phase/);
    assert.match(error.message, /about\/reference\.json failed after 4 attempts/);
    assert.match(error.message, /permissions and disk\/file quotas/);
    return true;
  });
  assert.equal(attempts, 4);
  assert.deepEqual(waits, [1000, 2000, 4000]);
  assert.deepEqual(transport.uploaded, []);
  assert.equal(transport.closed, true);
});

test('explicit permission, quota and invalid-path failures stop without retrying', async t => {
  const { directory, keyDirectory } = await fixture(t);
  for (const [code, message] of [
    [3, 'Permission denied'], ['EACCES', 'Permission denied'], ['ENOSPC', 'No space left'],
    ['EDQUOT', 'Quota exceeded'], ['ERR_BAD_PATH', 'parent not a directory or not exist'],
  ]) {
    const transport = sftpDouble();
    transport.mkdir = async () => { throw Object.assign(new Error(message), { code }); };
    const waits = [];
    const client = new SftpPublishClient({ client: transport, keyDirectory, sleep: async ms => waits.push(ms), log() {} });
    await assert.rejects(publishSite({ config, directory, client, log() {} }), error => error.message.includes(message));
    assert.deepEqual(waits, [], code);
    assert.deepEqual(transport.uploaded, []);
    assert.equal(transport.closed, true);
  }
});

test('a partial file upload restarts that file and redacts retry log credentials', async t => {
  const { directory, keyDirectory } = await fixture(t);
  const transport = sftpDouble();
  const put = transport.put.bind(transport);
  let attempts = 0;
  transport.put = async (source, target) => {
    if (++attempts === 1) {
      transport.paths.set(target, '-');
      throw Object.assign(new Error(`Temporary failure ${config.password}`), { code: 4 });
    }
    return put(source, target);
  };
  const waits = [], messages = [];
  const client = new SftpPublishClient({ client: transport, keyDirectory, sleep: async ms => waits.push(ms), log: message => messages.push(message) });
  await publishSite({ config, directory, client, log() {} });
  assert.deepEqual(waits, [1000]);
  assert.equal(attempts, 3);
  assert.equal(transport.uploaded[0].contents, '<h1>About</h1>');
  assert.ok(messages.some(message => message.includes('[redacted]')));
  assert.ok(messages.every(message => !message.includes(config.password)));
});

test('paths replaced by symlinks during a retry delay are rejected', async t => {
  const { directory, keyDirectory } = await fixture(t);
  for (const path of ['/home/publisher/www/about', '/home/publisher/www/about/index.html']) {
    const transport = sftpDouble();
    transport.put = async () => { throw Object.assign(new Error('Temporary failure'), { code: 4 }); };
    const waits = [];
    const client = new SftpPublishClient({ client: transport, keyDirectory, log() {}, sleep: async ms => {
      waits.push(ms);
      transport.paths.set(path, 'l');
    } });
    await assert.rejects(publishSite({ config, directory, client, log() {} }), /remote link/);
    assert.deepEqual(waits, [1000]);
    assert.deepEqual(transport.uploaded, []);
  }
});

test('a dropped transfer reconnects to the verified host and resumes the failed file', async t => {
  const { directory, keyDirectory } = await fixture(t);
  await writeFile(join(directory, 'main.js'), 'ready');
  const first = sftpDouble(), second = sftpDouble();
  second.paths = first.paths;
  const put = first.put.bind(first);
  first.put = async (source, target) => {
    if (target.endsWith('/about/index.html')) throw Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' });
    return put(source, target);
  };
  let reconnects = 0;
  const waits = [];
  const client = new SftpPublishClient({ client: first, createClient: () => { reconnects++; return second; }, keyDirectory, sleep: async ms => waits.push(ms), log() {} });
  await publishSite({ config, directory, client, log() {} });
  assert.equal(reconnects, 1);
  assert.deepEqual(waits, [1000]);
  assert.equal(first.closed, true);
  assert.equal(second.closed, true);
  assert.deepEqual(first.uploaded.map(file => file.target), ['/home/publisher/www/main.js']);
  assert.deepEqual(second.uploaded.map(file => file.target), ['/home/publisher/www/about/index.html', '/home/publisher/www/index.html']);
});

test('reconnect attempts stay bounded even if the replacement connection also fails', async t => {
  const { directory, keyDirectory } = await fixture(t);
  const first = sftpDouble();
  first.put = async () => { throw Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' }); };
  const replacements = [];
  const waits = [];
  const client = new SftpPublishClient({ client: first, keyDirectory, log() {}, sleep: async ms => waits.push(ms), createClient: () => {
    const replacement = sftpDouble();
    replacement.connect = async () => { throw Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' }); };
    replacements.push(replacement);
    return replacement;
  } });
  await assert.rejects(publishSite({ config, directory, client, log() {} }), /failed after 4 attempts/);
  assert.deepEqual(waits, [1000, 2000, 4000]);
  assert.equal(replacements.length, 3);
  assert.ok(replacements.every(transport => transport.closed));
});

test('a transient destination check during reconnect cannot upload into the account root', async t => {
  const { directory, keyDirectory } = await fixture(t);
  const first = sftpDouble(), second = sftpDouble(), third = sftpDouble();
  first.put = async () => { throw Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' }); };
  second.exists = async () => { throw Object.assign(new Error('Temporary failure'), { code: 4 }); };
  const replacements = [second, third], waits = [];
  const client = new SftpPublishClient({ client: first, keyDirectory, log() {}, sleep: async ms => waits.push(ms), createClient: () => replacements.shift() });
  await publishSite({ config, directory, client, log() {} });
  assert.equal(replacements.length, 0);
  assert.deepEqual(waits, [1000, 2000]);
  assert.deepEqual(second.uploaded, []);
  assert.deepEqual(third.uploaded.map(file => file.target), ['/home/publisher/www/about/index.html', '/home/publisher/www/index.html']);
});

test('reconnects reject changed host keys, authentication failures and replaced destinations', async t => {
  const { directory, keyDirectory } = await fixture(t);
  for (const scenario of ['host-key', 'authentication', 'destination']) {
    const first = sftpDouble(), second = sftpDouble(scenario === 'host-key' ? 'changed-key' : 'first-server-key');
    first.put = async () => { throw Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' }); };
    if (scenario === 'authentication') second.connect = async () => { throw Object.assign(new Error('Authentication failed'), { code: 'ERR_BAD_AUTH' }); };
    if (scenario === 'destination') second.paths.set('/home/publisher/www', 'l');
    const waits = [];
    const client = new SftpPublishClient({ client: first, createClient: () => second, keyDirectory, sleep: async ms => waits.push(ms), log() {} });
    await assert.rejects(publishSite({ config, directory, client, log() {} }), /SSH host key mismatch|Authentication failed|destination changed/);
    assert.deepEqual(waits, [1000]);
    assert.deepEqual(second.uploaded, []);
    assert.equal(second.closed, true);
  }
});

test('routing reads can recover, but uncertain routing writes are not replayed without the guard', async t => {
  const { directory, keyDirectory } = await fixture(t);
  const transport = sftpDouble();
  const target = '/home/publisher/www/.htaccess';
  transport.paths.set(target, '-');
  let reads = 0, writes = 0;
  transport.get = async () => {
    if (++reads === 1) throw Object.assign(new Error('Temporary failure'), { code: 4 });
    return Buffer.from('existing rules');
  };
  transport.put = async () => { writes++; throw Object.assign(new Error('Temporary failure'), { code: 4 }); };
  const waits = [];
  const client = new SftpPublishClient({ client: transport, keyDirectory, sleep: async ms => waits.push(ms), log() {} });
  try {
    await client.access(config);
    await client.cd('www');
    assert.equal((await client.readRemoteFile('.htaccess')).toString(), 'existing rules');
    await assert.rejects(client.uploadFiles(directory, ['.htaccess']), /Temporary failure/);
    assert.equal(writes, 1);
    assert.deepEqual(waits, [1000]);
  } finally {
    await client.close();
  }
});
