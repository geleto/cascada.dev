import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import SftpClient from 'ssh2-sftp-client';
import { projectRoot } from './sites.mjs';
import { planUploads } from './publish-files.mjs';
import { redactPublishError } from './publish-env.mjs';

const retryDelays = [1000, 2000, 4000];
const connectionErrors = new Set(['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'ERR_NOT_CONNECTED', '6', '7']);

function lostConnection(error) {
  return connectionErrors.has(String(error.code)) || (error.code === 'ERR_GENERIC_CLIENT'
    && /Unexpected (?:close|end) event|No SFTP connection|(?:Timeout|Timed out).*handshake/i.test(error.message));
}

function ambiguousMkdirFailure(error) {
  // ssh2-sftp-client maps SFTP status 4 (generic failure) to this misleading
  // message. Actual permission-denied status 3 is different and is not retried.
  return error.code === 'ERR_BAD_PATH' && /_doMkdir: Bad path: .* permission denied$/.test(error.message);
}

// SFTP connection, SSH host key verification, and recursive static-site uploads.
export class SftpPublishClient {
  constructor({ client, createClient = () => new SftpClient(), keyDirectory = resolve(projectRoot, '.cache/sftp-host-keys'), log = console.log, sleep = delay } = {}) {
    this.client = client || createClient();
    this.createClient = createClient;
    this.keyDirectory = keyDirectory;
    this.log = log;
    this.sleep = sleep;
  }

  async access({ host, port, user, password, hostKey }) {
    const address = `${host.toLowerCase()}:${port}`;
    const keyFile = join(this.keyDirectory, `${createHash('sha256').update(address).digest('hex')}.json`);
    let saved;
    try { saved = JSON.parse(await readFile(keyFile, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (saved && (saved.address !== address || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(saved.fingerprint))) {
      throw new Error(`Invalid saved SSH host key for ${address}.`);
    }
    const expected = hostKey || saved?.fingerprint;
    let observed;
    let mismatch = false;
    try {
      await this.client.connect({
        host, port, username: user, password,
        readyTimeout: 30000, keepaliveInterval: 10000, keepaliveCountMax: 3,
        hostVerifier: (key) => {
          observed = `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
          mismatch = Boolean(expected && expected !== observed);
          if (!expected) this.log(`First SFTP connection to ${address}: trusting SSH host key ${observed}.`);
          return !mismatch;
        },
      });
    } catch (error) {
      if (mismatch) throw new Error(`SSH host key mismatch for ${address}. Expected ${expected}, received ${observed}. Verify the server's key before changing the saved fingerprint.`);
      throw error;
    }
    if (!observed) throw new Error('SFTP connection did not verify an SSH host key.');
    if (!saved && !hostKey) {
      await mkdir(this.keyDirectory, { recursive: true });
      try {
        await writeFile(keyFile, JSON.stringify({ address, fingerprint: observed }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const existing = JSON.parse(await readFile(keyFile, 'utf8'));
        if (existing.fingerprint !== observed) throw new Error(`SSH host key changed while connecting to ${address}.`);
      }
    }
    this.directory = await this.client.cwd();
    // Pin reconnects to the verified key even if the local key cache changes.
    this.connection = { host, port, user, password, hostKey: observed };
  }

  async reconnect(destination) {
    const connection = this.connection;
    await this.client.end().catch(() => {});
    this.client = this.createClient();
    await this.access(connection);
    if (destination === this.directory || await this.client.exists(destination) !== 'd'
      || await this.client.realPath(destination) !== destination) {
      throw new Error(`SFTP destination changed or is no longer a safe website directory: ${destination}`);
    }
    this.directory = destination;
  }

  async retry(operation, action) {
    const destination = this.directory;
    let reconnect = false;
    for (let attempt = 0; ; attempt++) {
      try {
        if (reconnect) await this.reconnect(destination);
        reconnect = false;
        return await action(attempt);
      } catch (error) {
        const retryable = lostConnection(error) || Number(error.code) === 4 || ambiguousMkdirFailure(error);
        if (!retryable) throw error;
        const message = redactPublishError(error, [this.connection?.password]);
        if (attempt === retryDelays.length) {
          const hint = lostConnection(error) ? 'Check the SFTP connection and host availability.'
            : 'Check hosting permissions and disk/file quotas if this persists; the server may report these as a generic failure.';
          throw new Error(`${operation} failed after ${attempt + 1} attempts: ${message}. ${hint}`, { cause: error });
        }
        // Keep reconnecting if destination validation failed after connecting:
        // access() has temporarily selected the account root at that point.
        reconnect ||= lostConnection(error);
        const wait = retryDelays[attempt];
        this.log(`${operation} failed: ${message}. Retrying in ${wait / 1000}s (attempt ${attempt + 2}/${retryDelays.length + 1})${reconnect ? ' with a new SFTP connection' : ''}.`);
        await this.sleep(wait);
      }
    }
  }

  async pwd() { return this.directory; }

  async cd(path) {
    const target = posix.resolve(this.directory, path);
    if (await this.client.exists(target) !== 'd') throw new Error(`SFTP destination must be an existing directory, not a symbolic link: ${target}`);
    this.directory = await this.client.realPath(target);
  }

  async list() { return this.client.list(this.directory); }

  async readRemoteFile(path) {
    const target = posix.join(this.directory, path);
    return this.retry(`Reading ${path}`, async () => {
      const type = await this.client.exists(target);
      if (!type) return null;
      if (type !== '-') throw new Error(`Refusing to read a remote link or non-file: ${target}`);
      // concat-stream can return [] for an empty remote file. Keep the public
      // read contract binary, including files truncated by a failed upload.
      return Buffer.from(await this.client.get(target));
    });
  }

  async uploadFiles(directory, files) {
    const checked = new Set();
    for (const file of files) {
      const upload = async (attempt = 0) => {
        // A failed mkdir may have succeeded remotely, or a path may have changed
        // during the delay. Recheck paths before retrying the current file.
        if (attempt) checked.clear();
        let parent = this.directory;
        for (const part of file.split('/').slice(0, -1)) {
          parent = posix.join(parent, part);
          if (checked.has(parent)) continue;
          const type = await this.client.exists(parent);
          if (type && type !== 'd') throw new Error(`Refusing to upload through a remote link or non-directory: ${parent}`);
          if (!type) await this.client.mkdir(parent);
          checked.add(parent);
        }
        const target = posix.join(this.directory, file);
        const type = await this.client.exists(target);
        if (type && type !== '-') throw new Error(`Refusing to overwrite a remote link or non-file: ${target}`);
        await this.client.put(join(directory, file), target);
      };
      // A routing write needs a fresh baseline review after an uncertain result.
      // Do not retry it underneath the publisher's routing guard.
      if (file === '.htaccess') await upload();
      else await this.retry(`Uploading ${file}`, upload);
    }
  }

  async uploadFromDir(directory) {
    for (const phase of await planUploads(directory)) await this.uploadFiles(directory, phase.files);
  }

  async close() {
    this.connection = undefined;
    await this.client.end();
  }
}
