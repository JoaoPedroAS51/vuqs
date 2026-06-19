import type { DebugEvent } from '../../src/core/debug/bus'
import type { EngineSnapshot } from '../../src/core/debug/snapshot'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { createTestingAdapter } from '../../src/adapters/testing'
import {
  addDebugReporter,
  bindDebugTarget,
  createDebugChannel,
  DEBUG_PROTOCOL_VERSION,
  emitDebug,
  getDebugChannel,
  globalDebugChannel,
  isDebugArmed,
  retainDebugHistory,
} from '../../src/core/debug/bus'
import { normalizeForHistory } from '../../src/core/debug/normalize'
import { getDebugSnapshot, registerSnapshotSource } from '../../src/core/debug/snapshot'

const disposers: Array<() => void> = []

function track<T extends () => void>(dispose: T): T {
  disposers.push(dispose)
  return dispose
}

function engineSnapshot(id: string, keys: string[] = [], values: Record<string, unknown> = {}): EngineSnapshot {
  return {
    id,
    keys,
    managedPaths: keys,
    committedSelected: values,
    optimisticSelected: values,
    values,
    defaults: {},
  }
}

function collect(channel = createDebugChannel('rt-test')): { channel: ReturnType<typeof createDebugChannel>, events: DebugEvent[] } {
  const events: DebugEvent[] = []
  track(channel.addReporter(event => events.push(event)))
  return { channel, events }
}

