---
title: "Implicit async programming model for imperative (JS/Python-like) languages"
date: '2026-05-05'
tags: [cascada, async, concurrency, programming-languages, javascript, python, dataflow]
description: "CascadaScript brings safe, implicit concurrency to imperative JavaScript and Python-like code: familiar syntax, automatic dependency ordering, deterministic output, and dataflow-based error handling."
---

## Asynchronous Programming Is Hard

We tend to think sequentially, but in concurrent code time is the hidden variable that is out of your control. Operations that seem independent race each other in subtle ways. Exceptions pop up detached from the original call site. Shared state changes are a nightmare to coordinate.

Imperative languages like JavaScript and Python treat concurrency as an opt-in feature. Every `await` and every `Promise.all` is you doing the scheduler's job by hand. And you will occasionally get it wrong.

Other languages build concurrency into their foundations. It becomes safe and predictable by design. But the price is a completely different way of thinking. Not just new syntax - new primitives, new abstractions, a new vocabulary for every idea you already know.

What if imperative code could keep its familiar syntax, but get safe concurrency by default?

## Familiar Code, Implicit Concurrency

[CascadaScript](/cascada-script/) is a language that brings safe, implicit concurrency to imperative code. It looks like the JavaScript or Python you already know - functions, loops, plain expressions - but the execution model is radically different.

Under the hood, every operation that can run concurrently, does: every statement, every part of every expression, every step inside every function call, every iteration of every loop, and all code in each imported script. All of them run at the same time. An operation only waits when it actually depends on another's result. No special syntax or annotations required.

Despite execution happening concurrently and out of order, all output - arrays, objects, strings - is always in source-code order. The results are equivalent to sequential execution, only much faster.

Sequential execution in [CascadaScript](/cascada-script/) is not something you manage. It emerges naturally from data dependencies. If one operation uses the result of another, it waits. That's it.

```javascript
var a = fetchInput()
var b = transform(a)
```

Cascada knows `b` cannot start until `a` resolves. No `await`, no explicit ordering. Most code that looks sequential already is sequential in the ways that matter - and concurrent in all the ways you'd never have bothered to write by hand.

## Sequential by Exception

There are cases where imported native functions and objects still need to run in a specific order. Cascada can order its own internal work automatically, but it cannot know whether a context function is pure or has side effects.

For these external cases, such as writing to a database, interacting with a stateful API, or calling a mutable function, use the `!` marker to signal that an external call has side effects on a path. The path must be on the context object. Once any call on a path is marked with `!`, all subsequent accesses on that path wait - plain calls, further `!` calls, and property reads alike - while the rest of the script continues concurrently. Sequencing is hierarchical: marking `db!` sequences all sub-paths such as `db.users` and `db.accounts` too.

One example is when `db.write(A)` must happen before `db.write(B)`:

```javascript
db!.write(A)
db!.write(B)
```

There are two more constructs that add syntactic sugar on top of the `!` operator: the `each` loop and the `sequence` channel.

The `each` loop is a sequential variant of `for`. Where `for` fires all iterations concurrently, `each` runs them one at a time. The next iteration only starts after the previous one completes. Use it when iterations have side effects that must not overlap: writing records in order, processing a queue, or running steps that depend on the state left by the previous iteration.

```javascript
each event in auditEvents
  db!.write(event)
  logger!.append("stored " + event.id)
endeach
```

Here every event is written and logged before the next event starts. Other unrelated work in the script can still run concurrently; only this loop is ordered.

`sequence` lets you declare an external object as inherently sequential once. Every call on it will then respect source-code order, no matter where in the script it appears. Use it for connections, streams, or cursors where every interaction must happen in the order written.

```javascript
sequence db = services.db

var user  = db.getUser(123)
var posts = db.getPosts(user.id)
var state = db.connectionState

return {
  user: user,
  posts: posts,
  state: state
}
```

Each read or call through `db` waits for the previous one, because the database object is stateful. You do not have to mark every call with `!`; the sequence declaration makes the ordered interface explicit once.

## Errors That Flow Like Data

In concurrent code, the traditional exception handling model breaks down. If multiple operations are running in parallel and one fails, halting everything would discard all the work that succeeded.

