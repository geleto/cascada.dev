import { components, normalizeOptions, referenceSelection } from '../docs/matrix/matrix.js';

export const basePath = '/documentation/quick-reference/';
export const views = ['info', 'example', 'config'];
export const defaultComponent = 'LLMAgent';

export function referencePath(component, options) {
  return `${basePath}${referenceSelection(component, options).id.toLowerCase()}/`;
}

export function selectionUrl(component, options, view = 'info', hash = '') {
  const canonical = referenceSelection(component, options);
  const query = new URLSearchParams();
  if (options.join(',') !== canonical.activeOptions.join(',')) query.set('options', options.join(','));
  if (view !== 'info') query.set('view', view);
  return `${referencePath(component, options)}${query.size ? `?${query}` : ''}${hash}`;
}

export function restoreSelection(url, initial) {
  const component = components.find(item => item.name.toLowerCase() === url.pathname.slice(basePath.length).split(/[\/_]/)[0])?.name || initial.component;
  const routeOptions = url.pathname.slice(basePath.length).split('/')[0].split('_').slice(1);
  const choiceIds = components.find(item => item.name === component).groups.flatMap(group => group.choices.map(choice => choice.id));
  const fromRoute = routeOptions.map(value => choiceIds.find(id => id.toLowerCase() === value) || value);
  const restored = url.searchParams.has('options') ? url.searchParams.get('options').split(',').filter(Boolean) : url.pathname === basePath ? initial.options : fromRoute;
  const { activeOptions, dropped } = normalizeOptions(component, restored);
  return { component, options: activeOptions, view: views.includes(url.searchParams.get('view')) ? url.searchParams.get('view') : 'info', dropped };
}