afterEach(() => {
  while (disposers.length > 0) {
    disposers.pop()?.()
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('debug bus: emission', () => {
  it('delivers a frozen envelope with scope, level, seq and auto runtimeId', () => {
    const { channel, events } = collect(createDebugChannel('rt-1'))

    channel.debug('gtq:settle', { dropped: ['a', 'b'] })

    expect(events).toHaveLength(1)
    const [event] = events
    expect(event.code).toBe('gtq:settle')
    expect(event.scope).toBe('gtq')
    expect(event.level).toBe('debug')
    expect(typeof event.seq).toBe('number')
    expect(event.data).toEqual({ dropped: ['a', 'b'] })
    expect(event.context?.runtimeId).toBe('rt-1')
    expect(Object.isFrozen(event)).toBe(true)
  })

  it('assigns the warn level from the code', () => {
    const { channel, events } = collect()

    channel.warn('engine:parse-miss', { path: 'filters', raw: '{bad' })

    expect(events[0]?.level).toBe('warn')
  })

  it('assigns strictly increasing seq across events', () => {
    const { channel, events } = collect()

    channel.debug('gtq:reset')
    channel.debug('gtq:reset')

    expect(events[1]!.seq).toBeGreaterThan(events[0]!.seq)
  })

  it('merges caller context under the auto runtimeId', () => {
    const { channel, events } = collect(createDebugChannel('rt-ctx'))

    channel.debug('gtq:settle', { dropped: [] }, { transactionIds: [7] })

    expect(events[0]?.context).toEqual({ transactionIds: [7], runtimeId: 'rt-ctx' })
  })

  it('is inert when emitting through a handle that resolves to no channel', () => {
    const seen: DebugEvent[] = []
    // Arm the hub, so the emission would broadcast if a foreign handle were mistaken
    // for a channel instead of resolving to nothing.
    track(addDebugReporter(event => seen.push(event)))
    const noop = (): (() => void) => () => {}
    const foreign = { addReporter: noop, retainHistory: noop, registerSnapshotSource: noop }

    expect(() => emitDebug(foreign, 'gtq:reset')).not.toThrow()
    expect(seen).toHaveLength(0)
  })
})

describe('debug bus: reporters', () => {
  it('fans out to multiple reporters with independent teardown', () => {
    const channel = createDebugChannel('rt-multi')
    const a: DebugEvent[] = []
    const b: DebugEvent[] = []
    const removeA = track(channel.addReporter(e => a.push(e)))
    track(channel.addReporter(e => b.push(e)))

    channel.debug('gtq:reset')
    removeA()
    channel.debug('gtq:reset')

    expect(a).toHaveLength(1)
    expect(b).toHaveLength(2)
  })

  it('isolates a throwing reporter from the others', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const channel = createDebugChannel('rt-throw')
    const seen: DebugEvent[] = []
    track(channel.addReporter(() => {
      throw new Error('reporter boom')
    }))
    track(channel.addReporter(e => seen.push(e)))

    expect(() => channel.debug('gtq:reset')).not.toThrow()
    expect(seen).toHaveLength(1)
    expect(spy).toHaveBeenCalled()
  })

  it('does nothing when the channel is not armed', () => {
    const channel = createDebugChannel('rt-quiet')
    expect(isDebugArmed(channel)).toBe(false)

    channel.debug('gtq:reset')

    const late: DebugEvent[] = []
    track(channel.addReporter(e => late.push(e)))
    expect(late).toHaveLength(0)
  })

  it('preserves seq order under reentrant emission', () => {
    const channel = createDebugChannel('rt-reentrant')
    const order: string[] = []
    let reentered = false
    track(channel.addReporter((event) => {
      order.push(`${event.code}#${event.seq}`)
      if (event.code === 'gtq:reset' && !reentered) {
        reentered = true
        channel.debug('gtq:settle', { dropped: [] })
      }
    }))

    channel.debug('gtq:reset')

    expect(order).toHaveLength(2)
    expect(order[0]).toContain('gtq:reset')
    expect(order[1]).toContain('gtq:settle')
    const firstSeq = Number(order[0]!.split('#')[1])
    const secondSeq = Number(order[1]!.split('#')[1])
    expect(secondSeq).toBeGreaterThan(firstSeq)
  })
})

describe('debug bus: history replay', () => {
  it('replays retained history as a normalized snapshot to a late reporter', () => {
    const channel = createDebugChannel('rt-replay')
    track(retainDebugHistory({ channel, limit: 10 }))

    channel.debug('gtq:settle', { dropped: ['x'] })

    const replayed: DebugEvent[] = []
    track(channel.addReporter(e => replayed.push(e), { replay: true }))

    expect(replayed).toHaveLength(1)
    expect(replayed[0]?.data).toEqual({ dropped: ['x'] })
  })

  it('deep-freezes a retained payload so one replay cannot corrupt the next', () => {
    const channel = createDebugChannel('rt-replay-freeze')
    track(retainDebugHistory({ channel, limit: 10 }))

    channel.debug('binding:set', { id: '0', keys: ['q'], managedPaths: ['q'], touched: ['q'], touchedPaths: ['q'], values: { q: 'clean' }, options: {} })

    // A first replay reporter tries to mutate the retained (nested) payload in place.
    track(channel.addReporter((event) => {
      try {
        ;(event.data as { values: { q: string } }).values.q = 'mutated'
      }
      catch {}
    }, { replay: true }))

    // A second replay must still see the original value: the record is frozen, not shared-mutable.
    const second: DebugEvent[] = []
    track(channel.addReporter(event => second.push(event), { replay: true }))

    expect((second[0]?.data as { values: { q: string } }).values.q).toBe('clean')
  })

  it('replays a stable snapshot even when a replay callback emits', () => {
    const channel = createDebugChannel('rt-replay-reentrant')
    track(retainDebugHistory({ channel, limit: 10 }))
    channel.debug('gtq:reset')

    let calls = 0
    track(channel.addReporter(() => {
      calls++
      // Emitting during replay must not extend the snapshot being iterated.
      channel.debug('gtq:settle', { dropped: [] })
    }, { replay: true }))

    expect(calls).toBe(1)
  })

  it('evicts the oldest events past capacity (ring wrap)', () => {
    const channel = createDebugChannel('rt-wrap')
    track(retainDebugHistory({ channel, limit: 2 }))

    for (let i = 0; i < 4; i++) {
      channel.debug('gtq:settle', { dropped: [String(i)] })
    }

    const replayed: DebugEvent[] = []
    track(channel.addReporter(event => replayed.push(event), { replay: true }))

    expect(replayed.map(event => (event.data as { dropped: string[] }).dropped[0])).toEqual(['2', '3'])
  })

  it('does not retain when no lease is held', () => {
    const channel = createDebugChannel('rt-noretain')
    track(channel.addReporter(() => {}))

    channel.debug('gtq:reset')

    const replayed: DebugEvent[] = []
    track(channel.addReporter(e => replayed.push(e), { replay: true }))
    expect(replayed).toHaveLength(0)
  })

  it('caps retention at the largest active lease and shrinks when it releases', () => {
    const channel = createDebugChannel('rt-cap')
    const releaseBig = track(retainDebugHistory({ channel, limit: 5 }))
    track(retainDebugHistory({ channel, limit: 2 }))

    for (let i = 0; i < 5; i++) {
      channel.debug('gtq:settle', { dropped: [String(i)] })
    }

    const wide: DebugEvent[] = []
    track(channel.addReporter(e => wide.push(e), { replay: true }))
    expect(wide).toHaveLength(5)

    releaseBig()

    const narrow: DebugEvent[] = []
    track(channel.addReporter(e => narrow.push(e), { replay: true }))
    expect(narrow).toHaveLength(2)
  })
})

describe('debug bus: hub aggregation', () => {
  it('a hub reporter receives events from any channel tagged by runtimeId', () => {
    const seen: DebugEvent[] = []
    track(addDebugReporter(e => seen.push(e)))
    const channel = createDebugChannel('rt-hub')

    channel.debug('gtq:reset')

    const mine = seen.filter(e => e.context?.runtimeId === 'rt-hub')
    expect(mine).toHaveLength(1)
  })
})

describe('debug bus: snapshot', () => {
  it('aggregates registered sources by kind, regardless of arming', () => {
    const channel = createDebugChannel('rt-snap')
    track(registerSnapshotSource(channel, 'engine', () => engineSnapshot('e1', ['q'], { q: 'x' })))
    track(registerSnapshotSource(channel, 'storage', () => ({ key: 'filters', status: 'ready', revision: 1 })))

    const snapshot = getDebugSnapshot(channel)
    expect(snapshot.engines).toEqual([{ ...engineSnapshot('e1', ['q'], { q: 'x' }), runtimeId: 'rt-snap' }])
    expect(snapshot.storage).toEqual([{ runtimeId: 'rt-snap', key: 'filters', status: 'ready', revision: 1 }])
    expect(snapshot.queues).toEqual([])
  })

  it('isolates a throwing snapshot source and contaminates no bucket', () => {
    const channel = createDebugChannel('rt-snap-throw')
    track(registerSnapshotSource(channel, 'engine', () => {
      throw new Error('describe boom')
    }))

    const snapshot = getDebugSnapshot(channel)
    expect(snapshot.engines).toEqual([])
    expect(snapshot.queues).toEqual([])
    expect(snapshot.storage).toEqual([])
  })

  it('drops a source that throws while being stamped, keeping the rest', () => {
    const channel = createDebugChannel('rt-hostile')
    // A value that survives describe() but explodes on enumeration (the central stamp
    // spreads it after describeSources() left its own try/catch).
    const hostile = new Proxy({}, {
      ownKeys() {
        throw new Error('boom')
      },
    }) as unknown as EngineSnapshot
    track(registerSnapshotSource(channel, 'engine', () => hostile))
    track(registerSnapshotSource(channel, 'engine', () => engineSnapshot('ok')))

    const snapshot = getDebugSnapshot(channel)
    expect(snapshot.engines).toEqual([{ ...engineSnapshot('ok'), runtimeId: 'rt-hostile' }])
  })

  it('restricts a snapshot to a target\'s own channel, never every runtime', () => {
    const channelA = createDebugChannel('rt-target-a')
    const channelB = createDebugChannel('rt-target-b')
    track(registerSnapshotSource(channelA, 'engine', () => engineSnapshot('ea')))
    track(registerSnapshotSource(channelB, 'engine', () => engineSnapshot('eb')))

    // A target is a handle, not a DebugChannel: it must resolve to the channel it wraps,
    // not fall through to aggregating B (and every other live runtime).
    const snapshot = getDebugSnapshot(bindDebugTarget(channelA, { bindingId: 'b' }))
    expect(snapshot.engines).toEqual([{ ...engineSnapshot('ea'), runtimeId: 'rt-target-a' }])
  })

  it('returns an empty snapshot for a foreign handle, never the global aggregate', () => {
    track(registerSnapshotSource(createDebugChannel('rt-present'), 'engine', () => engineSnapshot('e')))

    // A handle that is neither a channel nor a target resolves to nothing: selecting by it
    // must yield an empty snapshot, not silently widen to every live runtime.
    const noop = (): (() => void) => () => {}
    const foreign = { addReporter: noop, retainHistory: noop, registerSnapshotSource: noop }
    expect(getDebugSnapshot(foreign)).toEqual({ engines: [], queues: [], storage: [] })
  })
})

describe('debug protocol version', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(DEBUG_PROTOCOL_VERSION)).toBe(true)
    expect(DEBUG_PROTOCOL_VERSION).toBeGreaterThan(0)
  })
})

