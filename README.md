# cascada.dev
The Cascada web page

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
