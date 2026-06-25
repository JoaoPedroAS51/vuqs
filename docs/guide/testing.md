# Testing

You can unit-test components and composables that use `useQueryState` /
`useQueryStates` without mocking a router. vuqs ships a **testing adapter** for
**setting up** initial query state and **asserting** on URL changes, plus
**codec helpers** for verifying your own [custom codecs](/guide/custom-codecs).

Both live at dedicated subpaths so they're never pulled into your app bundle:

```ts
import { createTestingAdapter, withVuqsTestingAdapter } from 'vuqs/adapters/testing'
import { isCodecBijective } from 'vuqs/testing'
```

## Testing composables

A composable reads `query` and `navigate` from the [adapter](/guide/adapters) in
scope. `createTestingAdapter` gives you one backed by an in-memory ref: pass the
initial query, install it on a throwaway app, and run the composable in that
app's [injection context](/api/composables#installqueryadapter).

```ts
import { describe, expect, it } from 'vitest'
import { createApp } from 'vue'
import { codecs, installQueryAdapter, useQueryState } from 'vuqs'
import { createTestingAdapter } from 'vuqs/adapters/testing'

it('reads the initial value', () => {
  const adapter = createTestingAdapter({ searchParams: '?count=42' })

  const app = createApp({})
  installQueryAdapter(app, adapter)

  const count = app.runWithContext(() => useQueryState('count', codecs.integer.withDefault(0)))

  expect(count.value).toBe(42)
})
```

### Asserting on URL writes

Wire `onUrlUpdate` to a spy to assert what gets written. It fires once per
flushed navigation, with the next query and the resolved
[navigation options](/guide/navigation-options):

```ts
import { vi } from 'vitest'

it('writes to the URL', async () => {
  const onUrlUpdate = vi.fn()
  const adapter = createTestingAdapter({ onUrlUpdate })

  const app = createApp({})
  installQueryAdapter(app, adapter)
  const count = app.runWithContext(() => useQueryState('count', codecs.integer.withDefault(0)))

  count.set(43, { history: 'push' })
  await Promise.resolve() // let the coalesced write flush

  expect(onUrlUpdate).toHaveBeenCalledOnce()
  const event = onUrlUpdate.mock.calls[0][0]
  expect(event.query).toEqual({ count: '43' })
  expect(event.options.history).toBe('push') // the options resolved for this write
})
```

::: tip Writes are coalesced
Like in a real app, writes within a tick are [coalesced](/guide/concepts) into a
single navigation. `await` a microtask (or `vi.advanceTimersByTimeAsync` when
using [`throttleMs`](/guide/navigation-options#throttlems)) before asserting.
:::

### Memory: frozen vs. real

By default the adapter is **immutable** — its `query` stays frozen at the initial
`searchParams`, so each write is independent and a test stays focused on one unit
of behavior. The composable still sees its own write optimistically, but
`adapter.query.value` never changes.

Pass `hasMemory: true` to behave like a real adapter, where each write lands back
in the query so later reads build on it:

```ts
const adapter = createTestingAdapter({ searchParams: '?count=42', hasMemory: true })

const app = createApp({})
installQueryAdapter(app, adapter)
const count = app.runWithContext(() => useQueryState('count', codecs.integer.withDefault(0)))

count.value = 43
await Promise.resolve()

expect(adapter.query.value).toEqual({ count: '43' }) // the URL caught up
```

### Isolating tests

The update queue that coalesces writes is a module-level singleton, so reset it
between tests to keep one test's pending writes from leaking into the next:

```ts
import { beforeEach } from 'vitest'
import { resetQueues } from 'vuqs/adapters/testing'

beforeEach(() => {
  resetQueues()
})
```

## Testing components

For a mounted component, `withVuqsTestingAdapter` returns a Vue plugin you drop
into `@vue/test-utils`' `global.plugins`:

```ts
import { mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { withVuqsTestingAdapter } from 'vuqs/adapters/testing'
import CounterButton from './CounterButton.vue'

it('increments the count when clicked', async () => {
  const onUrlUpdate = vi.fn()

  const wrapper = mount(CounterButton, {
    global: {
      plugins: [withVuqsTestingAdapter({ searchParams: '?count=42', onUrlUpdate })],
    },
  })

  expect(wrapper.text()).toContain('count is 42')

  await wrapper.get('button').trigger('click')
  await Promise.resolve()

  expect(onUrlUpdate).toHaveBeenCalledOnce()
  expect(onUrlUpdate.mock.calls[0][0].query).toEqual({ count: '43' })
})
```

When you also need the adapter reference (to read `adapter.query.value`), build
it with `createTestingAdapter` and install it yourself instead.

## Initial query shapes

`searchParams` accepts a query string, a `URLSearchParams`, or a query object.
Dot-notation keys nest the same way the core resolves [paths](/guide/nested-keys),
so all of these set up `{ filters: { sort: 'name' } }`:

```ts
createTestingAdapter({ searchParams: '?filters.sort=name' })
createTestingAdapter({ searchParams: { 'filters.sort': 'name' } })
createTestingAdapter({ searchParams: { filters: { sort: 'name' } } })
```

This matches what a router adapter delivers, so a composable bound to the
`filters.sort` path reads its initial value in tests exactly as it would in the
app. Repeated keys collapse into arrays — `'?tags=a&tags=b'` reads as
`{ tags: ['a', 'b'] }`.

## Testing custom codecs

A [custom codec](/guide/custom-codecs) must be **bijective**: `parse` and
`serialize` round-trip in both directions. `vuqs/testing` turns that contract into
assertions. All three return `true` on success and **throw** on failure, with a
message that pinpoints which side broke:

```ts
import { isCodecBijective, testParseThenSerialize, testSerializeThenParse } from 'vuqs/testing'

it('is bijective', () => {
  // Both directions plus the exact serialized form, in one call:
  expect(isCodecBijective(percent, '42', 42)).toBe(true)

  // A non-bijective pair throws:
  expect(() => isCodecBijective(percent, '42', 47)).toThrow()

  // Or check one side at a time to isolate a failure:
  expect(testSerializeThenParse(percent, 42)).toBe(true) // parse(serialize(42)) eq 42
  expect(testParseThenSerialize(percent, '42')).toBe(true) // serialize(parse('42')) === '42'
})
```

`isCodecBijective(codec, serialized, input)` checks everything at once:
`serialize(input)` equals `serialized`, `parse(serialized)` equals `input` (by
the codec's `eq`), and both round-trip directions hold. The codec's `eq` is used
for value comparison, so date and array codecs compare correctly.

::: warning Use canonical serialized values
The serialized side must be the codec's **canonical** output. `testParseThenSerialize`
re-serializes the parsed value and compares, so a non-canonical input like `'007'`
(which an integer codec parses to `7` and re-serializes to `'7'`) is reported as a
mismatch by design.
:::
