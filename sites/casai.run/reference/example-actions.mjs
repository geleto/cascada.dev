import { icons } from './render.mjs';

// Shared by the full reference and the homepage example explorer.
export function createExampleActions(announce) {
  const copyTimers = new WeakMap();
  function download(text, name, mime = 'text/plain') {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce(`Downloaded ${name}.`);
  }
  async function copyCode(text, button, code) {
    try {
      await navigator.clipboard.writeText(text);
      clearTimeout(copyTimers.get(button));
      button.innerHTML = icons.copied;
      button.classList.add('is-copied');
      button.title = 'Copied';
      copyTimers.set(button, setTimeout(() => {
        button.innerHTML = icons.copy;
        button.classList.remove('is-copied');
        button.title = button.getAttribute('aria-label') || 'Copy code';
      }, 1800));
      announce('Code copied.');
    } catch {
      const range = document.createRange(); range.selectNodeContents(code);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      code.closest('pre').focus();
      announce('Clipboard is unavailable. Code selected for manual copying.');
    }
  }
  return { copyCode, download };
}
