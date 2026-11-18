import { basePath, selectionUrl } from './state.mjs';

// Public links are usable on GitHub; website and complete-export consumers
// resolve the same links without introducing an authoring-only URI scheme.
export function referenceLink(href) {
  if (href.startsWith('component:')) {
    const target = new URL(href);
    const property = target.searchParams.get('property');
    const id = String(property).replace(/[^\w-]/g, '-');
    return selectionUrl(target.pathname, target.searchParams.get('options')?.split(',') || [],
      property ? 'config' : 'example', property ? `#property-${id}` : '#component-factories');
  }
  let url;
  try { url = new URL(href, 'https://casai.run'); } catch { return href; }
  if (url.origin !== 'https://casai.run') return href;
  url.pathname = url.pathname.replace(/^\/documentation\/quick-reference(?=\/|$)/, '/documentation/reference');
  return url.pathname.startsWith(basePath) || url.pathname.startsWith('/posts/')
    ? url.pathname + url.search + url.hash : href;
}
