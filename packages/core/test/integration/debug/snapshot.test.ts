import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { createApp, effectScope } from 'vue'
import { createTestingAdapter } from '../../../src/adapters/testing'
import { installQueryAdapter } from '../../../src/core/bindings/adapter-provider'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { getDebugChannel } from '../../../src/core/diagnostics/bus'
import { getDebugSnapshot } from '../../../src/core/diagnostics/snapshot'
import { withStorage } from '../../../src/modules/storage/storage'
import { resetDebugState } from '../../helpers/debug'

afterEach(resetDebugState)

describe('state snapshot', () => {
  it('describes an adapter\'s engine and queue with resolved, detached values', () => {
    const adapter = createTestingAdapter({ searchParams: { q: 'phone' }, hasMemory: true })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    app.runWithContext(() => useQueryStates({ q: codecs.string }))

    const channel = getDebugChannel(adapter)
    const snapshot = getDebugSnapshot(channel)

    expect(snapshot.engines).toHaveLength(1)
    expect(snapshot.engines[0]).toMatchObject({ runtimeId: channel.runtimeId, keys: ['q'], values: { q: 'phone' } })
    expect(snapshot.queues).toHaveLength(1)
    expect(snapshot.queues[0]).toMatchObject({ runtimeId: channel.runtimeId, overlayKeys: [] })

    // The snapshot must be detached: mutating it cannot change the engine's own state.
    ;(snapshot.engines[0]!.keys as string[]).splice(0)
    expect(getDebugSnapshot(channel).engines[0]!.keys).toEqual(['q'])
  })

  it('tags engine and storage entries with their runtime in the global aggregate', () => {
    const adapterA = createTestingAdapter({ searchParams: { q: 'aa' }, hasMemory: true })
    const adapterB = createTestingAdapter({ searchParams: { q: 'bb' }, hasMemory: true })
    const appA = createApp({})
    installQueryAdapter(appA, adapterA)
    const appB = createApp({})
    installQueryAdapter(appB, adapterB)
    appA.runWithContext(() => useQueryStates({ q: codecs.string }))
    appB.runWithContext(() => useQueryStates({ q: codecs.string }))

    const idA = getDebugChannel(adapterA).runtimeId
    const idB = getDebugChannel(adapterB).runtimeId
    const snapshot = getDebugSnapshot()

    expect(idA).not.toBe(idB)
    expect(snapshot.engines.find(engine => engine.values.q === 'aa')?.runtimeId).toBe(idA)
    expect(snapshot.engines.find(engine => engine.values.q === 'bb')?.runtimeId).toBe(idB)
  })

  it('registers and disposes a storage source on the server (SSR)', async () => {
    vi.stubGlobal('window', undefined)
    const adapter = createTestingAdapter()
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const scope = effectScope()
    onTestFinished(() => scope.stop())
    const query = app.runWithContext(() => scope.run(() => useQueryStates({ q: codecs.string }).use(withStorage({
      key: 'ssr-only',
      storage: { load: () => undefined, save: vi.fn(), remove: vi.fn() },
    }))))!

    await query.storage.ready
    const channel = getDebugChannel(adapter)
    expect(getDebugSnapshot(channel).storage).toEqual([
      { runtimeId: channel.runtimeId, bindingId: expect.any(String), key: 'ssr-only', status: expect.any(String), revision: expect.any(Number) },
    ])

    scope.stop()
    expect(getDebugSnapshot(channel).storage).toEqual([])
  })

  it('drops an engine source when its scope disposes', () => {
    const adapter = createTestingAdapter()
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const scope = effectScope()
    onTestFinished(() => scope.stop())
    app.runWithContext(() => scope.run(() => useQueryStates({ q: codecs.string })))
    const channel = getDebugChannel(adapter)
    expect(getDebugSnapshot(channel).engines).toHaveLength(1)

    scope.stop()

    expect(getDebugSnapshot(channel).engines).toHaveLength(0)
  })
})
