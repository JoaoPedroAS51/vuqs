# API: testing

Utilities for testing code that uses vuqs. Both subpaths are dev-only — they're
never imported by your app code. See the [Testing guide](/guide/testing) for
task-oriented walkthroughs.

## createTestingAdapter <Badge type="tip" text="vuqs/adapters/testing" />

Builds a [`QueryAdapter`](/api/adapters#queryadapter) backed by an in-memory ref,
so a composable can run in tests without a router.

### Signature

```ts
function createTestingAdapter(options?: TestingAdapterOptions): TestingAdapter
```

### Parameters

```ts
interface TestingAdapterOptions {
  searchParams?: string | URLSearchParams | ParsedQuery
  onUrlUpdate?: OnUrlUpdateFunction
  hasMemory?: boolean                          // default: false
  defaultOptions?: QueryAdapterDefaultOptions
}
```

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `searchParams` | `string \| URLSearchParams \| ParsedQuery` | `{}` | The initial query. A query string (with or without `?`), a `URLSearchParams`, or a query object. Dot-notation keys nest into objects the way the core resolves [paths](/guide/nested-keys); repeated keys collapse into arrays. |
| `onUrlUpdate` | `OnUrlUpdateFunction` | — | Invoked once per flushed write with the next query and resolved options. Wire to a spy to assert on URL changes. |
| `hasMemory` | `boolean` | `false` | When `true`, each write updates `query` so later reads build on it. When `false`, `query` stays frozen at `searchParams` and each write is independent. |
| `defaultOptions` | `QueryAdapterDefaultOptions` | — | App-wide defaults at the bottom of the [precedence chain](/guide/navigation-options#precedence). |

### Returns

A `TestingAdapter` — a [`QueryAdapter`](/api/adapters#queryadapter) whose `query`
is exposed as a `Ref`, so a test can read `adapter.query.value` to assert the URL
state directly:

```ts
interface TestingAdapter extends QueryAdapter {
  query: Ref<ParsedQuery>
}
```

Pass it to [`installQueryAdapter`](/api/composables#installqueryadapter) or
[`provideQueryAdapter`](/api/composables#providequeryadapter).

### Example

```ts
import { createApp } from 'vue'
import { codecs, installQueryAdapter, useQueryState } from 'vuqs'
import { createTestingAdapter } from 'vuqs/adapters/testing'

const adapter = createTestingAdapter({ searchParams: '?count=42' })
const app = createApp({})
installQueryAdapter(app, adapter)

const count = app.runWithContext(() => useQueryState('count', codecs.integer.withDefault(0)))
expect(count.value).toBe(42)
```

## withVuqsTestingAdapter <Badge type="tip" text="vuqs/adapters/testing" />

Returns a Vue plugin that builds a testing adapter and installs it on an app, for
use with `@vue/test-utils`' `global.plugins`.

### Signature

```ts
function withVuqsTestingAdapter(options?: TestingAdapterOptions): (app: App) => void
```

### Parameters

The same [`TestingAdapterOptions`](#createtestingadapter) as `createTestingAdapter`.

### Returns

A Vue plugin — a function `(app: App) => void`. When you also need the adapter
reference (to read `adapter.query.value`), call `createTestingAdapter` and install
it yourself instead.

### Example

```ts
import { mount } from '@vue/test-utils'
import { withVuqsTestingAdapter } from 'vuqs/adapters/testing'

mount(MyComponent, {
  global: { plugins: [withVuqsTestingAdapter({ searchParams: '?count=42' })] },
})
```

## resetQueues <Badge type="tip" text="vuqs/adapters/testing" />

Clears the module-level update queue shared by every engine, so pending writes
from one test don't leak into the next.

### Signature

```ts
function resetQueues(): void
```

### Example

```ts
import { beforeEach } from 'vitest'
import { resetQueues } from 'vuqs/adapters/testing'

beforeEach(() => {
  resetQueues()
})
```

Also re-exported from the core ([`vuqs`](/api/)) for convenience.

## Testing-adapter types <Badge type="tip" text="vuqs/adapters/testing" />

```ts
interface UrlUpdateEvent {
  query: ParsedQueryRaw    // the query the adapter would write
  options: NavigateOptions // the resolved navigation options
}

type OnUrlUpdateFunction = (event: UrlUpdateEvent) => void
```

## isCodecBijective <Badge type="tip" text="vuqs/testing" />

The full bijectivity check for a [custom codec](/guide/custom-codecs): both
round-trip directions hold, and the serialized/parsed forms match the expected
values. Returns `true` on success and **throws** on failure, naming the side that
broke.

### Signature

```ts
function isCodecBijective<T>(codec: Codec<T>, serialized: ParsedQueryValue, input: T): boolean
```

### Parameters

| Name | Type | Description |
| --- | --- | --- |
| `codec` | `Codec<T>` | The codec under test. |
| `serialized` | `ParsedQueryValue` | The codec's **canonical** serialized form of `input`. |
| `input` | `T` | The value `serialized` should parse back to (compared by `codec.eq`). |

### Returns

`true` when `serialize(input)` equals `serialized`, `parse(serialized)` equals
`input`, and both directions round-trip. Otherwise throws.

### Example

```ts
import { isCodecBijective } from 'vuqs/testing'

expect(isCodecBijective(codecs.integer, '42', 42)).toBe(true)
expect(() => isCodecBijective(codecs.integer, '42', 47)).toThrow()
```

## testSerializeThenParse <Badge type="tip" text="vuqs/testing" />

Checks one direction: `parse(serialize(input))` equals `input` (by `codec.eq`).

### Signature

```ts
function testSerializeThenParse<T>(codec: Codec<T>, input: T): boolean
```

### Parameters

| Name | Type | Description |
| --- | --- | --- |
| `codec` | `Codec<T>` | The codec under test. |
| `input` | `T` | The value to serialize and parse back. |

### Returns

`true` on a clean round-trip. Throws if the codec rejects its own serialized
output, or if the round-tripped value differs.

### Example

```ts
import { testSerializeThenParse } from 'vuqs/testing'

expect(testSerializeThenParse(codecs.integer, 42)).toBe(true)
expect(() => testSerializeThenParse(codecs.integer, Number.NaN)).toThrow()
```

## testParseThenSerialize <Badge type="tip" text="vuqs/testing" />

Checks the other direction: `serialize(parse(serialized))` equals `serialized`
([structurally](/api/serializer#structuraleq)).

### Signature

```ts
function testParseThenSerialize<T>(codec: Codec<T>, serialized: ParsedQueryValue): boolean
```

### Parameters

| Name | Type | Description |
| --- | --- | --- |
| `codec` | `Codec<T>` | The codec under test. |
| `serialized` | `ParsedQueryValue` | The codec's **canonical** raw form. `'007'` round-trips to `'7'` and is reported as a mismatch by design. |

### Returns

`true` on a clean round-trip. Throws if `parse` rejects the input, or if the
re-serialized value differs.

### Example

```ts
import { testParseThenSerialize } from 'vuqs/testing'

expect(testParseThenSerialize(codecs.integer, '42')).toBe(true)
expect(() => testParseThenSerialize(codecs.integer, 'not-a-number')).toThrow()
```
