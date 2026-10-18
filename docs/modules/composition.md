# Composing built-in modules

Built-in modules share the same query core, but never import or call each other.
They compose through reactive reads, default sources, pipelines, signals, and
transactions. The built-in interactions below support either installation order
within the same synchronous `.use()` chain.

The table lists module combinations that change observable behavior. Combinations
without special behavior are omitted.

## Composition mechanisms

| Mechanism | Purpose |
| --- | --- |
| Shared reads | Derive state from `explicitValues`, resolved `values`, or composed default candidates. |
| Default sources | Contribute fallback values, composed in installation order, without writing them to the URL. |
| Pipeline | Transform or filter reads and writes with declared presence effects. |
| Signals | Publish typed, namespaced events without knowing who reacts. |
| Transactions | Observe or produce atomic query-state write intents. |

## Built-in interactions

| Modules | Mechanism | Result |
| --- | --- | --- |
| [`withContext`](/modules/context) + [`withRuntimeDefaults`](/modules/runtime-defaults) | `context:change` signal | Changing context clears runtime defaults that may belong to the previous context. |
| [`withRuntimeDefaults`](/modules/runtime-defaults) + [`withActiveParams`](/modules/active-params) | Composed default candidates | Activity compares explicit values with composed default candidates and updates when those candidates change. |
| [`withContext`](/modules/context) + [`withActiveParams`](/modules/active-params) | Read pipeline | A param invalid in the active context is absent from active-param views. |
| [`withRuntimeDefaults`](/modules/runtime-defaults) + [`withStorage`](/modules/storage) | Explicit values | Runtime defaults are not persisted; an explicitly present value remains part of the mirror. |
| [`withContext`](/modules/context) + [`withStorage`](/modules/storage) | Read/write pipeline | Storage persists only context-valid values, and restore never reintroduces params invalid in the active context. |

## Composition order

Complete the `.use()` chain synchronously before reading the resulting state or
calling module actions. The built-in interactions listed above work in either
installation order. Their reactive reads observe contributions installed later in
the chain, and `withStorage` starts restoration after composition.

Installation order determines precedence when modules contribute overlapping
behavior:

- Default sources compose in installation order. Later defined contributions take
  precedence; omitted or `undefined` contributions keep lower defaults.
- Pipeline callbacks run in `pre`, `default`, then `post` order. Within each band,
  callbacks follow installation order and their declaration order within a module.
- Signal handlers run in subscription order.

Custom modules follow these same rules, so their results can depend on their
position in the chain. See [Module authoring](/modules/authoring) for the default
source, pipeline and signal contracts.

## Signals

Signals are the explicit event mechanism within this model. The
[signal registry](/modules/signals#the-signal-registry) lists each public signal,
its payload, and the built-ins that emit or react to it.

## Documenting a new interaction

Add an interaction here only when combining modules changes observable behavior.
Describe the relationship once, add focused coverage under
`packages/core/test/integration/modules/`, and test both `.use()` orders when registration timing is
relevant. If the interaction uses a signal, update the signal registry too.
