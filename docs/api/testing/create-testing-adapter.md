# createTestingAdapter <Badge type="tip" text="@vuqs/core/adapters/testing" />

Builds a [`QueryAdapter`](/api/adapters/query-adapter) backed by an in-memory ref, so
a composable can run in tests without a router.

## Usage

```ts
import { codecs, installQueryAdapter, useQueryState } from '@vuqs/core'
import { createTestingAdapter } from '@vuqs/core/adapters/testing'
import { expect } from 'vitest'
import { createApp } from 'vue'

const adapter = createTestingAdapter({ searchParams: '?count=42' })
const app = createApp({})
installQueryAdapter(app, adapter)

const count = app.runWithContext(() => useQueryState('count', codecs.integer.withDefault(0)))
expect(count.value).toBe(42)
```

## Type

```ts
function createTestingAdapter(options?: TestingAdapterOptions): TestingAdapter
```

## Parameters

- `options?: TestingAdapterOptions`
  - `searchParams?: string | URLSearchParams | ParsedQuery`: the initial query,
    default `{}`. A query string (with or without `?`), a `URLSearchParams`, or a
    query object. Dot-notation keys nest into objects the way the core resolves
    [paths](/guide/query-state/defining-params#nested-keys); repeated keys collapse
    into arrays.
  - `onUrlUpdate?: OnUrlUpdateFunction`: invoked once per flushed navigation with
    the next query and resolved options. Several coalesced transactions produce one
    callback. Wire it to a spy to assert on URL changes.
  - `hasMemory?: boolean`: default `false`. When `true`, each navigation updates
    `query` so later reads build on it. When `false`, `query` stays frozen at
    `searchParams`; completed writes remain visible to composables in a read layer,
    but are not reapplied to later navigation requests.
  - `defaultOptions?: QueryAdapterDefaultOptions`: app-wide defaults at the bottom of
    the [precedence chain](/guide/query-state/navigation-options#precedence).

## Return value

- `adapter: TestingAdapter`
  - A [`QueryAdapter`](/api/adapters/query-adapter) whose `query` is exposed as a
    `ShallowRef<ParsedQuery>`. Replace `adapter.query.value` to simulate an external
    update; mutating its nested properties does not notify composables.
  - `resetQueue(): void` discards this adapter's pending optimistic writes,
    scheduled navigation, and simulated values without memory. Fresh adapter
    instances are isolated automatically.
  - Pass it to [`installQueryAdapter`](/api/adapters/install-query-adapter) or
    [`provideQueryAdapter`](/api/adapters/provide-query-adapter).

## TestingAdapterOptions

```ts
interface TestingAdapterOptions {
  searchParams?: string | URLSearchParams | ParsedQuery
  onUrlUpdate?: OnUrlUpdateFunction
  hasMemory?: boolean
  defaultOptions?: QueryAdapterDefaultOptions
}
```

## TestingAdapter

```ts
interface TestingAdapter extends QueryAdapter {
  readonly query: ShallowRef<ParsedQuery>
  readonly resetQueue: () => void
}
```

## UrlUpdateEvent

```ts
interface UrlUpdateEvent {
  query: ParsedQueryRaw
  options: NavigateOptions
}
```

## OnUrlUpdateFunction

```ts
type OnUrlUpdateFunction = (event: UrlUpdateEvent) => void
```

## resetQueue

Clears pending writes for one testing adapter. Use it only when a test reuses an
adapter and needs to discard a scheduled navigation. A new adapter owns a fresh
runtime and needs no global cleanup.

```ts
interface TestingAdapter extends QueryAdapter {
  readonly query: ShallowRef<ParsedQuery>
  readonly resetQueue: () => void
}
```

### Return value

- `void`
  - Discards pending writes and cancels scheduled navigation for this adapter.
    Without memory, it also clears simulated values.

### Usage

```ts
import { createTestingAdapter } from '@vuqs/core/adapters/testing'

const adapter = createTestingAdapter()
// Schedule a write through a composable using adapter.
adapter.resetQueue()
```

## Related guide

[Testing](/guide/testing).
