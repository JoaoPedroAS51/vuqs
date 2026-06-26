# Navigation options

Every write — `q.value = …`, `.set`, `.clear`, `setValues`, `clear` — can be
tuned with options. They control how the URL changes and when. The same options
can be set at four levels, with a clear precedence order.

## The options

### `history`

Whether a write **pushes** a new history entry or **replaces** the current one.

```ts
q.set('laptop', { history: 'push' })    // back button returns to the previous value
q.set('laptop', { history: 'replace' }) // no new history entry (the default)
```

- `'replace'` (default) — best for live-updating filters, where every keystroke
  shouldn't be a back-button stop.
- `'push'` — best for discrete navigation, like moving between pages, where back
  *should* return to the previous state.

### `scroll`

Whether the navigation scrolls. Forwarded to the adapter, which decides how to
honor it. With `vue-router`, scrolling is governed by the router's
`scrollBehavior`, so this per-call option has no effect there.

```ts
q.set('laptop', { scroll: false })
```

### `throttleMs`

Coalesce writes within this many milliseconds into a single navigation. The
default is a **microtask** (effectively "the same tick"), which already batches
synchronous writes. Set a larger window for high-frequency input:

```ts
// A search box that fires on every keystroke — write the URL at most every 300ms.
const q = useQueryState('q', codecs.string.withDefault(''), { throttleMs: 300 })
```

The UI still updates instantly (the optimistic overlay); only the navigation is
throttled.

### `clearOnDefault`

Whether a value equal to its codec default is **dropped** from the URL. On by
default, which keeps links clean — `?page=1` never appears when 1 is the default.

```ts
// Keep defaults in the URL (rarely needed):
useQueryState('page', codecs.integer.withDefault(1), { clearOnDefault: false })
```

| Option | Type | Default | Set per call | Set on composable | Set on adapter |
| --- | --- | --- | :---: | :---: | :---: |
| `history` | `'push' \| 'replace'` | `'replace'` | ✅ | ✅ | ✅ |
| `scroll` | `boolean` | adapter-defined | ✅ | ✅ | ✅ |
| `throttleMs` | `number` | microtask | — | ✅ | ✅ |
| `clearOnDefault` | `boolean` | `true` | — | ✅ | ✅ |

`history` and `scroll` are per-navigation, so they're accepted on every write
method. `throttleMs` and `clearOnDefault` describe the binding itself, so they're
set once when you create it (or on the adapter).

## The four levels

The same option can be set in four places:

```ts
// 1. Per call — highest priority
q.set('x', { history: 'push' })

// 2. Per composable instance
useQueryState('q', codecs.string, { history: 'push' })

// 3. Adapter defaults — applies app-wide
provideVueRouterAdapter({ defaultOptions: { history: 'replace' } })

// 4. Built-in default — lowest priority
```

## Precedence

When the same option is set at more than one level, the most specific wins:

```
per-call  ▶  per-composable  ▶  adapter defaultOptions  ▶  built-in default
```

A concrete example — the app defaults to `replace`, one component overrides to
`push`, and a single "apply" button overrides back to `replace`:

```ts
// App.vue
provideVueRouterAdapter({ defaultOptions: { history: 'replace' } })

// Pager.vue — this component pushes by default
const page = useQueryState('page', codecs.integer.withDefault(1), { history: 'push' })

// …but one specific write replaces
page.set(1, { history: 'replace' })
```

This lets you set a sensible app-wide baseline and override exactly where it
matters.

## A common pattern: a per-call history toggle

Let the user choose whether paging is a back-button stop:

```vue
<script setup lang="ts">
import { codecs, useQueryStates } from '@vuqs/core'
import { ref } from 'vue'

const mode = ref<'replace' | 'push'>('replace')
const { values, setValues } = useQueryStates({
  page: defineQueryParam('page', codecs.integer.withDefault(1)),
})

function goToPage(n: number) {
  setValues({ page: n }, { history: mode.value })
}
</script>
```
