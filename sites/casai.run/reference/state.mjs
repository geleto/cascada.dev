import { components, normalizeOptions, referenceSelection } from '../docs/matrix/matrix.js';

export const basePath = '/documentation/quick-reference/';
export const viewTitles = { example: 'Example', config: 'Config', sources: 'Source modes', return: 'Return', notes: 'Notes' };
export const views = Object.keys(viewTitles);
export const hasReturnReference = reference => reference.result.shapes.some(shape => shape.properties.length) || reference.result.additionalProperties.length > 0;
export const availableViews = reference => views.filter(view => (view !== 'return' || hasReturnReference(reference)) && (view !== 'sources' || reference.config.supportedSources.length));
export const defaultComponent = 'LLMAgent';
export const componentChoices = components.filter(component => component.kind !== 'concept');

export function referencePath(component, options) {
  return `${basePath}${referenceSelection(component, options).id.toLowerCase()}/`;
}

export function selectionUrl(component, options, view = 'example', hash = '') {
  const canonical = referenceSelection(component, options);
  const query = new URLSearchParams();
  if (options.join(',') !== canonical.activeOptions.join(',')) query.set('options', options.join(','));
  if (view !== 'example') query.set('view', view);
  return `${referencePath(component, options)}${query.size ? `?${query}` : ''}${hash}`;
}

export function restoreSelection(url, initial) {
  const component = components.find(item => item.name.toLowerCase() === url.pathname.slice(basePath.length).split(/[\/_]/)[0])?.name || initial.component;
  const routeOptions = url.pathname.slice(basePath.length).split('/')[0].split('_').slice(1);
  const choiceIds = components.find(item => item.name === component).groups.flatMap(group => group.choices.map(choice => choice.id));
  const fromRoute = routeOptions.map(value => choiceIds.find(id => id.toLowerCase() === value) || value);
  const restored = url.searchParams.has('options') ? url.searchParams.get('options').split(',').filter(Boolean) : url.pathname === basePath ? initial.options : fromRoute;
  const { activeOptions, dropped } = normalizeOptions(component, restored);
  const requestedView = url.searchParams.get('view');
  return { component, options: activeOptions, view: requestedView === 'info' ? 'notes' : requestedView === 'results' ? 'return' : views.includes(requestedView) ? requestedView : 'example', dropped };
}
