import { rm } from 'node:fs/promises';

// This fixed path is the generated site, never the source or another checkout.
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
