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

Casai makes AI workflows easier to write and faster to run with [CascadaScript](https://cascada.dev/cascada-script/) - a simple scripting language, instantly familiar to JavaScript and Python developers. You express your workflow in normal, sequential code, without wiring up a graph. Under the hood, the runtime follows logical dependencies to run all independent operations concurrently, starting each as soon as its inputs are ready. The results are identical to sequential execution, but your workflow can finish much faster. ([See a workflow in action ↓](#concurrency))

### Components {id="why-components-title"}

Agents, templates, scripts and your own functions share a [consistent interface](#components). Configure them once and reuse them across workflows. Model components use the [Vercel AI SDK](https://ai-sdk.dev/docs/introduction), so you can choose from its [supported providers](https://ai-sdk.dev/providers/ai-sdk-providers).

</div>
</div>
</section>

<section id="orchestration" class="feature" aria-labelledby="orchestration-title">
<div class="container feature-grid">
<div class="feature-copy">

## Write the workflow.<br> Let Cascada handle the concurrency. {id="orchestration-title"}

Define components in JavaScript or TypeScript. Combine them with your own APIs and libraries in [CascadaScript](https://cascada.dev/cascada-script/).
{.lead}

The example is normal, sequential code. Specs, reviews and price are fetched concurrently, and the summary starts as soon as all three are ready.

**No `async`, no `await`, no juggling promises inside your script.** [Cascada](https://cascada.dev), the runtime behind [CascadaScript](https://cascada.dev/cascada-script/), follows the logical dependencies in your code. Everything that can run concurrently, does.

Operations can finish in any order, but **their outputs are assembled exactly as if the script had run sequentially**.

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

Use AI agents, templates, scripts and your own functions through one familiar interface. A template, script or function can turn your data into the prompts and inputs each component needs.

Share models, tools and defaults with [`Config`](/documentation/reference/config/#component-factories), then customize each component. Keep inputs and returned values compatible, and you can swap an implementation without rewriting the workflow.

</div>
{{ casaiSimpleMatrix | safe }}

<div class="component-tools feature-grid">
<div class="feature-copy">

### Turn a component into a tool

Let an agent delegate work to almost any component. Add [`.asTool`](/documentation/reference/llmagent_withtemplate_astool/#component-factories), describe its task and declare its arguments with [`inputSchema`](/documentation/reference/llmagent_withtemplate_astool/?options=withTemplate%2CasTool&view=config#property-inputSchema). A [template](https://cascada.dev/cascada-template/), script or function turns those arguments into the prompt or other input the component needs. It remains callable directly from your code.

Here, a research agent calls a page summarizer and receives a short summary, keeping the full page text out of its conversation.

Use these tools alongside [AI SDK tools](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) and [MCP tools](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools) in [`LLMAgent`](/documentation/reference/llmagent/#component-factories), [`Template`](/documentation/reference/template/#component-factories), [`Script`](/documentation/reference/script/#component-factories), [`Function`](/documentation/reference/function/#component-factories) and [`VoiceAgentBackend`](/documentation/reference/voiceagentbackend/#component-factories), or while preparing another component's inputs.

[Explore components and tools →](/documentation/reference/)

</div>

{% codeExample "page-summary.ts", "TypeScript · an agent with a summary tool", "Agent with a reusable page summary tool", "page-summary-code" %}

</div>
</div>
</section>

<section id="concurrency" class="feature" aria-labelledby="concurrency-title">
<div class="container feature-grid">
<div class="feature-copy">

## Start sooner.<br> Use results as they arrive. {id="concurrency-title"}

Process the first result while the rest are still arriving, using normal, sequential code.
{.lead}

A regular `for` loop processes each streamed item as it arrives. Independent iterations run concurrently, while collected results keep their original order.

In the example, one agent streams four headphone suggestions, your APIs fetch the details, and another agent summarizes each product.

<div class="workflow-explanation">

1. ### Find 4 headphones, streaming each result

   Start processing each product as its name arrives, while the agent is still producing the list.

2. ### Fetch specs, reviews and prices, then summarize

   Those lookups run concurrently, across products too. Each summary waits only for its own inputs.

3. ### Return summaries in the original order

   Summaries can finish in any order. The collected results follow the original product list, just as they would in a sequential loop.
{.workflow-steps}

</div>

The demo illustrates the timing; the code tabs show the workflow and its components. Connect the example to your own product APIs.
{.example-note}

Your app can also display generated text or play supported audio as it arrives. Steps that need the whole result wait for the stream to finish.

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
npm install casai ai@7 zod@4
npm install @ai-sdk/openai@4
```

</figure>

This component turns a document into a one-sentence summary. Reuse it in [CascadaScript](https://cascada.dev/cascada-script/), combine it with your APIs, or expose it as a tool.

<div class="home-actions"><a class="home-button" href="/documentation/reference/#guide-first-workflow">Continue with the documentation <span aria-hidden="true">↗</span></a><a href="/documentation/reference/#component-factories">Explore the reference <span aria-hidden="true">→</span></a></div>

</div>

{% codeExample "casai-start.ts", "TypeScript · your first component", "Casai getting started example" %}

</div>
</section>
