# Composing built-in modules

Built-in modules share the same query core, but never import or call each other.
They compose through reactive reads, default layers, pipelines, signals, and
transactions. Applying the same modules in a different `.use()` order must produce
the same behavior.

The table lists module combinations that change observable behavior. Combinations
without special behavior are omitted.

## Composition mechanisms

| Mechanism | Purpose |
| --- | --- |
| Shared reads | Derive state from `selected`, resolved `values`, or resolved defaults. |
| Default layers | Contribute fallback values without writing them to the URL. |
| Pipeline | Transform or filter reads, writes, and navigation output. |
| Signals | Publish typed, namespaced events without knowing who reacts. |
| Transactions | Observe or produce atomic query-state write intents. |

## Built-in interactions

| Modules | Mechanism | Result |
| --- | --- | --- |
| [`withContext`](/modules/context) + [`withRuntimeDefaults`](/modules/runtime-defaults) | `context:change` signal | Changing context clears runtime defaults that may belong to the previous context. |
| [`withRuntimeDefaults`](/modules/runtime-defaults) + [`withActiveParams`](/modules/active-params) | Resolved defaults | A selected param becomes active or inactive when its resolved default changes. |
| [`withContext`](/modules/context) + [`withActiveParams`](/modules/active-params) | Read pipeline | A param invalid in the active context is absent from active-param views. |
| [`withRuntimeDefaults`](/modules/runtime-defaults) + [`withStorage`](/modules/storage) | Explicit selection | Runtime defaults are not persisted; an explicitly selected value remains part of the mirror. |
| [`withContext`](/modules/context) + [`withStorage`](/modules/storage) | Read/write pipeline | Storage persists only context-valid selections, and restore never reintroduces params invalid in the active context. |

## Order independence

The order of `.use()` calls is for readability, not correctness. A module that
reads shared state must observe layers or transforms registered later in the same
composition chain. A module that initializes asynchronously must wait until the
chain is assembled before reading or restoring state.

Examples may choose the order that reads most naturally, but that order is never
a requirement. If a built-in interaction can exercise registration timing, its
interaction test must cover both orders.

## Signals

Signals are the explicit event mechanism within this model. The
[signal registry](/modules/signals#the-signal-registry) lists each public signal,
its payload, and the built-ins that emit or react to it.

## Documenting a new interaction

Add an interaction here only when combining modules changes observable behavior.
Describe the relationship once, add focused coverage under
`modules/_interactions`, and test both `.use()` orders when registration timing is
relevant. If the interaction uses a signal, update the signal registry too.
