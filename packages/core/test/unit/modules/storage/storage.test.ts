import type { QueryCore } from '../../../../src/core/query-core'
import type { QueryStorage, StorageControls, StoredQuerySnapshot } from '../../../../src/modules/storage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, createRenderer, effectScope } from 'vue'
import { createTestingAdapter } from '../../../../src/adapters/testing'
import { installQueryAdapter } from '../../../../src/core/adapter'
import { codecs, createCodec } from '../../../../src/core/codec'
import { queryParam } from '../../../../src/core/query-param'
import { useQueryState } from '../../../../src/core/use-query-state'
import { useQueryStates } from '../../../../src/core/use-query-states'
import { createWebStorage, withStorage } from '../../../../src/modules/storage'
import { withTestQuery as setup } from '../../../helpers/adapter'
import { createMemoryStorage, snapshot } from '../../../helpers/storage'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (cause: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })

  return { promise, resolve, reject }
}

const schema = {
  q: queryParam('q', codecs.string),
  page: queryParam('page', codecs.integer),
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.stubGlobal('window', {})
  vi.spyOn(Date, 'now').mockReturnValue(100)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('withStorage contract', () => {
  it.each([
    [undefined, 'options are required'],
    [null, 'options are required'],
    [{}, '`key` must be a non-empty string'],
    [{ key: '  ', storage: {} }, '`key` must be a non-empty string'],
    [{ key: 'query', storage: {}, restore: 'always' }, '`restore` must be "if-empty" or "never"'],
    [{ key: 'query', storage: {}, version: 1 }, '`version` must be a string'],
    [{ key: 'query' }, '`storage` must implement load(), save(), and remove()'],
    [{ key: 'query', storage: null }, '`storage` must implement load(), save(), and remove()'],
    [{ key: 'query', storage: 'invalid' }, '`storage` must implement load(), save(), and remove()'],
    [{ key: 'query', storage: { load: true, save: () => undefined, remove: () => undefined } }, '`storage` must implement load(), save(), and remove()'],
    [{ key: 'query', storage: { load: (): undefined => undefined } }, '`storage` must implement load(), save(), and remove()'],
    [{ key: 'query', storage: { load: (): undefined => undefined, save: (): undefined => undefined } }, '`storage` must implement load(), save(), and remove()'],
  ])('throws synchronously for invalid options %#', (options, message) => {
    const { build } = setup()

    expect(() => build(() => useQueryStates(schema).use(withStorage(options as never))))
      .toThrow(message)
  })

  it('supports grouped and single-param facades with one controls shape', async () => {
    const groupedMemory = createMemoryStorage(snapshot({ q: 'grouped' }))
    const groupedSetup = setup()
    const grouped = groupedSetup.build(() => useQueryStates(schema).use(withStorage({
      key: 'grouped',
      storage: groupedMemory.storage,
    })))

    const singleMemory = createMemoryStorage(snapshot({ q: 'single' }))
    const singleSetup = setup()
    const single = singleSetup.build(() => useQueryState('q').use(withStorage({
      key: 'single',
      storage: singleMemory.storage,
    })))

    await Promise.all([grouped.storage.ready, single.storage.ready])

    expect(grouped.values).toEqual({ q: 'grouped' })
    expect(single.value).toBe('single')
    expect(grouped.storage.status.value).toBe('ready')
    expect(single.storage.status.value).toBe('ready')
  })
})

describe('withStorage restoration', () => {
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

  it('an early no-op write intent beats a stale async snapshot', async () => {
    const pending = deferred<StoredQuerySnapshot | undefined>()
    const memory = createMemoryStorage()
    memory.load.mockImplementation(() => pending.promise)
    const test = setup()
    const state = test.build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    })))
    const sibling = test.build(() => useQueryState('q'))

    sibling.clear()
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

describe('withStorage mirroring', () => {
  it('mirrors writes and removes an empty selection', async () => {
    const memory = createMemoryStorage()
    const { build } = setup()
    const state = build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    })))

    await state.storage.ready

    state.patch({ q: 'sale', page: 3 })
    await state.storage.flush()
    expect(memory.current()).toEqual({
      format: 1,
      savedAt: 100,
      query: { q: 'sale', page: '3' },
    })

    state.clear()
    await state.storage.flush()
    expect(memory.current()).toBeUndefined()
    expect(memory.remove).toHaveBeenLastCalledWith('filters')
  })

  it('does not rewrite an already mirrored snapshot after a no-op write', async () => {
    const memory = createMemoryStorage(snapshot({ q: 'same' }))
    const { build } = setup({ q: 'same' })
    const state = build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    })))

    await state.storage.ready
    expect(memory.save).toHaveBeenCalledTimes(1)

    state.patch({ q: 'same' })
    await state.storage.flush()

    expect(memory.save).toHaveBeenCalledTimes(1)
  })

  it('serializes storage writes and coalesces pending snapshots to the latest', async () => {
    const firstWrite = deferred<void>()
    const saves: StoredQuerySnapshot[] = []
    let active = 0
    let maxActive = 0
    const storage: QueryStorage = {
      load: () => undefined,
      save: (_key, next) => {
        saves.push(next)
        active++
        maxActive = Math.max(maxActive, active)
        const operation = saves.length === 1 ? firstWrite.promise : Promise.resolve()
        return operation.finally(() => {
          active--
        })
      },
      remove: () => undefined,
    }
    const { build } = setup()
    const state = build(() => useQueryStates(schema).use(withStorage({ key: 'filters', storage })))

    await state.storage.ready
    state.patch({ q: 'one' })
    await flushMicrotasks()

    state.patch({ q: 'two' })
    await flushMicrotasks()
    state.patch({ q: 'three' })
    const flushed = state.storage.flush()

    expect(saves.map(item => item.query)).toEqual([{ q: 'one' }])

    firstWrite.resolve()
    await flushed

    expect(saves.map(item => item.query)).toEqual([{ q: 'one' }, { q: 'three' }])
    expect(maxActive).toBe(1)
  })

  it('flushes only writes requested before the call', async () => {
    const firstWrite = deferred<void>()
    const laterWrite = deferred<void>()
    const saves: StoredQuerySnapshot[] = []
    const storage: QueryStorage = {
      load: () => undefined,
      save: (_key, next) => {
        saves.push(next)
        return saves.length === 1 ? firstWrite.promise : laterWrite.promise
      },
      remove: () => undefined,
    }
    const { build } = setup()
    const state = build(() => useQueryStates(schema).use(withStorage({ key: 'filters', storage })))

    await state.storage.ready
    state.patch({ q: 'before' })
    await flushMicrotasks()

    let flushed = false
    const flushing = state.storage.flush().then(() => {
      flushed = true
    })

    state.patch({ q: 'after' })
    await flushMicrotasks()
    expect(flushed).toBe(false)
    firstWrite.resolve()
    await flushing

    expect(flushed).toBe(true)
    expect(saves.map(item => item.query)).toEqual([{ q: 'before' }, { q: 'after' }])

    laterWrite.resolve()
    await state.storage.flush()
  })

  it('captures its write boundary when called before ready', async () => {
    const pendingLoad = deferred<StoredQuerySnapshot | undefined>()
    const laterWrite = deferred<void>()
    const storage: QueryStorage = {
      load: () => pendingLoad.promise,
      save: () => laterWrite.promise,
      remove: () => undefined,
    }
    const { build } = setup()
    const state = build(() => useQueryStates(schema).use(withStorage({ key: 'filters', storage })))

    void state.storage.ready.then(() => {
      state.patch({ q: 'later' })
    })

    let flushed = false
    const flushing = state.storage.flush().then(() => {
      flushed = true
    })

    pendingLoad.resolve(undefined)
    await state.storage.ready
    await flushMicrotasks()

    expect(flushed).toBe(true)

    laterWrite.resolve()
    await flushing
    await state.storage.flush()
  })

  it('mirrors direct query-source changes, including invalid raw values', async () => {
    const memory = createMemoryStorage()
    const { query, build } = setup()
    const state = build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    })))

    await state.storage.ready

    query.value = { q: 'external' }
    await state.storage.flush()
    expect((memory.current() as StoredQuerySnapshot).query).toEqual({ q: 'external' })

    query.value = { page: 'invalid' }
    await state.storage.flush()
    expect(memory.current()).toBeUndefined()
  })
})

