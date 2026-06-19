import type { QueryAdapter } from '../adapter'
import type { DebugEventCode, DebugEventMap, LogDebugCode, WarnDebugCode } from './events'
import type { DebugSnapshotByKind, DebugSnapshotKind } from './snapshot'
import { deepFreeze, normalizeForHistory } from './normalize'

/**
 * The version of the structured debug protocol (the {@link DebugEvent} envelope plus
 * the event payload shapes). A consumer such as `@vuqs/devtools` reads it on attach to
 * detect a mismatched core and degrade gracefully. Bump it on any breaking change to
 * the envelope or a payload shape.
 */
export const DEBUG_PROTOCOL_VERSION = 1

/** The severity of a debug event. */
export type DebugLevel = 'debug' | 'warn'

/**
 * Correlation dimensions attached to an event so a consumer can group related events.
 *
 * @remarks
 * Each dimension is independent: `runtimeId` isolates a `QueryAdapter` identity,
 * `bindingId` a binding/engine instance, and `transactionIds` the transaction(s) a
 * write produced. `transaction` ids are monotonic only within a single runtime.
 */
export interface DebugContext {
  readonly runtimeId?: string
  readonly bindingId?: string
  readonly transactionIds?: readonly number[]
  readonly batchId?: number
}

/**
 * The context a call site may supply. `runtimeId` is filled in by the channel and can
 * never be set at the call site, so it cannot diverge from the channel it was emitted
 * on.
 */
export type DebugEmissionContext = Omit<DebugContext, 'runtimeId'>

/**
 * A single structured debug event. Frozen before it reaches any reporter.
 *
 * @remarks
 * Live reporters receive `data` as read-only raw references (fast, no copy). Replayed
 * events (from a history lease) carry a normalized, bounded representation instead.
 * Both preserve `seq`, `timestamp`, `code`, and `context`.
 */
export interface DebugEvent {
  readonly code: string
  readonly scope: string
  readonly level: DebugLevel
  /** Global monotonic sequence assigned by the hub, so events from every channel share one order. */
  readonly seq: number
  /** Epoch milliseconds (`Date.now()`), available in every environment. */
  readonly timestamp: number
  /** High-resolution time (`performance.now()`) when available; for fine-grained timelines. */
  readonly monotonicTime?: number
  readonly context?: DebugContext
  readonly data: unknown
}

/** Discriminated union for consumers that understand this protocol version's codes. */
export type KnownDebugEvent = {
  [Code in DebugEventCode]: Omit<DebugEvent, 'code' | 'scope' | 'data'> & {
    readonly code: Code
    readonly scope: Code extends `${infer Scope}:${string}` ? Scope : string
    readonly data: DebugEventMap[Code]
  }
}[DebugEventCode]

/** A consumer of debug events. */
export type Reporter = (event: DebugEvent) => void

/** Options for a channel-bound {@link DebugChannelHandle.addReporter}. */
export interface ChannelReporterOptions {
  /** Replay the channel's retained history to this reporter before it starts receiving live events. */
  replay?: boolean
}

/** Options for a channel-bound {@link DebugChannelHandle.retainHistory}. */
export interface ChannelHistoryOptions {
  /** Most events to retain while this lease is held. */
  limit?: number
}

/** Options for {@link addDebugReporter}. */
export interface AddReporterOptions extends ChannelReporterOptions {
  /** Attach to a specific channel instead of the global hub. */
  channel?: DebugChannelHandle
}

/** Options for {@link retainDebugHistory}. */
export interface RetainHistoryOptions extends ChannelHistoryOptions {
  /** Retain on a specific channel instead of the global hub. */
  channel?: DebugChannelHandle
}

/**
 * The observation surface of a debug channel exposed to consumers.
 *
 * @remarks
 * It can attach reporters, retain history, and register snapshot sources, but it
 * cannot emit events: emission is internal to the core, so a consumer holding a
 * handle (e.g. from {@link getDebugChannel}) cannot forge internal event codes.
 */
export interface DebugChannelHandle {
  readonly runtimeId?: string
  addReporter: (reporter: Reporter, options?: ChannelReporterOptions) => () => void
  retainHistory: (options?: ChannelHistoryOptions) => () => void
  registerSnapshotSource: <Kind extends DebugSnapshotKind>(kind: Kind, describe: () => DebugSnapshotByKind[Kind]) => () => void
}

const DEFAULT_HISTORY_LIMIT = 200
// Hard ceiling so a lease of `Infinity` (or an absurd number) cannot retain without bound.
const MAX_HISTORY_LIMIT = 10_000

