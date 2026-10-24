#Header
- Tutorial
- CascadaScript Doc
- Template Doc
- Playground


# Cascada
**Concurrency-first scripting and templating for JavaScript and TypeScript**

Modern applications spend much of their time waiting - fetching pages, calling web APIs, waiting for AI models to respond, querying databases... Operations often take seconds, even minutes.

Cascada runs these operations concurrently for you, inside your existing applications and AI agents. Orchestrate them with **CascadaScript**, a simple scripting language with familiar syntax, or generate prompts, HTML and other text with **Cascada Template**.

## Intentionally simple.

Instantly familiar to JavaScript and Python developers.

Variables, functions, conditionals, loops - the building blocks you already know. CascadaScript keeps the syntax simple and puts the complexity in the execution engine, not in your code.

```javascript
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

## Everything that can run concurrently, does.

Across statements, within expressions, inside function calls, across loop iterations, across composed scripts...

Every operation starts as soon as its inputs are ready, waiting only when it actually depends on another result.

```javascript
// Find the top 4 headphones, streaming each result
var products = findProducts({ query: "top 4 headphones" }).elementStream
data summaries = []

// Fetch specs, reviews and prices, then summarize
for product in products
  var specs = fetchSpecs(product)
  var reviews = fetchReviews(product)
  var price = fetchPrice(product)

  var summary = summarizeProduct(product, specs, reviews, price)
  summaries.push(summary)
endfor

// Return summaries in the original order
return summaries.snapshot()
```

## Concurrent execution. Sequential results.

Operations can run and finish out of order, but Cascada guarantees that their outputs are assembled exactly as if the script had run sequentially.

**No `async`, no `await`, no manual orchestration.** Just write your logic in the familiar, sequential style. Cascada handles the concurrency.

@headphones-animation.html

## Errors flow like data.

Errors don't stop execution. They *poison* all variables that depend on them, while independent work continues unaffected.

**The butterfly effect:** Poison also spreads through control flow. If an `if` condition is poisoned, neither branch runs, and everything either branch writes is poisoned. **Repair early, before it spreads.**

```js
var user = getUser()

if user is error
  user = { name: "Guest" }  // Repair with a fallback
endif
```

## Sequential by exception.
Concurrency is the default, but sometimes order matters.

- **`db!.write(data)`** - Add `!` to calls that modify external state, such as database writes, to run them in order.
- **`each item in items`** - Process loop iterations one by one.
- **`for item in items of 5`** - Limit a loop to five concurrent iterations.


(On the right)
```
db!.write(data)  // Mark the side-effect call with !
db.read(id)      // The read will wait for the write

each item in items
  process(item)
endeach

for item in items of 5
  process(item)
endfor
```

## Built for JavaScript and TypeScript.

Cascada works inside your existing applications, not as a replacement for JavaScript or TypeScript. TypeScript type definitions are included.

Use your existing functions, libraries, APIs, and services directly in CascadaScript. Organize complex workflows into reusable functions and scripts, then import and compose them into larger workflows.

**Concurrency works across the entire composition**, automatically managing dependencies between operations, functions, and scripts.

```ts
// Place your data, api and helpers in the context object
const context = {
  topic: 'electric cars',
  searchWeb, getReviews, summarize //functions
};

const env = new AsyncEnvironment();
// Run the script with the context object
const result = await env.renderScriptString(`
  var pages = searchWeb(topic)
  var reviews = getReviews(topic)
  return summarize(pages, reviews)`
, context);
```

## Templates that run concurrently.
**Cascada Template** brings the same engine to templates, using the popular Nunjucks syntax. Create AI prompts, HTML, emails, and more using familiar expressions, macros, conditionals, and loops.

Just like CascadaScript, **everything that can run concurrently, does** - even inside templates. Independent operations run in parallel, while the final output is assembled in the order you wrote it.

```njk
Write a research brief on {{ topic }}:

{% set urls = searchWeb(topic) %}
{% for url in urls %}
- {{ summarize(fetchPage(url)) }}
{% endfor %}
```
