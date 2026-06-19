# Signals

Modules coordinate through **signals**: typed, namespaced events on the shared
`core`. One module emits a signal, and any number of modules react to it without
importing the emitter.

Signals are one of the available [composition mechanisms](/modules/composition).
Modules can also interact through shared reads, default layers, pipelines, and
transactions without emitting an event.

A new module can emit or react to an existing signal without changing the modules
already using it.

## Reading a module's signals

Each module page has a **Signals** section listing what it **emits** and what it
**reacts to**. Two modules coordinate when one emits a signal the other reacts to.
Trace that coordination through the shared signal.

## The signal registry

The public signals modules may emit or react to:

| Signal | Payload | Built-in emitter | Built-in reactor | Emitted when |
| --- | --- | --- | --- | --- |
| `context:change` | the new context (`string`) | [`withContext`](/modules/context) | [`withRuntimeDefaults`](/modules/runtime-defaults) | the active context changes |

A new module that owns context can emit the same signal. A module holding
per-context state can react to it. Existing modules keep working because neither
side depends on a concrete counterpart.

## Emitting and reacting

The mechanism is `core.hooks`, a fire-and-forget bus. A module declares its signal
on the shared `QueryHooks` interface, emits with `core.hooks.emit`, and subscribes
with `core.hooks.on`. See [Writing a module](/modules/authoring#coordinating-with-other-modules)
for the API and lifecycle rules.

```ts
// the emitting module
core.hooks.emit('context:change', nextContext)

// a reacting module, with no import of the emitter
const stop = core.hooks.on('context:change', () => { /* reset per-context state */ })
```

Handlers run synchronously in an unspecified order and must be commutative, so do
not rely on ordering. A throwing handler is isolated and logged: it never aborts
the others or the emitter.
