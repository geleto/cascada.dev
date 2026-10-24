---
layout: layouts/base.njk
title: Cascada - Concurrency-first scripting and templating
home: true
---

<section class="hero" aria-labelledby="hero-title">
<div class="container">

# Cascada {#hero-title}

**Concurrency-first scripting and templating<br class="desktop-break"> for JavaScript and TypeScript**
{.tagline}

</div>
</section>

<section class="why" aria-labelledby="why-title">
<div class="container">

## Why Cascada? {#why-title}

<div class="why-copy">

Modern applications often spend much of their time waiting - fetching pages, calling web APIs, waiting for AI models to respond, querying databases… Operations often take seconds, even minutes.

Cascada runs these operations concurrently for you, inside your existing applications and AI agents. Orchestrate them with **[CascadaScript](/cascada-script/)**, a simple scripting language with familiar syntax, or generate prompts, HTML and other text with **[Cascada Template](/cascada-template/)**.

</div>
</div>
</section>

<section class="feature" aria-labelledby="simple-title">
<div class="container feature-grid">
<div class="feature-copy">

## Intentionally simple {#simple-title}

Instantly familiar to JavaScript and Python developers.
{.lead}

Variables, functions, conditionals, loops - the building blocks you already know. [CascadaScript](/cascada-script/) keeps the syntax simple and puts the complexity in the execution engine, not in your code.

</div>
<figure class="code-panel">
<figcaption><span>CascadaScript</span><button class="copy-button" type="button" aria-label="Copy greeting example" hidden>Copy</button></figcaption>

```cascada {tabindex="0" aria-label="Greeting example" data-language="cascada"}
function greet(user)
  if user.isNew
    return "Welcome, " + user.name
  endif
  return "Hello, " + user.name
endfunction

for user in users
  sendEmail(user.email, greet(user))
endfor
```

</figure>
</div>
</section>

<section class="feature feature-tinted feature-reversed" aria-labelledby="concurrent-title">
<div class="container feature-grid">
<div class="feature-copy">

## Everything that can run concurrently, does {#concurrent-title}

Across statements, within expressions, inside function calls, at each loop iteration, across composed scripts…
{.lead}

Every operation starts as soon as its inputs are ready, waiting only when it actually depends on another result.

</div>
<figure class="code-panel">
<figcaption><span>CascadaScript</span><button class="copy-button" type="button" aria-label="Copy concurrent workflow example" hidden>Copy</button></figcaption>

```cascada {tabindex="0" aria-label="Concurrent product comparison example" id="headphones-code" data-language="cascada"}
// Stream model names as strings
var products = findProducts({
  productName: "headphones",
  count: 4
}).elementStream

data summaries = []

// Start each model as it arrives.
// Loop iterations run concurrently.
for product in products
  // Run all three fetches concurrently.
  var specs = fetchSpecs(product)
  var reviews = fetchReviews(product)
  var price = fetchPrice(product)

  // Wait only for this model's fetches.
  var summary = summarizeProduct({
    product: product,
    specs: specs,
    reviews: reviews,
    price: price
  }).text
  // Append in the original search order.
  summaries.push(summary)
endfor

// Wait for all summaries, then return.
return summaries.snapshot()
```

</figure>
</div>
</section>

<section class="feature" aria-labelledby="results-title">
<div class="container feature-grid">
<div class="feature-copy">

## Concurrent execution<br> Sequential results {#results-title}

Operations can run and finish out of order, but Cascada guarantees that their outputs are assembled exactly as if the script had run sequentially.

**No `async`, no `await`, no manual orchestration.** Just write your logic in the familiar, sequential style. Cascada handles the concurrency.

<div class="workflow-explanation">

The example demonstrates concurrency in three steps:

1. ### Find the top 4 headphones, streaming each result

   Processing starts as soon as the search returns a headphone model, while the search continues.

2. ### Fetch specs, reviews and prices, then summarize

   Fetched concurrently across headphones. Each summary waits only for its own three fetches to finish.

3. ### Return summaries in the original order

   Summaries can finish in any order. Results keep the original search order.
{.workflow-steps}

</div>
</div>
<div class="example-tabs">
<div class="example-tablist" role="tablist" aria-label="Concurrent execution example" hidden>
<button id="workflow-tab" class="example-tab" type="button" role="tab" aria-controls="workflow-panel" aria-selected="true">Workflow</button>
<button id="code-tab" class="example-tab" type="button" role="tab" aria-controls="code-panel" aria-selected="false" tabindex="-1">Code</button>
</div>
<div id="workflow-panel" class="example-tabpanel" role="tabpanel" aria-labelledby="workflow-tab" tabindex="0">
<figure class="animation-panel">
<iframe id="concurrency-demo" src="/demos/headphones-workflow.html?embedded=1" title="Interactive demonstration: headphones processed concurrently, with results in their original order" loading="lazy" height="560"></iframe>
</figure>
</div>
<div id="code-panel" class="example-tabpanel" role="tabpanel" aria-labelledby="code-tab" tabindex="0" hidden>
<figure class="code-panel">
<figcaption><span>CascadaScript</span><button class="copy-button" type="button" aria-label="Copy headphones workflow example" hidden>Copy</button></figcaption>

