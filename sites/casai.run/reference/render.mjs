import MarkdownIt from 'markdown-it';
import { components, getControls, sourceUrl } from '../docs/matrix/matrix.js';
import { basePath, referencePath } from './state.mjs';

export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const anchor = value => String(value).replace(/[^\w-]/g, '-');
const badge = (label, kind = '') => `<span class="ref-badge ${kind}">${escape(label)}</span>`;
const titleCase = value => value[0].toUpperCase() + value.slice(1);

export function createRenderer(provenance) {
  const markdown = new MarkdownIt({ html: false });
  const repositoryBase = `${provenance.repository}/blob/${provenance.commit}/`;
  const link = value => /^(?:https?:|mailto:|#)/.test(value) || value.startsWith(basePath) ? value : new URL(value, repositoryBase).href;
  const renderLink = markdown.renderer.rules.link_open || ((tokens, index, options, env, self) => self.renderToken(tokens, index, options));
  markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index];
    token.attrSet('href', link(token.attrGet('href')));
    return renderLink(tokens, index, options, env, self);
  };
  const md = value => markdown.render(String(value || ''));
  const source = value => sourceUrl(value, provenance.commit);
  const sourceNote = (value, label = 'Source') => source(value) ? `[${label}](${source(value)})` : '';
  const list = (label, value) => value ? `**${label}:** ${value}\n\n` : '';
  const typeBlock = type => type ? `\n\n\`\`\`typescript\n${type}\n\`\`\`\n\n` : '';

  function detailsMarkdown(details, depth = 5) {
    if (!details) return '';
    return `**${details.name} — ${details.appliesTo}**\n\n${typeBlock(details.type)}` + details.variants.map((variant, index) =>
      `${details.variants.length > 1 ? `**Alternative ${index + 1}**\n\n` : ''}${typeBlock(variant.type)}${nativeMarkdown(variant.properties, depth)}`).join('\n');
  }
  function nativeMarkdown(properties = [], depth = 4) {
    return properties.map(property => `${'#'.repeat(Math.min(depth, 6))} ${property.name}${property.optional ? ' (optional)' : ''}\n\n${typeBlock(property.type)}${property.description || ''}\n\n` +
      list('Default', property.default) + list('Required', property.required) + list('Notes', property.notes) + list('Inheritance', property.inheritance) + list('Adaptation', property.adaptation) +
      (property.tags || []).filter(tag => ['deprecated', 'default', 'defaultValue', 'returns', 'param'].includes(tag.name)).map(tag => list(titleCase(tag.name), tag.text)).join('') +
      detailsMarkdown(property.details, depth + 1) + nativeMarkdown(property.nested, depth + 1) + sourceNote(property.source) + '\n\n' + sourceNote(property.descriptionSource, 'Description source') + '\n\n').join('');
  }
  function propertyMarkdown(property) {
    return `${property.description}\n\n${typeBlock(property.type)}` +
      list('Required', property.required.description) + list('Default', property.default) +
      list('Available in', property.locations.map(location => ({ construction: 'construction', run: '`.run()`', ordinary: 'ordinary calls' })[location]).join(', ')) +
      list('Overrides', property.override) + list('Inheritance', property.inheritance) + list('Scope', property.scope) + list('Origin', property.origin) +
      list('Adaptation', property.adaptation) + list('Notes', property.notes) + list('Deprecated', property.deprecated) + list('Alias for', property.aliasFor) +
      list('Applies to', [property.applicability.component, property.applicability.sourceMode, ...(property.applicability.operations || [])].filter(Boolean).join(' · ')) +
      detailsMarkdown(property.details) + nativeMarkdown(property.nested) +
      (property.upstream ? `#### Original AI SDK contract\n\n${property.upstream.description}\n${typeBlock(property.upstream.type)}${sourceNote(property.upstream, 'AI SDK source')}\n\n` : '') +
      sourceNote(property.source) + '\n\n';
  }
  function methodMarkdown(method) {
    return typeBlock(method.signature) + `${method.description}\n\n` +
      (method.propertyIds?.length ? `**Supported properties:** ${method.propertyIds.map(id => `[${id}](#property-${anchor(id)})`).join(', ')}\n\n` : '') +
      (method.arguments?.length ? `#### Arguments\n\n${nativeMarkdown(method.arguments)}` : '') + nativeMarkdown(method.properties) +
      (method.result?.length ? `#### Returns\n\n${nativeMarkdown(method.result)}` : '') + nativeMarkdown(method.additionalProperties);
  }
  function propertyHtml(property, highlighted = false, prefix = 'property') {
    return `<details class="ref-property${highlighted ? ' is-highlighted' : ''}" id="${prefix}-${anchor(property.id)}" data-property="${escape(property.name.toLowerCase())}">
      <summary><span class="ref-property-title"><code>${escape(property.name)}</code>${property.required.construction ? badge('Required') : property.required.operation ? badge('Required at execution', 'subtle') : ''}${property.deprecated ? badge('Deprecated', 'planned') : ''}${highlighted ? badge('Selected', 'selected') : ''}<span class="ref-origin">${escape(property.origin)}</span></span><span class="ref-type">${escape(property.displayType)}</span></summary>
      <div class="ref-prose ref-property-body">${md(propertyMarkdown(property))}</div></details>`;
  }
  function nativeHtml(properties = [], prefix) {
    return properties.map((property, index) => `<details class="ref-member" id="${anchor(prefix)}-${anchor(property.name)}-${index}"><summary><code>${escape(property.name)}</code>${property.optional ? ' <span class="ref-muted">optional</span>' : ''}<span class="ref-type">${escape(property.displayType || property.type)}</span></summary><div class="ref-prose">${md(nativeMarkdown([property]))}</div></details>`).join('');
  }

  function controls(reference) {
    const names = Object.fromEntries(components.find(component => component.name === reference.component).groups.flatMap(group => group.choices.map(choice => [choice.id, choice.name])));
    const clears = transition => transition?.cleared.length ? `Switching clears ${transition.cleared.map(id => names[id]).join(', ')}.` : '';
    const choiceHtml = choice => {
      const hint = [choice.description, !choice.available && !choice.transition ? choice.unavailableReasons?.join(' ') : '', clears(choice.transition)].filter(Boolean).join(' ');
      return `<label class="ref-choice${choice.transition ? '' : ' is-disabled'}"><input type="checkbox" data-choice="${choice.id}"${choice.active ? ' checked' : ''}${choice.transition ? '' : ' disabled'} aria-describedby="hint-${choice.id}"><span>${escape(choice.name)}<small id="hint-${choice.id}">${escape(hint)}</small></span></label>`;
    };
    return getControls(reference.component, reference.activeOptions, { unavailable: 'include' }).map(section => {
      if (section.id === 'source') {
        const control = section.control;
        if (!control) return '';
        return `<fieldset><legend>Source</legend><label class="visually-hidden" for="ref-source">Input preparation</label><select id="ref-source" data-source>${control.choices.map(choice => `<option value="${choice.id}"${choice.id === control.kind ? ' selected' : ''}>${escape(choice.name)}</option>`).join('')}</select><p class="ref-control-note">${escape(control.choices.find(choice => choice.id === control.kind).description)}</p>${choiceHtml({ ...control.loads, name: 'Load from a file', unavailableReasons: ['Choose a template or script source.'] })}</fieldset>`;
      }
      const choices = section.groups.flatMap(group => group.choices);
      if (!choices.length) return '';
      return `<fieldset><legend>${escape(section.name)}</legend>${choices.map(choiceHtml).join('')}</fieldset>`;
    }).join('') || '<p class="ref-muted">This component has no example options.</p>';
  }
  function info(reference) {
    return `<div class="ref-io" role="group" aria-label="Input and return value"><section><h3>Input</h3><div class="ref-prose">${md(reference.info.input)}</div></section><section><h3>Returns</h3><div class="ref-prose">${md(reference.info.result)}</div></section></div>
      ${reference.config.supportedSources.length ? `<section class="ref-section"><h3>Supported sources</h3><p class="ref-muted">All API source forms. The example controls show a representative subset.</p><div class="ref-source-list">${reference.config.supportedSources.map(form => `<div><code>${escape(form.modifier ? `.${form.modifier}` : 'Default')}</code>${!form.applicable ? badge('Unavailable in this form', 'subtle') : ''}<div class="ref-prose">${md(form.description)}</div><small>${form.toolSupported ? 'Supports tool use' : 'Direct invocation only'}</small></div>`).join('')}</div></section>` : ''}
      ${reference.config.alternatives.length ? `<section class="ref-section"><h3>Component configurations</h3><p class="ref-muted">Choose the component this configuration will belong to. Each has its own settings.</p><div class="ref-link-grid">${reference.config.alternatives.map(alternative => `<a data-reference-link href="${referencePath(alternative.component, alternative.activeOptions)}?view=config">${escape(alternative.factory)} <span aria-hidden="true">↗</span></a>`).join('')}</div></section>` : ''}
      ${reference.concepts.length ? `<section class="ref-section"><h3>How it works</h3>${reference.concepts.map(concept => `<details class="ref-concept" id="concept-${anchor(concept.id)}"><summary>${escape(concept.title)}</summary><div class="ref-prose">${concept.paragraphs.map(md).join('')}<a href="${escape(link(concept.link))}">Read the guide ↗</a></div></details>`).join('')}</section>` : ''}
      ${reference.relatedProperties.length ? `<section class="ref-section"><h3>Related properties</h3>${reference.relatedProperties.map(property => propertyHtml(property, false, 'related')).join('')}</section>` : ''}
      <section class="ref-section" id="results"><h3>Result reference</h3><div class="ref-prose">${md(reference.result.description)}${reference.result.tool ? `<h4>As a tool</h4>${md(reference.result.tool)}` : ''}</div>${reference.result.shapes.map((shape, index) => `<h4>${escape(shape.name)}</h4>${nativeHtml(shape.properties, `result-${index}`)}`).join('')}${nativeHtml(reference.result.additionalProperties, 'result-addition')}</section>
      ${reference.info.descriptionSource ? `<div class="ref-attribution">${md(sourceNote(reference.info.descriptionSource.source, 'Operation documentation') + ` · ${reference.info.descriptionSource.reuse === 'adapted' ? 'Adapted from' : 'From'} the AI SDK.`)}</div>` : ''}`;
  }
  function example(example, reference) {
    return `<p class="ref-muted">${escape(reference.example.note)}</p>${example.notice ? `<div class="ref-notice">${escape(example.notice)}</div>` : ''}
      ${example.files.map((file, index) => `<figure class="ref-code"><figcaption><span>${escape(file.name)}</span><div><button type="button" data-copy-file="${index}">Copy</button><button type="button" data-download-file="${index}">Download</button></div></figcaption><pre tabindex="0" aria-label="${escape(file.name)}"><code class="language-${escape(file.language)}">${highlight(file.code)}</code></pre></figure>`).join('')}
      ${example.explanations.length ? `<section class="ref-section"><h3>In this example</h3><div class="ref-prose">${example.explanations.map(md).join('')}</div></section>` : ''}`;
  }
  function config(reference) {
    const properties = reference.config.properties;
    const links = ids => ids.map(id => `<a href="#property-${anchor(id)}"><code>${escape(id)}</code></a>`).join('');
    return `<div class="ref-config-intro"><p class="ref-muted">Settings for <code>${escape(reference.form.factory || reference.component)}</code>. Expand a property for its full contract.</p>
      ${reference.config.requiredPropertyIds.length ? `<div class="ref-required"><strong>Required settings</strong><div class="ref-property-links">${links(reference.config.requiredPropertyIds)}</div><small>Requirements may be met by inheritance or at invocation; expand each setting for conditions.</small></div>` : ''}
      <label class="ref-search-label" for="ref-property-search">Find a property</label><input id="ref-property-search" type="search" placeholder="Search names, types and descriptions…" autocomplete="off" data-property-search><p class="ref-muted ref-search-status" data-property-status role="status"></p>
      <details class="ref-alphabetical"><summary>Alphabetical index · ${reference.config.index.length} properties</summary><div class="ref-property-links">${links(reference.config.index.map(entry => entry.propertyId))}</div></details></div>
      ${reference.config.sections.map(section => {
        if (!section.propertyIds.length && !section.methods?.length && !section.notes?.length && !section.references?.length) return '';
        const property = id => propertyHtml(properties[id], reference.config.highlightedPropertyIds.includes(id));
        return `<section class="ref-section ref-config-section" id="section-${section.id}"><h3>${escape(section.name)}</h3>${(section.notes || []).map(note => `<div class="ref-prose">${md(note)}</div>`).join('')}
          ${section.references?.length ? `<div class="ref-property-links">${links(section.references)}</div>` : ''}
          ${section.groups ? section.groups.filter(group => group.propertyIds.length).map(group => `<div class="ref-config-group"><h4>${escape(group.name)}</h4>${group.propertyIds.map(property).join('')}</div>`).join('') : section.propertyIds.map(property).join('')}
          ${(section.methods || []).map(method => `<details class="ref-method" id="method-${anchor(method.name)}"><summary><code>${escape(method.name)}</code><span class="ref-type">${escape(method.signature)}</span></summary><div class="ref-prose">${md(methodMarkdown(method))}</div></details>`).join('')}</section>`;
      }).join('')}
      ${!reference.config.index.length ? `<p class="ref-muted">${reference.config.alternatives.length ? 'Open a component configuration from Info to see its properties.' : 'This is a context object rather than a callable component. See Info for its relationships and usage.'}</p>` : ''}`;
  }
  function heading(reference) {
    return `<div class="ref-component-line"><h2 id="component-title" tabindex="-1">${escape(reference.form.factory?.split('.')[0] || reference.component)}</h2>${badge(reference.status === 'planned' ? 'Planned' : 'Available', reference.status === 'planned' ? 'planned' : 'available')}</div><p class="ref-factory"><code>${escape(reference.form.factory || reference.component)}</code>${reference.form.operation ? `<span> / ${escape(reference.form.operation)}</span>` : ''}</p><div class="ref-description ref-prose">${md(reference.info.description)}</div>${reference.form.notices.map(notice => `<div class="ref-notice ref-prose">${md(notice)}</div>`).join('')}`;
  }
  function shell(reference, exampleData) {
    return `<div class="ref-shell" data-matrix data-component="${reference.component}" data-options="${escape(reference.activeOptions.join(','))}">
      <header class="ref-page-heading"><a class="ref-breadcrumb" href="/documentation/">Documentation <span aria-hidden="true">/</span></a><h1>Quick reference</h1><p>Explore the components. Shape an example. Find the setting you need.</p><div class="ref-version">Casai ${escape(reference.versions.casai)}<span>·</span>${components.length} components<span>·</span><a href="${escape(provenance.repository)}/tree/${provenance.commit}">${provenance.commit.slice(0, 8)}</a>${provenance.modified ? '<span>+ local changes</span>' : ''}</div></header>
      <div class="ref-workspace"><aside class="ref-sidebar"><details class="ref-component-index" open><summary>Components <span>${components.length}</span></summary><label class="visually-hidden" for="ref-component-search">Find a component</label><input id="ref-component-search" type="search" placeholder="Find a component…" autocomplete="off"><nav aria-label="Components">${components.map(component => `<a data-component-link="${component.name}" href="${referencePath(component.name)}"${component.name === reference.component ? ' aria-current="page"' : ''}><span>${escape(component.name)}</span>${component.name === 'Translator' ? '<small>Planned</small>' : ''}</a>`).join('')}</nav><p data-component-empty hidden>No components match.</p></details><div class="ref-sidebar-footer"><a href="${basePath}index.json">Reference index · JSON</a><a href="${basePath}notices/THIRD_PARTY.md">Sources &amp; licenses</a></div></aside>
      <div class="ref-reader"><div data-reference-heading>${heading(reference)}</div>
        <div class="ref-toolbar"><div class="ref-tabs" aria-label="Reference views">${['info', 'example', 'config'].map(view => `<a id="tab-${view}" data-view="${view}" href="#${view}">${titleCase(view)}</a>`).join('')}</div><div class="ref-actions"><button type="button" data-reset hidden>Reset</button><button type="button" data-share hidden>Copy link</button></div></div>
        <div class="ref-detail"><div class="ref-panels">${['info', 'example', 'config'].map(view => `<section id="${view}" class="ref-panel" data-panel="${view}" aria-labelledby="tab-${view}">${view === 'info' ? info(reference) : view === 'example' ? example(exampleData, reference) : config(reference)}</section>`).join('')}</div>
        <aside class="ref-options"><details open data-options-panel><summary>Customize example</summary><div data-controls>${controls(reference)}</div><p class="ref-control-note">Options update all three views.</p></details></aside></div>
        <footer class="ref-reader-footer"><span>Take this reference with you</span><div><a data-export="md" href="${referencePath(reference.component, reference.activeOptions)}README.md">Markdown ↓</a><a data-export="json" href="${referencePath(reference.component, reference.activeOptions)}reference.json">JSON ↓</a></div></footer>
      </div></div><p class="ref-live" data-ref-status role="status" aria-live="polite"></p><noscript><p class="ref-notice">All reference sections are shown. Enable JavaScript to customize examples. <a href="${basePath}forms/">Browse all API forms</a>.</p></noscript>
      <details class="ref-build-info"><summary>Reference versions &amp; sources</summary><dl>${Object.entries(reference.versions).map(([name, version]) => `<dt>${escape(name)}</dt><dd>${escape(version)}</dd>`).join('')}</dl><p>Source revision: <a href="${provenance.repository}/tree/${provenance.commit}">${provenance.commit}</a>${provenance.modified ? ' with local changes; exact file hashes are recorded in the snapshot.' : ''}</p><p><a href="${basePath}source.json">Snapshot provenance</a> · <a href="${basePath}forms/">Browse all API forms</a></p></details></div>`;
  }
  function toMarkdown(reference, exampleData) {
    let text = `# ${reference.form.factory || reference.component}\n\n${reference.info.description}\n\n**Status:** ${reference.status}\n\n**Versions:** ${Object.entries(reference.versions).map(([name, version]) => `${name} ${version}`).join(', ')}\n\n**Source revision:** ${provenance.commit}${provenance.modified ? ' (includes local changes; see source.json for exact file hashes)' : ''}\n\n`;
    text += reference.form.notices.map(notice => `> ${notice}\n\n`).join('');
    text += `## Input\n\n${reference.info.input}\n\n## Returns\n\n${reference.info.result}\n\n## Example\n\n${reference.example.note}\n\n`;
    if (exampleData.notice) text += `> ${exampleData.notice}\n\n`;
    for (const file of exampleData.files) text += `### ${file.name}\n\n\`\`\`${file.language}\n${file.code}\`\`\`\n\n`;
    text += exampleData.explanations.map(value => `- ${value}\n`).join('') + '\n';
    if (reference.config.supportedSources.length) text += '## Supported sources\n\n' + reference.config.supportedSources.map(form => `### ${form.modifier || 'Default'}\n\n${form.description}\n\nTool support: ${form.toolSupported}. Applicable to selected form: ${form.applicable}.\n\n`).join('');
    if (reference.config.alternatives.length) text += '## Component configurations\n\n' + reference.config.alternatives.map(alternative => `- [${alternative.factory}](${referencePath(alternative.component, alternative.activeOptions)}README.md)\n`).join('') + '\n';
    for (const section of reference.config.sections) {
      if (!section.propertyIds.length && !section.methods?.length && !section.notes?.length) continue;
      text += `## ${section.name}\n\n${(section.notes || []).join('\n\n')}\n\n`;
      for (const id of section.propertyIds) text += `<a id="property-${anchor(id)}"></a>\n\n### ${id}\n\n${propertyMarkdown(reference.config.properties[id])}`;
      for (const method of section.methods || []) text += `<a id="method-${anchor(method.name)}"></a>\n\n### ${method.name}\n\n${methodMarkdown(method)}`;
    }
    for (const concept of reference.concepts) text += `## ${concept.title}\n\n${concept.paragraphs.join('\n\n')}\n\n[Read the guide](${link(concept.link)})\n\n`;
    for (const property of reference.relatedProperties) text += `## Related property: ${property.name}\n\n${propertyMarkdown(property)}`;
    text += `## Result reference\n\n${reference.result.description}\n\n${list('As a tool', reference.result.tool)}`;
    for (const shape of reference.result.shapes) text += `### ${shape.name}\n\n${nativeMarkdown(shape.properties)}`;
    text += nativeMarkdown(reference.result.additionalProperties);
    text += `\n[Sources and licenses](${basePath}notices/THIRD_PARTY.md)\n`;
    // Resolve authored repository links just as the HTML renderer does.
    return text.replace(/\]\(([^)]+)\)/g, (match, url) => `](${link(url)})`);
  }
  return { shell, heading, controls, info, example, config, toMarkdown };
}

// A small lexical highlighter for displayed examples, never an executor.
export function highlight(text) {
  const pattern = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(import|from|export|async|await|const|let|return|for|of|if|else|function|type|new|throw|true|false|null|undefined)\b|\b(\d+(?:\.\d+)?)\b/g;
  let html = '', last = 0;
  for (const match of text.matchAll(pattern)) {
    html += escape(text.slice(last, match.index));
    html += `<span class="token-${match[1] ? 'comment' : match[2] ? 'string' : match[3] ? 'keyword' : 'number'}">${escape(match[0])}</span>`;
    last = match.index + match[0].length;
  }
  return html + escape(text.slice(last));
}
