import { createHash } from 'node:crypto';

// Publication policy, not another authored reference. API prose, contracts and
// examples below come from the current matrix snapshot. The interactive matrix
// still offers every example; the linear publication teaches each pattern once.
export const additionalExamples = new Set([
  'LLMAgent_asTool', 'LLMAgent_asStream', 'LLMAgent_withTemplate',
  'Transcriber_loadAudio', 'SpeechGenerator_asStream', 'Translator_asStream',
]);

const slug = value => String(value).replace(/[^\w-]/g, '-').toLowerCase();
const marker = id => `<a id="${id}" name="${id}"></a>`;
const heading = (level, id, title) => `${marker(id)}\n\n${'#'.repeat(level)} ${title}\n\n`;
const link = (text, id) => `[${text}](#${id})`;
const unique = values => [...new Set(values)];
const groupBy = (values, key) => {
  const groups = new Map();
  for (const value of values) {
    const id = key(value);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(value);
  }
  return groups;
};
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 12);
const code = value => `\`${value}\``;
const cell = value => String(value).replace(/\|/g, '\\|').replace(/\n+/g, ' ');
const table = (headers, rows) => rows.length ? [headers, headers.map(() => '---'), ...rows].map(row => '| ' + row.map(cell).join(' | ') + ' |').join('\n') + '\n\n' : '';
const isPresent = value => value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0);
const sourceMode = entry => entry.reference.form.sourceModifier || 'Default';
const delivery = entry => entry.reference.activeOptions.includes('asTool') ? '.asTool' : entry.reference.activeOptions.includes('asStream') ? '.asStream' : 'Ordinary';
const operation = entry => entry.reference.form.operation || 'Default';
const dimensions = [sourceMode, delivery, operation];

// Describe exact subsets of the supported forms using the shortest combination
// of source, delivery and operation. This never implies a new supported form.
function condition(selected, universe, remaining = dimensions) {
  if (selected.length === universe.length) return '';
  const candidates = remaining.map(dimension => {
    const values = unique(selected.map(dimension));
    const matches = universe.filter(row => values.includes(dimension(row)));
    const label = values.map(value => value === 'Default' ? 'default source' : code(value)).join(', ');
    if (matches.length === selected.length) return label;
    const rest = remaining.filter(item => item !== dimension);
    if (!rest.length) return null;
    return values.map(value => {
      const suffix = condition(selected.filter(row => dimension(row) === value), universe.filter(row => dimension(row) === value), rest);
      return `${value === 'Default' ? 'default source' : code(value)}${suffix ? ` + ${suffix}` : ''}`;
    }).join('; ');
  }).filter(Boolean);
  return candidates.sort((a, b) => a.length - b.length)[0] || selected.map(row => code(row.reference.form.factory || row.reference.component)).join(', ');
}