describe('withStorage operational errors', () => {
  it('resolves ready and exposes a rejected load through status and error', async () => {
    const failure = new Error('load failed')
    const memory = createMemoryStorage()
    memory.load.mockRejectedValue(failure)
    const { build } = setup()
    const state = build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    })))

    const flushing = state.storage.flush()

    await expect(state.storage.ready).resolves.toBeUndefined()
    await expect(flushing).resolves.toBeUndefined()
    expect(state.storage.status.value).toBe('error')
    expect(state.storage.error.value).toBe(failure)
  })

  it.each([
    [null, 'stored snapshot is invalid'],
    [[], 'stored snapshot is invalid'],
    [{ format: 2, savedAt: 1, query: {} }, 'stored snapshot is invalid'],
    [{ format: 1, savedAt: 'now', query: {} }, 'stored snapshot is invalid'],
    [{ format: 1, savedAt: Number.POSITIVE_INFINITY, query: {} }, 'stored snapshot is invalid'],
    [{ format: 1, savedAt: 1, query: null }, 'stored snapshot is invalid'],
    [{ format: 1, savedAt: 1, query: [] }, 'stored snapshot is invalid'],
    [{ format: 1, savedAt: 1, query: {}, version: 2 }, 'stored snapshot is invalid'],
    [snapshot({}, 'old'), 'stored snapshot version is incompatible'],
  ])('settles an invalid or incompatible snapshot as an operational error %#', async (stored, message) => {
    const memory = createMemoryStorage(stored)
    const { build } = setup()
    const state = build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
      version: 'current',
    })))

    await expect(state.storage.ready).resolves.toBeUndefined()

    expect(state.storage.status.value).toBe('error')
    expect(state.storage.error.value).toBeInstanceOf(Error)
    expect((state.storage.error.value as Error).message).toContain(message)
    expect(memory.save).not.toHaveBeenCalled()
    expect(memory.remove).not.toHaveBeenCalled()
  })

  it('resolves ready on save failure and recovers after a later successful write', async () => {
    const failure = new Error('save failed')
    const memory = createMemoryStorage()
    memory.save.mockRejectedValue(failure)
    const { build } = setup({ q: 'initial' })
    const state = build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    })))

    await expect(state.storage.ready).resolves.toBeUndefined()
    expect(state.storage.status.value).toBe('error')
    expect(state.storage.error.value).toBe(failure)

    memory.save.mockResolvedValue(undefined)
    state.patch({ q: 'recovered' })
    await expect(state.storage.flush()).resolves.toBeUndefined()

    expect(state.storage.status.value).toBe('ready')
    expect(state.storage.error.value).toBeUndefined()
  })

  it('resolves flush on remove failure and recovers on a later remove', async () => {
    const failure = new Error('remove failed')
    const memory = createMemoryStorage(snapshot({ q: 'selected' }))
    const { build } = setup({ q: 'selected' })
    const state = build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    })))

    await state.storage.ready
    memory.remove.mockRejectedValueOnce(failure)
    state.clear()

    await expect(state.storage.flush()).resolves.toBeUndefined()
    expect(state.storage.status.value).toBe('error')
    expect(state.storage.error.value).toBe(failure)

    state.clear()
    await expect(state.storage.flush()).resolves.toBeUndefined()
    expect(state.storage.status.value).toBe('ready')
    expect(state.storage.error.value).toBeUndefined()
  })

  it('captures serialization and write-pipeline failures without rejecting', async () => {
    const brokenSchema = {
      q: queryParam('q', createCodec<string>({
        parse: value => typeof value === 'string' ? value : undefined,
        serialize: () => {
          throw new Error('serialize failed')
        },
        eq: (left, right) => left === right,
      })),
    }
    const memory = createMemoryStorage()
    const first = setup({ q: 'selected' })
    const serialization = first.build(() => useQueryStates(brokenSchema).use(withStorage({
      key: 'broken',
      storage: memory.storage,
    })))

    await expect(serialization.storage.ready).resolves.toBeUndefined()
    expect((serialization.storage.error.value as Error).message).toBe('serialize failed')

    const stored = createMemoryStorage(snapshot({ q: 'stored' }))
    const second = setup()
    const writePipeline = second.build(() => useQueryStates(schema)
      .use((core) => {
        core.pipeline.tap('write', () => {
          throw new Error('write failed')
        })
        return {}
      })
      .use(withStorage({ key: 'broken', storage: stored.storage })))

    await expect(writePipeline.storage.ready).resolves.toBeUndefined()
    expect((writePipeline.storage.error.value as Error).message).toBe('write failed')
  })
})

