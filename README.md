# Cascada and Casai websites

One Eleventy project builds independent static websites for `cascada.dev` and
`casai.run`. They share layouts, components, Markdown rendering, browser code,
and development, documentation, test, and publishing scripts. Content and
branding belong to each site. There is one package.json and one lockfile; no
workspace packages or separately versioned design library are needed.

## Structure

```text
sites.json                      # Site registry: ports, SFTP prefixes, docs sources
.env.example                    # Shared template; copy into a site directory
sites/
  cascada.dev/
    .env                        # Local publishing settings (Git-ignored)
    _data/site.json             # Name, URL, menus, metadata, blog settings
    pages/                      # Homepage and regular pages
    posts/                      # Blog posts
    public/                     # logo.svg, brand.css, images, demos
    docs/source/                # Saved imported Markdown and provenance
    docs/generated/             # Saved reference HTML and sidebar indexes
  casai.run/
    .env                        # Local publishing settings (Git-ignored)
    _data/site.json
    pages/
    public/
shared/
  _includes/                    # Layouts, header/footer, blog/feed/sitemap/404
  public/                       # Shared CSS and browser JavaScript
  data/                         # Shared page and post defaults
scripts/                        # Common build, dev, docs, and SFTP tooling
tests/
docs/licenses/
dist/
  cascada.dev/                   # Deploy this directory to cascada.dev
  casai.run/                     # Deploy this directory to casai.run
```

Cascada retains its existing public URLs. Casai currently has a minimal homepage
and documentation links, using deep teal for its header, navy for the Why Casai section and footer,
and the supplied Casai SVG logo. Its content can develop independently.

## Development and building

Use Node.js 18.20.4 or newer. Run `npm ci` once. Commands accept an optional website
name after `--`; omitting it selects all registered websites.

| Command | Result |
| --- | --- |
| `npm run dev` | Serve Cascada on http://localhost:3000 and Casai on http://localhost:3001 |
| `npm run dev -- casai.run` | Serve only Casai on port 3001 |
| `npm run build` | Build both sites into separate `dist/<website>/` folders |
| `npm run build -- cascada.dev` | Clean and build only Cascada's output |
| `npm test` | Build both and run content, rendering, isolation, and publishing checks |

`npm start` is an alias for `npm run dev`. Each dev server watches its site's
content and assets plus the shared code. Changes to shared layouts affect both
sites. Restart development servers after changing registry settings such as
ports or documentation sources. An occupied port produces an error instead of
silently serving a different site at the expected URL. Ctrl+C stops the servers.

Production builds remove stale files only from the selected site's output.
Do not run a production build or publish command for a site while its dev server
is writing that same output directory. Use a separate checkout if necessary.
No server-side runtime is needed on the host.

## Publishing to OVHcloud

```sh
npm run publish -- cascada.dev --dry-run
npm run publish -- casai.run --check
npm run publish -- cascada.dev
npm run publish
```

The final command builds and publishes **all registered sites**. A named command
builds and publishes only that site. Only the contents of `dist/<website>/` are
uploaded to that site's configured target. Never upload the parent `dist/`.
Publishing does not refresh imported documentation.

Keep one shared template at the root: `.env.example`. Copy it into each site's
directory as `.env`, then fill in that site's hosting account and destination:

```powershell
Copy-Item .env.example sites/cascada.dev/.env
Copy-Item .env.example sites/casai.run/.env
```

Copy only for a site that does not already have a configured `.env`. The former
root `.env` has moved to `sites/cascada.dev/.env`; its existing settings are
preserved. A root `.env` is no longer loaded.

Each file uses the same unprefixed keys: `OVH_SFTP_HOST`, `OVH_SFTP_PORT`,
`OVH_SFTP_USER`, `OVH_SFTP_PASSWORD`, and `OVH_SFTP_REMOTE_DIR`.
Publishing always uses SFTP with SSH encryption; the port defaults to 22.
SFTP access must be enabled for the hosting user in OVHcloud.
Use the actual site root folder from OVHcloud's My sites / Multisite settings,
relative to the SFTP account's home directory. Both sites use `www` under their
own accounts. Fill in all required values even when sites share a hosting account.

Publishing one site loads only `sites/<website>/.env`. Publishing all parses each
file independently; settings never carry over to another site. Actual `.env`
files are Git-ignored and excluded from website builds. Only the root template
is committed; it contains no credentials.