interface SnapshotSource {
  readonly kind: DebugSnapshotKind
  readonly describe: () => unknown
  readonly context?: DebugEmissionContext
}

/** A described subsystem, kept typed by its kind even when its source throws. */
export interface SnapshotEntry {
  readonly kind: DebugSnapshotKind
  readonly value: unknown
  readonly context?: DebugEmissionContext
}

function nowMonotonic(): number | undefined {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : undefined
}

function safeDeliver(reporter: Reporter, event: DebugEvent): void {
  try {
    reporter(event)
  }
  catch (error) {
    // A throwing reporter must never break the app or the other reporters.

    console.error(`[vuqs] error in debug reporter for "${event.code}"`, error)
  }
}

// A fixed-capacity circular buffer of retained (normalized) events. Insertion and
// eviction are O(1) with no per-event copy. The capacity is the largest limit among
// active leases; changing a lease resizes once (O(size)), not per event.
class HistoryBuffer {
  private readonly leases = new Set<{ limit: number }>()
  private buffer: DebugEvent[] = []
  private head = 0
  private size = 0
  private cap = 0

  leased(): boolean {
    return this.cap > 0
  }

  retain(limit: number): () => void {
    const lease = { limit: clampLimit(limit) }
    this.leases.add(lease)
    this.applyCapacity()

    return () => {
      this.leases.delete(lease)
      this.applyCapacity()
    }
  }

  add(event: DebugEvent): void {
    if (this.cap === 0) {
      return
    }

    if (this.size < this.cap) {
      this.buffer[(this.head + this.size) % this.cap] = event
      this.size++
    }
    else {
      // Full: overwrite the oldest slot and advance the head.
      this.buffer[this.head] = event
      this.head = (this.head + 1) % this.cap
    }
  }

  // A stable copy in insertion order, so a replay callback that emits cannot disturb it.
  snapshot(): DebugEvent[] {
    const out: DebugEvent[] = []

    for (let index = 0; index < this.size; index++) {
      out.push(this.buffer[(this.head + index) % this.cap])
    }

    return out
  }

  private capacity(): number {
    let cap = 0

    for (const { limit } of this.leases) {
      if (limit > cap) {
        cap = limit
      }
    }

    return cap
  }

  private applyCapacity(): void {
    const next = this.capacity()

    if (next === this.cap) {
      return
    }

    const kept = this.snapshot()
    const trimmed = kept.length > next ? kept.slice(kept.length - next) : kept
    this.buffer = trimmed.slice()
    this.head = 0
    this.size = trimmed.length
    this.cap = next
  }
}

function clampLimit(limit: number): number {
  if (limit === Number.POSITIVE_INFINITY) {
    return MAX_HISTORY_LIMIT
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    return 0
  }

  return Math.min(Math.floor(limit), MAX_HISTORY_LIMIT)
}

// A registry of reporters plus a history buffer, shared by every channel and the hub.
class ReporterSet {
  private readonly reporters = new Set<Reporter>()
  readonly history = new HistoryBuffer()

  armed(): boolean {
    return this.reporters.size > 0 || this.history.leased()
  }

  add(reporter: Reporter, replay: boolean): () => void {
    if (replay) {
      for (const event of this.history.snapshot()) {
        safeDeliver(reporter, event)
      }
    }

    this.reporters.add(reporter)

    return () => {
      this.reporters.delete(reporter)
    }
  }

  deliver(event: DebugEvent): void {
    // Snapshot the set so a reporter that (un)subscribes mid-dispatch cannot disturb this pass.
    for (const reporter of [...this.reporters]) {
      safeDeliver(reporter, event)
    }
  }
}

interface EmissionDraft {
  channel: DebugChannel
  code: string
  level: DebugLevel
  payload: unknown
  context?: DebugEmissionContext
}

// The single process-global aggregation point. It owns the one event queue: it assigns
// `seq`/timestamps, freezes the envelope, records history, then fans out, normalizing
// and recording before any reporter runs, so a reporter cannot mutate `data` before the
// retained record is taken.
class DebugHub {
  private readonly consumers = new ReporterSet()
  private readonly channels = new Set<WeakRef<DebugChannel>>()
  // Drop a channel's wrapper as soon as it is collected, so a per-request SSR channel
  // with no attached devtools does not leak a retained `WeakRef` forever. The callback
  // runs only on GC, which a test cannot force.
  /* v8 ignore start */
  private readonly finalizer = new FinalizationRegistry<WeakRef<DebugChannel>>(
    ref => this.channels.delete(ref),
  )
  /* v8 ignore stop */

