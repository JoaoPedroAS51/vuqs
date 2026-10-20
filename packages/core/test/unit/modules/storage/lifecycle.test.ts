import type { StorageControls } from '../../../../src/modules/storage/contract'
import type { StoredQuerySnapshot } from '../../../../src/modules/storage/snapshot'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { createApp, createRenderer, effectScope, watch } from 'vue'
import { createTestingAdapter } from '../../../../src/adapters/testing'
import { installQueryAdapter } from '../../../../src/core/bindings/adapter-provider'
import { useQueryStates } from '../../../../src/core/bindings/use-query-states'
import { createCodec } from '../../../../src/core/codecs/codec'
import { addDebugReporter } from '../../../../src/core/diagnostics/bus'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { withStorage } from '../../../../src/modules/storage/module'
import { withTestQuery as setup } from '../../../helpers/adapter'
import { createMemoryStorage, snapshot } from '../../../helpers/storage'
import { deferred, flushMicrotasks, schema, stubBrowserEnvironment } from './helpers'

describe('withStorage lifecycle', () => {
  beforeEach(stubBrowserEnvironment)

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
    onTestFinished(() => scope.stop())
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

  it('completes a flush requested by a synchronous status observer during disposal after ready', async () => {
    const pending = deferred<StoredQuerySnapshot | undefined>()
    const memory = createMemoryStorage()
    memory.load.mockImplementation(() => pending.promise)

    const adapter = createTestingAdapter({ hasMemory: true })
    const app = createApp({})
    installQueryAdapter(app, adapter)

    const scope = effectScope()
    onTestFinished(() => scope.stop())

    const state = app.runWithContext(() => scope.run(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    }))))!

    // The observer lives in its own scope so disposing the storage scope does not stop it
    const observed: string[] = []
    const order: string[] = []
    let flushing: Promise<void> | undefined

    const observerScope = effectScope(true)
    onTestFinished(() => observerScope.stop())

    observerScope.run(() => watch(state.storage.status, (status) => {
      observed.push(status)
      flushing = state.storage.flush().then(() => {
        order.push('flush')
      })
    }, { flush: 'sync' }))

    await flushMicrotasks()
    expect(state.storage.status.value).toBe('restoring')

    scope.stop()
    void state.storage.ready.then(() => {
      order.push('ready')
    })
    await flushing

    expect(observed).toEqual(['ready'])
    expect(order).toEqual(['ready', 'flush'])
    expect(memory.save).not.toHaveBeenCalled()
    expect(memory.remove).not.toHaveBeenCalled()
  })

  it('completes a flush requested after disposal and ready without waiting on ready again', async () => {
    const pending = deferred<StoredQuerySnapshot | undefined>()
    const memory = createMemoryStorage()
    memory.load.mockImplementation(() => pending.promise)

    const adapter = createTestingAdapter({ hasMemory: true })
    const app = createApp({})
    installQueryAdapter(app, adapter)

    const scope = effectScope()
    onTestFinished(() => scope.stop())

    const state = app.runWithContext(() => scope.run(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    }))))!

    await flushMicrotasks()
    scope.stop()
    await state.storage.ready

    const order: string[] = []
    const flushing = state.storage.flush().then(() => {
      order.push('flush')
    })
    void Promise.resolve().then(() => {
      order.push('next microtask')
    })
    await flushing

    expect(order).toEqual(['flush', 'next microtask'])
  })

  it('completes a flush without waiting when its own materialization disposes the module', async () => {
    const memory = createMemoryStorage()
    const { build, dispose } = setup()

    const state = build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    })))
    await state.storage.ready

    onTestFinished(addDebugReporter((event) => {
      if (event.code === 'storage:write') {
        dispose()
      }
    }))

    state.patch({ q: 'changed' })

    const order: string[] = []
    const flushing = state.storage.flush().then(() => {
      order.push('flush')
    })
    void Promise.resolve().then(() => {
      order.push('next microtask')
    })
    await flushing
    await flushMicrotasks()

    expect(order).toEqual(['flush', 'next microtask'])
  })

  it('does not start a queued restoration after synchronous disposal', async () => {
    const memory = createMemoryStorage(snapshot({ q: 'late' }))
    const adapter = createTestingAdapter({ hasMemory: true })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const scope = effectScope()
    onTestFinished(() => scope.stop())
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

  it('never loads or writes when its installation fails', async () => {
    const memory = createMemoryStorage(snapshot({ q: 'stored' }))
    const adapter = createTestingAdapter({ searchParams: { q: 'phone' }, hasMemory: true })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const scope = effectScope()
    onTestFinished(() => scope.stop())
    const query = app.runWithContext(() => scope.run(() => useQueryStates(schema).use(() => ({ api: { storage: true } }))))!

    expect(() => query.use(withStorage({ key: 'filters', storage: memory.storage }))).toThrow(/module key "storage"/)

    adapter.query.value = { q: 'changed' }
    await flushMicrotasks()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(memory.load).not.toHaveBeenCalled()
    expect(memory.save).not.toHaveBeenCalled()
    expect(memory.remove).not.toHaveBeenCalled()
  })

  it('stops mirroring once the binding that installed it is disposed', async () => {
    const memory = createMemoryStorage()
    const adapter = createTestingAdapter({ searchParams: { q: 'phone' }, hasMemory: true })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const scope = effectScope()
    onTestFinished(() => scope.stop())
    const query = app.runWithContext(() => scope.run(() => useQueryStates(schema)))!
    const state = query.use(withStorage({ key: 'filters', storage: memory.storage, restore: 'never' }))

    await flushMicrotasks()
    await state.storage.flush()
    expect(memory.save).toHaveBeenCalledOnce()

    scope.stop()
    adapter.query.value = { q: 'after' }
    await flushMicrotasks()

    expect(memory.save).toHaveBeenCalledOnce()
  })

  it.each(['resolve', 'reject'] as const)('ignores an in-flight write that %s after disposal', async (outcome) => {
    const pending = deferred<void>()
    const memory = createMemoryStorage()
    memory.save.mockImplementation(() => pending.promise)
    const adapter = createTestingAdapter({ searchParams: { q: 'phone' }, hasMemory: true })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const scope = effectScope()
    onTestFinished(() => scope.stop())
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
            return { api: {} }
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
