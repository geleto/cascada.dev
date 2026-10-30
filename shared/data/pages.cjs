module.exports = {
  layout: 'layouts/page.njk',
  permalink: ({ page }) => {
    const path = page.filePathStem.replace(/^\/pages\//, '').replace(/(?:^|\/)index$/, '');
    return `/${path}${path ? '/' : ''}`;
  },
};
