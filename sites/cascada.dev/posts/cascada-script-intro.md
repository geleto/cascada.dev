---
title: "Introduction to CascadaScript: Concurrent by Default, Sequential by Exception"
date: '2026-04-30'
tags: [cascada, async, concurrency, concurrent-programming, javascript, typescript, dataflow]
description: "A scripting language that turns async programming upside down: everything runs concurrently by default, you never write await, and race conditions are impossible by design. Learn how Cascada's data-driven execution model eliminates async plumbing while maximizing I/O throughput."
---

### CascadaScript - Everything Runs at Once

CascadaScript is a scripting language where everything runs at once, concurrently - every statement, every part of every expression, every step inside every function call, every iteration of every loop, every task in every imported script - and an operation only waits when it actually depends on another's result. And the final result is identical to sequential execution - just dramatically faster.

It is a specialized scripting language designed for orchestrating complex asynchronous workflows in JavaScript and TypeScript applications. It is not a general-purpose programming language - instead, it acts as a data-orchestration layer for coordinating APIs, databases, LLMs, and other I/O-bound operations with maximum concurrency and minimal boilerplate.

#### Ordinary Syntax, Extraordinary Power

What makes it extraordinary is how ordinary the syntax looks: instantly familiar to any JavaScript or Python developer. It uses familiar syntax and language constructs while offering language-level support for boilerplate-free concurrent workflows, explicit control over side effects, deterministic output construction, and dataflow-based error handling with recovery rollbacks.

Cascada is particularly well suited for:

