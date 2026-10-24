# cascada.dev
The Cascada web page

## Homepage

Run `npm run dev`, then open `http://localhost:3000`. No dependencies or build
step are required. The development server binds to localhost only.

The page is plain HTML, CSS and JavaScript. Publish `index.html`, `styles.css`,
`main.js`, `logo.svg` and `headphones-animation.html` together on any static host.
`docs/home.md` contains the original homepage copy. Navigation points to the
existing tutorial and documentation; Playground is marked as coming soon until
its URL is available.

The concurrent-results example has Workflow and Code tabs, with the Code tab
reusing the headphones script above. Code examples include copy icons when
clipboard access is supported. The menu
collapses on mobile, and all homepage text remains available without JavaScript.

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
