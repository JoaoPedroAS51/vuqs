# useQueryState

Binds a **single** query key to a writable ref. This is the workhorse for one
param — a search box, a page number, a toggle.

```ts
import { codecs, useQueryState } from '@vuqs/core'

const q = useQueryState('q', codecs.string.withDefault(''))
//    ^? QueryStateRef<string>
```

## What you get back

`useQueryState` returns a `QueryStateRef<T>` — a normal Vue
`WritableComputedRef<T>` with two extra methods:

```ts
interface QueryStateRef<T> extends WritableComputedRef<T> {
  set: (value: T, options?: NavigateOptions) => void
  clear: (options?: NavigateOptions) => void
}
```

- `q.value` — read or write the value (`v-model` writes here).
- `q.set(value, options?)` — write with [per-call options](/guide/navigation-options).
- `q.clear(options?)` — remove the key from the URL (revert to the default).

```ts
q.value = 'laptop'                 // ?q=laptop
q.set('phone', { history: 'push' }) // push a history entry instead of replacing
q.clear()                          // back to '' and the key leaves the URL
```

Assigning `undefined` to a nullable param also clears it:

```ts
const color = useQueryState('color', codecs.literal(['red', 'blue'] as const))
color.value = undefined // clears ?color
```

## Calling signatures

`useQueryState` has several overloads so the common cases stay terse.

### With a codec (canonical)

```ts
useQueryState('q', codecs.string)                  // QueryStateRef<string | undefined>
useQueryState('q', codecs.string.withDefault(''))  // QueryStateRef<string>
```

A codec with `.withDefault()` narrows the ref to non-nullable.

### String shorthand

Omit the codec entirely for a plain string key:

```ts
useQueryState('q')                       // QueryStateRef<string | undefined>
useQueryState('q', { defaultValue: '' }) // QueryStateRef<string>
```

`defaultValue` is **string-only** — it's sugar for `codecs.string.withDefault()`.
For any other type, pass a codec: `codecs.integer.withDefault(0)`.

### With a pre-built definition

If you've named a param with [`queryParam`](/guide/defining-params), pass it
directly:

```ts
const pageField = queryParam('page', codecs.integer.withDefault(1))

const page = useQueryState(pageField) // QueryStateRef<number>
```

### With options

Every form takes a trailing options object of behavior knobs — `history`,
`scroll`, `throttleMs`, `clearOnDefault`. The query source and URL writer come
from the [adapter](/guide/adapters):

```ts
useQueryState('q', codecs.string, { history: 'push', throttleMs: 300 })
```

See [Navigation options](/guide/navigation-options) for the full list and
precedence rules.

## Using it in templates

`v-model` on a `QueryStateRef` works exactly as you'd expect:

```vue
<template>
  <input v-model="q">
</template>
```

::: warning `.set()` and `.clear()` are not reachable in templates
This is the one gotcha worth internalizing. `QueryStateRef<T>` extends
`WritableComputedRef<T>`, so Vue **auto-unwraps** a top-level ref in the template
to its bare value. The augmented `.set` / `.clear` methods (and `.value`) are
dropped — `@click="q.clear()"` fails to type-check with *"Property 'clear' does
not exist on type 'string'"*.

The fix: don't reach for the methods through the ref in the template — call them
from a function in `<script setup>`, where `q` is still the real ref:

```vue
<script setup lang="ts">
const q = useQueryState('q', codecs.string.withDefault(''))

// Call .clear() from setup, where q is the real ref (not auto-unwrapped).
function clear() {
  q.clear()
}
</script>

<template>
  <input v-model="q">
  <button @click="clear()">Clear</button>
</template>
```

`v-model="q"` still works because assignment writes `.value` for you.
:::

## Adapting a codec value to an input

When a codec speaks a richer type than an HTML input (a `Date`, a `string[]`),
bridge it with a `computed`:

```vue
<script setup lang="ts">
import { codecs, useQueryState } from '@vuqs/core'
import { computed } from 'vue'

const date = useQueryState('date', codecs.isoDate)

// <input type="date"> wants a 'YYYY-MM-DD' string, the codec speaks Date.
const dateInput = computed({
  get: () => (date.value ? date.value.toISOString().slice(0, 10) : ''),
  set: value => (value ? date.set(new Date(value)) : date.clear()),
})
</script>

<template>
  <input v-model="dateInput" type="date">
</template>
```

## When to reach for `useQueryStates` instead

`useQueryState` shines for **one param with rich control** — a ref you pass
around, per-call options on that single param. For a **group of related params**
that change together, [`useQueryStates`](/guide/use-query-states) binds them in one
call and coalesces multi-param writes into a single navigation.
