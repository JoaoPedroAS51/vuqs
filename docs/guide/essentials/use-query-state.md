# useQueryState

Binds a **single** query key to a writable ref: a search box, a page number, a
toggle.

```ts
import { codecs, useQueryState } from '@vuqs/core'

const q = useQueryState('q', codecs.string.withDefault(''))
//    ^? QueryStateRef<string>
```

## Return value

`useQueryState` returns a `QueryStateRef<T>`: a normal Vue
`WritableComputedRef<T>` with two extra methods, plus a `.use()` for
[composing modules](#composing-a-module).

```ts
interface QueryStateRef<T> extends WritableComputedRef<T> {
  set: (value: T, options?: NavigateOptions) => void
  clear: (options?: NavigateOptions) => void
}
```

- `q.value` reads or writes the value (`v-model` writes here).
- `q.set(value, options?)` writes with [per-call options](/guide/essentials/navigation-options).
- `q.clear(options?)` removes the key from the URL, reverting to the default.

```ts
q.value = 'laptop' // ?q=laptop
q.set('phone', { history: 'push' }) // push a history entry instead of replacing
q.clear() // back to '' and the key leaves the URL
```

Assigning `undefined` to a nullable param also clears it:

```ts
const color = useQueryState('color', codecs.literal(['red', 'blue'] as const))
color.value = undefined // clears ?color
```

## Signatures

`useQueryState` accepts the following forms.

### With a codec (canonical)

```ts
useQueryState('q', codecs.string) // QueryStateRef<string | undefined>
useQueryState('q', codecs.string.withDefault('')) // QueryStateRef<string>
```

A codec with `.withDefault()` narrows the ref to non-nullable.

### String shorthand

Omit the codec entirely for a plain string key:

```ts
useQueryState('q') // QueryStateRef<string | undefined>
useQueryState('q', { defaultValue: '' }) // QueryStateRef<string>
```

`defaultValue` is **string-only**: it is sugar for `codecs.string.withDefault()`.
For any other type, pass a codec, such as `codecs.integer.withDefault(0)`.

### With a pre-built param

If you have built a param with [`queryParam`](/guide/going-further/defining-params),
pass it directly:

```ts
const pageParam = queryParam('page', codecs.integer.withDefault(1))

const page = useQueryState(pageParam) // QueryStateRef<number>
```

### With options

Every form takes a trailing options object for navigation and write behavior
(`history`, `scroll`, `throttleMs`, `clearOnDefault`). The query source and URL
writer come from the [adapter](/guide/getting-started/adapters):

```ts
useQueryState('q', codecs.string, { history: 'push', throttleMs: 300 })
```

See [Navigation & options](/guide/essentials/navigation-options) for the full list
and precedence rules.

## Composing a module

[Modules](/modules/) compose onto a single ref with `.use()`, the same way they do
on `useQueryStates`. `.use()` merges the module's API onto the ref and returns the
same ref object, so ref identity is preserved:

```ts
import { withRuntimeDefaults } from '@vuqs/core/modules'

const perPage = useQueryState('perPage', codecs.integer)
  .use(withRuntimeDefaults())

perPage.setDefault(20) // a runtime default, never written to the URL
perPage.value // reads through it: the selection if present, else 20
```

A single-param module adds a per-param API (here `setDefault`, `clearDefault`,
`selectedValue`, `defaultValue`). Call `.use()` synchronously during setup.

## Using it in templates

`v-model` on a `QueryStateRef` binds through `.value`:

```vue
<template>
  <input v-model="q">
</template>
```

::: warning `.set()` and `.clear()` are not reachable in templates
`QueryStateRef<T>` extends `WritableComputedRef<T>`, so Vue **auto-unwraps** a
top-level ref in the template
to its bare value. The added `.set` and `.clear` methods (and `.value`) are
dropped, so `@click="q.clear()"` fails to type-check with *"Property 'clear' does
not exist on type 'string'"*.

Call the methods from a function in `<script setup>` instead, where `q` is still
the real ref:

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

When a codec returns a type that an HTML input does not accept directly, such as
`Date` or `string[]`, bridge it with a `computed`:

```vue
<script setup lang="ts">
import { codecs, useQueryState } from '@vuqs/core'
import { computed } from 'vue'

const date = useQueryState('date', codecs.isoDate)

// <input type="date"> expects a 'YYYY-MM-DD' string; the codec returns Date.
const dateInput = computed({
  get: () => (date.value ? date.value.toISOString().slice(0, 10) : ''),
  set: value => (value ? date.set(new Date(value)) : date.clear()),
})
</script>

<template>
  <input v-model="dateInput" type="date">
</template>
```

## Choosing `useQueryStates`

Use `useQueryState` for one param when you need a ref or per-call options. For a
group of related params that change together,
[`useQueryStates`](/guide/essentials/use-query-states) binds them in one call and
exposes atomic `patch`, `replace`, and `clear` operations. Separate `useQueryState`
writes using the same adapter still coalesce into one navigation.
