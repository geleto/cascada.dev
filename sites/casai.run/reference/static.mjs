// Build entry for the complete static reference. Bundling gives each build one
// coherent module snapshot, including the dynamically imported example renderers.
export { components, referenceSelection, referenceSelections, render } from '../docs/matrix/matrix.js';
export { createMatrix } from '../docs/matrix/profiles.js';
export { concepts, describe, referenceVersions } from '../docs/matrix/reference.js';
export { basePath, defaultComponent, referencePath } from './state.mjs';
export { createRenderer, escape } from './render.mjs';
export { introduction } from '../docs/matrix/introduction.js';
export { chapterPublication, completeDocumentation, documentationUrl, readAllUrl } from './documentation.mjs';
export { configureArticles } from './articles.mjs';
export { renderDocumentation } from '../../../scripts/docs-render.mjs';
