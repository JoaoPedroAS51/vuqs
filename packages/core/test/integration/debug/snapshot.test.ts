import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { createApp, effectScope } from 'vue'
import { createTestingAdapter } from '../../../src/adapters/testing'
import { installQueryAdapter } from '../../../src/core/bindings/adapter-provider'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { getDebugChannel } from '../../../src/core/diagnostics/bus'
import { getDebugSnapshot } from '../../../src/core/diagnostics/snapshot'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { withRuntimeDefaults } from '../../../src/modules/runtime-defaults/module'
import { withStorage } from '../../../src/modules/storage/module'
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

  it('uses committed and effective query contexts for the corresponding explicit snapshots', () => {
    const adapter = createTestingAdapter({ searchParams: { q: 'initial', flag: 'committed' }, hasMemory: true })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const scope = effectScope()
    onTestFinished(() => {
      scope.stop()
      adapter.resetQueue()
    })
    const state = app.runWithContext(() => scope.run(() => useQueryStates({ q: codecs.string }).use(core => ({
      api: { explicit: core.state.explicitValues },
      pipeline: [core.pipeline.define('read', (values, context) => ({ ...values, q: String(context.query.flag) }), { projection: 'explicit' })],
    }))))!
    const sibling = app.runWithContext(() => scope.run(() => useQueryStates({ flag: codecs.string })))!
    expect(state.explicit.value.q).toBe('committed')

    sibling.patch({ flag: 'pending' })
    const snapshot = getDebugSnapshot(getDebugChannel(adapter)).engines.find(engine => engine.keys.includes('q'))!

    expect(snapshot.committedExplicitValues).toEqual({ q: 'committed' })
    expect(snapshot.optimisticExplicitValues).toEqual({ q: 'pending' })
    expect(adapter.query.value.flag).toBe('committed')
  })

  it('keeps local default attribution while sharing optimistic state', () => {
    const adapter = createTestingAdapter({ hasMemory: true })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const value = queryParam('value', codecs.integer.withDefault(1))
    const first = app.runWithContext(() => useQueryStates({ value }).use(withRuntimeDefaults()))
    const second = app.runWithContext(() => useQueryStates({ value }).use(withRuntimeDefaults()))

    first.setDefaults({ value: 5 })
    second.setDefaults({ value: 9 })
    first.patch({ value: 7 })

    const channel = getDebugChannel(adapter)
    const engines = getDebugSnapshot(channel).engines

    expect(engines).toHaveLength(2)
    expect(new Set(engines.map(engine => engine.bindingId)).size).toBe(2)
    expect(new Set(engines.map(engine => engine.runtimeId))).toEqual(new Set([channel.runtimeId]))
    expect(engines.map(engine => engine.defaults.value).sort()).toEqual([5, 9])

    for (const engine of engines) {
      expect(engine.committedExplicitValues).toEqual({})
      expect(engine.optimisticExplicitValues).toEqual({ value: 7 })
      expect(engine.values).toEqual({ value: 7 })
    }
  })

  it.each([
    { clearOnDefault: true, observer: 9, explicit: {} },
    { clearOnDefault: false, observer: 5, explicit: { value: 5 } },
  ])('keeps observer snapshots truthful when a default-equal write is omitted: $clearOnDefault', async ({ clearOnDefault, observer, explicit }) => {
    const adapter = createTestingAdapter({ hasMemory: true })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const value = queryParam('value', codecs.integer)
    const writer = app.runWithContext(() => useQueryStates({ value }, { clearOnDefault }).use(withRuntimeDefaults()))
    const watcher = app.runWithContext(() => useQueryStates({ value }).use(withRuntimeDefaults()))

    writer.setDefaults({ value: 5 })
    watcher.setDefaults({ value: 9 })
    writer.patch({ value: 5 })
    await new Promise(resolve => setTimeout(resolve, 0))

    const engines = getDebugSnapshot(getDebugChannel(adapter)).engines
    const byDefault = (candidate: number) => engines.find(engine => engine.defaults.value === candidate)!

    expect(engines).toHaveLength(2)
    expect(new Set(engines.map(engine => engine.bindingId)).size).toBe(2)
    expect(byDefault(5).values).toEqual({ value: 5 })
    expect(byDefault(5).committedExplicitValues).toEqual(explicit)
    expect(byDefault(9).values).toEqual({ value: observer })
    expect(byDefault(9).committedExplicitValues).toEqual(explicit)
  })

  it('detaches historical snapshots from later source changes', () => {
    const adapter = createTestingAdapter({ hasMemory: true })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const record = queryParam.object('record', {
      a: queryParam('a', codecs.integer.withDefault(0)),
    })
    const query = app.runWithContext(() => useQueryStates({ record }).use(withRuntimeDefaults()))

    query.setDefaults({ record: { a: 5 } })
    const before = getDebugSnapshot(getDebugChannel(adapter)).engines[0]!
    query.setDefaults({ record: { a: 9 } })

    expect(before.defaults).toEqual({ record: { a: 5 } })
    expect(before.values).toEqual({ record: { a: 5 } })
    expect(getDebugSnapshot(getDebugChannel(adapter)).engines[0]!.defaults).toEqual({ record: { a: 9 } })
  })
})
