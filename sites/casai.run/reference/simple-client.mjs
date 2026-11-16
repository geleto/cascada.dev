import { createMatrix } from '../docs/matrix/profiles.js';
import provenance from '../docs/matrix-source.json';
import { createRenderer } from './render.mjs';
import { selectionUrl } from './state.mjs';
import { createExampleActions } from './example-actions.mjs';

const root = document.querySelector('[data-simple-matrix]');
if (root) initialize(root);

function initialize(root) {
  const matrix = createMatrix('simple');
  const renderer = createRenderer(provenance, { profile: 'simple' });
  const initial = { component: root.dataset.component, options: root.dataset.options.split(',').filter(Boolean) };
  const componentButtons = root.querySelectorAll('[data-component-choice]');
  const customize = root.querySelector('.ref-customize');
  const status = root.querySelector('[data-ref-status]');
  let state = restore(), currentExample, version = 0;
  componentButtons.forEach(button => { button.disabled = false; });
  root.classList.add('is-enhanced');
  let announcementTimer;
  function announce(message) {
    clearTimeout(announcementTimer);
    status.textContent = message;
    announcementTimer = setTimeout(() => { status.textContent = ''; }, 5000);
  }

  function restore() {
    const query = new URL(location.href).searchParams;
    const component = matrix.components.find(item => item.name === query.get('component'))?.name || initial.component;
    const options = query.has('options') ? query.get('options').split(',').filter(Boolean)
      : component === initial.component ? initial.options : undefined;
    return { component, options: matrix.normalizeOptions(component, options).activeOptions };
  }
  function writeUrl() {
    const url = new URL(location.href);
    url.searchParams.set('component', state.component);
    if (state.options.length) url.searchParams.set('options', state.options.join(','));
    else url.searchParams.delete('options');
    url.hash = 'components';
    if (url.href !== location.href) history.pushState(null, '', url);
  }
  async function update({ focus, history = false } = {}) {
    const pending = ++version;
    const selected = { component: state.component, options: [...state.options] };
    try {
      const example = await matrix.render(selected.component, selected.options);
      if (pending !== version) return;
      currentExample = example;
      componentButtons.forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.componentChoice === selected.component));
      });
      root.querySelector('[data-simple-heading]').innerHTML = renderer.simpleHeading(example);
      root.querySelector('[data-controls]').innerHTML = renderer.simpleControls(example);
      root.querySelector('[data-simple-example]').innerHTML = renderer.example(example, null, { compact: true });
      root.querySelector('[data-full-reference]').href = selectionUrl(selected.component, selected.options, 'example', '#component-factories');
      customize.hidden = !root.querySelector('[data-controls] :is([data-choice], [data-source])');
      root.querySelector('[data-reset-example]').disabled = selected.options.join(',') === matrix.normalizeOptions(selected.component).activeOptions.join(',');
      if (history) writeUrl();
      if (focus) root.querySelector(focus)?.focus({ preventScroll: true });
      if (pending > 1) announce(`${selected.component} example updated.`);
    } catch (error) {
      announce(`The example could not be updated. ${error.message}`);
    }
  }
  function change(options, focus) {
    state.options = options;
    update({ focus, history: true });
  }
  const controls = () => matrix.getControls(state.component, state.options, { unavailable: 'include' });
  root.addEventListener('change', event => {
    const target = event.target;
    if (target.matches('[data-choice]')) {
      const choice = controls().flatMap(section => (section.groups || []).flatMap(group => group.choices))
        .find(choice => choice.id === target.dataset.choice);
      if (choice?.transition && target.checked !== choice.active) change(choice.transition.activeOptions, `[data-choice="${choice.id}"]`);
    }
  });
  const { copyCode, download } = createExampleActions(announce);
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-component-choice')) {
      const component = button.dataset.componentChoice;
      if (component === state.component) return;
      state = { component, options: matrix.normalizeOptions(component).activeOptions };
      update({ focus: `[data-component-choice="${component}"]`, history: true });
    } else if (button.hasAttribute('data-reset-example')) {
      change(matrix.normalizeOptions(state.component).activeOptions, `[data-component-choice="${state.component}"]`);
    } else if (button.hasAttribute('data-source')) {
      const choice = controls().find(section => section.id === 'source')?.control?.choices.find(choice => choice.id === button.dataset.source);
      if (choice?.transition) change(choice.transition.activeOptions, `[data-source="${choice.id}"]`);
    } else if (button.hasAttribute('data-copy-file') && currentExample) {
      const file = currentExample.files[Number(button.dataset.copyFile)];
      copyCode(file.code, button, button.closest('figure').querySelector('code'));
    } else if (button.hasAttribute('data-download-file') && currentExample) {
      const file = currentExample.files[Number(button.dataset.downloadFile)];
      download(file.code, file.name);
    }
  });
  window.addEventListener('popstate', () => { state = restore(); update(); });
  update();
}
