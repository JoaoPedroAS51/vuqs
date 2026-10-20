# Navigation & options

Write methods accept options that control navigation and default omission.
Direct assignments use the binding's configuration. See [Precedence](#precedence)
for the order in which settings apply.

## The options

### `history`

Whether a write **pushes** a new history entry or **replaces** the current one.

```ts
q.set('laptop', { history: 'push' }) // back button returns to the previous value
q.set('laptop', { history: 'replace' }) // no new history entry (the default)
```

- `'replace'` (default): use for live-updating filters when each keystroke should
  not add a back-button stop.
- `'push'`: use for discrete navigation, such as moving between pages, when back
  should return to the previous state.

### `scroll`

Where the window scrolls after the navigation. Writes keep the current position
unless they ask to scroll.

```ts
page.set(2, { scroll: true }) // top-left of the page
page.set(2, { scroll: { top: 0, behavior: 'smooth' } }) // as window.scrollTo(options)
q.set('laptop', { scroll: false }) // keep the position (the default)
```

- `false` (default): keeps the position, which suits filters and search boxes.
- `true`: scrolls to the top-left, for example when a pager moves to the next page.
- A `ScrollToOptions` object (`top`, `left`, `behavior`): scrolls as
  `window.scrollTo` does with it. An omitted coordinate keeps that axis.

The adapter scrolls after the DOM reflects the navigation, so a position inside
content that the write renders is reachable. When writes coalesce into one
navigation, the last value that scrolls wins over `false`. A `scroll` in the
adapter's `defaultOptions` (in Nuxt, `vuqs.adapter.defaultOptions`) applies to every
write that does not set its own, as described in [Precedence](#precedence).

With `vue-router`, the adapter applies `scroll` to its own navigations by wrapping
the router's `scrollBehavior`. Links, `router.push` from application code and
back/forward still go through your `scrollBehavior`, including saved positions.

::: warning Custom `scrollBehavior`
vuqs writes do not run a custom `scrollBehavior`, so its smooth scrolling, header
offsets, element targets or scroll containers do not apply to them. To move the
page on a write, pass a position in `scroll`, such as `{ top: 120 }`.
:::

### `throttleMs`

Coalesce writes using the same adapter within this many milliseconds into a single
navigation. The default is a **microtask** (effectively "the same tick"), which
already batches synchronous writes. Set a larger window for high-frequency input:

```ts
// A search box that fires on every keystroke: write the URL at most every 300ms.
const q = useQueryState('q', codecs.string.withDefault(''), { throttleMs: 300 })
```

The UI still updates instantly through the optimistic overlay. Only the
navigation is throttled.

### `clearOnDefault`

Whether a value equal to its default is **dropped** from the URL. It defaults
to `true`, so `?page=1` is omitted when 1 is the default.

Dropping is safe removal, not a comparison of the written value with the default.
A write is dropped only when the writing binding reads exactly what it would read
with `clearOnDefault: false`: the same complete resolved values, evaluated with the
binding's current defaults and modules. Two conditions must hold:

- the written value, as the codec serializes and parses it, equals the composed default
  under the param's equality;
- removing its keys changes no resolved read, including other params the same write
  touches.

Examples where the value is kept:

- a partial object such as `{ max: 10 }` against the complete default `{ min: 0, max: 10 }`,
  because the explicit value differs from the candidate under structural equality;
- an object declared with `.withDefaultsWhenPresent()`, because removing its last key
  makes it absent;
- two params that restore each other through a module: each is safe to drop alone but
  not together, so both stay.

If the check cannot be completed, for example because a read callback throws while
evaluating the alternative, the write is kept unchanged.

Codec-owned omission is separate. A codec that serializes a value as absent, such as
a nullable `null`, omits it with `clearOnDefault: false` too, and `clearOnDefault`
never adds a representation the codec does not produce. Explicit `clear()` and
`undefined` writes also remove their keys regardless of the option.

Only the writing binding is compared. Another binding on the same adapter keeps
its own defaults beneath the shared explicit value, so it can read a different
fallback after a drop without blocking it.

```ts
// Keep defaults in the URL:
useQueryState('page', codecs.integer.withDefault(1), { clearOnDefault: false })
```

A param can opt out with `keepOnDefault()`, which takes precedence over the
composable and adapter defaults. Override it for one write through the method's
`clearOnDefault` option:

```ts
import { codecs, queryParam, useQueryState } from '@vuqs/core'

const page = useQueryState(queryParam('page', codecs.integer.withDefault(1)).keepOnDefault())

page.set(1) // Keeps page=1.
page.set(1, { clearOnDefault: true }) // Omits page when the complete read is preserved.
page.set(1) // Keeps page=1 again.
```

The override applies only to that write. A transaction with
`defaultPolicy: 'preserve-explicit'` disables automatic omission even when
`clearOnDefault: true` is supplied.

| Option | Type | Default | Settable at |
| --- | --- | --- | --- |
| `history` | `'push' \| 'replace'` | `'replace'` | per call, composable, adapter |
| `scroll` | `boolean \| ScrollToOptions` | `false` | per call, composable, adapter |
| `throttleMs` | `number` | microtask | composable, adapter |
| `clearOnDefault` | `boolean` | `true` | per call, param, composable, adapter |

Write methods accept [`QueryWriteOptions`](/api/composables/use-query-states#querywriteoptions):
`history`, `scroll` and `clearOnDefault`. Adapters receive only `history` and
`scroll`. Set `throttleMs` on the composable or adapter.

## Precedence

For `history` and `scroll`:

```
per-call  ▶  per-composable  ▶  adapter defaultOptions  ▶  built-in default
```

For `clearOnDefault`:

```
per-call  ▶  param  ▶  per-composable  ▶  adapter defaultOptions  ▶  true
```

The [serializer](/api/serialization/create-serializer) uses the param setting,
then its own `clearOnDefault` option, then `true`.

Say the app defaults to `replace`, one component overrides to `push`, and a single
"apply" write overrides back to `replace`.

```ts
// main.ts: app-wide default
installQueryAdapter(app, createVueRouterAdapter({
  router,
  defaultOptions: { history: 'replace' },
}))

// Pager.vue: this component pushes by default
const page = useQueryState('page', codecs.integer.withDefault(1), { history: 'push' })

// …but one specific write replaces
page.set(1, { history: 'replace' })
```