  private readonly queue: EmissionDraft[] = []
  private cursor = 0
  private seq = 0
  private dispatching = false

  armed(): boolean {
    return this.consumers.armed()
  }

  registerChannel(channel: DebugChannel): void {
    const ref = new WeakRef(channel)
    this.channels.add(ref)
    this.finalizer.register(channel, ref)
  }

  addReporter(reporter: Reporter, replay: boolean): () => void {
    return this.consumers.add(reporter, replay)
  }

  retainHistory(limit: number): () => void {
    return this.consumers.history.retain(limit)
  }

  enqueue(draft: EmissionDraft): void {
    this.queue.push(draft)

    if (this.dispatching) {
      return
    }

    this.dispatching = true

    try {
      // Advance a read cursor rather than `shift()`, so a large reentrant burst dequeues
      // in O(1) per draft instead of O(n) per shift.
      while (this.cursor < this.queue.length) {
        this.process(this.queue[this.cursor++]!)
      }
    }
    finally {
      this.queue.length = 0
      this.cursor = 0
      this.dispatching = false
    }
  }

  liveChannels(): DebugChannel[] {
    const alive: DebugChannel[] = []

    for (const ref of this.channels) {
      const channel = ref.deref()

      /* v8 ignore next 3 -- a collected channel is pruned by the FinalizationRegistry; reaching it here is a GC-timing fallback that cannot be forced in a test */
      if (channel === undefined) {
        this.channels.delete(ref)
      }
      else {
        alive.push(channel)
      }
    }

    return alive
  }

  private process(draft: EmissionDraft): void {
    const separator = draft.code.indexOf(':')
    /* v8 ignore next -- every catalog code is `scope:name`, so `:` is always present */
    const scope = separator === -1 ? draft.code : draft.code.slice(0, separator)

    const event: DebugEvent = Object.freeze({
      code: draft.code,
      scope,
      level: draft.level,
      seq: this.seq++,
      timestamp: Date.now(),
      monotonicTime: nowMonotonic(),
      context: buildContext(draft.channel.runtimeId, draft.context),
      data: draft.payload,
    })

    this.record(draft.channel, event)

    draft.channel.deliverLocal(event)
    this.consumers.deliver(event)
  }

  private record(channel: DebugChannel, event: DebugEvent): void {
    if (!channel.reporterSet.history.leased() && !this.consumers.history.leased()) {
      return
    }

    let normalized: DebugEvent

    try {
      // Deep-freeze the payload as well as the envelope: the record is stored once and
      // shared by both history buffers and every replay, so mutable `data` would allow one
      // reporter to corrupt what the next one replays.
      normalized = Object.freeze({ ...event, data: deepFreeze(normalizeForHistory(event.data)) })
    }
    catch {
      normalized = Object.freeze({ ...event, data: '[Unnormalizable]' })
    }

    channel.reporterSet.history.add(normalized)
    this.consumers.history.add(normalized)
  }
}

const hub = new DebugHub()

function buildContext(runtimeId: string | undefined, emission?: DebugEmissionContext): DebugContext | undefined {
  const context: { -readonly [Key in keyof DebugContext]: DebugContext[Key] } = {}

  if (runtimeId !== undefined) {
    context.runtimeId = runtimeId
  }

  if (emission !== undefined) {
    if (emission.bindingId !== undefined) {
      context.bindingId = emission.bindingId
    }

    if (emission.transactionIds !== undefined) {
      // Clone so a later mutation of the caller's array cannot rewrite retained history.
      context.transactionIds = Object.freeze([...emission.transactionIds])
    }

    if (emission.batchId !== undefined) {
      context.batchId = emission.batchId
    }
  }

  return Object.keys(context).length > 0 ? Object.freeze(context) : undefined
}

type EmissionArgs<Code extends DebugEventCode> = DebugEventMap[Code] extends undefined
  ? [payload?: undefined, context?: DebugEmissionContext]
  : [payload: DebugEventMap[Code], context?: DebugEmissionContext]

/**
 * A per-runtime (or the global-fallback) debug channel. Core subsystems hold the
 * concrete channel to emit; consumers receive only its {@link DebugChannelHandle}.
 *
 * @internal
 */
export class DebugChannel implements DebugChannelHandle {
  readonly runtimeId?: string
  /** @internal */
  readonly reporterSet = new ReporterSet()
  private readonly snapshotSources = new Set<SnapshotSource>()

  constructor(runtimeId?: string) {
    this.runtimeId = runtimeId
    hub.registerChannel(this)
  }

