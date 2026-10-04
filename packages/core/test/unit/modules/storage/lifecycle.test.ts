import type { StoredQuerySnapshot } from '../../../../src/modules/storage/snapshot'
import type { StorageControls } from '../../../../src/modules/storage/storage'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { createApp, createRenderer, effectScope } from 'vue'
import { createTestingAdapter } from '../../../../src/adapters/testing'
import { installQueryAdapter } from '../../../../src/core/bindings/adapter-provider'
import { useQueryStates } from '../../../../src/core/bindings/use-query-states'
import { createCodec } from '../../../../src/core/codecs/codec'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { withStorage } from '../../../../src/modules/storage/storage'
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

  it.each(['resolve', 'reject'] as const)('ignores an in-flight write that %s after disposal', async (outcome) => {
    const pending = deferred<void>()
    const memory = createMemoryStorage()
    memory.save.mockImplementation(() => pending.promise)
    const adapter = createTestingAdapter({ searchParams: { q: 'selected' }, hasMemory: true })
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