```cascada {tabindex="0" aria-label="Headphones workflow code" data-language="cascada" data-code-source="headphones-code"}
// Stream model names as strings
var products = findProducts({
  productName: "headphones",
  count: 4
}).elementStream

data summaries = []

// Start each model as it arrives.
// Loop iterations run concurrently.
for product in products
  // Run all three fetches concurrently.
  var specs = fetchSpecs(product)
  var reviews = fetchReviews(product)
  var price = fetchPrice(product)

  // Wait only for this model's fetches.
  var summary = summarizeProduct({
    product: product,
    specs: specs,
    reviews: reviews,
    price: price
  }).text
  // Append in the original search order.
  summaries.push(summary)
endfor

// Wait for all summaries, then return.
return summaries.snapshot()
```

</figure>
</div>
</div>
</div>
</section>

<section class="feature feature-tinted feature-reversed" aria-labelledby="errors-title">
<div class="container feature-grid">
<div class="feature-copy">

## Errors flow like data {#errors-title}

Errors don’t stop execution. They *poison* all variables that depend on them, while independent work continues unaffected.
{.lead}

**The butterfly effect:** Poison also spreads through control flow. When an `if` condition is poisoned, neither branch runs, and everything either branch can potentially write is poisoned. **Repair early, before it spreads.**

</div>
<figure class="code-panel">
<figcaption><span>CascadaScript</span><button class="copy-button" type="button" aria-label="Copy error recovery example" hidden>Copy</button></figcaption>

```cascada {tabindex="0" aria-label="Error recovery example" data-language="cascada"}
var user = getUser()

if user is error
  showMessage("Failed to get user: "
    + user#message)
  // Repair with a fallback
  user = { name: "Guest" }
endif
```

</figure>
</div>
</section>

<section class="feature" aria-labelledby="sequential-title">
<div class="container feature-grid">
<div class="feature-copy">

## Sequential by exception {#sequential-title}

Concurrency is the default, but sometimes order matters.
{.lead}

- `db!.write(data)` - Add `!` to calls that modify external state, such as database writes, to run them in order.
- `each item in items` - Process loop iterations one by one.
- `for item in items of 5` - Limit a loop to five concurrent iterations.
{.feature-list}

</div>
<figure class="code-panel">
<figcaption><span>CascadaScript</span><button class="copy-button" type="button" aria-label="Copy sequential execution example" hidden>Copy</button></figcaption>

```cascada {tabindex="0" aria-label="Sequential execution example" data-language="cascada"}
// Mark the call side-effect with !
db!.write(data)
// The read will wait for the write
db.read(id)

// Process items one by one
each item in items
  process(item)
endeach

// Process up to 5 items concurrently
for item in items of 5
  process(item)
endfor
```

</figure>
</div>
</section>

<section class="feature feature-tinted feature-reversed" aria-labelledby="javascript-title">
<div class="container feature-grid">
<div class="feature-copy">

## Built for JavaScript<br> and TypeScript {#javascript-title}

Cascada works inside your existing applications, not as a replacement for JavaScript or TypeScript.

Use your existing functions, libraries, APIs, and services directly in [CascadaScript](/cascada-script/). Organize complex workflows into reusable functions and scripts, then import and compose them into larger workflows.

**Concurrency works across the entire composition**, automatically managing dependencies between operations, functions, and scripts.

</div>
<figure class="code-panel">
<figcaption><span>JavaScript</span><button class="copy-button" type="button" aria-label="Copy JavaScript integration example" hidden>Copy</button></figcaption>

```javascript {tabindex="0" aria-label="JavaScript integration example" data-language="javascript"}
import * as cascada from 'cascada-engine';

// Place your data, API and helpers
// in the context object
const context = {
  topic: 'electric cars',
  // Your functions:
  searchWeb, getReviews, summarize
};

const env = new cascada.AsyncEnvironment();

// Run the script with the context object
const result = await env.renderScriptString(`
  var pages = searchWeb(topic)
  var reviews = getReviews(topic)
  return summarize(pages, reviews)
`, context);
```

</figure>
</div>
</section>

<section class="feature" aria-labelledby="templates-title">
<div class="container feature-grid">
<div class="feature-copy">

## Templates that<br> run concurrently {#templates-title}

**[Cascada Template](/cascada-template/)** brings the same engine to templates, using the popular Nunjucks syntax. Create AI prompts, HTML, emails, and more using familiar expressions, macros, conditionals, and loops.

Just like [CascadaScript](/cascada-script/), **everything that can run concurrently, does** - even inside templates. Independent operations run in parallel, while the final output is assembled in the order you wrote it.

</div>
<figure class="code-panel">
<figcaption><span>Cascada Template</span><button class="copy-button" type="button" aria-label="Copy template example" hidden>Copy</button></figcaption>