describe('normalizeForHistory', () => {
  it('drops functions and symbols', () => {
    expect(normalizeForHistory({ fn: () => 1, sym: Symbol('s'), keep: 1 })).toEqual({ keep: 1 })
  })

  it('reduces an Error to reportable fields', () => {
    const normalized = normalizeForHistory(new Error('bad')) as { name: string, message: string }
    expect(normalized.name).toBe('Error')
    expect(normalized.message).toBe('bad')
  })

  it('breaks cycles', () => {
    const cyclic: Record<string, unknown> = { a: 1 }
    cyclic.self = cyclic
    expect(normalizeForHistory(cyclic)).toEqual({ a: 1, self: '[Circular]' })
  })

  it('truncates long strings', () => {
    const normalized = normalizeForHistory('x'.repeat(5000), { maxDepth: 6, maxProps: 64, maxItems: 128, maxStringLength: 10, maxNodes: 4096 }) as string
    expect(normalized).toBe(`${'x'.repeat(10)}…`)
  })

  it('summarizes arrays past the item limit', () => {
    const normalized = normalizeForHistory([1, 2, 3, 4], { maxDepth: 6, maxProps: 64, maxItems: 2, maxStringLength: 4096, maxNodes: 4096 }) as unknown[]
    expect(normalized).toEqual([1, 2, '[+2 more]'])
  })
})

