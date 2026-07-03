# withContext <Badge type="tip" text="@vuqs/core/modules" />

Makes one schema behave differently across **contexts** — tabs, wizard steps, view
modes. Switching to a context preserves some params, resets the rest, and drops
params that don't exist there — reconciled into a single navigation you trigger.

```ts
import { withContext } from '@vuqs/core/modules'
```

## Overview

Picture two tabs, Products and Orders, sharing one search box:

- `q` (the search term) should **survive** switching tabs.
- `sort` should **reset** — a product sort doesn't make sense for orders.
- `category` exists only on Products; `status` only on Orders. Neither should leak
  into the other, or survive a pasted stale link.

Hand-rolling this is fiddly. `withContext` declares it.

## API

`withContext(options)` or `withContext(schema, options)` for explicit key
checking (see [Typing `preserve` and `only`](#typing-preserve-and-only)) —
contributes `ContextStatesApi` or `ContextStateApi`:

```ts
function withContext<TSchema, TContext extends string>(
  options: QueryStatesContextOptions<TSchema, TContext>,
): QueryStatesModule<TSchema, ContextStatesApi<TContext>>

function withContext<TContext extends string>(
  options: QueryStateContextOptions<TContext>,
): DefinedQueryStateModule<ContextStateApi<TContext>>

interface ContextStatesApi<TContext extends string> {
  activeContext: ComputedRef<TContext>
  buildContextQuery: (currentQuery: ParsedQuery, nextContext: TContext) => ParsedQueryRaw
  switchTo: (target: TContext, options?: NavigateOptions) => void
}

interface ContextStateApi<TContext extends string> {
  activeContext: ComputedRef<TContext>
  buildContextQuery: (currentQuery: ParsedQuery, nextContext: TContext) => ParsedQueryRaw
  switchTo: (target: TContext, options?: NavigateOptions) => void
}
```

- `activeContext` — the current context as a ref (`.value`), mirroring the `active`
  option.
- `buildContextQuery(currentQuery, nextContext)` — the reconciled query for
  switching to `nextContext`, **without navigating**. Use it to render a link or
  for SSR.
- `switchTo(target, options?)` — switches in **one navigation**: reconciles the
  query and hands it to your [`navigate`](#navigate-how-to-switch) option. Throws
  if `navigate` isn't configured.

It also filters params by the active context, so a param invalid there never
enters `values`, the URL, or any module's derived state — and a stale link that
pastes an invalid param has it dropped on the next write.

## Options

```ts
interface ContextBaseOptions<TContext extends string> {
  active: MaybeRefOrGetter<TContext>
  navigate?: (target: TContext, query: ParsedQueryRaw, options?: NavigateOptions) => void
}

type QueryStatesContextOptions<TSchema, TContext extends string> = ContextBaseOptions<TContext> & (
  | {
    preserve: ReadonlyArray<keyof TSchema & string>
    only?: Partial<Record<keyof TSchema & string, readonly TContext[]>>
  }
  | {
    preserve?: ReadonlyArray<keyof TSchema & string>
    only: Partial<Record<keyof TSchema & string, readonly TContext[]>>
  }
)

type QueryStateContextOptions<TContext extends string> = ContextBaseOptions<TContext> & (
  | {
    preserve: boolean
    only?: readonly TContext[]
  }
  | {
    preserve?: boolean
    only: readonly TContext[]
  }
)
```

`ContextBaseOptions` with only `active` and optional `navigate` creates a module
that works with both `useQueryStates` and `useQueryState`. It adds the context
controls and keeps the default reconciliation rule: `buildContextQuery` and
`switchTo` reset managed params because no param is marked as preserved.

```ts
withContext({ active })
```

Grouped and single-param rules use different option shapes:

```ts
// grouped
withContext({
  active,
  preserve: ['q'],
  only: { category: ['products'] },
})

// single
withContext({
  active,
  preserve: true,
  only: ['products'],
})
```

### `active` — the current context

An **external, opaque** identifier (`MaybeRefOrGetter`). The module never derives
it — you own it, whether it's a tab `ref`, a route param, or a wizard step.

```ts
withContext({ active: tab })                     // a ref
withContext({ active: () => route.params.tab })  // a getter
```

### `preserve` — what survives a switch

Params kept when the context changes. **Everything not listed resets.** The split
is irreducible — two params can both be valid in both contexts yet one should
persist and the other shouldn't.

```ts
withContext({ active, preserve: ['q'] }) // q carries over; everything else resets
useQueryState('q').use(withContext({ active, preserve: true }))
```

### `only` — param validity per context

Restricts which contexts a param **exists in**. An invalid param never enters
`values`/URL/derived state, is dropped when you switch away from its context, and
is auto-dropped if a stale link pastes it into the wrong context. Omit a param to
make it valid everywhere.

```ts
withContext({
  active,
  only: {
    category: ['products'], // category exists only on Products
    status: ['orders'],     // status exists only on Orders
  },
})

useQueryState('category').use(withContext({ active, only: ['products'] }))
```

### `navigate` — how to switch

How to navigate to a context. `switchTo` reconciles the query and calls this with
the target context and that query, so **you** issue one navigation carrying both
the route and the query. The module is router-agnostic — only you know how a
context maps to a route, so you own that mapping.

```ts
// context lives in a route param:
withContext({ active, navigate: (target, query) => router.push({ params: { tab: target }, query }) })
// or in the query string:
withContext({ active, navigate: (target, query) => router.replace({ query: { ...query, tab: target } }) })
```

Omit it and `switchTo` throws; you can still drive navigation yourself with
[`buildContextQuery`](#api).

## How it works

### Switching context

The module **never navigates on its own** — `active` is yours. Changing it (setting
the ref, or navigating so a route-derived getter updates) makes param validity
follow the new context and signals [`withRuntimeDefaults`](#composing) to clear its
per-context defaults. Reconciling the URL is a separate, explicit step — that split
is what keeps the switch a single navigation you control.

`switchTo` is the ergonomic path: it reconciles the query and hands it to your
`navigate` option, so the route change and the param reset land together.

```ts
const { switchTo, buildContextQuery } = useQueryStates(schema)
  .use(withContext({
    active: () => route.params.tab as 'products' | 'orders',
    preserve: ['q'],
    navigate: (target, query) => router.push({ params: { tab: target }, query }),
  }))

switchTo('orders')                      // one navigation: new route + reconciled query
switchTo('orders', { history: 'push' }) // per-call options are forwarded to `navigate`
```

`switchTo` uses your router (`router.push`, Nuxt's `navigateTo`, …), not vuqs's
internal adapter — so it works the same whether the adapter is local or installed
app-wide.

When you only need the reconciled query *without* navigating — to render a link or
for SSR — call `buildContextQuery`:

```ts
const query = buildContextQuery(route.query, 'orders')
// <RouterLink :to="{ params: { tab: 'orders' }, query }">Orders</RouterLink>
```

### Typing `preserve` and `only`

`withContext` infers the option shape from the facade that consumes it.
Grouped options use schema keys:

```ts
// Inferred from the schema you chain off — no extra argument:
useQueryStates(schema).use(withContext({ active, preserve: ['q'] }))

// Or bind explicitly by passing the schema (handy when the keys can't be inferred):
useQueryStates(schema).use(withContext(schema, { active, preserve: ['q'] }))
```

Either way, TypeScript rejects a `preserve` or `only` key that isn't in the schema.

Single-param options describe the one param bound by `useQueryState`. They never
expose the internal single schema key:

```ts
useQueryState('category').use(withContext({
  active,
  preserve: true,
  only: ['products'],
}))
```

`withContext({ active })` has no param-specific rules and works with both
`useQueryStates` and `useQueryState`.

## Example

```vue
<script setup lang="ts">
import { codecs, queryParam, useQueryStates } from '@vuqs/core'
import { withContext, withRuntimeDefaults } from '@vuqs/core/modules'
import { useRoute, useRouter } from 'vue-router'

type Tab = 'products' | 'orders'

const route = useRoute()
const router = useRouter()

const schema = {
  q: queryParam('q', codecs.string),
  sort: queryParam('sort', codecs.literal(['newest', 'oldest'] as const)),
  category: queryParam('category', codecs.literal(['cpu', 'gpu', 'ram'] as const)),
  status: queryParam('status', codecs.literal(['open', 'shipped'] as const)),
}

const { values, selected, activeContext, switchTo } = useQueryStates(schema, { history: 'replace' })
  .use(withRuntimeDefaults())
  .use(withContext({
    active: () => (route.query.tab as Tab) ?? 'products', // context lives in the URL → deep-linkable
    preserve: ['q'],
    only: { category: ['products'], status: ['orders'] },
    navigate: (tab, query) => router.replace({ query: { ...query, tab } }),
  }))
</script>

<template>
  <nav>
    <button :class="{ active: activeContext === 'products' }" @click="switchTo('products')">Products</button>
    <button :class="{ active: activeContext === 'orders' }" @click="switchTo('orders')">Orders</button>
  </nav>

  <input
    :value="selected.q ?? ''"
    placeholder="Search (survives switch)…"
    @input="values.q = ($event.target as HTMLInputElement).value || undefined"
  >

  <!-- category only on Products, status only on Orders -->
  <select v-if="activeContext === 'products'" v-model="values.category">…</select>
  <select v-else v-model="values.status">…</select>

  <p>Active context: {{ activeContext }}</p>
</template>
```

Set a category on Products, `switchTo('orders')`, watch the URL: `q` stays,
`category` disappears, all in one navigation.

## Composing

[`withRuntimeDefaults`](/modules/runtime-defaults)'s runtime defaults are per-context, so
`withContext` signals a context change through `core` and `withRuntimeDefaults` clears
its stale defaults in response. Apply `withRuntimeDefaults` first, then `withContext`,
and re-call `setDefaults` after a switch.

## Nuxt

Under [`@vuqs/nuxt`](/nuxt/introduction#auto-imports), `withContext` is
auto-imported with the other modules — drop the `import` line and call it directly.