  debug<Code extends LogDebugCode>(code: Code, ...args: EmissionArgs<Code>): void {
    emit(this, code, 'debug', args[0], args[1])
  }

  warn<Code extends WarnDebugCode>(code: Code, ...args: EmissionArgs<Code>): void {
    emit(this, code, 'warn', args[0], args[1])
  }

  addReporter(reporter: Reporter, options: ChannelReporterOptions = {}): () => void {
    return this.reporterSet.add(reporter, options.replay ?? false)
  }

  retainHistory(options: ChannelHistoryOptions = {}): () => void {
    return this.reporterSet.history.retain(options.limit ?? DEFAULT_HISTORY_LIMIT)
  }

  registerSnapshotSource<Kind extends DebugSnapshotKind>(
    kind: Kind,
    describe: () => DebugSnapshotByKind[Kind],
    context?: DebugEmissionContext,
  ): () => void {
    const source: SnapshotSource = { kind, describe, context }
    this.snapshotSources.add(source)

    return () => {
      this.snapshotSources.delete(source)
    }
  }

  /** @internal */
  deliverLocal(event: DebugEvent): void {
    this.reporterSet.deliver(event)
  }

  /** @internal */
  armed(): boolean {
    return this.reporterSet.armed() || hub.armed()
  }

  /** @internal */
  describeSources(): SnapshotEntry[] {
    const entries: SnapshotEntry[] = []

    for (const { kind, describe, context } of this.snapshotSources) {
      try {
        entries.push({ kind, value: describe(), context })
      }
      catch {
        entries.push({ kind, value: undefined, context })
      }
    }

    return entries
  }
}

function emit(channel: DebugChannel | undefined, code: string, level: DebugLevel, payload: unknown, context?: DebugEmissionContext): void {
  // Fast path: no resolvable channel, or nothing armed on it or the hub, so skip all work.
  if (channel === undefined || !channel.armed()) {
    return
  }

  hub.enqueue({ channel, code, level, payload, context })
}

/**
 * A binding-scoped view over an adapter's {@link DebugChannel}: it merges an immutable
 * base context (the owning binding's id) into every emission, but shares the channel's
 * single FIFO, history, and snapshot registry. Reporters, leases, and snapshot
 * registration delegate straight to the channel; only emission carries the base context.
 *
 * @remarks
 * The base context wins over a call site's own context, so every binding-scoped event
 * keeps the target's `bindingId`.
 *
 * @internal
 */
class DebugTarget implements DebugChannelHandle {
  constructor(readonly channel: DebugChannel, readonly base: DebugEmissionContext) {}

  get runtimeId(): string | undefined {
    return this.channel.runtimeId
  }

  addReporter(reporter: Reporter, options?: ChannelReporterOptions): () => void {
    return this.channel.addReporter(reporter, options)
  }

  retainHistory(options?: ChannelHistoryOptions): () => void {
    return this.channel.retainHistory(options)
  }

  registerSnapshotSource<Kind extends DebugSnapshotKind>(kind: Kind, describe: () => DebugSnapshotByKind[Kind]): () => void {
    return this.channel.registerSnapshotSource(kind, describe, this.base)
  }
}

/**
 * Binds a base context onto a channel, returning a handle whose emissions always carry
 * it. Used to attach a `bindingId` once, per binding, instead of at every call site.
 *
 * @internal
 */
export function bindDebugTarget(channel: DebugChannelHandle, base: DebugEmissionContext): DebugChannelHandle {
  return new DebugTarget(channel as DebugChannel, base)
}

/**
 * Resolves any handle to its concrete channel: a target unwraps to the channel it
 * wraps; a channel is itself; anything else is `undefined`. The single place that knows
 * how a handle maps to a channel, reused by emission, arming, and snapshots, so a target
 * can never be mistaken for "no channel" (which aggregates every runtime).
 *
 * @internal
 */
export function resolveDebugChannel(handle?: DebugChannelHandle): DebugChannel | undefined {
  if (handle instanceof DebugTarget) {
    return handle.channel
  }

  if (handle instanceof DebugChannel) {
    return handle
  }

  return undefined
}

function resolveEmit(sink: DebugChannelHandle): { channel: DebugChannel | undefined, base?: DebugEmissionContext } {
  // Reuse the one handle→channel resolver; only the base context is target-specific.
  return {
    channel: resolveDebugChannel(sink),
    base: sink instanceof DebugTarget ? sink.base : undefined,
  }
}

