import type { QueryAdapter } from '../../src/core/adapter'
import type { QueryStateSchema } from '../../src/core/schema'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, watch } from 'vue'
import { createTestingAdapter } from '../../src/adapters/testing'
import { codecs, createCodec } from '../../src/core/codec'
import { createQueryStateEngine, parseRawQuerySelection } from '../../src/core/engine'
import { queryParam } from '../../src/core/query-param'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

const schema = {
  q: queryParam('q', codecs.string),
  sort: queryParam('filters.sort', codecs.string),
}

function createEngine<TSchema extends QueryStateSchema>(adapter: QueryAdapter, selectedSchema: TSchema) {
  const scope = effectScope()
  const engine = scope.run(() => createQueryStateEngine({
    id: 'transaction-test',
    schema: selectedSchema,
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
          selected: { ...engine.state.selected.value },
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
      selected: { q: 'sale', sort: 'name' },
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

  it('preserves causal ids when a sync watcher writes during overlay application', () => {
    const adapter = createTestingAdapter()
    const { engine, scope } = createEngine(adapter, schema)
    const starts: Array<{ id: number, keys: readonly string[] }> = []

    engine.query.transactions.observe({
      start: transaction => starts.push(transaction),
    })

    scope.run(() => watch(
      () => engine.state.selected.value.q,
      (value) => {
        if (value === 'outer') {
          engine.query.transact({ mode: 'patch', values: { sort: 'inner' } })
        }
      },
      { flush: 'sync' },
    ))

    engine.query.transact({ mode: 'patch', values: { q: 'outer' } })

    expect(starts).toEqual([
      expect.objectContaining({ id: 1, keys: ['q'] }),
      expect.objectContaining({ id: 2, keys: ['sort'] }),
    ])
  })

  it('skips an empty patch and undefined patch entries without allocating an id', () => {
    const adapter = createTestingAdapter()
    const { engine } = createEngine(adapter, schema)
    const starts = vi.fn()
    engine.query.transactions.observe({ start: starts })

    engine.query.transact({ mode: 'patch', values: {} })
    engine.query.transact({ mode: 'patch', values: { q: undefined } })
    engine.query.transact({ mode: 'patch', values: { q: 'sale' } })

    expect(starts).toHaveBeenCalledOnce()
    expect(starts).toHaveBeenCalledWith(expect.objectContaining({ id: 1, keys: ['q'] }))
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
    expect(engine.state.selected.value).toEqual({})

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

    expect(engine.state.selected.value).toEqual({ page: 1 })
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
    engine.pipeline.tap('write', values => ({
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

  it('preserves null as a legitimate codec value during replacement', async () => {
    const nullable = createCodec<string | null>({
      parse: raw => raw === 'null' ? null : typeof raw === 'string' ? raw : undefined,
      serialize: value => value === null ? 'null' : value,
    })
    const adapter = createTestingAdapter({ hasMemory: true })
    const { engine } = createEngine(adapter, {
      value: queryParam('value', nullable),
    })

    engine.query.transact({ mode: 'replace', values: { value: null } })

    expect(engine.state.selected.value).toEqual({ value: null })
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
    engine.query.transact({ mode: 'patch', values: { sort: null } })

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
    engine.pipeline.tap('write', (values) => {
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

    expect(engine.state.selected.value).toEqual({})
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

  it('parses a raw selection without injecting defaults or running a pipeline', () => {
    const selectedSchema = {
      q: queryParam('q', codecs.string.withDefault('default')),
    }

    expect(parseRawQuerySelection(selectedSchema, {})).toEqual({})
    expect(parseRawQuerySelection(selectedSchema, { q: 'sale' })).toEqual({ q: 'sale' })
  })
})
