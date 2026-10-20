import type { QueryAdapter } from '../../../../src/core/runtime/adapter'
import type { QueryStateSchema } from '../../../../src/core/schema/schema'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { effectScope, watch } from 'vue'
import { createTestingAdapter } from '../../../../src/adapters/testing'
import { codecs } from '../../../../src/core/codecs/catalog'
import { createCodec } from '../../../../src/core/codecs/codec'
import { resetQueryRuntime } from '../../../../src/core/runtime/adapter-runtime'
import { createQueryStateEngine } from '../../../../src/core/runtime/engine'
import { parseQueryStates } from '../../../../src/core/schema/operations'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { installWrite } from '../../../helpers/pipeline'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

const schema = {
  q: queryParam('q', codecs.string),
  sort: queryParam('filters.sort', codecs.string),
}

function createEngine<TSchema extends QueryStateSchema>(adapter: QueryAdapter, schema: TSchema) {
  const scope = effectScope()
  onTestFinished(() => {
    try {
      scope.stop()
    }
    finally {
      resetQueryRuntime(adapter)
    }
  })
  const engine = scope.run(() => createQueryStateEngine({
    id: 'transaction-test',
    schema,
    adapter,
  }))!

  return { engine, scope }
}

describe('query transactions', () => {
  it('applies a multi-key write atomically before emitting one frozen start', async () => {
    const onUrlUpdate = vi.fn()
    const adapter = createTestingAdapter({ hasMemory: true, onUrlUpdate })
    const { engine } = createEngine(adapter, schema)
    const origin = Symbol('module')
    const starts: unknown[] = []

    engine.query.transactions.observe({
      start: (transaction) => {
        starts.push({
          transaction,
          explicitValues: { ...engine.state.explicitValues.value },
        })
      },
    })

    engine.query.transact({
      mode: 'patch',
      values: { q: 'sale', sort: 'name' },
      navigation: { history: 'push' },
      origin,
    })

    expect(starts).toHaveLength(1)
    expect(starts[0]).toMatchObject({
      transaction: {
        id: 1,
        mode: 'patch',
        keys: ['q', 'sort'],
        paths: ['q', 'filters.sort'],
        origin,
      },
      explicitValues: { q: 'sale', sort: 'name' },
    })

    const transaction = (starts[0] as { transaction: object & { keys: object, paths: object } }).transaction

    expect(Object.isFrozen(transaction)).toBe(true)
    expect(Object.isFrozen(transaction.keys)).toBe(true)
    expect(Object.isFrozen(transaction.paths)).toBe(true)
    expect(onUrlUpdate).not.toHaveBeenCalled()

    await flush()

    expect(onUrlUpdate).toHaveBeenCalledOnce()
    expect(onUrlUpdate).toHaveBeenCalledWith(expect.objectContaining({
      query: { q: 'sale', filters: { sort: 'name' } },
      options: expect.objectContaining({ history: 'push' }),
    }))
  })

  it('gives each start of a reentrant write its causal id and the complete optimistic state', () => {
    const adapter = createTestingAdapter()
    const { engine, scope } = createEngine(adapter, schema)
    const starts: Array<{ id: number, keys: readonly string[], explicitValues: object }> = []

    engine.query.transactions.observe({
      start: transaction => starts.push({
        id: transaction.id,
        keys: transaction.keys,
        explicitValues: { ...engine.state.explicitValues.value },
      }),
    })

    scope.run(() => watch(
      () => engine.state.explicitValues.value.q,
      (value) => {
        if (value === 'outer') {
          engine.query.transact({ mode: 'patch', values: { sort: 'inner' } })
        }
      },
      { flush: 'sync' },
    ))

    engine.query.transact({ mode: 'patch', values: { q: 'outer' } })

    expect(starts).toEqual([
      { id: 1, keys: ['q'], explicitValues: { q: 'outer', sort: 'inner' } },
      { id: 2, keys: ['sort'], explicitValues: { q: 'outer', sort: 'inner' } },
    ])
  })

  it('skips an empty patch without allocating an id', () => {
    const adapter = createTestingAdapter()
    const { engine } = createEngine(adapter, schema)
    const starts = vi.fn()
    engine.query.transactions.observe({ start: starts })

    engine.query.transact({ mode: 'patch', values: {} })
    engine.query.transact({ mode: 'patch', values: { q: 'sale' } })

    expect(starts).toHaveBeenCalledOnce()
    expect(starts).toHaveBeenCalledWith(expect.objectContaining({ id: 1, keys: ['q'] }))
  })

  it('clears explicit undefined entries and preserves omitted params in a patch', async () => {
    const onUrlUpdate = vi.fn()
    const adapter = createTestingAdapter({
      searchParams: { q: 'phone', filters: { sort: 'name', keep: '' }, other: 'keep' },
      hasMemory: true,
      onUrlUpdate,
    })
    const { engine } = createEngine(adapter, schema)
    const starts = vi.fn()
    engine.query.transactions.observe({ start: starts })

    engine.query.transact({ mode: 'patch', values: { sort: undefined } })

    expect(starts).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      id: 1,
      mode: 'patch',
      keys: ['sort'],
      paths: ['filters.sort'],
    }))
    expect(engine.state.explicitValues.value).toEqual({ q: 'phone' })

    await flush()

    expect(adapter.query.value).toEqual({ q: 'phone', filters: { keep: '' }, other: 'keep' })
    expect(onUrlUpdate).toHaveBeenCalledOnce()
  })

  it('treats absent and undefined replace entries as clears', async () => {
    const adapter = createTestingAdapter({
      searchParams: { q: 'phone', filters: { sort: 'name' } },
      hasMemory: true,
    })
    const { engine } = createEngine(adapter, schema)
    const starts = vi.fn()
    engine.query.transactions.observe({ start: starts })

    engine.query.transact({ mode: 'replace', values: { q: undefined } })

    expect(starts).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'replace',
      keys: ['q', 'sort'],
      paths: ['q', 'filters.sort'],
    }))
    expect(engine.state.explicitValues.value).toEqual({})

    await flush()
    expect(adapter.query.value).toEqual({})
  })

  it('can preserve an explicit value equal to its resolved default', async () => {
    const adapter = createTestingAdapter({ hasMemory: true })
    const { engine } = createEngine(adapter, {
      page: queryParam('page', codecs.integer.withDefault(1)),
      q: queryParam('q', codecs.string),
    })

    engine.query.transact({
      mode: 'replace',
      values: { page: 1 },
      defaultPolicy: 'preserve-explicit',
    })

    expect(engine.state.explicitValues.value).toEqual({ page: 1 })
    await flush()
    expect(adapter.query.value).toEqual({ page: '1' })
  })

  it('preserve-explicit still clears omitted replacement entries and runs the write pipeline', async () => {
    const adapter = createTestingAdapter({
      searchParams: { q: 'stale' },
      hasMemory: true,
    })
    const { engine } = createEngine(adapter, {
      page: queryParam('page', codecs.integer.withDefault(1)),
      q: queryParam('q', codecs.string),
    })
    installWrite(engine, values => ({
      ...values,
      page: typeof values.page === 'number' ? values.page + 1 : values.page,
    }))

    engine.query.transact({
      mode: 'replace',
      values: { page: 1 },
      defaultPolicy: 'preserve-explicit',
    })

    await flush()
    expect(adapter.query.value).toEqual({ page: '2' })
  })

  it.each(['patch', 'replace'] as const)('preserves null as a codec value during %s', async (mode) => {
    const nullable = createCodec<string | null>({
      parse: raw => raw === 'null' ? null : typeof raw === 'string' ? raw : undefined,
      serialize: value => value === null ? 'null' : value,
    })
    const adapter = createTestingAdapter({ hasMemory: true })
    const { engine } = createEngine(adapter, {
      value: queryParam('value', nullable),
    })

    engine.query.transact({ mode, values: { value: null } })

    expect(engine.state.explicitValues.value).toEqual({ value: null })
    await flush()
    expect(adapter.query.value).toEqual({ value: 'null' })
  })

  it('emits starts for explicit no-op writes without suppressing navigation', async () => {
    const onUrlUpdate = vi.fn()
    const adapter = createTestingAdapter({ searchParams: { q: 'same' }, onUrlUpdate })
    const { engine } = createEngine(adapter, schema)
    const starts = vi.fn()
    engine.query.transactions.observe({ start: starts })

    engine.query.transact({ mode: 'patch', values: { q: 'same' } })
    engine.query.transact({ mode: 'patch', values: { sort: undefined } })

    expect(starts).toHaveBeenCalledTimes(2)
    expect(starts.mock.calls[0]![0]).toMatchObject({ id: 1, keys: ['q'] })
    expect(starts.mock.calls[1]![0]).toMatchObject({ id: 2, keys: ['sort'] })

    await flush()
    expect(onUrlUpdate).toHaveBeenCalledOnce()
  })

  it('validates and serializes the whole request before changing the runtime', async () => {
    const onUrlUpdate = vi.fn()
    const adapter = createTestingAdapter({ onUrlUpdate })
    const { engine } = createEngine(adapter, schema)
    const starts = vi.fn()
    engine.query.transactions.observe({ start: starts })
    installWrite(engine, (values) => {
      if ('sort' in values) {
        throw new Error('cannot serialize sort')
      }

      return values
    })

    expect(() => engine.query.transact({
      mode: 'patch',
      values: { q: 'sale', sort: 'name' },
    })).toThrow('cannot serialize sort')

    expect(() => engine.query.transact({
      mode: 'patch',
      // @ts-expect-error exercise runtime validation for untyped callers
      values: { unknown: 'value' },
    })).toThrow('cannot write unknown query-state key "unknown"')

    expect(engine.state.explicitValues.value).toEqual({})
    expect(starts).not.toHaveBeenCalled()
    await flush()
    expect(onUrlUpdate).not.toHaveBeenCalled()
  })

  it('projects starts across overlapping bindings on the same adapter', () => {
    const adapter = createTestingAdapter()
    const { engine: writer } = createEngine(adapter, schema)
    const { engine: observer } = createEngine(adapter, {
      sortAlias: queryParam('filters.sort', codecs.string),
      search: queryParam('q', codecs.string),
      page: queryParam('page', codecs.integer),
    })
    const starts = vi.fn()
    observer.query.transactions.observe({ start: starts })

    writer.query.transact({ mode: 'patch', values: { q: 'sale', sort: 'name' } })

    expect(starts).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'patch',
      keys: ['sortAlias', 'search'],
      paths: ['q', 'filters.sort'],
    }))
  })

  it('does not notify non-overlapping schemas or another adapter', () => {
    const firstAdapter = createTestingAdapter()
    const secondAdapter = createTestingAdapter()
    const { engine: writer } = createEngine(firstAdapter, schema)
    const { engine: sibling } = createEngine(firstAdapter, {
      page: queryParam('page', codecs.integer),
    })
    const { engine: isolated } = createEngine(secondAdapter, {
      q: queryParam('q', codecs.string),
    })
    const siblingStart = vi.fn()
    const isolatedStart = vi.fn()
    sibling.query.transactions.observe({ start: siblingStart })
    isolated.query.transactions.observe({ start: isolatedStart })

    writer.query.transact({ mode: 'patch', values: { q: 'sale' } })

    expect(siblingStart).not.toHaveBeenCalled()
    expect(isolatedStart).not.toHaveBeenCalled()
  })

  it('isolates observer errors and snapshots listeners during dispatch', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const adapter = createTestingAdapter()
    const { engine } = createEngine(adapter, schema)
    const surviving = vi.fn()
    const late = vi.fn()
    let registered = false

    engine.query.transactions.observe({
      start: () => {
        if (!registered) {
          registered = true
          engine.query.transactions.observe({ start: late })
        }

        throw new Error('observer failed')
      },
    })
    const stop = engine.query.transactions.observe({ start: surviving })

    engine.query.transact({ mode: 'patch', values: { q: 'one' } })
    expect(surviving).toHaveBeenCalledOnce()
    expect(late).not.toHaveBeenCalled()

    stop()
    engine.query.transact({ mode: 'patch', values: { q: 'two' } })

    expect(surviving).toHaveBeenCalledOnce()
    expect(late).toHaveBeenCalledOnce()
    expect(consoleError).toHaveBeenCalledTimes(2)

    consoleError.mockRestore()
  })

  it('allows a start observer to create a new transaction with the next id', () => {
    const adapter = createTestingAdapter()
    const { engine } = createEngine(adapter, schema)
    const starts: Array<{ id: number, keys: readonly string[] }> = []

    engine.query.transactions.observe({
      start: (transaction) => {
        starts.push(transaction)

        if (transaction.id === 1) {
          engine.query.transact({ mode: 'patch', values: { sort: 'name' } })
        }
      },
    })

    engine.query.transact({ mode: 'patch', values: { q: 'sale' } })

    expect(starts).toEqual([
      expect.objectContaining({ id: 1, keys: ['q'] }),
      expect.objectContaining({ id: 2, keys: ['sort'] }),
    ])
  })

  it('decodes query values without injecting defaults or running a pipeline', () => {
    const schema = {
      q: queryParam('q', codecs.string.withDefault('default')),
    }

    expect(parseQueryStates(schema, {})).toEqual({})
    expect(parseQueryStates(schema, { q: 'sale' })).toEqual({ q: 'sale' })
  })
})

