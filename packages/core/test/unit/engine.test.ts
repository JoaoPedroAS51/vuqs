import { describe, expect, it } from 'vitest'
import { effectScope } from 'vue'
import { createTestingAdapter } from '../../src/adapters/testing'
import { codecs } from '../../src/core/codec'
import { createQueryStateEngine } from '../../src/core/engine'
import { queryParam } from '../../src/core/query-param'
import { resetQueues } from '../../src/core/queues/throttle'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

// createQueryStateEngine is public API (exported from the package root) for
// consumers building their own composable on top of it. useQueryState(s) always
// goes through the binding layer, which pre-resolves clearOnDefault before the
// schema reaches the engine, so its own fallback chain needs its own direct
// coverage here.
function setup(schema: Parameters<typeof createQueryStateEngine>[0]['schema'], engineOptions: Partial<Parameters<typeof createQueryStateEngine>[0]> = {}) {
  resetQueues()
  const adapter = createTestingAdapter({ hasMemory: true })
  const scope = effectScope()
  const engine = scope.run(() => createQueryStateEngine({
    id: 'test',
    schema,
    adapter: { query: adapter.query, navigate: adapter.navigate },
    ...engineOptions,
  }))!

  return { adapter, engine, scope }
}

describe('createQueryStateEngine: clearOnDefault precedence', () => {
  const schema = { page: queryParam('page', codecs.integer.withDefault(1)) }

  it('falls back to the adapter-level default when nothing more specific is set', async () => {
    const { adapter, engine, scope } = setup(schema, { adapterClearOnDefault: false })

    engine.query.set('page', 1)
    await flush()

    expect(adapter.query.value).toEqual({ page: '1' })
    scope.stop()
  })

  it('falls back to true when neither the instance nor the adapter set it', async () => {
    const { adapter, engine, scope } = setup(schema)

    engine.query.set('page', 1)
    await flush()

    expect(adapter.query.value).toEqual({})
    scope.stop()
  })

  it('lets the instance-level option override the adapter default', async () => {
    const { adapter, engine, scope } = setup(schema, { clearOnDefault: true, adapterClearOnDefault: false })

    engine.query.set('page', 1)
    await flush()

    expect(adapter.query.value).toEqual({})
    scope.stop()
  })
})

describe('createQueryStateEngine: optimistic overlay', () => {
  it('reflects a pending clear before the URL catches up', () => {
    const schema = { q: queryParam('q', codecs.string) }
    const { adapter, engine, scope } = setup(schema)
    adapter.query.value = { q: 'phone' }

    engine.query.set('q', undefined)

    expect(engine.state.selected.value.q).toBeUndefined()
    scope.stop()
  })
})