For shell/CI overrides, use the site's `envPrefix` from `sites.json`, such as
`CASAI_OVH_SFTP_PASSWORD` or `CASCADA_OVH_SFTP_REMOTE_DIR`. These take precedence
over the matching site's file. Unprefixed shell variables are not shared
publishing defaults. CI may supply all required prefixed variables without a
local `.env` file.

- `--dry-run` validates configuration and builds/inspects the selected outputs,
  without connecting.
- `--check` also checks the SFTP login and existing target directory, without
  uploading or changing remote files.
- Without either flag, matching remote files are overwritten. Other remote files
  remain; removed or renamed pages may need separate server cleanup.

Every selected site's configuration and build is validated before the first
connection. Overlapping configured destinations on the same SFTP account are
rejected. Uploads are sequential, not transactional: if a later upload fails,
an earlier site may already be published. Correct the failure and rerun that
site's command.

SFTP remembers the SSH host key on the first successful connection in the
Git-ignored `.cache/sftp-host-keys/` directory and rejects subsequent key changes.
This is trust on first use. For a fingerprint verified through a trusted source,
set `OVH_SFTP_HOST_KEY_SHA256=SHA256:...` (or the site-prefixed shell/CI override)
to enforce that key from the first connection. Verify a host key change with the
provider before updating the saved fingerprint; it is never silently replaced.