```template {tabindex="0" aria-label="Research brief template example" data-language="template"}
Write a research brief on {{ topic }}:

{% set urls = searchWeb(topic) %}
{% for url in urls %}
- {{ summarize(fetchPage(url)) }}
{% endfor %}
```

</figure>
</div>
</section>
<section id="casai" class="feature feature-tinted feature-reversed" aria-labelledby="casai-title">
<div class="container feature-grid">
<div class="feature-copy">

## Casai - Cascada for AI workflows {#casai-title}

Build AI agents and workflows with [Casai](https://github.com/geleto/casai), a TypeScript library built on Cascada and the Vercel AI SDK, with all of Cascada’s concurrency features.
{.lead}

Compose model calls, tools, and structured outputs into reusable components. Define your workflows in [CascadaScript](/cascada-script/) and your prompts in [Cascada templates](/cascada-template/).

The same headphones example shown above, now with [Casai](https://github.com/geleto/casai) components. Explore the components, orchestration code, and workflow in motion.

The components stream headphone models, fetch specs, reviews, and prices from your product APIs, and generate a summary for each model.

[Explore Casai <span aria-hidden="true">→</span>](https://github.com/geleto/casai)

</div>
<div class="example-tabs casai-examples">
<div class="example-tablist" role="tablist" aria-label="Casai headphones example" hidden>
<button id="casai-components-tab" class="example-tab" type="button" role="tab" aria-controls="casai-components-panel" aria-selected="true">Components</button>
<button id="casai-orchestration-tab" class="example-tab" type="button" role="tab" aria-controls="casai-orchestration-panel" aria-selected="false" tabindex="-1">Orchestration</button>
<button id="casai-workflow-tab" class="example-tab" type="button" role="tab" aria-controls="casai-workflow-panel" aria-selected="false" tabindex="-1">Workflow</button>
</div>
<div id="casai-components-panel" class="example-tabpanel" role="tabpanel" aria-labelledby="casai-components-tab" tabindex="0">
<figure class="code-panel">
<figcaption><span>JavaScript · components.js</span><button class="copy-button" type="button" aria-label="Copy Casai components example" hidden>Copy</button></figcaption>

```javascript {tabindex="0" aria-label="Casai components example" id="casai-components-code" data-language="javascript"}
import {
  create, FileSystemLoader, z
} from 'casai';
import { openai } from '@ai-sdk/openai';
// Your product API integration.
import { productApi } from './product-api';

// Build the AI prompt with a template.
const summarizeProduct =
  create.TextGenerator.withTemplate({
    model: openai('gpt-4o-mini'),
    inputSchema: z.object({
      product: z.string(),
      specs: z.record(
        z.string(), z.string()
      ),
      reviews: z.array(z.string()),
      price: z.number().nonnegative()
    }),
    prompt: `Summarize this headphone.
      Use only the supplied information.
      Model: {{ product }}
      Specs: {{ specs | dump }}
      Reviews: {{ reviews | dump }}
      Price: {{ price | dump }}`
  });

// Load the Orchestration tab's script
// from headphones.csc in this folder.
const compare = create.Script.loadsScript({
  loader: new FileSystemLoader('./'),
  script: 'headphones.csc',
  context: {
    findProducts: productApi.findProducts,
    fetchSpecs: productApi.fetchSpecs,
    fetchReviews: productApi.fetchReviews,
    fetchPrice: productApi.fetchPrice,
    summarizeProduct
  }
});

const summaries = await compare();
```

</figure>
</div>
<div id="casai-orchestration-panel" class="example-tabpanel" role="tabpanel" aria-labelledby="casai-orchestration-tab" tabindex="0" hidden>
<figure class="code-panel">
<figcaption><span>CascadaScript · headphones.csc</span><button class="copy-button" type="button" aria-label="Copy Casai orchestration example" hidden>Copy</button></figcaption>

```cascada {tabindex="0" aria-label="Casai orchestration example" data-language="cascada" data-code-source="headphones-code"}
// Stream model names as strings
var products = findProducts({
  productName: "headphones",
  count: 4
}).elementStream

data summaries = []

// Start each model as it arrives.
// Loop iterations run concurrently.
for product in products
  // Run all three fetches concurrently.
  var specs = fetchSpecs(product)
  var reviews = fetchReviews(product)
  var price = fetchPrice(product)

  // Wait only for this model's fetches.
  var summary = summarizeProduct({
    product: product,
    specs: specs,
    reviews: reviews,
    price: price
  }).text
  // Append in the original search order.
  summaries.push(summary)
endfor

// Wait for all summaries, then return.
return summaries.snapshot()
```

</figure>
</div>
<div id="casai-workflow-panel" class="example-tabpanel" role="tabpanel" aria-labelledby="casai-workflow-tab" tabindex="0" hidden>
<figure class="animation-panel">
<iframe id="casai-demo" src="/demos/headphones-workflow.html?embedded=1" title="Casai headphones workflow: concurrent processing with ordered results" loading="lazy" height="560"></iframe>
</figure>
</div>
</div>
</div>
</section>