describe('full-request write policy', () => {
  const wide = {
    q: queryParam('q', codecs.string),
    sort: queryParam('filters.sort', codecs.string),
    page: queryParam('page', codecs.integer),
  }

  it('runs each write callback once with every param of the request', () => {
    const adapter = createTestingAdapter({ hasMemory: true })
    const { engine } = createEngine(adapter, wide)
    const write = vi.fn((values: Record<string, unknown>) => values)
    installWrite(engine, write)

    engine.query.transact({ mode: 'patch', values: { q: 'sale', sort: 'name' } })

    expect(write).toHaveBeenCalledOnce()
    expect(write.mock.calls[0]![0]).toEqual({ q: 'sale', sort: 'name' })
  })

  it('applies a param added by a callback in the same transaction', async () => {
    const adapter = createTestingAdapter({ hasMemory: true })
    const { engine } = createEngine(adapter, wide)
    const starts = vi.fn()
    engine.query.transactions.observe({ start: starts })
    installWrite(engine, values => ({ ...values, sort: 'added' }))

    engine.query.transact({ mode: 'patch', values: { q: 'sale' } })

    expect(starts).toHaveBeenCalledOnce()
    expect(starts.mock.calls[0]![0].keys).toEqual(['q', 'sort'])
    await flush()
    expect(adapter.query.value).toEqual({ q: 'sale', filters: { sort: 'added' } })
  })

  it('clears a param introduced by an earlier callback and removed by a later one', async () => {
    const adapter = createTestingAdapter({
      searchParams: { 'filters.sort': 'old', 'page': '3' },
      hasMemory: true,
    })
    const { engine } = createEngine(adapter, wide)
    installWrite(engine, values => ({ ...values, sort: 'introduced' }))
    installWrite(engine, ({ sort: _sort, ...rest }) => rest, { optional: [['sort']] })

    engine.query.transact({ mode: 'patch', values: { q: 'sale' } })

    await flush()
    expect(adapter.query.value).toEqual({ q: 'sale', page: '3' })
  })

  it('leaves a param the patch and callbacks never touched unchanged', async () => {
    const adapter = createTestingAdapter({ searchParams: { page: '3' }, hasMemory: true })
    const { engine } = createEngine(adapter, wide)
    installWrite(engine, values => values)

    engine.query.transact({ mode: 'patch', values: { q: 'sale' } })

    await flush()
    expect(adapter.query.value).toEqual({ q: 'sale', page: '3' })
  })

  it('rejects an output key outside the schema before any publication', async () => {
    const onUrlUpdate = vi.fn()
    const adapter = createTestingAdapter({ onUrlUpdate })
    const { engine } = createEngine(adapter, wide)
    const starts = vi.fn()
    engine.query.transactions.observe({ start: starts })
    installWrite(engine, values => ({ ...values, unknown: 'value' }))

    expect(() => engine.query.transact({ mode: 'patch', values: { q: 'sale' } })).toThrow(/unknown/)

    expect(engine.state.explicitValues.value).toEqual({})
    expect(starts).not.toHaveBeenCalled()
    await flush()
    expect(onUrlUpdate).not.toHaveBeenCalled()
  })

  it('publishes no earlier part when a later param fails to serialize', async () => {
    const failing = createCodec<string>({
      parse: raw => typeof raw === 'string' ? raw : undefined,
      serialize: () => {
        throw new Error('cannot encode')
      },
    })
    const onUrlUpdate = vi.fn()
    const adapter = createTestingAdapter({ onUrlUpdate })
    const { engine } = createEngine(adapter, { q: queryParam('q', codecs.string), bad: queryParam('bad', failing) })
    const starts = vi.fn()
    engine.query.transactions.observe({ start: starts })

    expect(() => engine.query.transact({ mode: 'patch', values: { q: 'sale', bad: 'x' } })).toThrow('cannot encode')

    expect(engine.state.explicitValues.value).toEqual({})
    expect(starts).not.toHaveBeenCalled()
    await flush()
    expect(onUrlUpdate).not.toHaveBeenCalled()
  })

  it('hands callbacks the request as supplied, including explicit undefined and set metadata only', () => {
    const adapter = createTestingAdapter({ searchParams: { q: 'old' }, hasMemory: true })
    const { engine } = createEngine(adapter, wide)
    const origin = Symbol('module')
    const seen: Array<{ request: Record<string, unknown>, values: Record<string, unknown> }> = []
    installWrite(engine, (values, context) => {
      seen.push({ request: context.request, values })
      return values
    }, { optional: [['q']] })

    engine.query.transact({ mode: 'patch', values: { q: undefined, page: 2 }, origin, navigation: { history: 'push' }, defaultPolicy: 'preserve-explicit' })
    engine.query.transact({ mode: 'replace', values: { page: 4 } })

    expect(seen[0]!.request).toEqual({ mode: 'patch', values: { q: undefined, page: 2 }, origin, navigation: { history: 'push' }, defaultPolicy: 'preserve-explicit' })
    expect(Object.hasOwn(seen[0]!.request.values as object, 'q')).toBe(true)
    expect(Object.keys(seen[1]!.request)).toEqual(['mode', 'values'])
    expect(seen[1]!.values).toEqual({ page: 4 })
  })

  it('shows every callback the same effective query, including earlier optimistic writes', () => {
    const adapter = createTestingAdapter({ hasMemory: true })
    const { engine } = createEngine(adapter, wide)
    const queries: unknown[] = []
    installWrite(engine, (values, context) => {
      queries.push(context.query)
      return { ...values, sort: 'one' }
    })
    installWrite(engine, (values, context) => {
      queries.push(context.query)
      return values
    })

    engine.query.transact({ mode: 'patch', values: { q: 'first' } })
    queries.length = 0
    engine.query.transact({ mode: 'patch', values: { page: 2 } })

    expect(queries).toHaveLength(2)
    expect(queries[0]).toBe(queries[1])
    expect(queries[0]).toMatchObject({ q: 'first' })
  })

  it('clears omitted params in a replacement while callbacks see only the supplied values', async () => {
    const adapter = createTestingAdapter({ searchParams: { q: 'old', page: '3' }, hasMemory: true })
    const { engine } = createEngine(adapter, wide)
    const seen: unknown[] = []
    installWrite(engine, (values) => {
      seen.push({ ...values })
      return values
    })

    engine.query.transact({ mode: 'replace', values: { sort: 'name' } })

    await flush()
    expect(seen).toEqual([{ sort: 'name' }])
    expect(adapter.query.value).toEqual({ filters: { sort: 'name' } })
  })
})
