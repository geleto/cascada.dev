import { components, getControls, render, setLoads } from '../docs/matrix/matrix.js';
import { describe } from '../docs/matrix/reference.js';
import provenance from '../docs/matrix-source.json';
import { createRenderer, icons } from './render.mjs';
import { basePath, restoreSelection, selectionUrl } from './state.mjs';
import { createExampleActions } from './example-actions.mjs';
import { initializeGuide } from './guide-client.mjs';

const root = document.querySelector('[data-matrix]');
if (root) initialize();

function initialize() {
  const renderer = createRenderer(provenance);
  const initial = { component: root.dataset.component, options: root.dataset.options.split(',').filter(Boolean) };
  let state = restoreSelection(new URL(location.href), initial);
  let currentReference, currentExample, renderVersion = 0;
  const status = root.querySelector('[data-ref-status]');
  const tabs = root.querySelector('.ref-tabs');
  tabs.setAttribute('role', 'tablist');
  function enhanceViews() {
    tabs.querySelectorAll('[data-view]').forEach(tab => { tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', tab.dataset.view); });
    root.querySelectorAll('[data-panel]').forEach(panel => { panel.setAttribute('role', 'tabpanel'); panel.tabIndex = 0; });
  }
  const tabViews = () => [...tabs.querySelectorAll('[data-view]')].map(tab => tab.dataset.view);
  enhanceViews();
  root.classList.add('is-enhanced');

  function syncComponentNavigation() {
    root.querySelectorAll('[data-component-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.componentChoice === state.component));
    });
  }

  let announcementTimer;
  const announce = message => {
    clearTimeout(announcementTimer);
    status.textContent = message;
    announcementTimer = setTimeout(() => { status.textContent = ''; }, 5000);
  };
  function setView(view, update = true) {
    if (!tabViews().includes(view)) {
      if (view === 'return' && root.querySelector('#results')?.tagName === 'DETAILS') root.querySelector('#results').open = true;
      view = 'example';
    }
    state.view = view;
    tabs.querySelectorAll('[data-view]').forEach(tab => {
      const selected = tab.dataset.view === view;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    root.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== view; });
    if (update) updateUrl(false, '');
  }
  function updateUrl(replace = false, hash = location.hash) {
    const url = selectionUrl(state.component, state.options, state.view, hash);
    if (url !== location.pathname + location.search + location.hash) history[replace ? 'replaceState' : 'pushState'](null, '', url);
  }
  function revealAnchor(scroll = true) {
    if (!location.hash) return;
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (!target || !root.contains(target)) return;
    const panel = target.closest('[data-panel]');
    if (panel) {
      if (panel.dataset.panel === 'config') filterProperties('');
      setView(panel.dataset.panel, false);
    }
    for (let element = target; element && element !== root; element = element.parentElement) if (element.tagName === 'DETAILS') element.open = true;
    if (scroll) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  }
  async function update({ focus, message, replace = false, writeHistory = true } = {}) {
    const version = ++renderVersion;
    const selectedState = { ...state, options: [...state.options] };
    try {
      const reference = describe(selectedState.component, selectedState.options);
      const example = await render(selectedState.component, selectedState.options);
      if (version !== renderVersion) return;
      currentReference = reference;
      currentExample = example;
      root.querySelector('[data-reference-heading]').innerHTML = renderer.heading(reference);
      root.querySelector('[data-controls]').innerHTML = renderer.controls(reference);
      tabs.innerHTML = renderer.tabs(reference);
      root.querySelector('.ref-panels').innerHTML = renderer.panels(reference, example);
      enhanceViews();
      syncComponentNavigation();
      for (const format of ['md', 'json']) {
        const link = root.querySelector(`[data-export="${format}"]`);
        const url = new URL(selectionUrl(state.component, state.options, state.view), location.origin);
        url.searchParams.set('download', format);
        link.href = url.pathname + url.search;
        link.hidden = false;
      }
      document.title = `${reference.form.factory || state.component} · Documentation | Casai`;
      const requestedView = state.view;
      setView(requestedView, false);
      if (writeHistory) updateUrl(replace, focus ? '' : location.hash);
      else if (state.view !== requestedView) updateUrl(true, focus ? '' : location.hash);
      document.querySelector('link[rel="canonical"]').href = new URL(basePath, location.origin).href;
      if (focus) root.querySelector(focus)?.focus({ preventScroll: true });
      announce(message || `${reference.form.factory || state.component} reference updated.`);
      revealAnchor();
      const downloadUrl = new URL(location.href);
      const format = downloadUrl.searchParams.get('download');
      if (format === 'md' || format === 'json') {
        downloadUrl.searchParams.delete('download');
        history.replaceState(null, '', downloadUrl.pathname + downloadUrl.search + downloadUrl.hash);
        downloadReference(format);
      }
    } catch (error) {
      announce(`The reference could not be updated. ${error.message}`);
      console.error(error);
    }
  }
  function navigate(url, focus = '#component-title') {
    const parsed = new URL(url, location.href);
    state = restoreSelection(parsed, initial);
    history.pushState(null, '', parsed);
    return update({ focus, writeHistory: false });
  }
  function changeOptions(options, focus) {
    const cleared = state.options.filter(id => !options.includes(id));
    const names = components.find(component => component.name === state.component).groups.flatMap(group => group.choices);
    state.options = options;
    const message = cleared.length ? `Updated example. Cleared: ${cleared.map(id => names.find(choice => choice.id === id).name).join(', ')}.` : 'Example and reference updated.';
    update({ focus, message });
  }
  const { copyCode, download } = createExampleActions(announce);
  function downloadReference(format) {
    const isJson = format === 'json';
    download(isJson ? JSON.stringify({ schemaVersion: 3, reference: currentReference, example: currentExample, provenance }, null, 2)
      : renderer.toMarkdown(currentReference, currentExample), `${currentExample.id}.${format}`, isJson ? 'application/json' : 'text/markdown');
  }

  root.addEventListener('click', event => {
    const target = event.target.closest('a, button');
    if (!target || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (target.hash?.startsWith('#guide-')) return;
    if (target.hasAttribute('data-property-search-toggle')) {
      togglePropertySearch(target.getAttribute('aria-expanded') !== 'true');
    } else if (target.hasAttribute('data-component-choice')) {
      if (target.dataset.componentChoice === state.component) return;
      const component = components.find(component => component.name === target.dataset.componentChoice);
      navigate(selectionUrl(component.name, component.activeOptions, state.view), `[data-component-choice="${component.name}"]`);
    } else if (target.hasAttribute('data-reference-link')) {
      event.preventDefault();
      navigate(target.href, target.matches('[data-option-property], [data-option-method]') ? `${new URL(target.href).hash} > summary` : undefined);
    } else if (target.hasAttribute('data-source')) {
      const source = getControls(state.component, state.options).find(section => section.id === 'source')?.control;
      const transition = source?.choices.find(choice => choice.id === target.dataset.source)?.transition;
      if (transition) changeOptions(transition.activeOptions, `[data-source="${target.dataset.source}"]`);
    } else if (target.hasAttribute('data-view')) {
      event.preventDefault(); setView(target.dataset.view);
    } else if (target.hasAttribute('data-copy-file') && currentExample) {
      copyCode(currentExample.files[Number(target.dataset.copyFile)].code, target, target.closest('figure').querySelector('code'));
    } else if (target.hasAttribute('data-download-file') && currentExample) {
      const file = currentExample.files[Number(target.dataset.downloadFile)]; download(file.code, file.name);
    } else if (target.hasAttribute('data-export') && currentReference) {
      event.preventDefault();
      downloadReference(target.dataset.export);
    } else if (target.hash && target.pathname === location.pathname) {
      event.preventDefault();
      const url = new URL(location.href);
      url.hash = target.hash;
      history.pushState(null, '', url);
      revealAnchor();
      updateUrl(true);
    }
  });
  root.addEventListener('change', event => {
    const target = event.target;
    if (!target.matches('[data-choice]')) return;
    let options;
    if (target.dataset.choice === 'loads') options = setLoads(state.component, state.options, target.checked);
    else {
      const choice = getControls(state.component, state.options, { unavailable: 'include' })
        .flatMap(section => (section.groups || []).flatMap(group => group.choices))
        .find(choice => choice.id === target.dataset.choice);
      if (!choice?.transition || target.checked === choice.active) return;
      options = choice.transition.activeOptions;
    }
    changeOptions(options, `[data-choice="${target.dataset.choice}"]`);
  });
  tabs.addEventListener('keydown', event => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault(); setView(event.target.dataset.view); return;
    }
    const views = tabViews();
    const index = views.indexOf(state.view);
    const next = { ArrowRight: (index + 1) % views.length, ArrowLeft: (index + views.length - 1) % views.length, Home: 0, End: views.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault(); setView(views[next]); tabs.querySelector(`[data-view="${views[next]}"]`).focus();
  });
  function filterProperties(value) {
    const query = value.trim().toLowerCase();
    const search = root.querySelector('[data-property-search]');
    search.value = value;
    let count = 0;
    root.querySelectorAll('[data-panel="config"] [data-property]').forEach(element => {
      const matches = !query || element.dataset.property.includes(query);
      element.hidden = !matches;
      if (matches) count++;
    });
    root.querySelectorAll('.ref-config-section').forEach(section => {
      section.hidden = Boolean(query) && ![...section.querySelectorAll('[data-property]')].some(property => !property.hidden);
      section.querySelectorAll('.ref-config-group').forEach(group => { group.hidden = ![...group.querySelectorAll('[data-property]')].some(property => !property.hidden); });
    });
    root.querySelectorAll('.ref-config-overview').forEach(section => { section.hidden = Boolean(query); });
    const heading = root.querySelector('[data-property-heading]');
    heading.textContent = query ? 'Matching properties' : heading.dataset.defaultHeading;
    root.querySelector('[data-property-status]').textContent = query ? `${count} ${count === 1 ? 'property' : 'properties'} found.` : '';
  }
  function togglePropertySearch(open) {
    const button = root.querySelector('[data-property-search-toggle]');
    root.querySelector('[data-property-search-box]').hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close property search' : 'Find a property');
    button.title = button.getAttribute('aria-label');
    button.innerHTML = open ? icons.close : icons.search;
    if (!open) filterProperties('');
    (open ? root.querySelector('[data-property-search]') : button).focus();
  }
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && event.target.matches('[data-property-search]')) {
      event.preventDefault(); togglePropertySearch(false);
    }
  });
  root.addEventListener('input', event => {
    if (event.target.matches('[data-property-search]')) filterProperties(event.target.value);
  });
  window.addEventListener('popstate', () => {
    state = restoreSelection(new URL(location.href), initial);
    update({ writeHistory: false });
  });
  window.addEventListener('hashchange', () => revealAnchor());
  initializeGuide({ root, navigate });
  update({ replace: true, writeHistory: false, message: state.dropped.length ? `Restored this reference. Removed unavailable options: ${state.dropped.join(', ')}.` : '' });
}
