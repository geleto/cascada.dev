import configureSite from '../../eleventy.config.mjs';
import { projectRoot } from '../../scripts/sites.mjs';
import { configureReference } from './reference/build.mjs';

// Casai extends the shared build; Cascada never imports its reference builder.
export default async function (eleventy) {
  const settings = configureSite(eleventy);
  await configureReference(eleventy, projectRoot);
  return settings;
}
