#Header
- Tutorial
- Script Doc
- Template Doc
- Playground


# Cascada
**The concurrency-first language**

Modern applications spend much of their time waiting - fetching pages, calling web APIs, waiting for AI models to respond, querying databases... Operations often take seconds, even minutes.

CascadaScript is a simple scripting language with familiar syntax, designed to orchestrate these operations inside your existing JavaScript and TypeScript applications and AI agents.

## Simple

Instantly familiar to JavaScript and Python developers.

Variables, functions, conditionals, loops - the building blocks you already know. Cascada keeps the syntax simple and puts the complexity in the execution engine, not in your code.

(On the right - simple syntax - show function, loop, etc...)

## Everything that can run concurrently, does.

Across statements, within expressions, inside function calls, across loop iterations, across composed scripts...

Every operation starts as soon as its inputs are ready, waiting only when it actually depends on another result.

(On the right) - animation with concurrent flow, timeline

## Concurrent execution. Sequential results.

Operations can run and finish out of order, but Cascada guarantees that their outputs are assembled exactly as if the script had run sequentially.

**No `async`, no `await`, no manual orchestration.** Just write your logic in the familiar, sequential style. Cascada handles the concurrency.

(On the right) - code  Pros, cons, search, summarize

### Errors flow like data.

Errors don't stop execution. They *poison* all variables that depend on them. Independent work continues unaffected.

**The butterfly effect:** An error can spread far. For example, if an `if` condition is poisoned, neither branch runs, but all variables that could be modified in either branch become poisoned. **Repair early, before the error spreads.**

## Sequential by exception.
Concurrency is the default, but sometimes order matters.

- **`db!.write(data)`** — Use `!` to execute function calls that modify external state, such as database writes, in sequence.
- **`each item in items`** — Process loop iterations one by one.
- **`for item in items of 5`** — Limit a loop to five concurrent iterations.


(On the right)
```
db!.write(data)
db.read(id)

each item in items
  process(item)
endeach

for item in items of 5
  process(item)
endfor
```

## Templates that run concurrently.
Cascada also includes a powerful template engine based on the popular Nunjucks syntax. Create AI prompts, HTML, emails, and more using familiar expressions, macros, conditionals, and loops.

Just like CascadaScript, **everything that can run concurrently, does** — even inside templates. Independent operations run in parallel, while the final output is assembled in the order you wrote it.