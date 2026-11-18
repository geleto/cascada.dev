import { basePath } from './state.mjs';

export function initializeGuide({ root, navigate }) {
  const host = document.querySelector('[data-guide]');
  if (!host) return;
  let pending;
  let loaded = Boolean(host.querySelector('[data-guide-loaded]'));
  const button = host.querySelector('[data-load-guide]');
  if (button) button.hidden = false;
  async function load() {
    if (loaded) return;
    if (pending) return pending;
    pending = (async () => {
      const response = await fetch(host.dataset.guideFragment);
      if (!response.ok) throw new Error(`Chapters returned HTTP ${response.status}`);
      const html = await response.text();
      const template = document.createElement('template');
      template.innerHTML = html;
      if (!template.content.querySelector('[data-guide-loaded]')) throw new Error('Chapter fragment is incomplete');
      host.replaceChildren(template.content);
      loaded = true;
      document.dispatchEvent(new CustomEvent('documentation:loaded'));
    })();
    try { await pending; }
    catch (error) {
      pending = undefined;
      if (button) { button.textContent = 'Retry loading chapters'; button.disabled = false; }
      // The ordinary link in the initial HTML remains available on failure.
      console.error('Could not load documentation chapters.', error);
      throw error;
    }
  }
  async function reveal() {
    if (!location.hash.startsWith('#guide-')) return;
    const requested = location.hash;
    try {
      await load();
      if (location.hash !== requested) return;
      const target = document.getElementById(decodeURIComponent(requested.slice(1)));
      if (target) {
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
        requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
      }
    } catch { /* Keep the fallback visible, with a usable full-page link. */ }
  }
  button?.addEventListener('click', () => { button.disabled = true; load().then(reveal).catch(() => {}); });
  document.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link || link.hasAttribute('download') || link.target || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href, location.href);
    if (!loaded && host.contains(link)) return;
    if (url.origin !== location.origin || (!url.pathname.startsWith(basePath) && url.pathname !== location.pathname)) return;
    if (url.hash.startsWith('#guide-') && !url.pathname.includes('/all/')) {
      event.preventDefault();
      const local = new URL(location.href); local.hash = url.hash;
      history.pushState(null, '', local);
      reveal();
    } else if (!root.contains(link) && link.hasAttribute('data-reference-link')) {
      event.preventDefault();
      navigate(url.href);
    }
  });
  if (!loaded && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect(); load().catch(() => {});
      }
    }, { rootMargin: '400px' });
    observer.observe(host);
  }
  window.addEventListener('hashchange', reveal);
  window.addEventListener('popstate', reveal);
  reveal();
}