describe('withStorage lifecycle', () => {
  it('does not access storage on the server', async () => {
    vi.stubGlobal('window', undefined)
    const memory = createMemoryStorage(snapshot({ q: 'stored' }))
    const { build } = setup({ q: 'server' })
    const state = build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    })))

    await expect(state.storage.ready).resolves.toBeUndefined()
    await expect(state.storage.flush()).resolves.toBeUndefined()

    expect(state.storage.status.value).toBe('ready')
    expect(memory.load).not.toHaveBeenCalled()
    expect(memory.save).not.toHaveBeenCalled()
    expect(memory.remove).not.toHaveBeenCalled()
  })

  it('settles ready and ignores a pending load after its scope is disposed', async () => {
    const pending = deferred<StoredQuerySnapshot | undefined>()
    const memory = createMemoryStorage()
    memory.load.mockImplementation(() => pending.promise)
    const adapter = createTestingAdapter({ hasMemory: true })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const scope = effectScope()
    const state = app.runWithContext(() => scope.run(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    }))))!

    await flushMicrotasks()
    scope.stop()

    await expect(state.storage.ready).resolves.toBeUndefined()
    await expect(state.storage.flush()).resolves.toBeUndefined()

    pending.resolve(snapshot({ q: 'late' }))
    await flushMicrotasks()

    expect(adapter.query.value).toEqual({})
    expect(memory.save).not.toHaveBeenCalled()
    expect(memory.remove).not.toHaveBeenCalled()
  })

  it('does not start a queued restoration after synchronous disposal', async () => {
    const memory = createMemoryStorage(snapshot({ q: 'late' }))
    const adapter = createTestingAdapter({ hasMemory: true })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const scope = effectScope()
    const state = app.runWithContext(() => scope.run(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    }))))!

    scope.stop()
    await state.storage.ready
    await state.storage.flush()
    await flushMicrotasks()

    expect(memory.load).not.toHaveBeenCalled()
  })

  it.each(['resolve', 'reject'] as const)('ignores an in-flight write that %s after disposal', async (outcome) => {
    const pending = deferred<void>()
    const memory = createMemoryStorage()
    memory.save.mockImplementation(() => pending.promise)
    const adapter = createTestingAdapter({ searchParams: { q: 'selected' }, hasMemory: true })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const scope = effectScope()
    const state = app.runWithContext(() => scope.run(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
      restore: 'never',
    }))))!

    await flushMicrotasks()
    expect(memory.save).toHaveBeenCalledOnce()

    scope.stop()
    if (outcome === 'resolve') {
      pending.resolve()
    }
    else {
      pending.reject(new Error('late failure'))
    }
    await state.storage.ready
    await flushMicrotasks()

    expect(state.storage.status.value).toBe('ready')
    expect(state.storage.error.value).toBeUndefined()
  })

  it.each(['resolve', 'reject'] as const)('keeps a newer serialization error when an older write %s', async (outcome) => {
    let failSerialization = false
    const delayed = deferred<void>()
    const delayedStorage = createMemoryStorage()
    delayedStorage.save.mockImplementation(() => delayed.promise)
    const guardedSchema = {
      q: queryParam('q', createCodec<string>({
        parse: value => typeof value === 'string' ? value : undefined,
        serialize: (value) => {
          if (failSerialization) {
            throw new Error('newer serialization failed')
          }

          return value
        },
      })),
    }
    const { build } = setup()
    const state = build(() => useQueryStates(guardedSchema).use(withStorage({
      key: 'filters',
      storage: delayedStorage.storage,
    })))

    await state.storage.ready
    state.patch({ q: 'first' })
    await flushMicrotasks()
    expect(delayedStorage.save).toHaveBeenCalledOnce()

    state.patch({ q: 'second' })
    failSerialization = true
    await flushMicrotasks()
    expect((state.storage.error.value as Error).message).toBe('newer serialization failed')

    let flushed = false
    const flushing = state.storage.flush().then(() => {
      flushed = true
    })
    await flushMicrotasks()
    expect(flushed).toBe(false)

    failSerialization = false
    if (outcome === 'resolve') {
      delayed.resolve()
    }
    else {
      delayed.reject(new Error('older write failed'))
    }
    await flushing

    expect(flushed).toBe(true)
    expect(state.storage.status.value).toBe('error')
    expect((state.storage.error.value as Error).message).toBe('newer serialization failed')
  })

  it('starts restoration from onMounted after the complete setup chain is composed', async () => {
    let composed = false
    let controls!: StorageControls
    const memory = createMemoryStorage()
    memory.load.mockImplementation(() => {
      expect(composed).toBe(true)
      return undefined
    })
    const adapter = createTestingAdapter({ hasMemory: true })
    const renderer = createRenderer<Record<string, unknown>, Record<string, unknown>>({
      patchProp: () => undefined,
      insert: () => undefined,
      remove: () => undefined,
      createElement: () => ({}),
      createText: () => ({}),
      createComment: () => ({}),
      setText: () => undefined,
      setElementText: () => undefined,
      parentNode: () => null,
      nextSibling: () => null,
    })
    const app = renderer.createApp({
      setup() {
        const state = useQueryStates(schema)
          .use(withStorage({ key: 'filters', storage: memory.storage }))
          .use(() => {
            composed = true
            return {}
          })
        controls = state.storage

        return () => null
      },
    })
    installQueryAdapter(app, adapter)

    const root = app.mount({})
    await controls.ready

    expect(memory.load).toHaveBeenCalledOnce()
    app.unmount()
    expect(root).toBeDefined()
  })
})

describe('createWebStorage', () => {
  it('loads, saves, and removes JSON snapshots through a lazy resolver', () => {
    const values = new Map<string, string>()
    const web: Storage = {
      get length() {
        return values.size
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: index => [...values.keys()][index] ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value)
      },
      removeItem: (key: string) => {
        values.delete(key)
      },
    }
    const resolve = vi.fn(() => web)
    const storage = createWebStorage(resolve)
    const stored = snapshot({ q: 'saved' })

    expect(storage.load('filters')).toBeUndefined()
    storage.save('filters', stored)
    expect(storage.load('filters')).toEqual(stored)
    storage.remove('filters')
    expect(storage.load('filters')).toBeUndefined()
    expect(resolve).toHaveBeenCalledTimes(5)
  })

  it('throws synchronously for an invalid resolver and operation-time Web Storage failures', () => {
    expect(() => createWebStorage(undefined as never)).toThrow('expected a storage resolver function')

    const unavailable = createWebStorage(() => undefined)
    expect(() => unavailable.load('filters')).toThrow('web storage is unavailable')

    const malformed = createWebStorage(() => ({
      ...({} as Storage),
      getItem: () => '{',
    }))
    expect(() => malformed.load('filters')).toThrow(SyntaxError)
  })
})
