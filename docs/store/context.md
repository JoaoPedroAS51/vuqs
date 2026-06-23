# Context switching

A single store can serve several **contexts** — tabs, wizard steps, view modes —
where the *same* schema behaves differently. Switching context should preserve
some filters, reset others, and respect that certain fields only exist in certain
contexts. That's what `context` configures.

## The problem it solves

Picture a screen with two tabs, Products and Orders, sharing one search box:

- The search term `q` should **survive** switching tabs.
- The `sort` should **reset** — a sort that made sense for products doesn't for
  orders.
- `category` only exists on **Products**; `status` only on **Orders**. Neither
  should leak into the other (or survive a pasted stale link).

Hand-rolling this is fiddly. `context` declares it.

## Configuration

```ts
import { ref } from 'vue'

const tab = ref<'products' | 'orders'>('products')

const store = createQueryStore({
  schema: {
    q: defineQueryState('q', codecs.string),
    sort: defineQueryState('sort', codecs.literal(['newest', 'oldest'] as const)),
    category: defineQueryState('category', codecs.literal(['cpu', 'gpu', 'ram'] as const)),
    status: defineQueryState('status', codecs.literal(['open', 'shipped'] as const)),
  },
  query: adapter.query,
  navigate: adapter.navigate,
  context: {
    active: tab,                  // 1. the active context
    preserve: ['q'],              // 2. what survives a switch
    only: {                       // 3. field validity per context
      category: ['products'],
      status: ['orders'],
    },
  },
})
```

Three independent knobs:

### `active` — the current context

An **external, opaque** identifier (`MaybeRefOrGetter`). The store never derives
it — *you* own it, whether it's a tab `ref`, a route param, or a wizard step. It
can be any string union.

```ts
active: tab                     // a ref
active: () => route.params.tab  // a getter
```

Read it back as a ref:

```ts
store.activeContext.value // 'products' | 'orders' | undefined
```

::: tip Note the `.value`
`activeContext` is a single scalar, so it's a **ref** (`.value`), unlike the
`selected`/`defaults`/`effective` maps which are dot-access. See the
[reactive shape rule](/guide/concepts#reactive-shapes-ref-vs-reactive-object).
:::

### `preserve` — what survives a switch

A list of fields kept when the context changes. **Everything not listed resets.**
This split is irreducible — two fields can both be valid in both contexts yet one
should persist and the other shouldn't.

```ts
preserve: ['q'] // q carries over; sort, category, status reset
```

### `only` — field validity per context

Restricts which contexts a field **exists in**. An invalid field:

- never enters `selected`, the URL, or `effective`,
- is **dropped from the URL** when you switch away from its context,
- is **auto-dropped** if a stale link pastes it into the wrong context.

```ts
only: {
  category: ['products'], // category exists only on Products
  status: ['orders'],     // status exists only on Orders
}
```

Omit a field from `only` to make it valid **everywhere** (like `q` and `sort`
above).

## Performing a switch

Here's the key design decision: **the store builds the query, but *you* navigate.**
The store doesn't know how a context maps to a route — that's yours. So on a
switch you call `buildContextQuery` and navigate with the result:

```ts
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

function switchTab(next: 'products' | 'orders') {
  if (next === tab.value) {
    return
  }

  // Build the final query: keep preserved + valid fields, drop the rest,
  // preserve unmanaged params. This is ONE navigation.
  const query = store.buildContextQuery(route.query, next)

  tab.value = next
  router.replace({ query })
}
```

`buildContextQuery(currentQuery, nextContext)`:

- keeps each `preserve` field **if it's still valid** in `nextContext`,
- drops everything not preserved,
- drops fields invalid in `nextContext`,
- preserves unmanaged params untouched.

It's a single, atomic query — no flash of an intermediate URL.

::: tip Contrast with `setValue`
A normal `setValue` auto-navigates on the **same** route. A context switch is
different: it may change route, and only the consumer knows how. So vuqs hands you
the query and steps back.
:::

## Defaults reset on context change

[Defaults](/store/three-states) are per-context — the next context supplies its
own. So when `activeContext` changes, the store **automatically clears
defaults** to avoid showing stale ones. Re-call `setDefaults` after the switch
(typically when the new context's data loads).

## Full example

```vue
<script setup lang="ts">
import type { ParsedQuery } from 'vuqs'
import { createQueryStore } from '@vuqs/store'
import { codecs, defineQueryState } from 'vuqs'
import { createVueRouterAdapter } from 'vuqs/adapters/vue-router'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

type Tab = 'products' | 'orders'

const route = useRoute()
const router = useRouter()
const adapter = createVueRouterAdapter()
const tab = ref<Tab>('products')

const store = createQueryStore({
  schema: {
    q: defineQueryState('q', codecs.string),
    sort: defineQueryState('sort', codecs.literal(['newest', 'oldest'] as const)),
    category: defineQueryState('category', codecs.literal(['cpu', 'gpu', 'ram'] as const)),
    status: defineQueryState('status', codecs.literal(['open', 'shipped'] as const)),
  },
  query: adapter.query,
  navigate: adapter.navigate,
  history: 'replace',
  context: {
    active: tab,
    preserve: ['q'],
    only: { category: ['products'], status: ['orders'] },
  },
})

function switchTab(next: Tab) {
  if (next === tab.value) {
    return
  }
  const query = store.buildContextQuery(route.query as ParsedQuery, next)
  tab.value = next
  router.replace({ query: query as Record<string, string> })
}
</script>

<template>
  <nav>
    <button :class="{ active: tab === 'products' }" @click="switchTab('products')">Products</button>
    <button :class="{ active: tab === 'orders' }" @click="switchTab('orders')">Orders</button>
  </nav>

  <input
    :value="store.selected.q ?? ''"
    placeholder="Search (survives switch)…"
    @input="store.setValue('q', ($event.target as HTMLInputElement).value || undefined)"
  >

  <!-- category only on Products, status only on Orders -->
  <select v-if="tab === 'products'" :value="store.selected.category ?? ''">…</select>
  <select v-else :value="store.selected.status ?? ''">…</select>

  <p>Active context: {{ store.activeContext.value }}</p>
</template>
```

Set a category on Products, switch to Orders, watch the URL: `q` stays,
`category` disappears, and it all happens in one navigation.
