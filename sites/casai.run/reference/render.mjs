import MarkdownIt from 'markdown-it';
import { highlight } from '../../../shared/public/syntax.mjs';
import { components, getControls, selectOption, sourceUrl } from '../docs/matrix/matrix.js';
import { introduction } from '../docs/matrix/introduction.js';
import { isTypeAbbreviated } from '../docs/matrix/reference/type-display.js';
import { availableViews, basePath, componentChoices, hasReturnReference, referencePath, selectionUrl, viewTitles } from './state.mjs';

export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const anchor = value => String(value).replace(/[^\w-]/g, '-');
const badge = (label, kind = '') => `<span class="ref-badge ${kind}">${escape(label)}</span>`;
const titleCase = value => value[0].toUpperCase() + value.slice(1);
const svg = content => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${content}</svg>`;
export const icons = {
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'),
  copied: svg('<path d="m5 12 4 4L19 6"/>'),
  download: svg('<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>'),
  search: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>'),
  close: svg('<path d="m6 6 12 12M6 18 18 6"/>'),
};

export function createRenderer(provenance) {
  const markdown = new MarkdownIt({ html: false, highlight });
  const repositoryBase = `${provenance.repository}/blob/${provenance.commit}/`;
  const link = value => /^(?:https?:|mailto:|#)/.test(value) || value.startsWith(basePath) ? value : new URL(value, repositoryBase).href;
  const renderLink = markdown.renderer.rules.link_open || ((tokens, index, options, env, self) => self.renderToken(tokens, index, options));
  markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const href = token.attrGet('href');
    if (href.startsWith('component:')) {
      const reference = new URL(href);
      const property = reference.searchParams.get('property');
      token.attrSet('href', selectionUrl(reference.pathname, reference.searchParams.get('options')?.split(',') ?? [],
        property ? 'config' : 'example', property ? `#property-${anchor(property)}` : '#component-factories'));
      if (property) token.attrSet('title', `${reference.pathname}.${property}`);
      token.attrSet('data-reference-link', '');
    } else if (/^(property|method):/.test(href) && env?.controlSelection) {
      const target = new URL(href);
      const kind = target.protocol.slice(0, -1);
      const name = target.pathname;
      const { component, options } = env.controlSelection;
      const option = target.searchParams.get('option');
      const selected = option ? selectOption(component, options, option, true) : options;
      token.attrSet('href', selectionUrl(component, selected, 'config', `#${kind}-${anchor(name)}`));
      token.attrSet('title', `${component}.${name}`);
      token.attrSet('data-reference-link', '');
      token.attrSet(`data-option-${kind}`, name);
    } else token.attrSet('href', link(href));
    return renderLink(tokens, index, options, env, self);
  };
  const md = value => markdown.render(String(value || ''));
  const source = value => sourceUrl(value, provenance.commit);
  const sourceNote = (value, label = 'Source') => source(value) ? `[${label}](${source(value)})` : '';
  const list = (label, value) => value ? `**${label}:** ${value}\n\n` : '';
  const typeBlock = type => type ? `\n\n\`\`\`typescript\n${type}\n\`\`\`\n\n` : '';
  const descriptionSources = reference => reference.info.descriptionSources.map((value, index, sources) => sourceNote(value, sources.length === 1 ? 'Source' : `Source ${index + 1}`)).filter(Boolean).join(' · ');

  function detailsMarkdown(details, depth = 5) {
    if (!details) return '';
    return `**${details.name} — ${details.appliesTo}**\n\n${typeBlock(details.type)}` + details.variants.map((variant, index) =>
      `${details.variants.length > 1 ? `**Alternative ${index + 1}**\n\n` : ''}${typeBlock(variant.type)}${nativeMarkdown(variant.properties, depth)}`).join('\n');
  }
  function nativeMarkdown(properties = [], depth = 4) {
    return properties.map(property => `${'#'.repeat(Math.min(depth, 6))} ${property.name}${property.optional ? ' (optional)' : ''}\n\n${typeBlock(property.type)}${property.description || ''}\n\n` +
      (property.typeDescription ? `${property.typeDescription}\n\n` : '') + list('Default', property.default) + list('Required', property.required) + list('Notes', property.notes) + list('Inheritance', property.inheritance) + list('Adaptation', property.adaptation) +
      (property.tags || []).filter(tag => ['deprecated', 'default', 'defaultValue', 'returns', 'param'].includes(tag.name)).map(tag => list(titleCase(tag.name), tag.text)).join('') +
      detailsMarkdown(property.details, depth + 1) + nativeMarkdown(property.nested, depth + 1) + sourceNote(property.source) + '\n\n' + sourceNote(property.descriptionSource, 'Description source') + '\n\n').join('');
  }
  function propertyMarkdown(property) {
    return `${property.description}\n\n${property.typeDescription ? property.typeDescription + '\n\n' : ''}${typeBlock(property.type)}` +
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
  function methodHtml(method) {
    const id = `method-${anchor(method.name)}`;
    const fields = (label, properties, suffix) => properties?.length ? `<h4>${label}</h4>${nativeHtml(properties, `${id}-${suffix}`)}` : '';
    return `<details class="ref-method" id="${id}"><summary><code>${escape(method.name)}</code><span class="ref-type">${escape(method.signature)}</span></summary><div class="ref-prose">${md(method.description)}
      ${method.propertyIds?.length ? `<p>Supported properties: ${method.propertyIds.map(value => `<a href="#property-${anchor(value)}"><code>${escape(value)}</code></a>`).join(', ')}</p>` : ''}
      ${fields('Arguments', method.arguments, 'argument')}${nativeHtml(method.properties, `${id}-property`)}${fields('Returns', method.result, 'result')}${nativeHtml(method.additionalProperties, `${id}-additional`)}</div></details>`;
  }
  function propertyHtml(property, highlighted = false, prefix = 'property') {
    const metadata = [
      ['Required', property.required.description === 'Optional.' ? null : property.required.description],
      ['Available in', property.locations.map(location => ({ construction: 'construction', run: '`.run()`', ordinary: 'ordinary calls' })[location]).join(', ')],
      ['Overrides', property.override], ['Inheritance', property.inheritance],
      ['Adaptation', property.adaptation], ['Notes', property.notes],
      ['Deprecated', property.deprecated], ['Alias for', property.aliasFor],
    ];
    const native = property.upstream;
    const upstream = native ? (native.description !== property.description ? md(native.description) : '') +
      (native.type !== property.type ? `<h5>AI SDK type</h5>${md(typeBlock(native.type))}` : '') : '';
    const id = `${prefix}-${anchor(property.id)}`;
    const extra = (property.typeDescription ? md(property.typeDescription) : '') + metadataHtml(metadata) + upstream;
    const body = typeDetailsHtml(property.details, id) + nativeHtml(property.nested, `${id}-nested`) +
      exactTypeHtml(property, !property.required.construction) + (extra ? `<div class="ref-prose">${extra}</div>` : '');
    return propertyRow(property, { id, className: `ref-property${highlighted ? ' is-highlighted' : ''}`, optional: !property.required.construction, body, searchable: true,
      badges: `${property.required.operation && !property.required.construction ? badge('Required at execution', 'subtle') : ''}${property.deprecated ? badge('Deprecated', 'planned') : ''}${highlighted ? badge('Selected', 'selected') : ''}` });
  }
  function exactTypeHtml(property, optional) {
    return property.type && property.displayType && isTypeAbbreviated(property.type, property.displayType, optional)
      ? `<div class="ref-prose ref-exact-type">${md(typeBlock(property.type))}</div>` : '';
  }
  function propertyRow(property, { id, className, optional, body, searchable = false, badges = '' }) {
    const type = property.displayType || property.type;
    const preview = `<div class="ref-property-header"><div class="ref-property-title"><code>${escape(property.name)}${optional ? '<span class="ref-optional" title="Optional at construction">?</span>' : ''}${type ? ':' : ''}</code>${type ? `<span class="ref-type">${escape(type)}</span>` : ''}${badges}</div>${property.origin ? `<span class="ref-origin">${escape(property.origin)}</span>` : ''}</div>
      ${property.description ? `<div class="ref-prose ref-property-description">${md(property.description)}</div>` : ''}
      ${property.default ? `<div class="ref-property-default"><span>Default:</span> ${markdown.renderInline(property.default)}</div>` : ''}`;
    const attributes = `class="${className}" id="${id}"${searchable ? ` data-property="${escape(property.name.toLowerCase())}"` : ''}`;
    return body ? `<details ${attributes}><summary class="ref-property-preview">${preview}</summary><div class="ref-property-body">${body}</div></details>`
      : `<article ${attributes}><div class="ref-property-preview">${preview}</div></article>`;
  }
  function metadataHtml(entries) {
    const values = entries.filter(([, value]) => value);
    return values.length ? `<dl class="ref-property-meta">${values.map(([label, value]) => `<dt>${escape(label)}</dt><dd>${md(value)}</dd>`).join('')}</dl>` : '';
  }
  function typeDetailsHtml(details, prefix) {
    if (!details?.variants.some(variant => variant.properties.length)) return '';
    return `<section class="ref-nested"><h5>${escape(details.name)} <span class="ref-muted">· ${escape(details.appliesTo)}</span></h5>${details.variants.map((variant, index) =>
      `${details.variants.length > 1 ? `<h5>Alternative ${index + 1}</h5>` : ''}${nativeHtml(variant.properties, `${prefix}-variant-${index}`)}`
    ).join('')}</section>`;
  }
  function nativeHtml(properties = [], prefix) {
    return properties.map((property, index) => {
      const id = `${anchor(prefix)}-${anchor(property.name)}-${index}`;
      const metadata = [['Required', property.required], ['Notes', property.notes], ['Inheritance', property.inheritance], ['Adaptation', property.adaptation],
        ...(property.tags || []).filter(tag => ['deprecated', 'returns', 'param'].includes(tag.name)).map(tag => [titleCase(tag.name), tag.text])];
      const extra = (property.typeDescription ? md(property.typeDescription) : '') + metadataHtml(metadata);
      const body = typeDetailsHtml(property.details, id) + nativeHtml(property.nested, `${id}-nested`) + exactTypeHtml(property, property.optional) +
        (extra ? `<div class="ref-prose">${extra}</div>` : '');
      const value = { ...property, default: Object.hasOwn(property, 'default') ? property.default : property.tags?.find(tag => ['default', 'defaultValue'].includes(tag.name))?.text };
      return propertyRow(value, { id, className: 'ref-member', optional: property.optional, body });
    }).join('');
  }

  function controls(reference) {
    const names = Object.fromEntries(components.find(component => component.name === reference.component).groups.flatMap(group => group.choices.map(choice => [choice.id, choice.name])));
    const clears = transition => transition?.cleared.length ? `Switching clears ${transition.cleared.map(id => names[id]).join(', ')}.` : '';
    const choiceHtml = (choice, label = escape(choice.name)) => {
      const note = [!choice.available && !choice.transition ? choice.unavailableReasons?.join(' ') : '', clears(choice.transition)].filter(Boolean).join(' ');
      const hint = [choice.description, note].filter(Boolean).join(' ');
      const description = choice.shortDescription ?? choice.description;
      const descriptionHtml = markdown.renderInline(description, { controlSelection: {
        component: reference.component, options: choice.active ? reference.activeOptions : choice.transition?.activeOptions ?? reference.activeOptions,
      } });
      return `<label class="ref-choice${choice.transition ? '' : ' is-disabled'}" title="${escape(hint)}"><input type="checkbox" data-choice="${choice.id}"${choice.active ? ' checked' : ''}${choice.transition ? '' : ' disabled'} aria-labelledby="label-${choice.id}" aria-describedby="hint-${choice.id}${note ? ` note-${choice.id}` : ''}"><span class="ref-choice-text"><span class="ref-choice-name" id="label-${choice.id}">${label}</span><span class="ref-choice-description" id="hint-${choice.id}">${descriptionHtml}</span></span></label>${note ? `<span class="visually-hidden" id="note-${choice.id}">${escape(note)}</span>` : ''}`;
    };
    const sections = getControls(reference.component, reference.activeOptions, { unavailable: 'include' });
    const source = sections.find(section => section.id === 'source')?.control;
    const checkboxes = sections.filter(section => section.id !== 'source').flatMap(section => section.groups.flatMap(group => group.choices)).filter(choice => choice.active || choice.transition);
    const variants = new Set(sections.find(section => section.id === 'variants')?.groups.flatMap(group => group.choices.map(choice => choice.id)) || []);
    const checkboxesHtml = choices => `<div class="ref-checkboxes">${choices.map(choice => choiceHtml(choice)).join('')}</div>`;
    const optionGroup = (title, content, className = '') => {
      const id = `filter-title-${anchor(title).toLowerCase()}`;
      return `<fieldset class="ref-option-group ${className}" aria-labelledby="${id}"><legend id="${id}">${escape(title)}</legend><div class="ref-group-body">${content}</div></fieldset>`;
    };
    const sourceHint = source?.description;
    const input = reference.form.primaryProperty;
    const groupedSource = source?.choices.length > 1;
    const loadMode = ['default', 'function', input].includes(source?.kind) ? '' : source?.kind;
    const loadLabel = groupedSource ? 'Load from file' : `Load ${loadMode ? escape(loadMode) + ' ' : ''}<strong>${escape(input || 'source')}</strong> from file`;
    const loadControl = source?.loads.available ? choiceHtml(source.loads, loadLabel) : '';
    const sourceContent = groupedSource ? `${loadControl}<div class="ref-source-segments" role="group" aria-label="Input source" aria-describedby="hint-source" title="${escape(sourceHint)}">${source.choices.map(choice => `<button type="button" data-source="${choice.id}" aria-pressed="${choice.id === source.kind}" title="${escape(choice.description)}">${escape(choice.name)}</button>`).join('')}</div>
      <span class="visually-hidden" id="hint-source">${escape(sourceHint)}</span>` : '';
    const sourceHtml = groupedSource ? optionGroup(titleCase(input || 'source'), sourceContent, 'ref-source-controls')
      : loadControl ? `<div class="ref-source-controls ref-source-single">${loadControl}</div>` : '';
    const variantChoices = checkboxes.filter(choice => variants.has(choice.id));
    const exampleChoices = checkboxes.filter(choice => !variants.has(choice.id));
    return `<div class="ref-filter-groups">${sourceHtml}${variantChoices.length ? optionGroup('Behavior', checkboxesHtml(variantChoices), 'ref-variants') : ''}${exampleChoices.length ? optionGroup('Example options', checkboxesHtml(exampleChoices), 'ref-example-options') : ''}</div>` +
      (reference.info.selectionNote ? `<p class="ref-control-note">${escape(reference.info.selectionNote)}</p>` : !checkboxes.length && !source ? '<p class="ref-control-note">No options for this component.</p>' : '');
  }
  function sources(reference) {
    const forms = reference.config.supportedSources;
    if (!forms.length) return '';
    const groups = new Map();
    for (const form of forms) {
      const group = groups.get(form.mode) || [];
      group.push(form);
      groups.set(form.mode, group);
    }
    return `<ul class="ref-source-reference">${[...groups.values()].map(items => {
      const form = items[0];
      return `<li><div class="ref-source-mode"><strong>${escape(form.name)}</strong>${items.some(item => !item.modifier) ? '<span class="ref-muted">default</span>' : ''}${items.filter(item => item.modifier).map(item => `<code>.${escape(item.modifier)}</code>`).join(' ')}</div><div class="ref-prose">${md(form.explanation)}</div>${!form.applicable ? '<p class="ref-muted">Unavailable in this variant.</p>' : !form.toolSupported ? '<p class="ref-muted">For direct calls only.</p>' : ''}</li>`;
    }).join('')}</ul>`;
  }
  function contractRow(label, summary, body, id) {
    const preview = `<strong>${label}</strong> <span class="ref-contract-value ref-prose">${summary}</span>`;
    return body ? `<details class="ref-contract-row" id="${id}"><summary class="ref-contract-heading">${preview}</summary><div class="ref-contract-body ref-prose">${body}</div></details>`
      : `<div class="ref-contract-row" id="${id}"><div class="ref-contract-heading">${preview}</div></div>`;
  }
  function contracts(reference) {
    const source = reference.config.supportedSources.find(form => form.mode === reference.form.sourceMode);
    const property = reference.config.properties[reference.form.primaryProperty];
    const inputSummary = source && reference.form.primaryProperty ? `<span class="ref-source-summary"><code>${escape(reference.form.primaryProperty)}</code>: ${markdown.renderInline(source.description)}</span>` : markdown.renderInline(reference.info.input);
    const inputLinks = [
      property ? `<a href="#property-${anchor(property.id)}">Input configuration</a>` : '',
      reference.config.properties.context ? '<a href="#property-context">Context</a>' : '',
      reference.config.supportedSources.length ? '<a href="#section-source">Source modes</a>' : '',
    ].filter(Boolean).join(' · ');
    const inputExplanation = source && source.value !== 'direct' ? source.explanation : reference.info.input;
    const inputBody = (inputExplanation !== (source?.description ?? reference.info.input) ? md(inputExplanation) : '') +
      (property?.typeDescription ? md(property.typeDescription) : '') +
      (property ? `<p class="ref-contract-type"><code>${escape(property.name)}</code><span class="ref-type">${escape(property.displayType)}</span></p>` : '') +
      (inputLinks ? `<div class="ref-contract-links">${inputLinks}</div>` : '');
    const returnBody = (reference.result.description !== reference.info.result ? md(reference.result.description) : '') +
      (reference.result.tool ? `<h4>Tool execution</h4>${md(reference.result.tool)}` : '') +
      (hasReturnReference(reference) ? '<div class="ref-contract-links"><a href="#section-return">Full return reference</a></div>' : '');
    return `<div class="ref-contract">${contractRow('Input', inputSummary, inputBody, 'component-input')}${contractRow('Return', markdown.renderInline(reference.info.result), returnBody, 'results')}</div>`;
  }
  function returns(reference) {
    const shapeCount = reference.result.shapes.filter(shape => shape.properties.length).length;
    return `<section class="ref-result-reference" id="section-return"><h3>Return value</h3><div class="ref-prose">${md(reference.info.result)}${reference.result.description !== reference.info.result ? md(reference.result.description) : ''}</div>
      ${reference.result.tool ? `<section class="ref-section"><h3>Tool execution</h3><div class="ref-prose">${md(reference.result.tool)}</div></section>` : ''}
      ${reference.result.shapes.map((shape, index) =>
      shape.properties.length ? `<section class="ref-result-shape">${shapeCount > 1 ? `<h4>${escape(shape.name)}</h4>` : ''}${nativeHtml(shape.properties, `result-${index}`)}</section>` : ''
    ).join('')}${nativeHtml(reference.result.additionalProperties, 'result-addition')}</section>`;
  }
  function notes(reference) {
    return `<span id="info"></span>${reference.concepts.map(concept => `<details class="ref-concept" id="concept-${anchor(concept.id)}"><summary>${escape(concept.title)}</summary><div class="ref-prose">${concept.paragraphs.map(md).join('')}<a href="${escape(link(concept.link))}">Read the guide ↗</a></div></details>`).join('')}
      ${descriptionSources(reference) ? `<div class="ref-attribution">${md(descriptionSources(reference))}</div>` : ''}`;
  }
  function example(example, reference) {
    return `<p class="ref-muted">${escape(reference.example.note)}</p>${example.notice ? `<div class="ref-notice">${escape(example.notice)}</div>` : ''}
      ${example.files.map((file, index) => `<figure class="ref-code"><figcaption><span>${escape(file.name)}</span><div><button class="ref-icon-button" type="button" data-copy-file="${index}" aria-label="Copy ${escape(file.name)}" title="Copy ${escape(file.name)}">${icons.copy}</button><button class="ref-icon-button" type="button" data-download-file="${index}" aria-label="Download ${escape(file.name)}" title="Download ${escape(file.name)}">${icons.download}</button></div></figcaption><pre tabindex="0" aria-label="${escape(file.name)}"><code class="language-${escape(file.language)}">${highlight(file.code, file.language)}</code></pre></figure>`).join('')}
      ${example.explanations.length ? `<section class="ref-section"><h3>In this example</h3><div class="ref-prose">${example.explanations.map(md).join('')}</div></section>` : ''}`;
  }
  function config(reference) {
    const properties = reference.config.properties;
    const links = ids => ids.map(id => `<a href="#property-${anchor(id)}"><code>${escape(id)}</code></a>`).join('');
    const inputIds = [...new Set([reference.form.primaryProperty, 'context'])].filter(id => properties[id]);
    const remaining = ids => ids.filter(id => !inputIds.includes(id));
    const property = id => propertyHtml(properties[id], reference.config.highlightedPropertyIds.includes(id));
    const heading = inputIds.length > 1 ? 'Input & context' : inputIds.length ? titleCase(inputIds[0]) : 'Properties';
    return `<div class="ref-config-heading"><h3 data-property-heading data-default-heading="${escape(heading)}">${escape(heading)}</h3><div class="ref-property-search"><div id="ref-property-search-box" data-property-search-box hidden><label class="visually-hidden" for="ref-property-search">Find a property by name</label><input id="ref-property-search" type="search" placeholder="Find a property by name…" autocomplete="off" data-property-search></div><button type="button" class="ref-icon-button" data-property-search-toggle aria-expanded="false" aria-controls="ref-property-search-box" aria-label="Find a property" title="Find a property">${icons.search}</button></div></div><p class="ref-muted ref-search-status" data-property-status role="status"></p>
      ${inputIds.length ? `<section class="ref-config-section ref-inputs" id="section-input">${inputIds.map(property).join('')}</section>` : ''}
      ${reference.config.alternatives.length ? `<section class="ref-section ref-config-overview"><h3>Compatible component configurations</h3><p class="ref-muted">These components support the selected modifiers. The settings you put in Config must also fit the receiving component.</p><div class="ref-link-grid">${reference.config.alternatives.map(alternative => `<a data-reference-link href="${referencePath(alternative.component, alternative.activeOptions)}?view=config">${escape(alternative.factory)} <span aria-hidden="true">↗</span></a>`).join('')}</div></section>` : ''}
      ${reference.config.sections.map(section => {
        const ids = remaining(section.propertyIds);
        const notes = section.notes || [];
        if (!ids.length && !section.methods?.length && !notes.length && !section.references?.length) return '';
        return `<section class="ref-section ref-config-section" id="section-${section.id === 'source' ? 'source-settings' : section.id}"><h3>${escape(section.name)}</h3>${notes.map(note => `<div class="ref-prose">${md(note)}</div>`).join('')}
          ${section.references?.length ? `<div class="ref-property-links">${links(section.references)}</div>` : ''}
          ${section.groups ? section.groups.filter(group => remaining(group.propertyIds).length).map(group => `<div class="ref-config-group"><h4>${escape(group.name)}</h4>${remaining(group.propertyIds).map(property).join('')}</div>`).join('') : ids.map(property).join('')}
          ${(section.methods || []).map(methodHtml).join('')}</section>`;
      }).join('')}
      ${reference.relatedProperties.length ? `<section class="ref-section ref-config-section"><h3>Related configuration</h3>${reference.relatedProperties.map(property => propertyHtml(property, false, 'related')).join('')}</section>` : ''}`;
  }
  function heading(reference) {
    const factory = reference.form.factory || reference.component;
    const callable = reference.info.kind !== 'concept';
    return `<h3 class="ref-component-title" id="component-title" tabindex="-1"><code>${factory.split('.').map(escape).join('<wbr>.')}${callable ? '<wbr><span class="ref-title-muted">({...})</span>' : ''}</code></h3>
      <div class="ref-description ref-prose">${md(reference.info.description)}</div>
      ${contracts(reference)}`;
  }
  function panel(view, reference, exampleData) {
    return view === 'example' ? example(exampleData, reference) : { config, sources: reference => `<section id="section-source"><h3>Source modes</h3>${sources(reference)}</section>`, return: returns, notes }[view](reference);
  }
  function tabs(reference) {
    return availableViews(reference).map(view => `<a id="tab-${view}" data-view="${view}" href="#${view}">${escape(viewTitles[view])}</a>`).join('');
  }
  function panels(reference, exampleData) {
    return availableViews(reference).map(view => `<section id="${view}" class="ref-panel" data-panel="${view}" aria-labelledby="tab-${view}">${panel(view, reference, exampleData)}</section>`).join('');
  }
  function shell(reference, exampleData) {
    return `<div class="ref-shell" data-matrix data-component="${reference.component}" data-options="${escape(reference.activeOptions.join(','))}">
      <header class="ref-page-heading"><a class="ref-breadcrumb" href="/documentation/">Documentation <span aria-hidden="true">/</span></a><h1>Quick reference</h1><p>Explore the components. Shape an example. Find the setting you need.</p><div class="ref-version">Casai ${escape(reference.versions.casai)}<span>·</span>${componentChoices.length} components<span>·</span><a href="${escape(provenance.repository)}/tree/${provenance.commit}">${provenance.commit.slice(0, 8)}</a>${provenance.modified ? '<span>+ local changes</span>' : ''}</div></header>
      <section class="ref-introduction" aria-labelledby="introduction-title">
        <div class="ref-intro-heading"><h2 id="introduction-title">${escape(introduction.title)}</h2><a href="#component-factories">Explore the components <span aria-hidden="true">↓</span></a></div>
        <div class="ref-intro-lead ref-prose">${md(introduction.lead)}</div>
        <dl class="ref-principles">${introduction.principles.map(principle => `<div><dt>${escape(principle.title)}</dt><dd class="ref-prose">${md(principle.text)}</dd></div>`).join('')}</dl>
      </section>
      <h2 class="ref-matrix-title" id="component-factories">Component factories</h2>
      <div class="ref-workspace"><aside class="ref-sidebar" aria-label="Component factories and example options">
        <div class="ref-component-index"><div class="ref-component-grid" role="group" aria-label="Component factories">${componentChoices.map(component => `<button type="button" data-component-choice="${component.name}" aria-pressed="${component.name === reference.component}">${escape(component.name)}</button>`).join('')}</div><noscript><nav class="ref-component-grid" aria-label="Component factories">${componentChoices.map(component => `<a href="${referencePath(component.name)}"${component.name === reference.component ? ' aria-current="page"' : ''}>${escape(component.name)}</a>`).join('')}</nav></noscript></div>
        <div class="ref-options" data-controls>${controls(reference)}</div>
      </aside>
      <div class="ref-reader"><div data-reference-heading>${heading(reference)}</div>
        <div class="ref-toolbar"><div class="ref-tabs" aria-label="Reference views">${tabs(reference)}</div></div>
        <div class="ref-panels">${panels(reference, exampleData)}</div>
        <footer class="ref-reader-footer"><span>Take this reference with you</span><div><a data-export="md" href="${referencePath(reference.component, reference.activeOptions)}README.md">Markdown ↓</a><a data-export="json" href="${referencePath(reference.component, reference.activeOptions)}reference.json">JSON ↓</a></div></footer>
      </div></div><p class="ref-live" data-ref-status role="status" aria-live="polite"></p><noscript><p class="ref-notice">All reference sections are shown. Enable JavaScript to customize examples. <a href="${basePath}forms/">Browse all API forms</a>.</p></noscript>
      <details class="ref-build-info"><summary>Reference versions &amp; sources</summary><dl>${Object.entries(reference.versions).map(([name, version]) => `<dt>${escape(name)}</dt><dd>${escape(version)}</dd>`).join('')}</dl><p>Source revision: <a href="${provenance.repository}/tree/${provenance.commit}">${provenance.commit}</a>${provenance.modified ? ' with local changes; exact file hashes are recorded in the snapshot.' : ''}</p><p><a href="${basePath}source.json">Snapshot provenance</a> · <a href="${basePath}forms/">Browse all API forms</a> · <a href="${basePath}index.json">Reference index</a> · <a href="${basePath}notices/THIRD_PARTY.md">Sources &amp; licenses</a></p></details></div>`;
  }
  function toMarkdown(reference, exampleData) {
    let text = `# ${reference.form.factory || reference.component}\n\n${reference.info.description}\n\n**Status:** ${reference.status}\n\n**Versions:** ${Object.entries(reference.versions).map(([name, version]) => `${name} ${version}`).join(', ')}\n\n**Source revision:** ${provenance.commit}${provenance.modified ? ' (includes local changes; see source.json for exact file hashes)' : ''}\n\n`;
    text += reference.form.notices.map(notice => `> ${notice}\n\n`).join('');
    if (descriptionSources(reference)) text += `${descriptionSources(reference)}\n\n`;
    text += `## Input\n\n${reference.info.input}\n\n## Returns\n\n${reference.info.result}\n\n## Example\n\n${reference.example.note}\n\n`;
    if (exampleData.notice) text += `> ${exampleData.notice}\n\n`;
    for (const file of exampleData.files) text += `### ${file.name}\n\n\`\`\`${file.language}\n${file.code}\`\`\`\n\n`;
    text += exampleData.explanations.map(value => `- ${value}\n`).join('') + '\n';
    if (reference.config.supportedSources.length) text += '## Supported sources\n\n' + reference.config.supportedSources.map(form => `### ${form.modifier || 'Default'}\n\n${form.explanation}\n\nTool support: ${form.toolSupported}. Applicable to selected form: ${form.applicable}.\n\n`).join('');
    if (reference.config.alternatives.length) text += '## Compatible component configurations\n\nThese components support the selected modifiers. The settings you put in Config must also fit the receiving component.\n\n' + reference.config.alternatives.map(alternative => `- [${alternative.factory}](${referencePath(alternative.component, alternative.activeOptions)}README.md)\n`).join('') + '\n';
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
  return { shell, heading, controls, panel, panels, tabs, example, config, returns, notes, toMarkdown };
}
