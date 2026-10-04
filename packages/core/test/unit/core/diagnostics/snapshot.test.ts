import type { EngineSnapshot } from '../../../../src/core/diagnostics/snapshot'
import { describe, expect, it } from 'vitest'
import { bindDebugTarget, createDebugChannel } from '../../../../src/core/diagnostics/bus'
import { getDebugSnapshot, registerSnapshotSource } from '../../../../src/core/diagnostics/snapshot'
import { engineSnapshot, track } from './helpers'

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