Error-as-value approaches like Rust's `Result` or Go's error returns fare better, but in ordinary imperative code they still put the burden on you: every call site must explicitly check, unwrap, return, or repair the error. In a concurrent workflow with dozens of parallel operations, that manual plumbing becomes unmanageable - and easy to get wrong.

[CascadaScript](/cascada-script/) replaces exceptions with **dataflow poisoning**. A failed operation produces an Error Value that flows forward through your script exactly like any other value. Only operations that depend on it are poisoned, while everything else keeps running unaffected.

```javascript
var user  = fetchUser(123)     // succeeds
var posts = fetchPosts(123)    // fails

var postCount = posts.length   // becomes an error - depends on posts
var username  = user.name      // fine - independent of posts
```

A script only fails if an error reaches what you actually return. Until then, you can detect it with `is error` and repair it by reassigning a fallback:

```javascript
if posts is error
  posts = []
endif
```

This means partial failures are not catastrophic. Unrelated concurrent work completes, and you decide what to do with the parts that failed.

Poisoning is especially careful around control flow. For example, if an `if` condition is itself an Error Value, neither branch runs - and every variable that either branch could have modified becomes poisoned too:

```javascript
var accessLevel = "none"

if user.isAdmin        // user is an error
  accessLevel = "full"
else
  accessLevel = "limited"
endif

// accessLevel is now poisoned - not "none", not stale
// downstream code can detect that something went wrong
```

The variable does not silently keep its old value. It becomes an error, so any code that depends on it knows the decision was never made.

## Incremental Output Without Shared-State Chaos

In addition to regular vars and the `sequence` channel, [CascadaScript](/cascada-script/) provides two other channel types: `text` and `data`.

They are for values you build up incrementally, the same way you would modify any variable. Unlike vars, reading a channel requires `.snapshot()`, which waits for all pending changes to settle before returning the value.

Reach for `data` or `text` for large structured objects or long assembled texts built up across concurrent operations - cases where a plain var can also work, but would be far less efficient.

## Putting It Together

Here is the model in one small script:

```javascript
var user  = fetchUser(userId)   // ┐ start immediately,
var posts = fetchPosts(userId)  // ┘ run concurrently

// evaluates as soon as 'user' resolves - posts may still be fetching
var role = "admin" if user.isAdmin else "member"

// every loop iteration runs concurrently
data result
for post in posts
  var enriched = enrichPost(post)
  result.posts.push({
    title:  enriched.title | title,  // built-in title-case filter
    status: "published" if enriched.isLive else "draft"
  })
endfor

// ! makes these two sequential with each other, without affecting the rest
db!.log("report", userId)
db!.updateLastSeen(userId)

return {
  name: user.name,
  role: role,
  posts: result.snapshot()
}
```

There is no async ceremony here. The two fetches start together. The role calculation waits only for `user`. The loop waits for `posts`, then enriches every post concurrently while preserving the final output order. The two database calls are ordered because they touch a stateful external object, but that ordering does not freeze the rest of the script.

That is the programming model [CascadaScript](/cascada-script/) is aiming for: ordinary imperative code, automatic concurrency where it is safe, explicit sequencing only where it matters, and deterministic results at the end.

Unbounded JavaScript and Python will not be able to do this, but we may someday get a constrained dialect that can. [CascadaScript](/cascada-script/) pushes the envelope on how far this model can go.

## Quick Links

- [CascadaScript Specification](/cascada-script/) - the full language reference
- [Introduction to CascadaScript](/posts/cascada-script-intro/) - a fuller walkthrough of the language and its core features
- [Cascada project](https://github.com/geleto/cascada) - The Cascada GitHub repository - comes in two flavors that share the same execution model: [CascadaScript](/cascada-script/) - the language, and [Cascada Template](/cascada-template/) for generating text output.
- [The Kitchen Chef's Guide to Taming Chaos](/posts/cascada-kitchen-chef/) - the intuitive, no-jargon explanation that everyone can understand
<!-- - [Casai](https://github.com/geleto/casai) - an AI orchestration library built on Cascada for effortless, concurrent agent and workflow design. -->
<!-- - [Casai Examples](https://github.com/geleto/casai-examples) - a collection of practical examples demonstrating AI agent patterns using Casai. -->
