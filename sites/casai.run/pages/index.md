---
layout: layouts/base.njk
templateEngineOverride: njk,md
title: Casai - AI orchestration for JavaScript and TypeScript
home: true
simpleMatrix: true
description: Build AI agents and workflows in JavaScript and TypeScript. Compose reusable components with simple code, automatic concurrency and streaming.
---
<section class="hero" aria-labelledby="hero-title">
<div class="container">

# Casai {id="hero-title"}

**AI orchestration<br class="desktop-break"> for JavaScript and TypeScript**
{.tagline}

**Casai is in active development.** APIs and syntax may change. [Feedback](https://github.com/geleto/casai/issues) and contributions are welcome.
{.development-note}

</div>
</section>

<section class="why" aria-labelledby="why-title">
<div class="container">

## Why Casai? {id="why-title"}

<div class="why-copy">

### Simple code. Concurrent workflows.

AI agents spend most of their time waiting. They wait for models, tools, web pages, APIs and databases - sometimes for seconds, even minutes.

[CascadaScript](https://cascada.dev/cascada-script/) is a simple language familiar to JavaScript and Python developers. Use your usual programming toolbox - conditions, loops, functions and more - without wiring a graph.

You write normal, sequential code. [Cascada](https://cascada.dev), the engine behind [CascadaScript](https://cascada.dev/cascada-script/), follows logical dependencies and runs independent operations concurrently. You get the results of sequential execution with less time spent waiting.

[See a workflow in action ↓](#concurrency)

### Components {id="why-components-title"}

Agents, templates, scripts and your own functions share a [consistent interface](#components). Configure them once and reuse them across workflows. Model components use the [Vercel AI SDK](https://ai-sdk.dev/docs/introduction), so you can choose from its [supported providers](https://ai-sdk.dev/providers/ai-sdk-providers).

</div>
</div>
</section>

<section id="orchestration" class="feature" aria-labelledby="orchestration-title">
<div class="container feature-grid">
<div class="feature-copy">

## Write the workflow.<br> Let Cascada handle the concurrency. {id="orchestration-title"}

Define components in JavaScript or TypeScript. Connect them with [CascadaScript](https://cascada.dev/cascada-script/).
{.lead}

Call your own APIs and libraries alongside Casai components.

In the example, specs, reviews and price are fetched concurrently. The summary starts as soon as all three are ready.

**No `async`, no `await`, no juggling promises inside your script.** Cascada follows the logical dependencies in your code. Everything that can run concurrently, does.

Operations can finish in any order, but **Cascada assembles their outputs exactly as if the script had run sequentially** - with less time spent waiting.

</div>
<figure class="code-panel">
<figcaption><span><a href="https://cascada.dev/cascada-script/">CascadaScript</a> · product summary</span><button class="copy-button" type="button" aria-label="Copy product summary example" hidden>Copy</button></figcaption>

```cascada {tabindex="0" aria-label="Product summary example" data-language="cascada"}
var specs = fetchSpecs(product)
var reviews = fetchReviews(product)
var price = fetchPrice(product)

return summarizeProduct({
  product: product,
  specs: specs,
  reviews: reviews,
  price: price
}).output
```

</figure>
</div>
</section>

<section id="components" class="feature feature-tinted" aria-labelledby="components-title">
<div class="container">
<div class="feature-copy component-intro">

## Many components. Different capabilities.<br> One consistent interface. {id="components-title"}

Configure once. Call with new inputs. Reuse across workflows.
{.lead}

Mix AI agents, templates, scripts and your own functions through one familiar interface. Use templates or code to turn your application's data into the prompts and inputs each component needs.

Keep a component's inputs and results consistent, and you can change how it works without rewriting the workflow.

</div>
{{ casaiSimpleMatrix | safe }}

<div class="component-tools feature-grid">
<div class="feature-copy">

### Turn a component into a tool

Almost any component can become a tool. Add [`.asTool`](/documentation/quick-reference/llmagent_withtemplate_astool/#component-factories), describe its task and declare its inputs with [`inputSchema`](/documentation/quick-reference/llmagent_withtemplate_astool/?options=withTemplate%2CasTool&view=config#property-inputSchema). A [template](https://cascada.dev/cascada-template/), script or function can turn those inputs into the prompt or other data the component needs.

Here, an agent uses a page summarizer to read a URL without adding the whole page to its conversation.

Use these tools alongside [AI SDK tools](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) and [MCP tools](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools) in [`LLMAgent`](/documentation/quick-reference/llmagent/#component-factories), [`Template`](/documentation/quick-reference/template/#component-factories), [`Script`](/documentation/quick-reference/script/#component-factories), [`Function`](/documentation/quick-reference/function/#component-factories) and [`VoiceAgentBackend`](/documentation/quick-reference/voiceagentbackend/#component-factories), or while preparing another component's inputs.

[Explore components and tools →](/documentation/quick-reference/)

</div>

{% codeExample "page-summary.ts", "TypeScript · an agent with a summary tool", "Agent with a reusable page summary tool", "page-summary-code" %}

</div>
</div>
</section>

<section id="concurrency" class="feature" aria-labelledby="concurrency-title">
<div class="container feature-grid">
<div class="feature-copy">

## Start sooner.<br> Use results as they arrive. {id="concurrency-title"}

Streaming works with normal, sequential code too.
{.lead}

A regular `for` loop can process a stream. Each item starts moving through the workflow as soon as it arrives, while more are still on their way. Independent iterations run concurrently, and the collected results keep their original order.

In the example, one agent streams four headphone suggestions, your APIs fetch the details, and another agent summarizes each product.

<div class="workflow-explanation">

1. ### Find 4 headphones, streaming each result

   Start processing each product as its name arrives, while the agent is still producing the list.

2. ### Fetch specs, reviews and prices, then summarize

   Specs, reviews and prices run concurrently, across products too. Each summary waits only for its own inputs.

3. ### Return summaries in the original order

   Summaries can finish in any order. The collected results follow the original product list, just as they would in a sequential loop.
{.workflow-steps}

</div>

The demo illustrates the timing; the code tabs show the workflow and its components. Connect the example to your own product APIs.
{.example-note}

Streaming also lets you display generated text or play supported audio as it arrives. A step that needs a complete result waits for completion.

</div>
<div class="example-tabs casai-examples">
<div class="example-tablist" role="tablist" aria-label="Headphones workflow example" hidden>
<button id="workflow-tab" class="example-tab" type="button" role="tab" aria-controls="workflow-panel" aria-selected="true">Workflow</button>
<button id="script-tab" class="example-tab" type="button" role="tab" aria-controls="script-panel" aria-selected="false" tabindex="-1">CascadaScript</button>
<button id="components-tab" class="example-tab" type="button" role="tab" aria-controls="components-panel" aria-selected="false" tabindex="-1">Components</button>
</div>
<div id="workflow-panel" class="example-tabpanel" role="tabpanel" aria-labelledby="workflow-tab" tabindex="0">
<figure class="animation-panel">
<iframe id="casai-demo" src="/demos/headphones-workflow.html?embedded=1" title="Headphones workflow: concurrent processing with results in the original order" loading="lazy" height="560"></iframe>
</figure>
</div>
<div id="script-panel" class="example-tabpanel" role="tabpanel" aria-labelledby="script-tab" tabindex="0" hidden>

{% codeExample "headphones.cas", "CascadaScript · headphones.cas", "Headphones orchestration example", "headphones-code" %}

</div>
<div id="components-panel" class="example-tabpanel" role="tabpanel" aria-labelledby="components-tab" tabindex="0" hidden>

{% codeExample "headphones.ts", "TypeScript · headphones.ts", "Casai components example", "casai-components-code" %}

</div>
</div>
</div>
</section>

<section id="get-started" class="feature feature-tinted" aria-labelledby="start-title">
<div class="container feature-grid">
<div class="feature-copy">

## Build your first workflow. {id="start-title"}

Start with one component. Add the next when you need it.
{.lead}

Install Casai and a model provider. This example uses [OpenAI](https://ai-sdk.dev/providers/ai-sdk-providers/openai); set `OPENAI_API_KEY` in your environment before running it.

<figure class="code-panel install-command">
<figcaption><span>Install</span><button class="copy-button" type="button" aria-label="Copy Casai install command" hidden>Copy</button></figcaption>

```sh {tabindex="0" aria-label="Install Casai and the OpenAI provider"}
npm install casai ai zod @ai-sdk/openai
```

</figure>

Create a reusable summarizer, pass it a document, and read the output. Then call it from [CascadaScript](https://cascada.dev/cascada-script/), combine it with your APIs, or expose it as a tool.

<div class="home-actions"><a class="home-button" href="https://github.com/geleto/casai#readme">Continue with the guide <span aria-hidden="true">↗</span></a><a href="/documentation/quick-reference/#component-factories">Explore the reference <span aria-hidden="true">→</span></a></div>

</div>

{% codeExample "casai-start.ts", "TypeScript · your first component", "Casai getting started example" %}

</div>
</section>
