import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { projectRoot } from './sites.mjs';

const keys = ['OVH_SFTP_HOST', 'OVH_SFTP_PORT', 'OVH_SFTP_USER', 'OVH_SFTP_PASSWORD', 'OVH_SFTP_REMOTE_DIR', 'OVH_SFTP_HOST_KEY_SHA256'];

export function loadPublishEnvironment(site, { env = process.env, root = projectRoot } = {}) {
  const path = resolve(root, site.input, '.env');
  let local = {};
  try {
    local = dotenv.parse(readFileSync(path));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  // Parse into a fresh object instead of mutating process.env. Only explicitly
  // site-prefixed shell/CI variables override this site's local file.
  return Object.fromEntries(keys.map((key) => [key, env[`${site.envPrefix}_${key}`] ?? local[key]]));
}

export function redactPublishError(error, passwords) {
  let message = String(error.message);
  for (const password of [...new Set(passwords)].filter(Boolean).sort((a, b) => b.length - a.length)) {
    message = message.replaceAll(password, '[redacted]');
  }
  return message;
}
