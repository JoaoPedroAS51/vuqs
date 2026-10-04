import type { DebugEvent } from '../../../src/core/diagnostics/bus'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, ref } from 'vue'
import { createTestingAdapter } from '../../../src/adapters/testing'
import { installQueryAdapter } from '../../../src/core/bindings/adapter-provider'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { addDebugReporter, getDebugChannel } from '../../../src/core/diagnostics/bus'
import { withContext } from '../../../src/modules/context'
import { withRuntimeDefaults } from '../../../src/modules/runtime-defaults'
import { withTestQuery } from '../../helpers/adapter'
import { resetDebugState, trackReporter } from '../../helpers/debug'

afterEach(resetDebugState)

describe('adapter isolation', () => {
  it('publishes each adapter runtime only on its own channel', () => {
    const adapterA = createTestingAdapter()
    const adapterB = createTestingAdapter()
    const channelA = getDebugChannel(adapterA)
    const channelB = getDebugChannel(adapterB)
    expect(channelA.runtimeId).not.toBe(channelB.runtimeId)

    interface Seen { code: string, runtimeId?: string, value?: string }
    const written = (event: { code: string, context?: { runtimeId?: string }, data: unknown }): Seen => ({
      code: event.code,
      runtimeId: event.context?.runtimeId,
      value: (event.data as { values?: { q?: string } } | undefined)?.values?.q,
    })

    const onA: Seen[] = []
    const onHub: Seen[] = []
    // The adapter A reporter is channel-scoped. The hub reporter arms adapter B.
    trackReporter(addDebugReporter(event => onA.push(written(event)), { channel: channelA }))
    trackReporter(addDebugReporter(event => onHub.push(written(event))))

    const appA = createApp({})
    installQueryAdapter(appA, adapterA)
    const appB = createApp({})
    installQueryAdapter(appB, adapterB)

    const queryA = appA.runWithContext(() => useQueryStates({ q: codecs.string }))
    const queryB = appB.runWithContext(() => useQueryStates({ q: codecs.string }))

    queryA.patch({ q: 'a' })
    queryB.patch({ q: 'b' })

    // A's channel reporter sees only A's runtime and only A's write ('a'), never B's ('b').
    const aWrites = onA.filter(seen => seen.code === 'binding:set')
    expect(aWrites.length).toBeGreaterThan(0)
    expect(aWrites.every(seen => seen.runtimeId === channelA.runtimeId)).toBe(true)
    expect(aWrites.some(seen => seen.value === 'a')).toBe(true)
    expect(aWrites.some(seen => seen.value === 'b')).toBe(false)

    // The hub confirms that adapter B emitted its write on its own runtime.
    expect(onHub.some(seen => seen.code === 'binding:set' && seen.runtimeId === channelB.runtimeId && seen.value === 'b')).toBe(true)
  })

  it('attributes id-less binding-scoped events to distinct bindings sharing one adapter', () => {
    // Both bindings share one adapter, so their events require distinct binding ids.
    const { build } = withTestQuery({ q: 'x' })

    const events: DebugEvent[] = []
    trackReporter(addDebugReporter(event => events.push(event)))

    const tabA = ref('products')
    const tabB = ref('products')
    const a = build(() =>
      useQueryStates({ a: codecs.string, ca: codecs.string })
        .use(withRuntimeDefaults())
        .use(withContext({ active: tabA, preserve: ['a'], only: { ca: ['products'] } })),
    )
    const b = build(() =>
      useQueryStates({ b: codecs.string, cb: codecs.string })
        .use(withRuntimeDefaults())
        .use(withContext({ active: tabB, preserve: ['b'], only: { cb: ['products'] } })),
    )
    a.setDefaults({ a: 'da' })
    b.setDefaults({ b: 'db' })

    // Recover each binding's id from binding:created (its payload carries both id and keys).
    const idOf = (key: string): string | undefined => events.find(
      event => event.code === 'binding:created' && (event.data as { keys: string[] }).keys.includes(key),
    )?.context?.bindingId
    const idA = idOf('a')
    const idB = idOf('b')
    expect(idA).toBeDefined()
    expect(idB).toBeDefined()
    expect(idA).not.toBe(idB)

    // These event payloads carry no id. Their context must identify the binding,
    // and events from the two bindings must not share one.
    const idless = new Set(['pipeline:tap', 'rd:set', 'rd:register', 'ctx:build'])
    const scoped = events.filter(event => idless.has(event.code))
    expect(scoped.length).toBeGreaterThan(0)
    expect(scoped.every(event => event.context?.bindingId === idA || event.context?.bindingId === idB)).toBe(true)

    // Correlate by payload so a swapped attribution (A's event tagged idB) would fail:
    // the rd:set carrying `defaults.a` must be A's, and the one carrying `defaults.b`, B's.
    const rdSetFor = (key: string): DebugEvent | undefined => events.find(
      event => event.code === 'rd:set' && (event.data as { defaults: Record<string, unknown> }).defaults[key] !== undefined,
    )
    expect(rdSetFor('a')?.context?.bindingId).toBe(idA)
    expect(rdSetFor('b')?.context?.bindingId).toBe(idB)
  })
})