describe('globalDebugChannel', () => {
  it('has no runtimeId', () => {
    expect(globalDebugChannel.runtimeId).toBeUndefined()
  })

  it('emits without a context when none is in scope', () => {
    const events: DebugEvent[] = []
    track(globalDebugChannel.addReporter((event) => {
      if (event.code === 'gtq:reset') {
        events.push(event)
      }
    }))

    globalDebugChannel.debug('gtq:reset')

    expect(events[0]?.context).toBeUndefined()
  })
})

describe('debug bus: context dimensions', () => {
  it('carries bindingId, batchId and a cloned transactionIds', () => {
    const { channel, events } = collect(createDebugChannel('rt-dims'))
    const ids = [1, 2]

    channel.debug('gtq:settle', { dropped: [] }, { bindingId: 'b1', batchId: 9, transactionIds: ids })
    ids.push(3)

    expect(events[0]?.context).toEqual({ bindingId: 'b1', batchId: 9, transactionIds: [1, 2], runtimeId: 'rt-dims' })
  })

  it('omits monotonicTime when User Timing is unavailable', () => {
    vi.stubGlobal('performance', undefined)
    const { channel, events } = collect(createDebugChannel('rt-perf'))

    channel.debug('gtq:reset')

    expect(events[0]?.monotonicTime).toBeUndefined()
  })

  it('carries a context that omits the unset dimensions', () => {
    const { channel, events } = collect(createDebugChannel('rt-partial'))

    channel.debug('gtq:settle', { dropped: [] }, { bindingId: 'only' })

    expect(events[0]?.context).toEqual({ bindingId: 'only', runtimeId: 'rt-partial' })
  })
})

describe('debug bus: binding target', () => {
  it('merges an immutable base context and delegates observation to the channel', () => {
    const channel = createDebugChannel('rt-bound')
    const target = bindDebugTarget(channel, { bindingId: 'b7' })

    // The handle surface delegates straight to the underlying channel.
    expect(target.runtimeId).toBe('rt-bound')

    const events: DebugEvent[] = []
    track(target.addReporter(event => events.push(event)))
    track(target.retainHistory({ limit: 4 }))
    track(target.registerSnapshotSource('engine', () => engineSnapshot('e')))
    expect(isDebugArmed(target)).toBe(true)

    // The base bindingId wins: a call site cannot override or spoof it.
    emitDebug(target, 'ctx:change', { context: 'c', valid: [], invalid: [] }, { bindingId: 'spoofed', transactionIds: [1] })

    expect(events).toHaveLength(1)
    expect(events[0]!.context).toEqual({ runtimeId: 'rt-bound', bindingId: 'b7', transactionIds: [1] })
    // A source registered through the target is owned by the channel it wraps.
    expect(getDebugSnapshot(channel).engines).toEqual([{
      ...engineSnapshot('e'),
      runtimeId: 'rt-bound',
      bindingId: 'b7',
    }])
  })
})