* **AI, agents, and LLM orchestration** - chain prompts, tools, and retrieval calls without juggling promises (see [Casai](https://github.com/geleto/casai), an AI orchestration library built on Cascada)
* **Data pipelines** - coordinate parallel stages while keeping the final result deterministic
* **ETL workflows** - write complex extraction, transformation, validation, enrichment, and loading flows in ordinary code that runs concurrently
* **High-throughput I/O coordination** - squeeze maximum concurrency out of API-heavy workloads

Cascada is open source - explore the project on [GitHub](https://github.com/geleto/cascada).

---

## Quick Links
- [CascadaScript Specification](/cascada-script/) - the full language reference
- [The Kitchen Chef's Guide to Taming Chaos](/posts/cascada-kitchen-chef/) - the intuitive, no-jargon explanation that everyone can understand
- [Cascada GitHub Repository](https://github.com/geleto/cascada) - open source · `npm install cascada-engine`
- [Casai](https://github.com/geleto/casai) - an AI orchestration library built on Cascada for effortless, concurrent agent and workflow design.
- [Casai Examples](https://github.com/geleto/casai-examples) - a collection of practical examples demonstrating AI agent patterns using Casai.

---

### The Nightmare: Why Async Programming Is So Hard

`async/await` is a huge improvement over callback hell. But the moment you want performance, you're back to being a concurrency expert.

The fundamental problem: you manually orchestrate what runs when. Which operations can run together? Which must wait? You figure it out yourself, every time.

#### Shared State

All operations read and write to shared variables or objects. The complexity explodes:

- **Manual dependency tracking.** Should operation A `await` operation B before updating state? Which operations can safely run concurrently? You trace through every possible execution order in your head.

- **Get the order wrong: race conditions.** Operation A reads a value, operation B modifies it, operation A writes based on the stale value. Your state is corrupted.

- **Over-serialize to be safe?** Make everything `await` everything else to avoid conflicts. Now your concurrent code runs sequentially anyway.

- **Changes ripple everywhere.** Add one new operation that touches shared state? Review every other operation to ensure no new conflicts. Your code becomes brittle and impossible to refactor.

#### State Machines & Batch Synchronization

To avoid this complexity, most frameworks use state machines (with chokepoints between states) or batch synchronization (concurrent tasks that must all complete). Simpler to reason about, but: 19 API calls finish in 50ms, one takes 3 seconds. Everything waits at the chokepoint for the slowest operation-and you still manually coordinate the convergence.

The payoff for getting this right is enormous - optimal orchestration can cut response times in half or more. But the manual complexity? That's where code breaks.

What if you could skip the manual orchestration entirely? That's exactly what [CascadaScript](/cascada-script/) does.

Let's dive into how it flips the script on async programming.

---

## 1. ⚡ Concurrent by Default

The most fundamental shift in Cascada is that it's concurrent by default. In most languages, code runs line by line, one after the other. In Cascada, any independent lines of code run at the same time.

Think about fetching a user's profile, their preferences, and their analytics. These are three separate operations that don't depend on each other. In traditional JavaScript, you'd need `Promise.all` to run them concurrently. Cascada does it automatically.

```javascript
// These three operations start at the same time, automatically!
var user = fetchUser(123)
var preferences = getUserPreferences(123)
var analytics = getAnalytics(123)

// `return` produces the script's output
return {
  user: user,
  preferences: preferences,
  analytics: analytics
}
```

No `Promise.all`, no `await`, no special syntax. If it *can* run concurrently, it *will*.

---

## 2. 🚦 Data-Driven Flow: Code Runs When Its Inputs Are Ready

You might be thinking, "What if one operation *does* depend on another?" Cascada has you covered.

The engine automatically analyzes the data dependencies in your script. An operation will only run once all the variables it needs are ready. This simple rule guarantees the correct order of execution and completely eliminates race conditions by design.

```javascript
// 1. This runs first
var user = fetchUser(123)

// 2. This depends on 'user', so Cascada waits for it to resolve
var greeting = "Hello, " + user.name

// 3. Meanwhile, these run concurrently with everything above
var posts = fetchPosts(123)
var comments = fetchComments(123)

return {
  greeting: greeting,
  posts: posts,
  comments: comments
}
```

Here, `greeting` won't be calculated until `fetchUser(123)` is complete and the `user` variable has a value. But `posts` and `comments` start fetching immediately since they don't depend on `user`.

No more subtle timing bugs that only appear in production. The engine orchestrates everything automatically.

---

## 3. ✨ No More `await`: Just Use Your Values

This is where the magic really happens. Notice the lack of `await` in the examples above? In Cascada, you never have to think about whether a variable holds a value or a promise. You just use it.

```javascript
// Traditional JavaScript: Promise hell
const userPromise = fetchUser(123);
const name = await userPromise.name; // Wait, can't do this!
const actualUser = await userPromise;
const name = actualUser.name; // Finally!
```

Cascada makes this completely invisible:

```javascript
// Cascada: Just use it
var user = fetchUser(123)

return {
  greeting: "Hello, " + user.name,
  email: user.email,
  status: "active" if user.isActive else "inactive"
}
```

Forget `.then()` and forget manually tracking promises. Cascada handles the asynchronous state invisibly under the hood. You can pass a "future value" (a promise) into a function or use it in an expression, and it just works.

This lets you focus entirely on your business logic, not the async plumbing.

---

## 4. 📋 From Chaos to Order: Channels

So far we've used a simple `return` to produce output. But what happens when concurrent code needs to *contribute* to the output? Imagine fetching three users at once and collecting their names:

```javascript
var userIds = [101, 102, 103]
// We want all three fetched concurrently - but how do we collect the results in order?
```

In a traditional concurrent loop, you'd push to a shared array and pray the order works out. In Cascada, you reach for a channel.

Most of the time, a regular `var` is exactly what you want: assign a value, compose an object, change it a bit, pass it around, and return it. `var`, `data`, and `text` can all be used to build values incrementally. The main visible difference is that a `var` is read directly, while a channel is read with `.snapshot()`.

That snapshot step matters when several concurrent branches contribute to one growing output - an array of results, a nested JSON object, or a long text report. A `data` or `text` channel is a declared output builder: you write to it from anywhere, including concurrent loop iterations, and `.snapshot()` waits for all pending changes to settle before returning the materialized value.

```javascript
var userIds = [101, 102, 103]

// Declare a data channel
data result

// All three fetchUserDetails calls run concurrently.
// Maybe user 103's data comes back first - that's fine.
for id in userIds
  var details = fetchUserDetails(id)
  result.users.push(details.name)
endfor

// `snapshot()` materializes the channel into a value
return result.snapshot()
// { "users": ["Alice", "Bob", "Charlie"] } - always in this order
```

Cascada provides two built-in channel types:

- **`data`** - for incrementally building structured objects and arrays. Supports `.push()`, `.merge()`, property assignment, arithmetic operators, and more. Reach for it when concurrent work contributes to one JSON-shaped result.
- **`text`** - for incrementally assembling strings. Calls like `log("hello")` append text in source-code order, perfect for streaming, transcripts, logs, or reports.

```javascript
text log
log("Starting import\n")
for user in users
  log("Imported: " + user.name + "\n")
endfor
log("Done.")
return log.snapshot()
```

This gives you the best of both worlds: maximum I/O performance from concurrent execution, with the reliability of deterministic, source-order assembly.

---

## 5. ➡️ Sequential by Exception

Of course, sometimes you absolutely need things to happen in a specific order - especially when calling external functions with side effects, like writing to a database or making stateful API calls.

For these cases, Cascada provides a small set of surgical tools. Each one sequences only what it touches, leaving the rest of the script free to run concurrently.

**The `!` marker** - signals that an external call has side effects on a path. The path must be on the context object, not a local variable. Once any call on a path is marked with `!`, all subsequent accesses on that path wait - method calls (whether or not they carry `!`) and property reads alike - while unrelated operations continue concurrently. Sequencing is also hierarchical: marking `bank!` sequences not just `bank` itself but all sub-paths such as `bank.account` and `bank.user`.

```javascript
// `bank.account` is provided by the render context.
bank.account!.deposit(100)
bank.account.getStatus()    // waits - plain calls on a sequential path wait too
bank.account!.withdraw(50)  // waits - as do further ! calls

// Meanwhile, these run concurrently with everything above
var preferences = getUserPreferences()
var analytics = fetchAnalytics()
```

If many calls go through the same ordered interface, `sequence` gives that path a local name and applies the same idea without repeating `!` on every line:

```javascript
sequence db = services.db
var user = db.getUser(1)
var state = db.connectionState
db.updateLastSeen(user.id)
```

Think of `sequence` as syntactic sugar for "this external object should be used sequentially here." It is not a channel; it does not build output or get materialized with `.snapshot()`. It is a named ordered interface around an external context object, useful when the object itself is the thing that needs strict source-code ordering.

**The `each` loop** - iterates one item at a time. Use it when per-iteration side effects must not overlap.

```javascript
each id in idsToWrite
  db!.write(id)   // each write completes before the next starts
endeach
```

It's concurrent by default, sequential by exception - the opposite of traditional programming. You only pay for ordering where you actually need it.

---

## 6. ☣️ Errors Flow Like Data

Traditional `try/catch` blocks don't work well in a massively concurrent system. If one of fifty concurrent API calls fails, should everything stop?

Cascada uses a more resilient model called dataflow poisoning. When an operation fails, it doesn't throw an exception; it produces an `Error Value`. This error then "poisons" any other variable or operation that depends on it. Crucially, unrelated operations continue running completely unaffected.

```javascript
// Three concurrent calls - fetchPosts() fails, the others succeed
var user = fetchUser(123)         // ✅ Succeeds
var posts = fetchPosts(123)       // ❌ Fails and becomes an Error Value
var comments = fetchComments(123) // ✅ Succeeds

// Now, let's see what happens:
var userName = user.name           // ✅ Works fine, uses the successful result
var commentCount = comments.length // ✅ Works fine - unrelated to posts
var postCount = posts.length       // ❌ Becomes an error because 'posts' is poisoned

// Detect with `is error` and provide fallbacks
if posts is error
  posts = []           // Assign a default
  postCount = 0
endif

return {
  userName: userName,
  postCount: postCount,
  commentCount: commentCount
}
```

Poisoning extends to control flow, too. If the condition of an `if` or `switch` is an Error Value, neither branch runs - and any variable that *would have been* modified in either branch becomes poisoned. The same applies to loops: a poisoned iterable poisons everything the loop body would have touched.

```javascript
var role = "guest"
var user = fetchUser(123)  // ❌ Fails

// `user.isAdmin` is poisoned, so neither branch executes
if user.isAdmin
  role = "admin"
else
  role = "member"
endif

// `role` is now poisoned - both branches would have written to it,
// so the engine can't safely leave it as "guest"
```

This ensures corrupted state can't silently slip past as a stale default value. If something would have been touched, it carries the failure forward.

You can also peek inside an Error Value using the `#` operator to inspect its details - message, source, and more - without triggering further propagation:

```javascript
if posts is error
  var msg = posts#message
  var origin = posts#source.origin
endif
```

This approach isolates failures, prevents corrupted data from producing incorrect results, and makes your workflows incredibly robust. The beauty of dataflow poisoning is that you have complete control over recovery: detect errors anywhere with `is error`, repair them with fallbacks, log them for monitoring, or retry - all while the rest of your script continues executing normally.

---

## 7. 🛡️ Transactional Recovery with `guard`

For higher-stakes operations - like database writes that span multiple steps - a single fallback isn't enough. You need to roll back. The `guard` block is Cascada's transactional recovery primitive: it acts like a save point. If anything inside fails, the channel writes and sequential paths from before the guard are automatically restored.

```javascript
data out

guard
  out.status = "processing"

  db!.beginTransaction()
  db!.insert(user)
  db!.update(account)   // ❌ Suppose this fails
  db!.commit()
  out.status = "success"

recover err
  // STATE RESTORED automatically:
  //  - data writes inside the guard are reverted
  //  - the db! sequential path is repaired and safe to use again
  db!.rollback()
  out.error = "Transaction failed: " + err#message
endguard

return out.snapshot()
```

By default, `guard` protects all channels and sequential paths in scope. The `recover` block runs only if the guarded code finished in an error state, with the cleanup state already in place. It's like a database transaction - except for your entire workflow.

---

## 8. 💡 Familiar Syntax

Cascada offers a clean, expressive syntax that will feel instantly familiar if you know JavaScript. Variables, conditionals, loops, and reusable functions all work the way you'd expect.

| Feature | Syntax |
|---|---|
| Variables | `var name = value` |
| Conditionals | `if / elif / else / endif` |
| Switch | `switch / case / default / endswitch` |
| Logic operators | `and`, `or`, `not` (Python-style) |
| Concurrent loop | `for item in array` |
| Sequential loop | `each item in array` |
| While loop | `while condition / endwhile` |
| Inline `if` (ternary) | `a if condition else b` (Python-style) |
| Functions | `function name(x, y="default") ... endfunction` |
| Filters | `value \| filterName(args)` |
| Imports | `import "file" as ns` |
| Comments | `// line`, `/* block */` |

```javascript
// Variables, conditionals, loops
var discount = 0

if userType == "premium"
  discount = 0.10
endif

// Reusable functions with default and keyword arguments
function formatPrice(amount, discount=0)
  var final = amount * (1 - discount)
  return "$" + final
endfunction

return formatPrice(100, discount)  // "$90"
```

You get variables (`var`), conditionals (`if/elif/else`), concurrent (`for`) and sequential (`each`, `while`) loops, reusable `function` definitions, and modular code organization through `import` and `extends`.

---

## 🚀 Putting It All Together

Cascada is `a work in progress` under active development and evolving quickly. Install it with:

```bash
npm install cascada-engine
```

Here's a realistic example: a customer dashboard endpoint that aggregates data from three APIs, enriches each order, recovers from missing recommendations, and logs the access - all from a single Cascada script.

**JavaScript context:**

```javascript
import { AsyncEnvironment } from 'cascada-engine';

const env = new AsyncEnvironment();

const context = {
  userId: 42,

  // Three independent data sources
  fetchUser:            (id) => api.get(`/users/${id}`),
  fetchOrders:          (id) => api.get(`/users/${id}/orders`),
  fetchRecommendations: (id) => recommender.suggestFor(id),

  // Per-order enrichment - runs concurrently for each order
  enrichOrder: (order) => api.get(`/orders/${order.id}/details`),

  // Stateful service for audit logging
  audit: auditLogger,
};

const dashboard = await env.renderScriptString(script, context);
```

**Cascada script:**

```javascript
// Three sources fetched concurrently
var user = fetchUser(userId)
var orders = fetchOrders(userId)
var recs = fetchRecommendations(userId)

data report

// Cascada waits for `user` to resolve, then writes both properties
report.user.name = user.name
report.user.tier = "premium" if user.lifetimeValue > 1000 else "standard"

// Each order is enriched concurrently - but the final array is in source order
for order in orders
  var details = enrichOrder(order)
  report.orders.push({
    id: order.id,
    total: details.total,
    status: details.status
  })
endfor

// Recommendations are nice-to-have - recover with an empty list if they fail
if recs is error
  recs = []
endif
report.recommendations = recs

// Audit the access - `!` keeps log calls sequential
// without slowing anything else down
audit!.log("dashboard_viewed", userId)

return report.snapshot()
```

In one short script you've got three concurrent API calls, a concurrent enrichment loop with deterministic ordering, error recovery for non-critical data, and a sequential side effect - without `Promise.all`, `await`, or a single race condition to reason about.

**⚠️ Heads up!** Cascada is a new project. You might run into bugs, and the documentation is catching up with the code. Your feedback and contributions are welcome as we build the future of asynchronous programming.

---

## 🎯 Why This Matters

Cascada isn't trying to replace JavaScript - it's designed to be the backbone of your data layer.

Use it to compose complex workflows that wire together LLMs, APIs, databases, and external services. By inverting the traditional programming model - concurrent by default, sequential by exception - it lets you build high-performance data pipelines that are surprisingly simple and intuitive, all with maximum I/O throughput and minimum mental overhead.

The result? Code that reads like synchronous logic but executes with the performance of carefully orchestrated async operations. You get to focus on *what* you're building instead of *how* to manage promises, race conditions, and execution order.

And the best part? When you look at your Cascada script six months later, you'll actually understand what it does.

---

## Final Thoughts

If you've ever fought through promise hell, callback pyramids, or race conditions, Cascada might just feel like magic.

It turns async programming from a juggling act into a walk in the park. You write code like a human - simple, sequential, intuitive - and let the runtime handle the concurrency and safety behind the scenes.

The future of async programming isn't about getting better at promises. It's about not having to think about them at all.
