# cascada.dev
The Cascada website and blog, built with Eleventy.

## Development and publishing

Use Node.js 18 or newer. Run `npm ci` once, then `npm run dev` and open
`http://localhost:3000`. Eleventy watches the content, layouts, and assets.

Run `npm run build` and publish **the contents of `dist/`** to your static host.
The build clears old generated files first. No server-side runtime is needed.
`npm test` builds the site and checks the generated navigation, local links,
article images, feed, and homepage examples. Source files are not deployment
artifacts. The feed is at `/feed.xml` and the sitemap at `/sitemap.xml`.

### Publishing to OVHcloud

Run `npm run publish` to build the site and upload **only `dist/`** to OVHcloud.
This does not refresh the imported documentation; use `npm run docs:update`
separately when you want to update those sources.

Keep the hosting credentials in the local, Git-ignored `.env` file. On a new
checkout, copy `.env.example` to `.env` and fill in the username and password.
`OVH_FTP_REMOTE_DIR` must match the site's **Root folder** in OVHcloud's My sites
or Multisite settings, commonly `www`, relative to the FTP login directory.
The account home path, such as `/home/username`, is not itself the website
directory. See [OVHcloud's root folder guide](https://docs.ovhcloud.com/en/guides/web-cloud/web-hosting/diagnostic-index-of).

- `npm run publish -- --dry-run` builds and validates the upload contents and
  settings locally, without connecting to OVHcloud.
- `npm run publish -- --check` builds and checks the FTP login and existing
  target directory without uploading or changing remote files.
- `npm run publish` builds and uploads the site. Matching remote files are
  overwritten; other remote files remain. Removed or renamed pages may need
  separate cleanup on the server.

`OVH_FTP_SECURE=true` requires explicit FTP-over-TLS. Set it to `false` only
when using plain FTP, which sends credentials and files without encryption.
The script never silently falls back from TLS to plain FTP. Login, directory,
and transfer failures exit with an error; fix the issue and rerun the command.
The target directory must already exist. `.env` files and symbolic links in
the build output are rejected before connecting.

## Homepage and shared design

`pages/index.md` mixes Markdown content with HTML wrappers for the homepage layout.
Edit headings, paragraphs, links, lists, and fenced code samples in Markdown.
The HTML sections, columns, captions, tabs, and demo frames retain the existing
design and interactive controls. Leave a blank line between HTML wrappers and
Markdown content so Markdown is parsed normally.

The shared Markdown renderer supports attributes: `{#simple-title}` keeps a
heading's stable ID, and `{.lead}` on the line after a paragraph applies its
lead style. Fenced code can carry attributes after the language name, such as
`cascada {tabindex="0" aria-label="Greeting example"}`. Focus and label attributes
go on the code block's `<pre>`; IDs and data attributes go on `<code>`, preserving
the shared examples and copy controls. Cascada's `{{ ... }}` and `{% ... %}`
remain literal because Markdown content is not preprocessed as a template.

Eleventy renders the complete page at build time and adds
`_includes/layouts/base.njk`, the shared header and footer.
Edit `_data/site.json` to change the site URL or menu on every page. The Tutorial
link points to the migrated introduction; Blog points to `/blog/`.
Playground stays marked as coming soon.
The AI with Casai link opens `/ai/`, a short Casai overview maintained in `pages/ai.md`.
The footer links to `pages/about.md`. Its email username and domain are stored
separately as Base64 in `data-email-user` and `data-email-domain`; `main.js`
decodes them and creates the visible email and clickable link. Encode each part
separately when changing the address. Without JavaScript, the contact sentence
links to LinkedIn. This discourages basic harvesting; it does not keep the
address secret from scrapers that decode it or run JavaScript.

The header spans the viewport, with the brand at the left and navigation plus
GitHub grouped at the right. Every page shows the Cascada name beside the logo.
The header stays visible while scrolling: its outer spacing scrolls away until
it reaches 44px high, then stays compact. The logo and brand name shrink with it;
scrolling back to the top restores their full size and the full header height.
CSS pins the header, while `main.js` scales the brand with the scroll position.
Anchor offsets and the documentation sidebar leave room for the menu.
At 960px and below the menu becomes a drop-down,
with GitHub at its top right. The drop-down scrolls within short viewports;
without JavaScript its links remain visible in the page flow.

The footer has Light, Dark, and Auto appearance choices. Auto is the default and
follows the system setting; an explicit choice is remembered in local storage
across pages and visits. `theme.js` runs before the stylesheets to avoid a flash
of the wrong theme and keeps the embedded workflow examples in sync. Theme
colors live in `styles.css`; without JavaScript the site follows the system.

`styles.css` and `main.js` are shared across the site. `content.css` adds scoped
article and blog styles without changing the homepage. `docs/home.md` remains
the original homepage copy and is excluded from the build.

The concurrent-results example has Workflow and Code tabs, with the Code tab
reusing the headphones script above. Both homepage workflow demos embed
`demos/headphones-workflow.html`, a standalone HTML animation copied directly
into the build. Code examples include copy icons when
clipboard access is supported. The menu
collapses on mobile, and all homepage text remains available without JavaScript.

## Adding a blog post

Create `posts/my-post.md`:

```markdown
---
title: My post
date: '2026-10-24'
description: A short description for search results, social sharing, and the feed.
tags: [cascada]
---
Write the article in Markdown. The layout supplies its title, date, and author.
```

`posts/posts.json` supplies the post layout and collection membership. The post
appears automatically at `/posts/my-post/`, in `/blog/`, and in the feed.
Posts are listed newest first. There are no automatic header images; add images
explicitly in the body, as in `posts/cascada-kitchen-chef.md`.
The blog listing automatically generates a plain-text excerpt from the beginning
of each article, shortened to roughly 200 characters at a word boundary, with a
Read more link. Editing the article updates its excerpt on the next build;
there is no separate excerpt field to maintain.

## Adding a regular page

Create `pages/getting-started.md`:

```markdown
---
title: Getting started
description: Install Cascada and run your first script.
---
Write the page in Markdown, starting sections with `##`.
```

It becomes `/getting-started/`, using the shared menu, footer, and article
styling. Nested paths work too: `pages/guides/setup.md` becomes `/guides/setup/`.
Set `permalink: /another-url/` in front matter to override the URL. Regular
pages do not enter the blog or feed. Add a link in `_data/site.json` when a page
should appear in the menu; creating a page does not automatically add a menu item.

Markdown supports embedded HTML for figures, custom formatting, and other rich
content. You can also use `.html` files in `pages/`. HTML and Markdown content
are not processed as Nunjucks, so Cascada examples using `{{ ... }}` and
`{% ... %}` remain literal, including inside fenced code blocks. Layouts and
explicit `.njk` files use Nunjucks normally.

The four migrated Cascada articles retain their `/posts/.../` paths. The
AI-development and Semachunk articles were not imported. The source blog in
the separate repository is untouched; any redirects from its old domain must
be configured there when this site is published.

## Documentation

The menu links to `/cascada-script/` and `/cascada-template/`. Both use the shared
documentation layout with a generated H2/H3 index on the left, and contain their complete text and
code in the initial HTML. They use the shared menu, `content.css`, code
highlighting, and Markdown renderer (`scripts/markdown.mjs`). `docs.css` only
adds the compact documentation spacing and sidebar layout. The mobile index
uses a native expandable control; no iframe or runtime document loading is used.
The index highlights the section being read and scrolls its own pane to keep
that entry visible, without moving the document or keyboard focus.

Refresh the docs explicitly from the sibling Cascada checkout:

```sh
npm run docs:update
```

Or choose a different local checkout:

```sh
npm run docs:update -- --source C:\Projects\cascada
```

This reads `docs/cascada/script.md` and `docs/cascada/template.md` from that
checkout, saves copies in `docs/source/` with em dashes replaced by hyphens, generates HTML and both sidebar
indexes in `docs/generated/`, and builds the site into `dist/`. It reads the
checkout's current files, including local edits; it does not pull or change
that repository. Update the source checkout yourself when you want newer docs.
`docs/source/source.json` records the source commit, whether the source docs
were modified, and their content hashes (with line endings normalized to LF).

To regenerate from the saved Markdown without accessing the Cascada checkout:

```sh
npm run docs:generate
```

Commit both `docs/source/` and `docs/generated/` when refreshing documentation.
Ordinary `npm run build` and `npm run dev` use the saved HTML fragments, so
editing the site never refreshes the documentation. Neither docs command
uploads anything or publishes to GitHub Pages. The existing site sitemap
includes both documentation pages. Markdown downloads are available at
`/cascada-script/README.md` and `/cascada-template/README.md`.

The index builder and legacy heading IDs are adapted from Cascada's
`scripts/docs-gen.js` (license in `docs/licenses/cascada.txt`). Fenced code is
rendered by the same `markdown-it` module as Eleventy's other pages, with no
separate Markdown engine or theme. Links between the docs and migrated posts
resolve locally; references to other Markdown files point to the source commit
on GitHub.

## Logo

`logo.svg` is a standalone vector asset with a 64 × 64 CSS-pixel default size.
Its `viewBox` preserves the artwork's proportions when resized.

For a standard image, specify its size and alternative text:

```html
<img src="/logo.svg" width="32" height="32" alt="Cascada">
```

For a logo that follows your theme, inline the contents of `logo.svg` in your HTML
and add a class to its opening `<svg>` tag. The shared `fill="currentColor"`
uses the CSS `color` of the SVG or its parent:

```css
.cascada-logo {
  width: 2rem;
  height: 2rem;
  color: #635bff;
}
```

An SVG loaded through `<img>` does not inherit the page's `color`; this file
renders black in that case. To recolor the external file with CSS, use a mask:

```html
<span class="cascada-logo-mask" role="img" aria-label="Cascada"></span>
```

```css
.cascada-logo-mask {
  display: inline-block;
  width: 2rem;
  height: 2rem;
  color: #635bff;
  background-color: currentColor;
  mask: url("/logo.svg") center / contain no-repeat;
}
```

The SVG includes an accessible name for inline use. If it is decorative beside
equivalent text, replace its `role` and `aria-label` with `aria-hidden="true"`.
For a decorative `<img>`, use `alt=""`. When the logo is the only content of a
home link, give the image or link a name such as "Cascada home".