describe('debug bus: public selection API', () => {
  it('routes addDebugReporter/retainDebugHistory to a specific channel', () => {
    const channel = createDebugChannel('rt-public')
    track(retainDebugHistory({ channel, limit: 5 }))
    channel.debug('gtq:settle', { dropped: ['a'] })

    const seen: DebugEvent[] = []
    track(addDebugReporter(event => seen.push(event), { channel, replay: true }))

    expect(seen).toHaveLength(1)
  })

  it('retains history on the hub without a channel', () => {
    track(retainDebugHistory({ limit: 3 }))
    const channel = createDebugChannel('rt-hubhist')
    channel.debug('gtq:reset')

    const seen: DebugEvent[] = []
    track(addDebugReporter(event => seen.push(event), { replay: true }))

    expect(seen.some(event => event.context?.runtimeId === 'rt-hubhist')).toBe(true)
  })

  it('reports hub arming via isDebugArmed with no channel', () => {
    expect(isDebugArmed()).toBe(false)
    track(addDebugReporter(() => {}))
    expect(isDebugArmed()).toBe(true)
  })

  it('applies the default history limit when none is given', () => {
    const channel = createDebugChannel('rt-default-limit')
    track(retainDebugHistory({ channel }))
    track(retainDebugHistory())

    expect(() => channel.debug('gtq:reset')).not.toThrow()
  })

  it('clamps non-finite and negative history limits', () => {
    const channel = createDebugChannel('rt-clamp')
    track(retainDebugHistory({ channel, limit: Number.POSITIVE_INFINITY }))
    track(retainDebugHistory({ channel, limit: -1 }))

    expect(() => channel.debug('gtq:reset')).not.toThrow()
  })

  it('does not arm a channel for a zero, negative, or NaN-only history lease', () => {
    const channel = createDebugChannel('rt-empty-lease')
    track(retainDebugHistory({ channel, limit: 0 }))
    track(retainDebugHistory({ channel, limit: -1 }))
    track(retainDebugHistory({ channel, limit: Number.NaN }))

    expect(isDebugArmed(channel)).toBe(false)
  })

  it('returns the same channel for one adapter identity', () => {
    const adapter = createTestingAdapter()

    expect(getDebugChannel(adapter)).toBe(getDebugChannel(adapter))
    expect(getDebugChannel(adapter).runtimeId).toMatch(/^rt/)
  })
})

describe('debug bus: snapshot queue bucket', () => {
  it('buckets a queue source', () => {
    const channel = createDebugChannel('rt-queue')
    track(registerSnapshotSource(channel, 'queue', () => ({ runtimeId: 'rt-queue', overlay: { q: 'x' }, overlayKeys: ['q'], scheduled: true })))

    expect(getDebugSnapshot(channel).queues).toEqual([{ runtimeId: 'rt-queue', overlay: { q: 'x' }, overlayKeys: ['q'], scheduled: true }])
  })

  it('aggregates across every live channel by default', () => {
    const channel = createDebugChannel('rt-live')
    track(registerSnapshotSource(channel, 'engine', () => engineSnapshot('live')))

    expect(getDebugSnapshot().engines.some(engine => engine.id === 'live')).toBe(true)
  })
})

const wideLimits = { maxDepth: 6, maxProps: 64, maxItems: 128, maxStringLength: 4096, maxNodes: 4096 }

