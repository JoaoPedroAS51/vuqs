import type { QueryStorage } from '../../../../src/modules/storage/contract'
import type { StoredQuerySnapshot } from '../../../../src/modules/storage/snapshot'
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest'
import { effectScope, watch } from 'vue'
import { useQueryStates } from '../../../../src/core/bindings/use-query-states'
import { withStorage } from '../../../../src/modules/storage/module'
import { withTestQuery as setup } from '../../../helpers/adapter'
import { createMemoryStorage, snapshot } from '../../../helpers/storage'
import { deferred, flushMicrotasks, schema, stubBrowserEnvironment } from './helpers'

describe('withStorage mirroring', () => {
  beforeEach(stubBrowserEnvironment)

  it('mirrors writes and removes an empty state', async () => {
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

  it('does not wait for a write requested after mirroring starts while ready is pending', async () => {
    const mirroredWrite = deferred<void>()
    const saves: StoredQuerySnapshot[] = []
    const storage: QueryStorage = {
      load: () => undefined,
      save: (_key, next) => {
        saves.push(next)
        return saves.length === 1 ? undefined : mirroredWrite.promise
      },
      remove: () => undefined,
    }

    const { build } = setup({ q: 'url' })
    const state = build(() => useQueryStates(schema).use(withStorage({ key: 'filters', storage, restore: 'never' })))

    // Mirroring starts when the status turns ready, before the ready promise settles
    const order: string[] = []

    const observerScope = effectScope(true)
    onTestFinished(() => observerScope.stop())

    observerScope.run(() => watch(state.storage.status, () => {
      state.patch({ q: 'mirrored' })
      void state.storage.flush().then(() => {
        order.push('flush')
      })
    }, { flush: 'sync' }))

    void state.storage.ready.then(() => {
      order.push('ready')
    })

    await state.storage.ready
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(order).toEqual(['ready', 'flush'])
    expect(saves.map(item => item.query)).toEqual([{ q: 'url' }, { q: 'mirrored' }])

    let settled = false
    const mirroredFlush = state.storage.flush().then(() => {
      settled = true
    })
    await flushMicrotasks()

    expect(settled).toBe(false)

    mirroredWrite.resolve()
    await mirroredFlush

    expect(settled).toBe(true)
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