function mergeContext(base: DebugEmissionContext | undefined, context: DebugEmissionContext | undefined): DebugEmissionContext | undefined {
  if (base === undefined) {
    return context
  }

  if (context === undefined) {
    return base
  }

  // The base (binding) context is spread last, so a call site cannot override it.
  return { ...context, ...base }
}

/**
 * Emits a log-level event through a channel handle. Core call sites use this so they
 * only hold the opaque handle: the concrete channel's emit stays internal, and a
 * consumer holding a handle cannot forge event codes. A handle bound to a base context
 * ({@link bindDebugTarget}) merges it into the emission.
 *
 * @internal
 */
export function emitDebug<Code extends LogDebugCode>(channel: DebugChannelHandle, code: Code, ...args: EmissionArgs<Code>): void {
  const { channel: concrete, base } = resolveEmit(channel)
  emit(concrete, code, 'debug', args[0], mergeContext(base, args[1]))
}

/**
 * The warn-level counterpart of {@link emitDebug}.
 *
 * @internal
 */
export function emitWarn<Code extends WarnDebugCode>(channel: DebugChannelHandle, code: Code, ...args: EmissionArgs<Code>): void {
  const { channel: concrete, base } = resolveEmit(channel)
  emit(concrete, code, 'warn', args[0], mergeContext(base, args[1]))
}

/**
 * The fallback channel for diagnostics emitted without a runtime in scope (a standalone
 * codec, a missing adapter). Events here are not isolated to any request.
 *
 * @internal
 */
export const globalDebugChannel = new DebugChannel()

/**
 * Creates a debug channel bound to a runtime identity. Each `QueryRuntime` owns one.
 *
 * @internal
 */
export function createDebugChannel(runtimeId: string): DebugChannel {
  return new DebugChannel(runtimeId)
}

const channelsByAdapter = new WeakMap<object, DebugChannel>()
let adapterSeq = 0

/**
 * Returns the debug channel bound to an adapter identity, creating it on first use.
 * Query runtimes resolve their channel through the same map.
 *
 * @internal
 */
export function debugChannelForAdapter(adapter: object): DebugChannel {
  let channel = channelsByAdapter.get(adapter)

  if (channel === undefined) {
    channel = new DebugChannel(`rt${(adapterSeq++).toString(36)}`)
    channelsByAdapter.set(adapter, channel)
  }

  return channel
}

/**
 * Returns the {@link DebugChannelHandle} for an adapter identity, so a consumer can
 * observe (or retain history for) a single runtime instead of the global hub.
 *
 * @param adapter - The query adapter whose events to select.
 */
export function getDebugChannel(adapter: QueryAdapter): DebugChannelHandle {
  return debugChannelForAdapter(adapter)
}

/**
 * Registers a reporter that receives every debug event, returning a disposer that
 * removes it. Multiple reporters coexist; removing one never affects another.
 *
 * @param reporter - Invoked with each event. A throw is caught and never propagates.
 * @param options - `replay` to receive retained history first; `channel` to observe a
 *   single channel instead of the global hub.
 * @returns A function that detaches the reporter.
 */
export function addDebugReporter(reporter: Reporter, options: AddReporterOptions = {}): () => void {
  if (options.channel !== undefined) {
    return options.channel.addReporter(reporter, { replay: options.replay })
  }

  return hub.addReporter(reporter, options.replay ?? false)
}

/**
 * Takes a lease that makes events be retained for replay, returning a disposer that
 * releases it. While any lease is held the buffer keeps up to the largest lease's
 * limit; releasing the largest lease shrinks it.
 *
 * @param options - `limit` for the retained count; `channel` to retain a single
 *   channel's history instead of the global hub's.
 * @returns A function that releases the lease.
 */
export function retainDebugHistory(options: RetainHistoryOptions = {}): () => void {
  if (options.channel !== undefined) {
    return options.channel.retainHistory({ limit: options.limit })
  }

  return hub.retainHistory(options.limit ?? DEFAULT_HISTORY_LIMIT)
}

/**
 * Reports whether debug observation is active for a channel (or globally). Emit call
 * sites on hot paths guard their payload construction with this.
 *
 * @param channel - The channel to check; omit to check the global hub only.
 */
export function isDebugArmed(channel?: DebugChannelHandle): boolean {
  const concrete = resolveDebugChannel(channel)

  return concrete === undefined ? hub.armed() : concrete.armed()
}

/**
 * Returns the live channels registered with the hub (fallback + any runtime channels
 * still alive), for aggregating snapshots.
 *
 * @internal
 */
export function liveDebugChannels(): DebugChannel[] {
  return hub.liveChannels()
}