Target directories must already exist and must not
resolve to the account root. `.env` files, Git/dependency directories, and symbolic
links in build output are rejected before uploading. See
[OVHcloud's root folder guide](https://docs.ovhcloud.com/en/guides/web-cloud/web-hosting/diagnostic-index-of).

## Branding, menus, and shared design

Edit `sites/<website>/_data/site.json` to change the name, canonical URL,
description, author, header and footer navigation, GitHub link, optional upcoming
navigation labels, and browser theme color. Set `blog` to true to generate the
shared blog and Atom feed; `blogDescription` supplies the blog introduction.
A site without a blog has no blog/feed links or output. Sitemaps and feeds contain
only the current site's content and canonical domain.

Put each site's public assets in `sites/<website>/public/`. They are copied to
that site's root, so its logo is always `/logo.svg` and its palette `/brand.css`.
Shared assets retain stable URLs such as `/styles.css` and `/main.js`. Keep
site-specific asset filenames separate from files in `shared/public/`.

`brand.css` loads after the common stylesheet. Override semantic CSS variables
such as `--brand` (header), `--accent` (links/controls), and `--brand-deep`
(footer/feature sections). Values can use `light-dark(light, dark)`; additional
surface and syntax variables are defined in `shared/public/styles.css`.

The header, footer, mobile menu, sticky shrinking header, appearance controls,
code highlighting/copy buttons, article styles, and documentation sidebar remain
shared. The footer offers Light, Dark, and Auto; Auto follows the system. Set a
unique `themeStorageKey` per site to identify each brand?s saved appearance preference. Local preview ports also
keep separate storage because they have different origins. Cascada's
existing `cascada-theme` preference is preserved.

Both logos use `fill="currentColor"`, so inline SVGs follow the CSS `color` of
their parent (or a `color` set directly on the SVG). The shared `.brand-mark`
masks `/logo.svg` with the current text color; for example,
`.brand-mark { color: #1b666b; }` recolors it without editing the asset. A regular
`<img src="/logo.svg" width="32" height="32" alt="Casai">` can also be used,
but an external SVG does not inherit the page's color. Keep an accessible name
for a standalone logo and hide decorative marks beside equivalent text.

## Pages and posts

Each site's `pages/pages.11tydata.js` imports the shared page defaults. Create
`sites/<website>/pages/getting-started.md`:

```markdown
---
title: Getting started
description: A short description for search and sharing.
---
Write the page in Markdown, starting sections with ##.
```

It becomes `/getting-started/`. Nested paths work too: `pages/guides/setup.md`
becomes `/guides/setup/`. Use `permalink: /another-url/` to override the URL.
Add menu links in that site's `_data/site.json`; page creation does not add one.

For a blog, set `blog: true` and create `posts/posts.11tydata.js` containing:

```js
module.exports = require('../../../shared/data/posts.cjs');
```

Then create `sites/<website>/posts/my-post.md`:

```markdown
---
title: My post
date: '2026-10-24'
description: A short description for search, social sharing, and the feed.
tags: [example]
---
Write the article in Markdown. The layout supplies its title, date, and author.
```

Posts appear at `/posts/my-post/`, in `/blog/`, and in `/feed.xml`, newest first.
The listing generates an excerpt from the body. There are no automatic header
images; insert images explicitly in the article. Regular pages never enter the
blog or feed. Shared endpoint templates use
[Eleventy's virtual templates](https://www.11ty.dev/docs/virtual-templates/), so
new sites do not need copies of blog/feed/sitemap/robots/404 files.

Markdown supports embedded HTML and attributes. Keep blank lines around HTML
wrappers. `{#stable-title}` sets a heading ID; `{.lead}` after a paragraph adds a
class. Fenced code accepts attributes such as
`cascada {tabindex="0" aria-label="Greeting example"}`. Focus/label attributes go
on `<pre>`; IDs/data attributes go on `<code>`. HTML and Markdown are not processed
as Nunjucks, so `{{ ... }}` and `{% ... %}` examples remain literal. Explicit
`.njk` templates and layouts use Nunjucks normally.

Cascada's homepage retains its Markdown/HTML sections, interactive tabs, and
embedded `public/demos/headphones-workflow.html` animations. Its four migrated
posts retain their original URLs. The AI-development and Semachunk posts remain
excluded. The About page still encodes the public email username/domain
separately in Base64 for `main.js` to decode; this discourages basic harvesting,
but is not secret storage. Without JavaScript its contact sentence links to
LinkedIn.

## Imported documentation

Documentation tooling is shared; configuration and saved source/generated
files belong to each site. Cascada imports the script and template references
from the sibling Cascada checkout. Casai currently links to upstream references
and has no imported documentation profile.

```sh
npm run docs:update
npm run docs:update -- cascada.dev --source C:\Projects\cascada
npm run docs:generate -- cascada.dev
```

With no site name, these commands process all sites that have `documentation`
configured in `sites.json`. Selecting a site without a profile gives an error.
`--source` overrides the checkout for one selected profile and is valid only for
`docs:update`.

The profile defines the default checkout (relative to this project), GitHub
repository, source directory, named documents with file paths/public URLs, and
optional legacy URL aliases. Refresh reads the checkout's current files,
including local edits, without pulling or modifying that repository. It saves
Markdown in `sites/<website>/docs/source/`, normalizes em dashes to hyphens, and
records the source commit, modified state, and SHA-256 hashes with LF line
endings in `source.json`. Both commands render HTML and H2/H3 indexes in
`docs/generated/` and rebuild only the affected sites locally. They do not
publish. Commit both source and generated documentation when refreshing.

Ordinary builds/dev/publish use the saved fragments and never refresh upstream
content. The `documentation` shortcode selects only fragments from the current
site's profile. See Cascada's `pages/cascada-script.njk` and
`pages/cascada-template.njk` for reference pages using `layouts/docs.njk` and the
shared sidebar. Markdown downloads are emitted at each document URL followed
by `README.md`.

The Markdown renderer is shared with regular pages and posts. Links among
configured documents resolve locally; other relative source links point to the
recorded GitHub commit. The sidebar contains static HTML and uses JavaScript to
highlight the current section without moving keyboard focus. The index builder
and legacy heading IDs are adapted from Cascada's `scripts/docs-gen.js`;
licenses remain in `docs/licenses/`.

## Adding another website

1. Add its domain to `sites.json` with a unique port and uppercase `envPrefix`.
2. Create `sites/<domain>/_data/site.json`, `pages/`, and `public/`. Copy a site
   metadata file and set its name, URL, menus, theme fields, and blog settings.
3. Add `public/brand.css`, `public/logo.svg`, and `pages/index.md`. The page
   defaults file contains `module.exports = require('../../../shared/data/pages.cjs');`.
4. Add posts or a documentation profile only when needed.
5. Copy the root `.env.example` to `sites/<domain>/.env` and configure its account
   and `OVH_SFTP_REMOTE_DIR`. Shell/CI overrides use the site's `<PREFIX>_OVH_SFTP_*`.
6. Run `npm run build -- <domain>` and `npm run publish -- <domain> --dry-run`.

The same dev/build/docs/publish commands then include the new site automatically.
There is no need to add another package, dependency set, layout copy, or script.