export function exportReference(entries, { source, basePath }) {
  const byComponent = groupBy(entries, entry => entry.reference.component);
  const properties = new Map();
  const methods = new Map();
  const targets = new Map();
  const shapes = new Map();
  const types = new Map();
  const examples = [];
  const sources = new Map();
  const propertyId = name => `ref-property-${slug(name)}`;
  const methodId = name => `ref-method-${name.replace(/[^\w-]/g, '-')}`;
  const componentId = name => `ref-${slug(name)}`;
  const setTarget = (entry, fragment, id) => targets.set(entry.url + fragment, id);
  const add = (map, name, item) => {
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(item);
  };
  const labels = (selected, universe = entries, omitComponent = false, allowExclusion = true) => {
    const positive = rows => [...groupBy(rows, entry => entry.reference.component)].map(([name, values]) => {
      const scope = condition(values, universe.filter(entry => entry.reference.component === name));
      return omitComponent ? scope || 'All forms' : `${name}${scope ? ` (${scope})` : ''}`;
    }).join('; ');
    if (selected.length === universe.length) return 'All supported forms';
    const included = positive(selected);
    const excluded = universe.filter(entry => !selected.includes(entry));
    const alternative = excluded.length ? 'All except ' + positive(excluded) : included;
    return allowExclusion && alternative.length < included.length && alternative.length < 180 ? alternative : included;
  };
  const field = (label, content) => isPresent(content) ? `**${label}:**${String(content).includes('\n') ? '\n\n' : ' '}${content}\n\n` : '';

  function type(value, name) {
    if (!value) return '';
    if (value.length <= 180 && !value.includes('\n') && !value.includes('`')) return code(value);
    const id = `ref-type-${hash(value)}`;
    if (!types.has(id)) types.set(id, { name, value });
    return link(`${name} type`, id);
  }

  // Source-location metadata is retained in source.json and the interactive
  // reference, not repeated under every field of a published SDK shape.
  function semantic(value) {
    if (Array.isArray(value)) return value.map(semantic);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !['source', 'descriptionSource', 'descriptionOrigin', 'displayType'].includes(key))
      .map(([key, item]) => [key, semantic(item)]));
    return value;
  }

  function shape(title, fields) {
    if (!fields?.length) return '';
    const key = JSON.stringify(semantic(fields));
    const id = `ref-shape-${hash(key)}`;
    if (!shapes.has(id)) shapes.set(id, { title, fields });
    return link(title, id);
  }

  function details(detail) {
    if (!detail) return '';
    const variants = detail.variants || [];
    const rows = variants.map((variant, index) => [variants.length > 1 ? `Alternative ${index + 1}` : detail.appliesTo || 'Value', type(variant.type, detail.name), shape(`${detail.name} fields${variants.length > 1 ? ` (${index + 1})` : ''}`, variant.properties)]);
    const definition = variants.some(variant => variant.type === detail.type) ? '' : field('Definition', type(detail.type, detail.name));
    return definition + table(['Shape', 'Type', 'Fields'], rows);
  }

  function nativeField(property) {
    const content = [property.description, property.typeDescription].filter(Boolean);
    for (const key of ['default', 'required', 'notes', 'inheritance', 'adaptation']) {
      if (isPresent(property[key])) content.push(`**${key[0].toUpperCase() + key.slice(1)}:** ${property[key]}`);
    }
    for (const tag of property.tags || []) if (['deprecated', 'default', 'defaultValue', 'returns', 'param'].includes(tag.name)) content.push(`**${tag.name}:** ${tag.text}`);
    const body = `**${code(property.name + (property.optional ? '?' : ''))}**${property.type ? `: ${type(property.type, property.name)}` : ''}. ${unique(content).join('\n\n')}\n`
      + (property.details ? '\n' + details(property.details) : '')
      + (property.nested?.length ? `\n${shape(`${property.name} fields`, property.nested)}\n` : '');
    return '- ' + body.trimEnd().replace(/\n/g, '\n  ') + '\n';
  }

  // A facet appears once when it is shared. Differences retain their exact
  // conditions, instead of repeating all the other facets for each variant.
  function facets(records, definitions, { omitComponent = false } = {}) {
    const universe = records.map(record => record.entry);
    return definitions.map(([label, get, format = value => String(value), defaultValue]) => {
      const groups = groupBy(records, record => JSON.stringify(get(record.value) ?? null));
      const available = [...groups.values()].filter(group => isPresent(get(group[0].value)) && get(group[0].value) !== defaultValue);
      if (!available.length) return '';
      if (groups.size === 1) return field(label, format(get(available[0][0].value)));
      return `**${label}:**\n\n` + available.map(group => {
        const content = format(get(group[0].value));
        // An absent documented value is not a different value. For example,
        // unspecified default metadata must not become "all except X: 2".
        const scope = labels(group.map(record => record.entry), universe, omitComponent, groups.size === available.length);
        return `- **${scope}:**${content.includes('\n') ? '\n\n  ' : ' '}${content.replace(/\n/g, '\n  ')}\n`;
      }).join('') + '\n';
    }).join('');
  }

  for (const entry of entries) {
    const ref = entry.reference;
    const id = componentId(ref.component);
    for (const fragment of ['', '#component-factories', '#component-title', '#info']) setTarget(entry, fragment, id);
    for (const fragment of ['#config', '#sources', '#section-source']) setTarget(entry, fragment, `${id}-configuration`);
    for (const fragment of ['#return', '#results']) setTarget(entry, fragment, `${id}-results`);
    setTarget(entry, '#example', `${id}-examples`);
    setTarget(entry, '#notes', id);
    for (const property of Object.values(ref.config.properties)) {
      add(properties, property.name, { entry, value: property });
      setTarget(entry, `#property-${property.id.replace(/[^\w-]/g, '-')}`, propertyId(property.name));
    }
    for (const property of ref.relatedProperties) {
      add(properties, property.name, { entry, value: property });
      setTarget(entry, `#related-${property.id.replace(/[^\w-]/g, '-')}`, propertyId(property.name));
    }
    for (const method of ref.config.sections.flatMap(section => section.methods || [])) {
      if (method.name === 'run') {
        const declared = method.propertyIds || [];
        const located = Object.values(ref.config.properties).filter(property => property.locations.includes('run')).map(property => property.id);
        if (declared.some(name => !located.includes(name)) || located.some(name => !declared.includes(name))) throw new Error(`run settings need an explicit exception: ${ref.canonical.id}`);
      }
      add(methods, method.name, { entry, value: method });
      setTarget(entry, `#method-${method.name.replace(/[^\w-]/g, '-')}`, methodId(method.name));
    }
    for (const concept of ref.concepts) {
      const chapter = new URL(concept.link).hash.slice(1);
      if (!chapter || !source.includes(`id="${chapter}"`)) throw new Error(`Missing chapter for ${concept.id}: ${concept.link}`);
      setTarget(entry, `#concept-${concept.id.replace(/[^\w-]/g, '-')}`, chapter);
    }
    for (const item of ref.config.supportedSources) {
      if (!item.modifier) continue;
      const explanation = ref.form.primaryProperty ? item.explanation.replaceAll(code(ref.form.primaryProperty), '`main input`') : item.explanation;
      add(sources, item.modifier, { entry, value: explanation });
    }
  }

  let markdown = heading(2, 'ref-components', 'Component reference');
  markdown += 'Each component is described once. Source modifiers, tool delivery and streaming reuse the shared contracts below. Conditions apply only to the supported forms listed for that component. Choose one delivery: ordinary, `.asTool` or `.asStream`; tool and stream delivery cannot be combined.\n\n';
  markdown += [...byComponent.keys()].map(name => '- ' + link(name, componentId(name))).join('\n') + '\n\n';

  for (const [name, forms] of byComponent) {
    const base = forms.find(entry => entry.reference.activeOptions.length === 0) || forms[0];
    const ref = base.reference;
    const id = componentId(name);
    // Keep every existing static form anchor, but point it to its component's
    // compact contract rather than creating another repeated section.
    markdown += forms.map(entry => `ref-${entry.url.slice(basePath.length).replace(/\/$/, '')}`).filter(alias => alias !== id).map(marker).join('\n') + '\n\n';
    markdown += heading(3, id, name) + ref.info.description + '\n\n';
    markdown += facets(forms.map(entry => ({ entry, value: entry.reference })), [
      ['Status', value => value.form.notices.join('\n\n')],
      ['Input', value => value.info.input],
      ['Returns', value => value.info.result],
    ], { omitComponent: true });
    const descriptions = groupBy(forms.filter(entry => entry.reference.info.description !== ref.info.description), entry => entry.reference.info.description);
    for (const [description, selected] of descriptions) markdown += `**${labels(selected, forms, true)}:** ${description}\n\n`;

    markdown += heading(4, `${id}-configuration`, 'Configuration and supported forms');
    if (ref.form.primaryProperty) markdown += field('Main input', link(code(ref.form.primaryProperty), propertyId(ref.form.primaryProperty)));
    const modes = groupBy(forms, sourceMode);
    markdown += table(['Source', 'Supported delivery / operation'], [...modes].map(([mode, selected]) => [mode === 'Default' ? 'Default' : code('.' + mode), unique(selected.map(entry => `${delivery(entry)}${entry.reference.activeOptions.includes('prepareSession') ? ' / prepareSessionConfig' : entry.reference.activeOptions.includes('webRTC') ? ' / createWebRTCSession' : ''}`)).join(', ')]));
    const defaultSource = ref.config.supportedSources.find(item => !item.modifier);
    if (defaultSource) markdown += field('Default source', defaultSource.explanation);
    const modifiers = unique(forms.flatMap(entry => entry.reference.config.supportedSources.map(item => item.modifier).filter(Boolean)));
    if (modifiers.length) markdown += field('Source modifiers', modifiers.map(modifier => link(code('.' + modifier), `ref-source-${slug(modifier)}`)).join(', '));
    if (ref.info.selectionNote) markdown += ref.info.selectionNote + '\n\n';
    markdown += facets(forms.map(entry => ({ entry, value: entry.reference.config })), [
      ['Configuration notes', value => unique(value.sections.flatMap(section => section.notes || [])).join('\n\n')],
    ], { omitComponent: true });
    const compatible = unique(forms.flatMap(entry => entry.reference.config.alternatives.map(item => item.component)));
    if (compatible.length) markdown += table(['Can inherit these modifiers', 'Supported configuration forms'], compatible.map(component => [
      link(component, componentId(component)), labels(forms.filter(entry => entry.reference.config.alternatives.some(item => item.component === component)), forms, true),
    ]));

    const propertyRows = [];
    for (const propertyName of unique(forms.flatMap(entry => [...Object.keys(entry.reference.config.properties), ...entry.reference.relatedProperties.map(property => property.name)]))) {
      const available = forms.filter(entry => entry.reference.config.properties[propertyName] || entry.reference.relatedProperties.some(property => property.name === propertyName));
      const first = available[0].reference;
      const property = first.config.properties[propertyName] || first.relatedProperties.find(property => property.name === propertyName);
      const section = first.config.sections.find(section => section.id === property.section)?.name || 'Related configuration';
      propertyRows.push([section, link(code(propertyName), propertyId(propertyName)), labels(available, forms, true)]);
    }
    markdown += table(['Group', 'Properties', 'Available in'], [...groupBy(propertyRows, row => JSON.stringify([row[0], row[2]]))].map(([, rows]) => [rows[0][0], rows.map(row => row[1]).join(', '), rows[0][2]]));
    const methodNames = unique(forms.flatMap(entry => entry.reference.config.sections.flatMap(section => section.methods || []).map(method => method.name)));
    markdown += table(['Call or method', 'Available in'], methodNames.map(methodName => [link(code(methodName), methodId(methodName)), labels(methods.get(methodName).map(record => record.entry).filter(entry => forms.includes(entry)), forms, true)]));
    const alternatives = groupBy(forms.flatMap(entry => entry.reference.config.operationAlternatives.map(value => ({ entry, value }))), record => JSON.stringify(semantic(record.value)));
    for (const records of alternatives.values()) {
      const alternative = records[0].value;
      markdown += `**${code(alternative.operation)} (${labels(records.map(record => record.entry), forms, true)}):** ${alternative.when} ${shape(`${alternative.operation} request`, alternative.properties)}\n\n`;
    }

    markdown += heading(4, `${id}-results`, 'Results');
    markdown += facets(forms.map(entry => ({ entry, value: entry.reference.result })), [
      ['Behavior', value => value.description],
      ['Tool execution output', value => value.tool],
      ['Result fields', value => value.shapes.map(item => shape(item.name, item.properties)).filter(Boolean).join(', ')],
      ['Additional fields', value => shape(`${name} additional result fields`, value.additionalProperties)],
    ], { omitComponent: true });

    markdown += heading(4, `${id}-examples`, 'Examples');
    const selected = forms.filter(entry => entry === base || additionalExamples.has(entry.reference.canonical.id));
    for (const entry of selected) {
      examples.push(entry.reference.canonical.id);
      if (selected.length > 1) markdown += `**${entry.reference.form.factory || name}**\n\n`;
      if (entry.example.notice) markdown += `> ${entry.example.notice}\n\n`;
      for (const file of entry.example.files) markdown += `**${file.name}**\n\n\`\`\`${file.language}\n${file.code.trimEnd()}\n\`\`\`\n\n`;
      markdown += entry.example.explanations.map(note => '- ' + note).join('\n') + '\n\n';
    }
  }

  markdown += heading(2, 'ref-sources', 'Source modifiers');
  markdown += 'The main input is the component property named in its configuration section, such as `prompt`, `text` or `audio`. The component tables show supported combinations; source preparation does not change output delivery.\n\n';
  for (const [name, records] of sources) markdown += heading(3, `ref-source-${slug(name)}`, '.' + name) + facets(records, [['Behavior', value => value]]);

  const commonRule = get => [...groupBy([...properties.values()].flat(), record => get(record.value))].sort((a, b) => b[1].length - a[1].length)[0][0];
  const defaultRequired = commonRule(value => value.required.description);
  const defaultInheritance = commonRule(value => value.inheritance);
  const defaultOverride = commonRule(value => value.override);
  markdown += heading(2, 'ref-properties', 'Shared property reference');
  markdown += 'Properties are listed once by name. Each component links to the properties it supports. Conditional entries specify the component, source or delivery where a rule applies. Construction means factory configuration; ordinary means positional calls; run means named `.run()` input.\n\n';
  markdown += 'The following defaults apply unless a property states otherwise:\n\n' + field('Required', defaultRequired) + field('Inheritance', defaultInheritance) + field('Overrides', defaultOverride);
  for (const [name, records] of properties) {
    markdown += heading(3, propertyId(name), name);
    markdown += facets(records, [
      ['Description', value => value.description],
      ['Type', value => value.type, value => type(value, name)],
      ['Values', value => value.typeDescription],
      ['Required', value => value.required.description, undefined, defaultRequired],
      ['Default', value => value.default],
      ['Accepted by', value => value.locations.join(', ')],
      ['Overrides', value => value.override, undefined, defaultOverride],
      ['Inheritance', value => value.inheritance, undefined, defaultInheritance],
      ['Behavior', value => value.adaptation],
      ['Notes', value => value.notes],
      ['Deprecated', value => value.deprecated],
      ['Alias', value => value.aliasFor],
      ['Native operation', value => value.applicability.operations?.join(', ')],
      ['Fields', value => shape(`${name} fields`, value.nested)],
      ['Value shape', value => value.details, value => details(value)],
    ]);
  }

  markdown += heading(2, 'ref-methods', 'Calls and methods');
  markdown += 'Use the component tables above to check which methods are available. `.run()` accepts exactly the settings marked **run** in the applicable property contract. Other methods list their supported settings below.\n\n';
  const methodOrder = unique(['call', 'run', 'config', ...methods.keys()]).filter(name => methods.has(name));
  for (const name of methodOrder) {
    const records = methods.get(name);
    markdown += heading(3, methodId(name), name);
    markdown += facets(records, [
      ['Signature', value => value.signature, value => type(value, name)],
      ['Behavior', value => value.description],
      ['Settings', value => name === 'run' ? null : value.propertyIds?.join(', '), value => value.split(', ').map(property => link(code(property), propertyId(property))).join(', ')],
      ['Arguments', value => shape(`${name} arguments`, value.arguments)],
      ['Additional inputs', value => shape(`${name} inputs`, value.properties)],
      ['Returns', value => shape(`${name} result`, value.result)],
      ['Additional fields', value => shape(`${name} additional fields`, value.additionalProperties)],
    ]);
  }

  markdown += heading(2, 'ref-contracts', 'Shared types and result fields');
  markdown += 'Nested shapes and long TypeScript signatures are defined once here. Separate alternatives remain separate; fields from different alternatives are not interchangeable. Native SDK fields retain their documented behavior.\n\n';
  // Rendering a shape can register nested shapes, so iterate the live Map.
  for (const [id, value] of shapes) markdown += heading(3, id, value.title) + value.fields.map(nativeField).join('\n') + '\n';
  for (const [id, value] of types) markdown += heading(3, id, value.name + ' type') + `\`\`\`typescript\n${value.value}\n\`\`\`\n\n`;
  return { markdown, targets, examples, propertyNames: [...properties.keys()], methodNames: [...methods.keys()], shapeCount: shapes.size };
}
