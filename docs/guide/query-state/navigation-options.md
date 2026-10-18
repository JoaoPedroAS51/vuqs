# Navigation & options

Every write (`q.value = …`, `.set`, `.clear`, `patch`, `replace`, `clear`) accepts
options that control how and when the URL changes. The same options can be set at
four levels with a defined precedence order.

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

Whether the navigation scrolls. Forwarded to the adapter, which decides how to
honor it. With `vue-router`, scrolling is governed by the router's
`scrollBehavior`, so this per-call option has no effect there.

```ts
q.set('laptop', { scroll: false })
```

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
// Keep defaults in the URL (rarely needed):
useQueryState('page', codecs.integer.withDefault(1), { clearOnDefault: false })
```

A param can opt out with `keepOnDefault()`. The effective setting follows the
binding option, then the param, then the adapter default, then `true`. A transaction
that restores state with `defaultPolicy: 'preserve-explicit'` keeps every supplied
value, including default-equal ones.

| Option | Type | Default | Settable at |
| --- | --- | --- | --- |
| `history` | `'push' \| 'replace'` | `'replace'` | per call, composable, adapter |
| `scroll` | `boolean` | adapter | per call, composable, adapter |
| `throttleMs` | `number` | microtask | composable, adapter |
| `clearOnDefault` | `boolean` | `true` | composable, adapter |

`history` and `scroll` are per-navigation, so they are accepted on every write
method. `throttleMs` and `clearOnDefault` describe the binding itself, so they are
set once when you create it, or on the adapter.

## Precedence

The same option can be set at four levels. When more than one sets it, the most
specific wins:

```
per-call  ▶  per-composable  ▶  adapter defaultOptions  ▶  built-in default
```

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
