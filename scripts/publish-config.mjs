import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { projectRoot } from './sites.mjs';

export const contentHash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function routingGuard({ config, destination, directory, client, stateDirectory = resolve(projectRoot, '.cache/publish-config'), reviewedConfigHash }) {
  const identity = JSON.stringify([config.host.toLowerCase(), config.port, config.user, destination]);
  const stateFile = join(stateDirectory, contentHash(identity) + '.json');
  const desired = contentHash(await readFile(join(directory, '.htaccess')));
  let previous;
  try {
    const state = JSON.parse(await readFile(stateFile, 'utf8'));
    if (state.identity !== identity || !/^[a-f\d]{64}$/.test(state.hash)) throw new Error('Invalid published routing baseline.');
    previous = state.hash;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (reviewedConfigHash && !/^[a-f\d]{64}$/.test(reviewedConfigHash)) throw new Error('The reviewed config SHA-256 must contain 64 lowercase hex characters.');
  async function inspect() {
    const bytes = await client.readRemoteFile('.htaccess');
    const remote = bytes === null ? null : contentHash(bytes);
    if (remote !== null && remote !== desired && remote !== previous && remote !== reviewedConfigHash) {
      throw new Error(`Remote .htaccess differs from the published baseline (SHA-256 ${remote}). Fetch and inspect it, merge its rules into the build, then supply --reviewed-config-sha256 with that reviewed remote hash. No routing file was overwritten.`);
    }
    return remote === desired;
  }
  async function record() {
    const bytes = await client.readRemoteFile('.htaccess');
    if (bytes === null || contentHash(bytes) !== desired) throw new Error('Remote .htaccess did not match after publication; baseline was not updated.');
    await mkdir(stateDirectory, { recursive: true });
    const temporary = `${stateFile}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify({ identity, hash: desired }) + '\n', { mode: 0o600 });
    await rename(temporary, stateFile);
  }
  return { inspect, record };
}
