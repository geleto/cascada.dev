import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import SftpClient from 'ssh2-sftp-client';
import { projectRoot } from './sites.mjs';

// SFTP connection, SSH host key verification, and recursive static-site uploads.
export class SftpPublishClient {
  constructor({ client = new SftpClient(), keyDirectory = resolve(projectRoot, '.cache/sftp-host-keys'), log = console.log } = {}) {
    this.client = client;
    this.keyDirectory = keyDirectory;
    this.log = log;
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
  }

  async pwd() { return this.directory; }

  async cd(path) {
    const target = posix.resolve(this.directory, path);
    if (await this.client.exists(target) !== 'd') throw new Error(`SFTP destination must be an existing directory, not a symbolic link: ${target}`);
    this.directory = await this.client.realPath(target);
  }

  async list() { return this.client.list(this.directory); }

  async uploadFromDir(directory) {
    const visit = async (local, remote) => {
      for (const entry of await readdir(local, { withFileTypes: true })) {
        const source = join(local, entry.name);
        const target = posix.join(remote, entry.name);
        const type = await this.client.exists(target);
        if (entry.isDirectory()) {
          if (type && type !== 'd') throw new Error(`Refusing to upload through a remote link or non-directory: ${target}`);
          if (!type) await this.client.mkdir(target);
          await visit(source, target);
        } else if (entry.isFile()) {
          if (type && type !== '-') throw new Error(`Refusing to overwrite a remote link or non-file: ${target}`);
          // Streaming put works with servers that do not support fastPut's
          // concurrent writes. Existing unrelated remote files remain intact.
          await this.client.put(source, target);
        } else {
          throw new Error('The build output must contain only regular files and directories.');
        }
      }
    };
    await visit(directory, this.directory);
  }

  async close() { await this.client.end(); }
}
