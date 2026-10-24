// Small progressive enhancements; all page content is available without JavaScript.
const siteHeader = document.querySelector('.site-header');
const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#primary-nav');
const smallScreen = window.matchMedia('(max-width: 960px)');

// Scale the brand with the space that scrolls away, without changing document flow.
let headerShrinkDistance;
let previousHeaderShrink;
let headerUpdateQueued = false;
function updateHeaderScale() {
  headerUpdateQueued = false;
  const shrink = Math.min(1, Math.max(0, window.scrollY) / headerShrinkDistance);
  if (shrink === previousHeaderShrink) return;
  previousHeaderShrink = shrink;
  siteHeader.style.setProperty('--header-shrink', String(shrink));
}
function measureHeaderShrink() {
  const style = getComputedStyle(siteHeader);
  headerShrinkDistance = Math.max(1, parseFloat(style.getPropertyValue('--header-expanded-height')) - parseFloat(style.getPropertyValue('--header-min-height')));
  updateHeaderScale();
}
measureHeaderShrink();
smallScreen.addEventListener('change', measureHeaderShrink);
window.addEventListener('pageshow', updateHeaderScale);
window.addEventListener('scroll', () => {
  if (headerUpdateQueued) return;
  headerUpdateQueued = true;
  requestAnimationFrame(updateHeaderScale);
}, { passive: true });

function closeMenu() {
  menuToggle.setAttribute('aria-expanded', 'false');
  navigation.hidden = smallScreen.matches;
}

menuToggle.hidden = false;
siteHeader.classList.add('has-menu-toggle');
closeMenu();
smallScreen.addEventListener('change', closeMenu);
menuToggle.addEventListener('click', () => {
  const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!expanded));
  navigation.hidden = expanded;
});
navigation.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && smallScreen.matches) {
    closeMenu();
    menuToggle.focus();
  }
});

// Native details keeps the static docs index usable without JavaScript too.
const docsIndex = document.querySelector('.docs-index');
if (docsIndex) {
  const compactDocs = window.matchMedia('(max-width: 760px)');
  const resizeIndex = () => { docsIndex.open = !compactDocs.matches; };
  resizeIndex();
  compactDocs.addEventListener('change', resizeIndex);
  docsIndex.addEventListener('click', (event) => {
    if (compactDocs.matches && event.target.closest('a')) docsIndex.open = false;
  });

  const sections = [...docsIndex.querySelectorAll('nav a[href^="#"]')]
    .map((link) => ({ link, heading: document.getElementById(decodeURIComponent(link.hash.slice(1))) }))
    .filter(({ heading }) => heading);
  let activeLink;
  let updateQueued = false;
  let revealCurrent = false;

  function updateIndex() {
    updateQueued = false;
    let current = sections[0];
    // Match the anchor clearance, allowing a pixel for fractional scroll positions.
    const sectionThreshold = siteHeader.getBoundingClientRect().bottom + 41;
    for (const section of sections) {
      if (section.heading.getBoundingClientRect().top <= sectionThreshold) current = section;
      else break;
    }
    // A short final section may never reach the top of the viewport.
    if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
      current = sections[sections.length - 1];
    }
    if (!current) return;

    const changed = activeLink !== current.link;
    if (changed) {
      activeLink?.removeAttribute('aria-current');
      activeLink = current.link;
      activeLink.setAttribute('aria-current', 'location');
    }
    if (docsIndex.open && (changed || revealCurrent)) {
      const scroller = compactDocs.matches ? docsIndex.querySelector('nav') : docsIndex.closest('.docs-sidebar');
      const bounds = scroller.getBoundingClientRect();
      const item = activeLink.getBoundingClientRect();
      // Scroll only the index pane, never the document or the keyboard focus.
      if (item.top < bounds.top + 8) scroller.scrollTop += item.top - bounds.top - 8;
      else if (item.bottom > bounds.bottom - 8) scroller.scrollTop += item.bottom - bounds.bottom + 8;
    }
    revealCurrent = false;
  }

  function queueIndexUpdate(reveal = false) {
    revealCurrent ||= reveal;
    if (updateQueued) return;
    updateQueued = true;
    requestAnimationFrame(updateIndex);
  }

  window.addEventListener('scroll', () => queueIndexUpdate(), { passive: true });
  window.addEventListener('hashchange', () => queueIndexUpdate(true));
  window.addEventListener('resize', () => queueIndexUpdate(true));
  window.addEventListener('load', () => queueIndexUpdate(true));
  docsIndex.addEventListener('toggle', () => queueIndexUpdate(true));
  queueIndexUpdate(true);
}

