# withContext <Badge type="tip" text="@vuqs/core/modules" />

Makes state behave differently across **contexts**: tabs, wizard steps, view
modes. Switching to a context preserves some params, resets the rest, and drops
params that don't exist there, reconciled into a single navigation you trigger. It
composes onto a group with `useQueryStates` or onto a single param with
`useQueryState`.

## Usage

`withContext` composes on a group with `useQueryStates` or on a single param with
`useQueryState`. Both get the same controls; `preserve` and `only` match the facade.

### On a group

Two tabs, Products and Orders, sharing filters: `q` should **survive** the switch,
`sort` should **reset**, `category` exists only on Products, and `status` only on
Orders.

```ts
import { useQueryStates } from '@vuqs/core'
import { withContext } from '@vuqs/core/modules'

const { values, activeContext, switchTo } = useQueryStates(schema)
  .use(withContext({
    active: tab, // your context: a ref, a route param, or a wizard step
    preserve: ['q'], // q carries over; everything else resets
    only: { category: ['products'], status: ['orders'] }, // per-context validity
    navigate: (target, query) => router.push({ params: { tab: target }, query }),
  }))
```

### On a single param

The same rules for one param: `preserve` is a boolean, `only` a list of contexts.

```ts
import { codecs, useQueryState } from '@vuqs/core'
import { withContext } from '@vuqs/core/modules'

const category = useQueryState('category', codecs.string)
  .use(withContext({ active: tab, only: ['products'] }))
// dropped from reads and the URL when the active context is not 'products'
```

## API

`withContext(options)` binds to whichever composable composes it. To build a module
outside a `.use` chain, pass a schema (`withContext(schema, options)`) or a param
(`withContext(param, options)`) so the facade is explicit (see
[Typing `preserve` and `only`](#typing-preserve-and-only)). Every form contributes the
same controls:

- `activeContext: ComputedRef<TContext>`
  - The current context as a ref, mirroring the `active` option.
- `buildContextQuery(currentQuery, nextContext): ParsedQueryRaw`
  - The reconciled query for switching to `nextContext`, **without navigating**.
    Use it to render a link.
- `switchTo(target, options?): void`
  - Switches in **one navigation**, reconciling the query and handing it to your
    [`navigate`](#navigate-how-to-switch) option. Throws if `navigate` is not
    configured.

It also filters params by the active context, so a param invalid there never enters
`values`, the URL, or any module's derived state, and a stale link that pastes an
invalid param has it dropped on the next write.

## Options

`active` and `navigate` are shared. `preserve` and `only` take a different shape
per composable:

- `active: MaybeRefOrGetter<TContext>`
  - The current context. An **external, opaque** identifier the module never
    derives: you own it, whether it is a tab `ref`, a route param, or a wizard step.
- `preserve`
  - Grouped: `(keyof schema)[]`, the params kept across a switch. Everything not
    listed resets.
  - Single: `boolean`, whether the one param carries over.
- `only`
  - Grouped: `Record<key, TContext[]>`, restricting which contexts each param
    exists in. An omitted param is valid everywhere.
  - Single: `TContext[]`, the contexts the one param exists in.
- `navigate?: (target, query, options?) => void`
  - How to reach a context. `switchTo` reconciles the query and calls this with the
    target context and that query, so **you** issue one navigation carrying both the
    route and the query. Only you know how a context maps to a route, so you own
    that mapping. Omit it and `switchTo` throws; you can still drive navigation
    yourself with `buildContextQuery`.

Omit both `preserve` and `only` for the base form: every managed param then resets on
a switch.

## Signals

- **Emits** [`context:change`](/modules/signals) when the active context changes. A
  module holding per-context state can react to it.
  [`withRuntimeDefaults`](/modules/runtime-defaults) does, clearing its stale
  defaults. Apply `withRuntimeDefaults` first, then `withContext`, and re-call
  `setDefaults` after a switch.
- **Reacts to:** none.

## How it works

### Switching context

The module **never navigates on its own**: `active` is yours. Changing it (setting
the ref, or navigating so a route-derived getter updates) makes param validity
follow the new context and emits the `context:change` signal. Reconciling the URL is
a separate, explicit step, and that split is what keeps the switch a single
navigation you control.

`switchTo` is the ergonomic path: it reconciles the query and hands it to your
`navigate` option, so the route change and the param reset land together.

```ts
const { switchTo } = useQueryStates(schema)
  .use(withContext({
    active: () => route.params.tab as 'products' | 'orders',
    preserve: ['q'],
    navigate: (target, query) => router.push({ params: { tab: target }, query }),
  }))

switchTo('orders') // one navigation: new route + reconciled query
switchTo('orders', { history: 'push' }) // per-call options are forwarded to `navigate`
```

`switchTo` uses your router (`router.push`, Nuxt's `navigateTo`, and so on), not
vuqs's internal adapter, so it works the same whether the adapter is local or
installed app-wide.

When you only need the reconciled query *without* navigating, to render a link, call
`buildContextQuery`:

```ts
const query = buildContextQuery(route.query, 'orders')
// <RouterLink :to="{ params: { tab: 'orders' }, query }">Orders</RouterLink>
```

### Typing `preserve` and `only`

The composable that composes the module picks the option shapes: `useQueryStates` types
`preserve`/`only` against its schema (grouped), `useQueryState` types them for its one
param (single). Chained off `useQueryStates(schema)`, the keys are inferred from that
schema:

```ts
useQueryStates(schema).use(withContext({ active, preserve: ['q'] })) // keys inferred
```

To build a module outside a `.use` chain, pass the schema or the param so the facade and
its option shapes are known:

```ts
withContext(schema, { active, preserve: ['q'] }) // grouped, keys checked against the schema
withContext(sort, { active, preserve: true }) // single, for the `sort` param
```

TypeScript rejects a grouped `preserve` or `only` key that is not in the schema.

## Example

```vue
<script setup lang="ts">
import { codecs, useQueryStates } from '@vuqs/core'
import { withContext, withRuntimeDefaults } from '@vuqs/core/modules'
import { useRoute, useRouter } from 'vue-router'

type Tab = 'products' | 'orders'

const route = useRoute()
const router = useRouter()

const schema = {
  q: codecs.string,
  sort: codecs.literal(['newest', 'oldest'] as const),
  category: codecs.literal(['cpu', 'gpu', 'ram'] as const),
  status: codecs.literal(['open', 'shipped'] as const),
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

Set a category on Products, `switchTo('orders')`, and watch the URL: `q` stays,
`category` disappears, all in one navigation.

## Nuxt

Under [`@vuqs/nuxt`](/nuxt/auto-imports), `withContext` is auto-imported with the
other modules.