describe('normalizeForHistory: value kinds', () => {
  it('unwraps refs and reactive proxies', () => {
    expect(normalizeForHistory(ref({ a: 1 }))).toEqual({ a: 1 })
    expect(normalizeForHistory(reactive({ a: 1 }))).toEqual({ a: 1 })
  })

  it('keeps bigint and formats dates and regexps', () => {
    expect(normalizeForHistory(10n)).toBe(10n)
    expect(normalizeForHistory(new Date('2026-06-22T00:00:00.000Z'))).toBe('2026-06-22T00:00:00.000Z')
    expect(normalizeForHistory(new Date('invalid'))).toBe('Invalid Date')
    expect(normalizeForHistory(/ab+c/gi)).toBe('/ab+c/gi')
  })

  it('normalizes Map and Set', () => {
    expect(normalizeForHistory(new Map([['a', 1]]))).toEqual({ '[Map]': [['a', 1]] })
    expect(normalizeForHistory(new Set([1, 2]))).toEqual({ '[Set]': [1, 2] })
  })

  it('summarizes Map and Set past the item limit', () => {
    const limits = { ...wideLimits, maxItems: 1 }
    expect(normalizeForHistory(new Map([['a', 1], ['b', 2]]), limits)).toEqual({ '[Map]': [['a', 1], '[+1 more]'] })
    expect(normalizeForHistory(new Set([1, 2]), limits)).toEqual({ '[Set]': [1, '[+1 more]'] })
  })

  it('summarizes past maxProps and maxDepth', () => {
    const wide = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`k${index}`, index]))
    const narrow = normalizeForHistory(wide, { ...wideLimits, maxProps: 2 }) as Record<string, unknown>
    expect(Object.keys(narrow)).toHaveLength(3)
    expect(narrow['…']).toBe('[truncated]')

    const deep = normalizeForHistory({ a: { b: 1 } }, { ...wideLimits, maxDepth: 1 }) as { a: unknown }
    expect(deep.a).toBe('[MaxDepth]')
  })

  it('stops at the node budget', () => {
    expect(normalizeForHistory({ a: 1 }, { ...wideLimits, maxNodes: 0 })).toBe('[Budget]')
  })

  it('skips inherited enumerable properties', () => {
    const object = Object.create({ inherited: 'x' })
    object.own = 1

    expect(normalizeForHistory(object)).toEqual({ own: 1 })
  })

  it('bounds scanning of a large inherited key set by the node budget', () => {
    const proto: Record<string, number> = {}
    for (let i = 0; i < 50; i++) {
      proto[`p${i}`] = i
    }
    const object = Object.create(proto)
    object.own = 1

    // A tiny budget must stop the scan long before every inherited key is examined.
    const result = normalizeForHistory(object, { ...wideLimits, maxProps: 1, maxNodes: 2 }) as Record<string, unknown>
    expect(result['…']).toBe('[truncated]')
  })

  it('keeps a hostile __proto__ key as data without polluting the prototype', () => {
    const hostile = JSON.parse('{"__proto__":{"polluted":true}}')
    const normalized = normalizeForHistory(hostile) as Record<string, unknown>

    expect(Object.getPrototypeOf(normalized)).toBe(Object.prototype)
    expect(Object.hasOwn(normalized, '__proto__')).toBe(true)
    expect((({}) as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('recovers from a throwing getter', () => {
    const object = {}
    Object.defineProperty(object, 'boom', { enumerable: true, get() {
      throw new Error('getter')
    } })

    expect(normalizeForHistory(object)).toEqual({ boom: '[Unreadable]' })
  })

  it('caps the error message length', () => {
    const normalized = normalizeForHistory(new Error('y'.repeat(50)), { ...wideLimits, maxStringLength: 10 }) as { message: string }
    expect(normalized.message).toBe(`${'y'.repeat(10)}…`)
  })

  it('passes null through', () => {
    expect(normalizeForHistory(null)).toBeNull()
    expect(normalizeForHistory({ a: null })).toEqual({ a: null })
  })

  it('handles an error without a stack', () => {
    const error = new Error('no stack')
    Object.defineProperty(error, 'stack', { value: undefined })
    const normalized = normalizeForHistory(error) as { stack?: string }
    expect(normalized.stack).toBeUndefined()
  })
})

describe('debug bus: unnormalizable history', () => {
  it('records a marker when normalization throws, without breaking dispatch', () => {
    const channel = createDebugChannel('rt-unnorm')
    track(retainDebugHistory({ channel, limit: 5 }))

    // A proxy whose `ownKeys` throws makes the top-level normalization walk fail.
    const hostile = new Proxy({ deltas: {}, pendingPathCount: 0 }, {
      ownKeys() {
        throw new Error('no keys')
      },
    })

    expect(() => channel.debug('gtq:enqueue', hostile)).not.toThrow()

    const replayed: DebugEvent[] = []
    track(channel.addReporter(event => replayed.push(event), { replay: true }))
    expect(replayed[0]?.data).toBe('[Unnormalizable]')
  })
})
