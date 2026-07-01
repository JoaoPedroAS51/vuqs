# API: testing

Utilities for testing code that uses vuqs. Both subpaths are dev-only: they are
never imported by your app code. See the [Testing guide](/guide/going-further/testing)
for task-oriented walkthroughs.

## createTestingAdapter <Badge type="tip" text="@vuqs/core/adapters/testing" />

Builds a [`QueryAdapter`](/api/adapters#queryadapter) backed by an in-memory ref, so
a composable can run in tests without a router.

```ts
function createTestingAdapter(options?: TestingAdapterOptions): TestingAdapter
```

**Parameters**

- `options?: TestingAdapterOptions`
  - `searchParams?: string | URLSearchParams | ParsedQuery`: the initial query,
    default `{}`. A query string (with or without `?`), a `URLSearchParams`, or a
    query object. Dot-notation keys nest into objects the way the core resolves
    [paths](/guide/going-further/defining-params#nested-keys); repeated keys collapse
    into arrays.
  - `onUrlUpdate?: OnUrlUpdateFunction`: invoked once per flushed write with the next
    query and resolved options. Wire it to a spy to assert on URL changes.
  - `hasMemory?: boolean`: default `false`. When `true`, each write updates `query`
    so later reads build on it. When `false`, `query` stays frozen at `searchParams`
    and each write is independent.
  - `defaultOptions?: QueryAdapterDefaultOptions`: app-wide defaults at the bottom of
    the [precedence chain](/guide/essentials/navigation-options#precedence).

**Returns**

- `adapter: TestingAdapter`
  - A [`QueryAdapter`](/api/adapters#queryadapter) whose `query` is exposed as a
    `Ref<ParsedQuery>`, so a test can read `adapter.query.value` to assert the URL
    state directly.
  - Pass it to [`installQueryAdapter`](/api/composables#installqueryadapter) or
    [`provideQueryAdapter`](/api/composables#providequeryadapter).

**Example**

```ts
import { codecs, installQueryAdapter, useQueryState } from '@vuqs/core'
import { createTestingAdapter } from '@vuqs/core/adapters/testing'
import { createApp } from 'vue'

const adapter = createTestingAdapter({ searchParams: '?count=42' })
const app = createApp({})
installQueryAdapter(app, adapter)

const count = app.runWithContext(() => useQueryState('count', codecs.integer.withDefault(0)))
expect(count.value).toBe(42)
```

## withVuqsTestingAdapter <Badge type="tip" text="@vuqs/core/adapters/testing" />

Returns a Vue plugin that builds a testing adapter and installs it on an app, for
use with `@vue/test-utils`' `global.plugins`.

```ts
function withVuqsTestingAdapter(options?: TestingAdapterOptions): (app: App) => void
```

**Parameters**

- `options?: TestingAdapterOptions`
  - The same options as [`createTestingAdapter`](#createtestingadapter).

**Returns**

- `plugin: (app: App) => void`
  - A Vue plugin. When you also need the adapter reference (to read
    `adapter.query.value`), call `createTestingAdapter` and install it yourself
    instead.

**Example**

```ts
import { mount } from '@vue/test-utils'
import { withVuqsTestingAdapter } from '@vuqs/core/adapters/testing'

mount(MyComponent, {
  global: { plugins: [withVuqsTestingAdapter({ searchParams: '?count=42' })] },
})
```

## resetQueues <Badge type="tip" text="@vuqs/core/adapters/testing" />

Clears the module-level update queue shared by every engine, so pending writes from
one test do not leak into the next. Takes no arguments and returns nothing.

```ts
function resetQueues(): void
```

**Example**

```ts
import { resetQueues } from '@vuqs/core/adapters/testing'
import { beforeEach } from 'vitest'

beforeEach(() => {
  resetQueues()
})
```

Also re-exported from the core ([`@vuqs/core`](/api/)) for convenience.

## Testing-adapter types <Badge type="tip" text="@vuqs/core/adapters/testing" />

```ts
interface UrlUpdateEvent {
  query: ParsedQueryRaw // the query the adapter would write
  options: NavigateOptions // the resolved navigation options
}

type OnUrlUpdateFunction = (event: UrlUpdateEvent) => void
```

## isCodecBijective <Badge type="tip" text="@vuqs/core/testing" />

The full bijectivity check for a [custom codec](/guide/codecs/custom): both
round-trip directions hold, and the serialized/parsed forms match the expected
values.

```ts
function isCodecBijective<T>(codec: Codec<T>, serialized: ParsedQueryValue, input: T): boolean
```

**Parameters**

- `codec: Codec<T>`
  - The codec under test.
- `serialized: ParsedQueryValue`
  - The codec's **canonical** serialized form of `input`.
- `input: T`
  - The value `serialized` should parse back to, compared by `codec.eq`.

**Returns**

- `boolean`
  - `true` when `serialize(input)` equals `serialized`, `parse(serialized)` equals
    `input`, and both directions round-trip. Otherwise **throws**, naming the side
    that broke.

**Example**

```ts
import { isCodecBijective } from '@vuqs/core/testing'

expect(isCodecBijective(codecs.integer, '42', 42)).toBe(true)
expect(() => isCodecBijective(codecs.integer, '42', 47)).toThrow()
```

## testSerializeThenParse <Badge type="tip" text="@vuqs/core/testing" />

Checks one direction: `parse(serialize(input))` equals `input` (by `codec.eq`).

```ts
function testSerializeThenParse<T>(codec: Codec<T>, input: T): boolean
```

**Parameters**

- `codec: Codec<T>`
  - The codec under test.
- `input: T`
  - The value to serialize and parse back.

**Returns**

- `boolean`
  - `true` on a clean round-trip. **Throws** if the codec rejects its own serialized
    output, or if the round-tripped value differs.

**Example**

```ts
import { testSerializeThenParse } from '@vuqs/core/testing'

expect(testSerializeThenParse(codecs.integer, 42)).toBe(true)
expect(() => testSerializeThenParse(codecs.integer, Number.NaN)).toThrow()
```

## testParseThenSerialize <Badge type="tip" text="@vuqs/core/testing" />

Checks the other direction: `serialize(parse(serialized))` equals `serialized`
([structurally](/api/serializer#structuraleq)).

```ts
function testParseThenSerialize<T>(codec: Codec<T>, serialized: ParsedQueryValue): boolean
```

**Parameters**

- `codec: Codec<T>`
  - The codec under test.
- `serialized: ParsedQueryValue`
  - The codec's **canonical** raw form. A non-canonical input like `'007'`
    round-trips to `'7'` and is reported as a mismatch by design.

**Returns**

- `boolean`
  - `true` on a clean round-trip. **Throws** if `parse` rejects the input, or if the
    re-serialized value differs.

**Example**

```ts
import { testParseThenSerialize } from '@vuqs/core/testing'

expect(testParseThenSerialize(codecs.integer, '42')).toBe(true)
expect(() => testParseThenSerialize(codecs.integer, 'not-a-number')).toThrow()
```
