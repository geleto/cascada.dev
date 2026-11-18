import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';

for (const site of ['cascada.dev', 'casai.run']) {
  test(`${site} ships a self-contained menu script that opens, closes and follows viewport changes`, t => {
    const output = join('dist', site);
    const html = readFileSync(join(output, 'index.html'), 'utf8');
    const url = html.match(/<script src="(\/assets\/main-[a-f\d]{16}\.js)" type="module">/)?.[1];
    assert.ok(url, 'pages load a versioned .js bundle');
    const script = readFileSync(join(output, url), 'utf8');
    const dom = new JSDOM(html, { url: `https://${site}/`, runScripts: 'outside-only', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    const { document } = dom.window;
    const menu = document.querySelector('.menu-toggle');
    const nav = document.querySelector('#primary-nav');
    const changes = new Set();
    const media = {
      matches: true,
      addEventListener: (event, listener) => { if (event === 'change') changes.add(listener); },
    };
    dom.window.matchMedia = query => query === '(max-width: 960px)'
      ? media : { matches: false, addEventListener() {} };

    assert.equal(nav.hidden, false, 'the static fallback keeps links accessible');
    assert.equal(menu.hidden, true);
    // Execute the actual published file, with no module loader or secondary
    // requests. A raw import of syntax.mjs would fail here like the live host.
    dom.window.eval(script);
    assert.equal(menu.hidden, false);
    assert.equal(nav.hidden, true);
    assert.equal(menu.getAttribute('aria-expanded'), 'false');

    menu.click();
    assert.equal(nav.hidden, false);
    assert.equal(menu.getAttribute('aria-expanded'), 'true');
    menu.click();
    assert.equal(nav.hidden, true);
    assert.equal(menu.getAttribute('aria-expanded'), 'false');

    menu.click();
    nav.querySelector('a').focus();
    nav.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(nav.hidden, true);
    assert.equal(document.activeElement, menu);

    media.matches = false;
    changes.forEach(listener => listener(media));
    assert.equal(nav.hidden, false, 'desktop navigation remains visible');
    media.matches = true;
    changes.forEach(listener => listener(media));
    assert.equal(nav.hidden, true, 'returning to mobile closes the menu');
  });
}
