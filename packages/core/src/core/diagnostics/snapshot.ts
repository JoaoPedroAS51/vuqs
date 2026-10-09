import type { DebugChannel, DebugChannelHandle, SnapshotEntry } from './bus'
import { liveDebugChannels, resolveDebugChannel } from './bus'

/** The kind of subsystem a snapshot source describes. */
export type DebugSnapshotKind = 'engine' | 'queue' | 'storage'

/** The current state of one query-state engine instance. */
export interface EngineSnapshot {
  /** The runtime (adapter identity) this source belongs to, injected during aggregation. */
  readonly runtimeId?: string
  readonly bindingId?: string
  readonly id: string
  readonly keys: readonly string[]
  readonly managedPaths: readonly string[]
  readonly committedExplicitValues: Record<string, unknown>
  readonly optimisticExplicitValues: Record<string, unknown>
  readonly values: Record<string, unknown>
  readonly defaults: Record<string, unknown>
}

/** The current state of one adapter-scoped throttle queue. */
export interface QueueSnapshot {
  readonly runtimeId?: string
  readonly overlay: Record<string, unknown>
  readonly overlayKeys: readonly string[]
  readonly scheduled: boolean
}

/** The current state of one storage module. */
export interface StorageSnapshot {
  readonly runtimeId?: string
  readonly bindingId?: string
  readonly key: string
  readonly status: string
  readonly revision: number
}

/** Maps each snapshot kind to the concrete shape its source returns. */
export interface DebugSnapshotByKind {
  engine: EngineSnapshot
  queue: QueueSnapshot
  storage: StorageSnapshot
}

/** Current state of the live subsystems, collected on demand. */
export interface DebugSnapshot {
  readonly engines: EngineSnapshot[]
  readonly queues: QueueSnapshot[]
  readonly storage: StorageSnapshot[]
}

/**
 * Registers a source that describes a subsystem's current state.
 *
 * @param channel - The channel that owns the subsystem.
 * @param kind - Which bucket the described value belongs to.
 * @param describe - Produces the current state on demand.
 * @returns A function that unregisters the source.
 *
 * @internal
 */
export function registerSnapshotSource<Kind extends DebugSnapshotKind>(
  channel: DebugChannelHandle,
  kind: Kind,
  describe: () => DebugSnapshotByKind[Kind],
): () => void {
  return channel.registerSnapshotSource(kind, describe)
}

/**
 * Aggregates the current state across the live subsystems.
 *
 * @param channel - Restrict to one channel; omit to aggregate every live channel.
 */
export function getDebugSnapshot(channel?: DebugChannelHandle): DebugSnapshot {
  const engines: EngineSnapshot[] = []
  const queues: QueueSnapshot[] = []
  const storage: StorageSnapshot[] = []

  // A passed handle restricts to its own channel (a target unwraps to the one it wraps),
  // so selecting by channel can never fall through to aggregating every runtime. Only an
  // omitted argument aggregates the live channels.
  let channels: DebugChannel[]
  if (channel === undefined) {
    channels = liveDebugChannels()
  }
  else {
    const resolved = resolveDebugChannel(channel)
    channels = resolved === undefined ? [] : [resolved]
  }

  for (const source of channels) {
    for (const entry of source.describeSources()) {
      bucket(entry, source.runtimeId, engines, queues, storage)
    }
  }

  return { engines, queues, storage }
}

function bucket(entry: SnapshotEntry, runtimeId: string | undefined, engines: EngineSnapshot[], queues: QueueSnapshot[], storage: StorageSnapshot[]): void {
  if (entry.value === undefined) {
    return
  }

  // Assign runtimeId centrally so a source cannot spoof another runtime.
  //
  // Spreading a proxy or getter can throw outside describeSources()'s catch.
  // Isolate that failure to the affected source.
  try {
    const context = {
      runtimeId,
      ...(entry.context?.bindingId === undefined ? {} : { bindingId: entry.context.bindingId }),
    }

    if (entry.kind === 'engine') {
      engines.push({ ...entry.value, ...context })
    }
    else if (entry.kind === 'queue') {
      queues.push({ ...entry.value, ...context })
    }
    else {
      storage.push({ ...entry.value, ...context })
    }
  }
  catch {
    // A failing source must not prevent the remaining snapshots from being collected.
  }
}
