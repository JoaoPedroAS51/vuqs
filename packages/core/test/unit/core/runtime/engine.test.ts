import type { QueryStateSchema } from '../../../../src/core/schema/schema'
import { describe, expect, it, onTestFinished } from 'vitest'
import { effectScope } from 'vue'
import { createTestingAdapter } from '../../../../src/adapters/testing'
import { codecs } from '../../../../src/core/codecs/catalog'
import { createQueryStateEngine } from '../../../../src/core/runtime/engine'
import { queryParam } from '../../../../src/core/schema/params/query-param'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

// createQueryStateEngine is public API (exported from the package root) for
// consumers building their own composable on top of it. useQueryState(s) always
// goes through the binding layer, which pre-resolves clearOnDefault before the
// schema reaches the engine, so its own fallback chain needs its own direct
// coverage here.
function setup(schema: Parameters<typeof createQueryStateEngine>[0]['schema'], engineOptions: Partial<Parameters<typeof createQueryStateEngine>[0]> = {}) {
  const adapter = createTestingAdapter({ hasMemory: true })
  const scope = effectScope()
  onTestFinished(() => {
    try {
      scope.stop()
    }
    finally {
      adapter.resetQueue()
    }
  })
  const engine = scope.run(() => createQueryStateEngine({
    id: 'test',
    schema,
    adapter,
    ...engineOptions,
  }))!

  return { adapter, engine, scope }
}

describe('createQueryStateEngine: clearOnDefault precedence', () => {
  const schema = { page: queryParam('page', codecs.integer.withDefault(1)) }

  it('falls back to the adapter-level default when nothing more specific is set', async () => {
    const { adapter, engine, scope } = setup(schema, { adapterClearOnDefault: false })

    engine.query.transact({ mode: 'patch', values: { page: 1 } })
    await flush()

    expect(adapter.query.value).toEqual({ page: '1' })
    scope.stop()
  })

  it('falls back to true when neither the instance nor the adapter set it', async () => {
    const { adapter, engine, scope } = setup(schema)

    engine.query.transact({ mode: 'patch', values: { page: 1 } })
    await flush()

    expect(adapter.query.value).toEqual({})
    scope.stop()
  })

  it('the instance-level option overrides the adapter default', async () => {
    const { adapter, engine, scope } = setup(schema, { clearOnDefault: true, adapterClearOnDefault: false })

    engine.query.transact({ mode: 'patch', values: { page: 1 } })
    await flush()

    expect(adapter.query.value).toEqual({})
    scope.stop()
  })

  it('compares writes with the resolved default after the read pipeline', async () => {
    const transformedSchema = { q: queryParam('q', codecs.string.withDefault('default')) }
    const { adapter, engine, scope } = setup(transformedSchema)
    engine.pipeline.tap('read', values => ({
      ...values,
      q: typeof values.q === 'string' ? values.q.toUpperCase() : values.q,
    }))
    engine.pipeline.tap('write', values => ({
      ...values,
      q: typeof values.q === 'string' ? values.q.toLowerCase() : values.q,
    }))

    engine.query.transact({ mode: 'patch', values: { q: 'DEFAULT' } })
    await flush()

    expect(adapter.query.value).toEqual({})
    scope.stop()
  })
})

describe('createQueryStateEngine: value resolution', () => {
  it('retains the keys and static defaults captured at creation', () => {
    const schema: QueryStateSchema = { page: queryParam('page', codecs.integer.withDefault(1)) }
    const { adapter, engine, scope } = setup(schema)

    try {
      expect(engine.state.values.value).toEqual({ page: 1 })
      schema.page = queryParam('page', codecs.integer.withDefault(9))
      schema.extra = queryParam('extra', codecs.string.withDefault('late'))
      adapter.query.value = { page: '2', extra: 'incoming' }

      expect(engine.state.values.value).toEqual({ page: 2 })
      adapter.query.value = {}
      expect(engine.state.values.value).toEqual({ page: 1 })
    }
    finally {
      scope.stop()
    }
  })

  it('runs the read pipeline after resolving selections and defaults', () => {
    const { adapter, engine, scope } = setup({ page: queryParam('page', codecs.integer.withDefault(1)) })
    engine.pipeline.tap('read', values => ({ ...values, page: Number(values.page) + 10 }))

    try {
      expect(engine.defaults.resolved.value).toEqual({ page: 11 })
      expect(engine.state.values.value).toEqual({ page: 11 })
      adapter.query.value = { page: '2' }
      expect(engine.state.values.value).toEqual({ page: 12 })
    }
    finally {
      scope.stop()
    }
  })
})

describe('createQueryStateEngine: optimistic overlay', () => {
  it('reflects a pending clear before the URL catches up', () => {
    const schema = { q: queryParam('q', codecs.string) }
    const { adapter, engine, scope } = setup(schema)
    adapter.query.value = { q: 'phone' }

    engine.query.transact({ mode: 'patch', values: { q: undefined } })

    expect(engine.state.selected.value.q).toBeUndefined()
    scope.stop()
  })
})

describe('createQueryStateEngine: schema validation', () => {
  it('rejects duplicate paths for direct engine callers', () => {
    const clashing = {
      first: queryParam('shared', codecs.string),
      second: queryParam('shared', codecs.string),
    }

    expect(() => setup(clashing)).toThrow('duplicate query path "shared"')
  })
})
