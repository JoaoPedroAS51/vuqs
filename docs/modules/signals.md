# Signals

Modules never import each other. When one needs to react to another, they
coordinate through **signals**: typed, namespaced events on the shared `core`. One
module emits a signal, and any number of modules react to it. The emitter does not
know who listens, so modules stay independent.

This is what lets the module set stay open-ended. Coordination lives in the signal,
not in either module, so a new module can emit or react to an existing signal
without touching the modules already using it.

## Reading a module's signals

Each module page has a **Signals** section listing what it **emits** and what it
**reacts to**. Two modules coordinate when one emits a signal the other reacts to.
To trace a coordination, follow the signal, not a link between the two modules.

## The signal registry

The public signals modules may emit or react to:

| Signal | Payload | Emitted when |
| --- | --- | --- |
| `context:change` | the new context (`string`) | the active context changes |

For example, [`withContext`](/modules/context) emits `context:change` when its
active context changes, and [`withRuntimeDefaults`](/modules/runtime-defaults)
reacts to it by clearing its per-context runtime defaults. Neither imports the
other. A new module that owns context could emit the same signal, or one holding
per-context state could react to it, and the existing modules keep working
unchanged.

## Emitting and reacting

The mechanism is `core.hooks`, a fire-and-forget bus. A module declares its signal
on the shared `QueryHooks` interface, emits with `core.hooks.emit`, and subscribes
with `core.hooks.on`. See [Writing a module](/modules/authoring#coordinating-with-other-modules)
for the full contract.

```ts
// the emitting module
core.hooks.emit('context:change', nextContext)

// a reacting module, with no import of the emitter
const stop = core.hooks.on('context:change', () => { /* reset per-context state */ })
```

Handlers run synchronously in an unspecified order and must be commutative, so do
not rely on ordering. A throwing handler is isolated and logged: it never aborts
the others or the emitter.