// Reuse the original example so all views always show exactly the same code.
document.querySelectorAll('[data-code-source]').forEach((code) => {
  code.textContent = document.getElementById(code.dataset.codeSource).textContent;
});

// Highlight text nodes rather than parsing HTML or loading a third-party script.
const tokens = /(?<comment>\/\/[^\n]*)|(?<string>"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`)|(?<delimiter>\{%|%\}|\{\{|\}\})|\b(?<keyword>function|endfunction|if|endif|return|for|endfor|each|endeach|var|data|in|of|is|error|const|new|async|await|type|export|import|as|from|set)\b|\b(?<number>\d+)\b|\b(?<function>[A-Za-z_$][\w$]*)(?=\()/g;

document.querySelectorAll('pre code').forEach((code) => {
  const source = code.textContent;
  const fragment = document.createDocumentFragment();
  let end = 0;
  for (const match of source.matchAll(tokens)) {
    fragment.append(document.createTextNode(source.slice(end, match.index)));
    const token = document.createElement('span');
    const type = Object.keys(match.groups).find((key) => match.groups[key] !== undefined);
    token.className = `token-${type}`;
    token.textContent = match[0];
    fragment.append(token);
    end = match.index + match[0].length;
  }
  fragment.append(document.createTextNode(source.slice(end)));
  code.replaceChildren(fragment);
});

const copyStatus = document.querySelector('#copy-status');
const copyIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
const copiedIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 12 4 4L19 6"/></svg>';
document.querySelectorAll('.copy-button').forEach((button) => {
  if (!navigator.clipboard?.writeText) return;
  const label = button.getAttribute('aria-label');
  button.innerHTML = copyIcon;
  button.title = label;
  button.hidden = false;
  let reset;
  button.addEventListener('click', async () => {
    clearTimeout(reset);
    copyStatus.textContent = '';
    try {
      await navigator.clipboard.writeText(button.closest('figure').querySelector('code').textContent);
      button.innerHTML = copiedIcon;
      button.classList.add('is-copied');
      button.title = 'Copied!';
      copyStatus.textContent = `${label.replace(/^Copy /, '')} copied to clipboard.`;
    } catch {
      button.innerHTML = copyIcon;
      button.classList.remove('is-copied');
      button.title = 'Code selected for manual copying';
      const code = button.closest('figure').querySelector('code');
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      code.closest('pre').focus();
      copyStatus.textContent = 'Clipboard access is unavailable. The code is selected for manual copying.';
    }
    reset = setTimeout(() => {
      button.innerHTML = copyIcon;
      button.classList.remove('is-copied');
      button.title = label;
    }, 2000);
  });
});

// Each example owns its tabs and animation visibility.
const demos = [...document.querySelectorAll('.animation-panel iframe')].map((frame) => ({
  frame,
  panel: frame.closest('[role="tabpanel"]'),
  visible: !('IntersectionObserver' in window),
}));
function updateDemoVisibility() {
  demos.forEach(({ frame, panel, visible }) => {
    frame.contentWindow?.postMessage({
      type: 'cascada:visibility',
      visible: visible && !panel.hidden && !document.hidden,
    }, window.location.origin);
  });
}

document.querySelectorAll('.example-tablist').forEach((tablist) => {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  function selectExampleTab(selectedTab) {
    tabs.forEach((tab) => {
      const selected = tab === selectedTab;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    });
    updateDemoVisibility();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectExampleTab(tab));
    tab.addEventListener('keydown', (event) => {
      let nextIndex;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = tabs.length - 1;
      else return;
      event.preventDefault();
      selectExampleTab(tabs[nextIndex]);
      tabs[nextIndex].focus();
    });
  });
  tablist.hidden = false;
});

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  const demo = demos.find(({ frame }) => event.source === frame.contentWindow);
  if (!demo || demo.panel.hidden) return;
  if (event.data?.type === 'cascada:resize' && Number.isFinite(event.data.height) && event.data.height > 0) {
    demo.frame.style.height = Math.max(200, Math.min(1400, event.data.height)) + 'px';
  }
});
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      demos.find(({ frame }) => frame === entry.target).visible = entry.isIntersecting;
    });
    updateDemoVisibility();
  }, { threshold: 0.15 });
  demos.forEach(({ frame }) => observer.observe(frame));
}
demos.forEach(({ frame }) => frame.addEventListener('load', updateDemoVisibility));
document.addEventListener('visibilitychange', updateDemoVisibility);
