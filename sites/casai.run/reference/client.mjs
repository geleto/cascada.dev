import { components, render, selectOption, selectSource, setLoads } from '../docs/matrix/matrix.js';
import { describe } from '../docs/matrix/reference.js';
import provenance from '../docs/matrix-source.json';
import { createRenderer } from './render.mjs';
import { restoreSelection, selectionUrl, referencePath, views } from './state.mjs';

const root = document.querySelector('[data-matrix]');
if (root) initialize();

function initialize() {
  const renderer = createRenderer(provenance);
  const initial = { component: root.dataset.component, options: root.dataset.options.split(',').filter(Boolean) };
  let state = restoreSelection(new URL(location.href), initial);
  let currentReference, currentExample, renderVersion = 0;
  const status = root.querySelector('[data-ref-status]');
  const tabs = root.querySelector('.ref-tabs');
  const componentIndex = root.querySelector('.ref-component-index');
  const controlsPanel = root.querySelector('[data-options-panel]');
  const compact = matchMedia('(max-width: 800px)');
  const resize = () => { componentIndex.open = !compact.matches; controlsPanel.open = !compact.matches; };
  resize();
  compact.addEventListener('change', resize);
  root.querySelectorAll('[data-reset], [data-share]').forEach(button => { button.hidden = false; });
  tabs.setAttribute('role', 'tablist');
  tabs.querySelectorAll('[data-view]').forEach(tab => { tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', tab.dataset.view); });
  root.querySelectorAll('[data-panel]').forEach(panel => { panel.setAttribute('role', 'tabpanel'); panel.tabIndex = 0; });
  root.classList.add('is-enhanced');

  let announcementTimer;
  const announce = message => {
    clearTimeout(announcementTimer);
    status.textContent = message;
    announcementTimer = setTimeout(() => { status.textContent = ''; }, 5000);
  };
  function setView(view, update = true) {
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
      root.querySelector('[data-panel="info"]').innerHTML = renderer.info(reference);
      root.querySelector('[data-panel="example"]').innerHTML = renderer.example(example, reference);
      root.querySelector('[data-panel="config"]').innerHTML = renderer.config(reference);
      root.querySelectorAll('[data-component-link]').forEach(link => {
        if (link.dataset.componentLink === state.component) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
      root.querySelector('[data-export="md"]').href = `${referencePath(state.component, state.options)}README.md`;
      root.querySelector('[data-export="json"]').href = `${referencePath(state.component, state.options)}reference.json`;
      document.title = `${reference.form.factory || state.component} · Quick reference | Casai`;
      document.querySelector('link[rel="canonical"]').href = new URL(referencePath(state.component, state.options), location.origin).href;
      setView(state.view, false);
      if (writeHistory) updateUrl(replace, focus ? '' : location.hash);
      if (focus) root.querySelector(focus)?.focus({ preventScroll: true });
      announce(message || `${reference.form.factory || state.component} reference updated.`);
      revealAnchor(!focus);
    } catch (error) {
      announce(`The reference could not be updated. ${error.message}`);
      console.error(error);
    }
  }
  function navigate(url) {
    const parsed = new URL(url, location.href);
    state = restoreSelection(parsed, initial);
    history.pushState(null, '', parsed);
    if (compact.matches) componentIndex.open = false;
    update({ focus: '#component-title', writeHistory: false });
  }
  function download(text, name, mime = 'text/plain') {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce(`Downloaded ${name}.`);
  }
  async function copy(text, button, code) {
    try {
      await navigator.clipboard.writeText(text);
      const previous = button.textContent;
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = previous; }, 1800);
      announce(code ? 'Code copied.' : 'Reference link copied.');
    } catch {
      if (code) {
        const range = document.createRange(); range.selectNodeContents(code);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        code.closest('pre').focus();
        announce('Clipboard is unavailable. Code selected for manual copying.');
      } else {
        announce(`Clipboard is unavailable. Copy the URL from your address bar: ${text}`);
      }
    }
  }

  root.addEventListener('click', event => {
    const target = event.target.closest('a, button');
    if (!target || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (target.matches('[data-component-link], [data-reference-link]')) {
      event.preventDefault(); navigate(target.href);
    } else if (target.hasAttribute('data-view')) {
      event.preventDefault(); setView(target.dataset.view);
    } else if (target.hasAttribute('data-reset')) {
      state.options = [...components.find(component => component.name === state.component).activeOptions];
      update({ focus: '[data-reset]', message: 'Example reset to the default selection.' });
    } else if (target.hasAttribute('data-share')) {
      copy(location.href, target);
    } else if (target.hasAttribute('data-copy-file') && currentExample) {
      copy(currentExample.files[Number(target.dataset.copyFile)].code, target, target.closest('figure').querySelector('code'));
    } else if (target.hasAttribute('data-download-file') && currentExample) {
      const file = currentExample.files[Number(target.dataset.downloadFile)]; download(file.code, file.name);
    } else if (target.hasAttribute('data-export') && currentReference) {
      event.preventDefault();
      const isJson = target.dataset.export === 'json';
      download(isJson ? JSON.stringify({ schemaVersion: 1, reference: currentReference, example: currentExample, provenance }, null, 2) : renderer.toMarkdown(currentReference, currentExample), `${currentExample.id}.${isJson ? 'json' : 'md'}`, isJson ? 'application/json' : 'text/markdown');
    } else if (target.hash && target.pathname === location.pathname) {
      // Native fragment navigation remains shareable and opens collapsed entries.
      setTimeout(() => revealAnchor(), 0);
    }
  });
  root.addEventListener('change', event => {
    const target = event.target;
    if (!target.matches('[data-choice], [data-source]')) return;
    const old = [...state.options];
    if (target.hasAttribute('data-source')) state.options = selectSource(state.component, state.options, target.value);
    else if (target.dataset.choice === 'loads') state.options = setLoads(state.component, state.options, target.checked);
    else state.options = selectOption(state.component, state.options, target.dataset.choice, target.checked);
    const cleared = old.filter(id => !state.options.includes(id));
    const names = components.find(component => component.name === state.component).groups.flatMap(group => group.choices);
    const message = cleared.length ? `Updated example. Cleared: ${cleared.map(id => names.find(choice => choice.id === id).name).join(', ')}.` : 'Example and reference updated.';
    update({ focus: target.hasAttribute('data-source') ? '[data-source]' : `[data-choice="${target.dataset.choice}"]`, message });
  });
  tabs.addEventListener('keydown', event => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault(); setView(event.target.dataset.view); return;
    }
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
    root.querySelectorAll('[data-property]').forEach(element => {
      const property = currentReference?.config.properties[element.dataset.property] || Object.values(currentReference?.config.properties || {}).find(property => property.name.toLowerCase() === element.dataset.property);
      // Related properties in Info do not belong to the configuration filter.
      if (!element.closest('[data-panel="config"]')) return;
      const matches = !query || `${property.name} ${property.type} ${property.description}`.toLowerCase().includes(query);
      element.hidden = !matches;
      if (matches) count++;
    });
    root.querySelectorAll('.ref-config-section').forEach(section => {
      section.hidden = Boolean(query) && ![...section.querySelectorAll('[data-property]')].some(property => !property.hidden);
      section.querySelectorAll('.ref-config-group').forEach(group => { group.hidden = ![...group.querySelectorAll('[data-property]')].some(property => !property.hidden); });
    });
    root.querySelector('[data-property-status]').textContent = query ? `${count} ${count === 1 ? 'property' : 'properties'} found.` : '';
  }
  root.addEventListener('input', event => {
    if (event.target.matches('[data-property-search]')) filterProperties(event.target.value);
    if (event.target.id === 'ref-component-search') {
      const query = event.target.value.toLowerCase().trim();
      let count = 0;
      root.querySelectorAll('[data-component-link]').forEach(link => {
        const component = components.find(component => component.name === link.dataset.componentLink);
        link.hidden = !`${component.name} ${component.description}`.toLowerCase().includes(query);
        if (!link.hidden) count++;
      });
      root.querySelector('[data-component-empty]').hidden = count > 0;
    }
  });
  window.addEventListener('popstate', () => {
    state = restoreSelection(new URL(location.href), initial);
    update({ writeHistory: false });
  });
  window.addEventListener('hashchange', () => revealAnchor());
  update({ replace: true, message: state.dropped.length ? `Restored this reference. Removed unavailable options: ${state.dropped.join(', ')}.` : '' });
}
