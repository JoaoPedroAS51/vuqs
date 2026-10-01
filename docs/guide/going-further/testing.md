# Testing

The **testing adapter** supplies initial query state and records navigation requests
without a router mock. **Codec helpers** verify custom codec round trips.

Both live at dedicated subpaths, so they are never pulled into your app bundle:

```ts
import { createTestingAdapter, withVuqsTestingAdapter } from '@vuqs/core/adapters/testing'
import { isCodecBijective } from '@vuqs/core/testing'
```

## Testing composables

A composable reads `query` and `navigate` from the
[adapter](/guide/getting-started/adapters) in scope. `createTestingAdapter` gives
you one backed by an in-memory ref: pass the initial query, install it on a
throwaway app, and run the composable in that app's
[injection context](/api/composables#installqueryadapter).

```ts
import { codecs, installQueryAdapter, useQueryState } from '@vuqs/core'
import { createTestingAdapter } from '@vuqs/core/adapters/testing'
import { describe, expect, it } from 'vitest'
import { createApp } from 'vue'

it('reads the initial value', () => {
  const adapter = createTestingAdapter({ searchParams: '?count=42' })

  const app = createApp({})
  installQueryAdapter(app, adapter)

  const count = app.runWithContext(() => useQueryState('count', codecs.integer.withDefault(0)))

  expect(count.value).toBe(42)
})
```

### Asserting on URL writes

Wire `onUrlUpdate` to a spy to assert what gets written. It fires once per flushed
navigation, with the next query and the resolved
[navigation options](/guide/essentials/navigation-options):

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
Writes within a tick are
[coalesced](/guide/essentials/concepts) into a single navigation. `await` a
microtask (or `vi.advanceTimersByTimeAsync` when using
[`throttleMs`](/guide/essentials/navigation-options#throttlems)) before asserting.
:::

### Adapter memory

By default, `hasMemory` is `false`: `adapter.query.value` stays at the initial
`searchParams`. Each navigation applies its pending writes to that initial base.
Writes in one batch are coalesced, but completed writes are not reapplied to later
navigations. Composables retain their simulated values in a separate read layer
shared by bindings using that adapter. Clearing a param removes its simulated
selection, even if it exists in the initial base.

For example, starting from `{}`, writing `q` and flushing emits `{ q: 'search' }`.
Writing `page` in a later batch emits `{ page: '2' }`, while the composables still
read `q` as `'search'` and `page` as `2`.

Pass `hasMemory: true` to match a router-backed adapter, where each navigation
updates the query so later reads build on it:

```ts
const adapter = createTestingAdapter({ searchParams: '?count=42', hasMemory: true })

const app = createApp({})
installQueryAdapter(app, adapter)
const count = app.runWithContext(() => useQueryState('count', codecs.integer.withDefault(0)))

count.value = 43
await Promise.resolve()

expect(adapter.query.value).toEqual({ count: '43' }) // the URL caught up
```

### Query snapshots

The testing adapter exposes `query` as a `shallowRef`. Initial query objects and
navigation inputs are copied recursively, with Vue reactive proxies unwrapped.
Changing an input object afterwards does not change the captured query.

To simulate an external URL update, replace the query snapshot:

```ts
adapter.query.value = { q: 'external', tags: ['a', 'b'] }
```

Mutating properties or arrays inside `adapter.query.value` does not notify
composables. This applies with and without memory.

### Isolating tests

Each adapter identity owns its update queue. Create a fresh adapter per test and
pending writes cannot leak between tests. When a test intentionally reuses an
adapter, call `resetQueue()` to discard pending writes and scheduled navigation.
Without memory, it also clears simulated values so reads return to the initial base:

```ts
const adapter = createTestingAdapter()

adapter.resetQueue()
```

## Testing components

For a mounted component, `withVuqsTestingAdapter` returns a Vue plugin you drop
into `@vue/test-utils`' `global.plugins`:

```ts
import { mount } from '@vue/test-utils'
import { withVuqsTestingAdapter } from '@vuqs/core/adapters/testing'
import { vi } from 'vitest'
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

When you also need the adapter reference (to read `adapter.query.value`), build it
with `createTestingAdapter` and install it yourself instead.

## Initial query shapes

`searchParams` accepts a query string, a `URLSearchParams`, or a query object.
Dot-notation keys nest the same way the core resolves
[paths](/guide/going-further/defining-params#nested-keys), so all of these set up
`{ filters: { sort: 'name' } }`:

```ts
createTestingAdapter({ searchParams: '?filters.sort=name' })
createTestingAdapter({ searchParams: { 'filters.sort': 'name' } })
createTestingAdapter({ searchParams: { filters: { sort: 'name' } } })
```

This matches what a router adapter delivers, so a composable bound to the
`filters.sort` path reads its initial value in tests exactly as it would in the
app. Repeated keys collapse into arrays: `'?tags=a&tags=b'` reads as
`{ tags: ['a', 'b'] }`.

## Testing custom codecs

A [custom codec](/guide/codecs/custom) must be **bijective**: `parse` and
`serialize` round-trip in both directions. `@vuqs/core/testing` turns that contract
into assertions. All three return `true` on success and **throw** on failure, with
a message that pinpoints which side broke:

```ts
import { isCodecBijective, testParseThenSerialize, testSerializeThenParse } from '@vuqs/core/testing'

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
`serialize(input)` equals `serialized`, `parse(serialized)` equals `input` (by the
codec's `eq`), and both round-trip directions hold. The codec's `eq` is used for
value comparison, so date and array codecs compare correctly.

::: warning Use canonical serialized values
The serialized side must be the codec's **canonical** output.
`testParseThenSerialize` re-serializes the parsed value and compares, so a
non-canonical input like `'007'` (which an integer codec parses to `7` and
re-serializes to `'7'`) is reported as a mismatch by design.
:::
