import type { QueryCore } from '../../../../src/core/module-system/query-core'
import type { StoredQuerySnapshot } from '../../../../src/modules/storage/snapshot'
import type { QueryStorage } from '../../../../src/modules/storage/storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useQueryState } from '../../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../../src/core/bindings/use-query-states'
import { codecs } from '../../../../src/core/codecs/catalog'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { withStorage } from '../../../../src/modules/storage/storage'
import { withTestQuery as setup } from '../../../helpers/adapter'
import { createMemoryStorage, snapshot } from '../../../helpers/storage'
import { deferred, flushMicrotasks, schema, stubBrowserEnvironment } from './helpers'

describe('withStorage restoration', () => {
  beforeEach(stubBrowserEnvironment)

  it('restores one complete stored selection into an empty URL with replace history', async () => {
    const memory = createMemoryStorage(snapshot({ q: 'stored', page: '2' }))
    const { query, navigate, build } = setup()
    const state = build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    })))

    expect(state.storage.status.value).toBe('restoring')

    await state.storage.ready
    await flushMicrotasks()

    expect(state.values).toEqual({ q: 'stored', page: 2 })
    expect(query.value).toEqual({ q: 'stored', page: '2' })
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith(
      { q: 'stored', page: '2' },
      { history: 'replace' },
    )
    expect(memory.save).toHaveBeenLastCalledWith('filters', {
      format: 1,
      savedAt: 100,
      query: { q: 'stored', page: '2' },
    })
  })

  it('a non-empty URL wins without partially merging stored fields', async () => {
    const memory = createMemoryStorage(snapshot({ q: 'stored', page: 5 }))
    const { query, navigate, build } = setup({ q: 'url' })
    const state = build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
      version: 'v2',
    })))

    await state.storage.ready

    expect(query.value).toEqual({ q: 'url' })
    expect(navigate).not.toHaveBeenCalled()
    expect(memory.save).toHaveBeenCalledWith('filters', {
      format: 1,
      version: 'v2',
      savedAt: 100,
      query: { q: 'url' },
    })
  })

  it('does nothing when both the URL selection and storage are empty', async () => {
    const memory = createMemoryStorage()
    const { build } = setup()
    const state = build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    })))

    await state.storage.ready
    await state.storage.flush()

    expect(memory.load).toHaveBeenCalledOnce()
    expect(memory.save).not.toHaveBeenCalled()
    expect(memory.remove).not.toHaveBeenCalled()
  })

  it('never loads under restore never and mirrors the current selection instead', async () => {
    const memory = createMemoryStorage(snapshot({ q: 'stored' }))
    const { build } = setup({ q: 'url' })
    const state = build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
      restore: 'never',
    })))

    await state.storage.ready

    expect(memory.load).not.toHaveBeenCalled()
    expect(memory.save).toHaveBeenLastCalledWith('filters', {
      format: 1,
      savedAt: 100,
      query: { q: 'url' },
    })
  })

  it('removes storage under restore never when the current selection is empty', async () => {
    const memory = createMemoryStorage(snapshot({ q: 'stored' }))
    const { build } = setup()
    const state = build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
      restore: 'never',
    })))

    await state.storage.ready

    expect(memory.load).not.toHaveBeenCalled()
    expect(memory.remove).toHaveBeenCalledWith('filters')
    expect(memory.current()).toBeUndefined()
  })

  it.each(['ref', 'patch'] as const)('an early %s clear beats a stale async snapshot', async (writer) => {
    const pending = deferred<StoredQuerySnapshot | undefined>()
    const memory = createMemoryStorage()
    memory.load.mockImplementation(() => pending.promise)
    const test = setup()
    const state = test.build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    })))
    const sibling = test.build(() => useQueryState('q'))

    if (writer === 'ref') {
      sibling.clear()
    }
    else {
      state.patch({ q: undefined })
    }
    pending.resolve(snapshot({ q: 'stale' }))
    await state.storage.ready

    expect(test.query.value).toEqual({})
    expect(memory.remove).toHaveBeenCalledWith('filters')
    expect(memory.save).not.toHaveBeenCalled()
  })

  it('an external URL change during load beats the stored snapshot', async () => {
    const pending = deferred<StoredQuerySnapshot | undefined>()
    const memory = createMemoryStorage()
    memory.load.mockImplementation(() => pending.promise)
    const { query, build } = setup()
    const state = build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    })))

    await flushMicrotasks()
    query.value = { q: 'external' }
    pending.resolve(snapshot({ q: 'stale' }))
    await state.storage.ready

    expect(query.value).toEqual({ q: 'external' })
    expect(memory.save).toHaveBeenLastCalledWith('filters', {
      format: 1,
      savedAt: 100,
      query: { q: 'external' },
    })
  })

  it('retries the initial mirror when the source changes during its first write', async () => {
    const firstWrite = deferred<void>()
    const latestWrite = deferred<void>()
    const saves: StoredQuerySnapshot[] = []
    const storage: QueryStorage = {
      load: () => undefined,
      save: (_key, next) => {
        saves.push(next)
        return saves.length === 1 ? firstWrite.promise : latestWrite.promise
      },
      remove: () => undefined,
    }
    const { build } = setup({ q: 'initial' })
    const state = build(() => useQueryStates(schema).use(withStorage({ key: 'filters', storage })))

    await flushMicrotasks()
    expect(saves.map(item => item.query)).toEqual([{ q: 'initial' }])

    state.patch({ q: 'latest' })
    await flushMicrotasks()
    firstWrite.resolve()
    await vi.waitFor(() => {
      expect(saves.map(item => item.query)).toEqual([{ q: 'initial' }, { q: 'latest' }])
    })

    let ready = false
    void state.storage.ready.then(() => {
      ready = true
    })
    expect(ready).toBe(false)

    latestWrite.resolve()
    await state.storage.ready
    expect(ready).toBe(true)
  })

  it('does not persist codec defaults', async () => {
    const defaultsSchema = {
      page: queryParam('page', codecs.integer.withDefault(1)),
    }
    const memory = createMemoryStorage()
    const { build } = setup()
    const state = build(() => useQueryStates(defaultsSchema)
      .use(withStorage({ key: 'filters', storage: memory.storage })))

    await state.storage.ready
    await state.storage.flush()

    expect(state.values).toEqual({ page: 1 })
    expect(memory.save).not.toHaveBeenCalled()
    expect(memory.remove).not.toHaveBeenCalled()
  })

  it('round-trips post-read selection through the write pipeline', async () => {
    const pipelineModule = (core: QueryCore<typeof schema>) => {
      core.pipeline.tap('read', values => ({
        ...values,
        q: typeof values.q === 'string' ? values.q.toUpperCase() : values.q,
      }))
      core.pipeline.tap('write', values => ({
        ...values,
        q: typeof values.q === 'string' ? values.q.toLowerCase() : values.q,
      }))
      return {}
    }
    const persisted = createMemoryStorage()
    const first = setup({ q: 'source' })
    const source = first.build(() => useQueryStates(schema)
      .use(pipelineModule)
      .use(withStorage({ key: 'filters', storage: persisted.storage })))

    await source.storage.ready

    expect(source.values.q).toBe('SOURCE')
    expect((persisted.current() as StoredQuerySnapshot).query).toEqual({ q: 'SOURCE' })

    const restored = createMemoryStorage(persisted.current())
    const second = setup()
    const target = second.build(() => useQueryStates(schema)
      .use(pipelineModule)
      .use(withStorage({ key: 'filters', storage: restored.storage })))

    await target.storage.ready
    await flushMicrotasks()

    expect(second.query.value).toEqual({ q: 'source' })
    expect(target.values.q).toBe('SOURCE')
    expect((restored.current() as StoredQuerySnapshot).query).toEqual({ q: 'SOURCE' })
  })
})
