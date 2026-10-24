// Run before the stylesheets so a saved preference applies before first paint.
(() => {
  const key = 'cascada-theme';
  const choices = ['light', 'dark', 'auto'];
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'auto';

  function savedPreference() {
    try { return localStorage.getItem(key); } catch { return preference; }
  }

  function syncFrame(frame) {
    frame.contentWindow?.postMessage({ type: 'cascada:theme', preference }, window.location.origin);
  }

  function apply(value) {
    preference = choices.includes(value) ? value : 'auto';
    root.dataset.themePreference = preference;
    root.dataset.theme = preference === 'auto' ? (system.matches ? 'dark' : 'light') : preference;
    document.querySelectorAll('input[name="theme"]').forEach((input) => {
      input.checked = input.value === preference;
    });
    document.querySelectorAll('.animation-panel iframe').forEach(syncFrame);
  }

  let initial = savedPreference();
  // The embedded examples also follow an in-memory choice if storage is blocked.
  try {
    if (window.parent !== window) initial = window.parent.document.documentElement.dataset.themePreference || initial;
  } catch { /* A standalone example can also be embedded by another origin. */ }
  apply(initial);

  document.addEventListener('DOMContentLoaded', () => {
    const control = document.querySelector('.theme-switch');
    if (control) {
      control.closest('.footer-appearance').hidden = false;
      control.addEventListener('change', (event) => {
        if (event.target.name !== 'theme' || !choices.includes(event.target.value)) return;
        apply(event.target.value);
        try { localStorage.setItem(key, preference); } catch { /* Works for this page without storage. */ }
      });
    }
    document.querySelectorAll('.animation-panel iframe').forEach((frame) => {
      frame.addEventListener('load', () => syncFrame(frame));
    });
    apply(preference);
  });

  system.addEventListener('change', () => { if (preference === 'auto') apply('auto'); });
  window.addEventListener('storage', (event) => {
    if (event.key === key || event.key === null) apply(savedPreference());
  });
  window.addEventListener('pageshow', (event) => { if (event.persisted) apply(savedPreference()); });
  window.addEventListener('message', (event) => {
    if (window.parent === window || event.source !== window.parent || event.origin !== window.location.origin) return;
    if (event.data?.type === 'cascada:theme' && choices.includes(event.data.preference)) apply(event.data.preference);
  });
})();
