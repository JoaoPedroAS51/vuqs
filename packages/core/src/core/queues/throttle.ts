import type { EffectScope, ShallowRef } from 'vue'
import type { QueryAdapter } from '../adapter'
import type { DebugChannel, DebugEmissionContext } from '../debug/bus'
import type { NavigateOptions, ParsedQuery, ParsedQueryValue } from '../types'
import { effectScope, shallowRef, toValue, triggerRef, watch } from 'vue'
import { debugChannelForAdapter, emitDebug, emitWarn, isDebugArmed } from '../debug/bus'
import { normalizeForHistory } from '../debug/normalize'
import { registerSnapshotSource } from '../debug/snapshot'
import { structuralEq } from '../equality'
import { runManagedNavigation } from '../managed-navigation'
import { collectLeafPaths, deletePath, getPath, pruneEmptyAncestors, setPath } from '../path'
import { cloneQuery } from '../query-object'

/**
 * One pending write for a single query path: a raw value to set, or `null` to
 * remove the path from the URL.
 */
export type OverlayDelta = ParsedQueryValue | null

/**
 * The optimistic overlay: raw pending writes keyed by query path.
 *
 * @remarks
 * A path present here overrides the live URL until a navigation commits and the
 * URL catches up. Values are raw (already serialized), so the overlay is the one
 * namespace every engine shares regardless of its schema or codecs.
 */
export type Overlay = Record<string, OverlayDelta>

// Coalescing several writes in one window: an explicit value carries over, with
// the more navigational choice winning a conflict (`push` over `replace`, scroll
// over no scroll). An option left undefined never overrides one already set.
function mergeOptions(base: NavigateOptions, next: NavigateOptions): NavigateOptions {
  const result: NavigateOptions = { ...base }

  if (next.history !== undefined) {
    result.history = result.history === 'push' || next.history === 'push' ? 'push' : next.history
  }

  if (next.scroll !== undefined) {
    result.scroll = result.scroll === true || next.scroll === true ? true : next.scroll
  }

  return result
}

interface DebugBatch {
  readonly id: number
  readonly transactionIds: Set<number>
  writeCount: number
}

interface OverlayDebugOwner {
  readonly batchId: number
  readonly transactionIds: Set<number>
}

interface AttemptedDelta {
  readonly delta: OverlayDelta
  readonly version: number
}

interface ExpectedCommit {
  readonly attempt: ReadonlyMap<string, AttemptedDelta>
  readonly context?: DebugEmissionContext
  observed: boolean
}

/**
 * The adapter-scoped queue that coalesces writes into a single navigation.
 *
 * @remarks
 * One instance backs one adapter identity. Writes from any engine merge into
 * {@link ThrottledQueue.overlay | overlay}: one canonical object
 * behind a `shallowRef`, notified atomically after each transaction without copying
 * all previously pending paths. One adapter-scoped observer owns settlement and external
 * commit visibility, independent of any binding lifecycle. Flushes serialize async
 * navigations, so an older router commit cannot complete after and overwrite a
 * newer batch.
 */
export class ThrottledQueue {
  /** The single optimistic overlay shared by every engine using this adapter. */
  readonly overlay: ShallowRef<Overlay> = shallowRef<Overlay>(Object.create(null) as Overlay)

  private readonly debug: DebugChannel
  private options: NavigateOptions = {}
  private scheduled = false
  private navigationPending = false
  private flushAfterNavigation = false
  private expectedCommit: ExpectedCommit | undefined
  private generation = 0
  private overlaySize = 0
  private nextOverlayVersion = 1
  private readonly overlayVersions = new Map<string, number>()
  private adapterObserver: EffectScope | undefined
  private bindingOwners = 0
  private nextDebugBatchId = 1
  private debugBatch: DebugBatch | undefined
  // Debug-only ownership survives the flush until the URL reflects each path. It is
  // populated only while observed, preserving the disarmed path's zero-retention goal.
  private readonly overlayDebugOwners = new Map<string, OverlayDebugOwner>()

  constructor(private readonly adapter: QueryAdapter) {
    this.debug = debugChannelForAdapter(adapter)

    // One queue lives for the whole channel, so its snapshot source needs no disposer:
    // it is collected with the channel when the adapter identity is.
    registerSnapshotSource(this.debug, 'queue', () => ({
      overlay: normalizeForHistory(this.overlay.value) as Record<string, unknown>,
      overlayKeys: Object.keys(this.overlay.value),
      scheduled: this.scheduled,
    }))
  }

  /** Keeps committed-query observation alive for one engine binding. @internal */
  retainBinding(): () => void {
    this.bindingOwners++
    this.ensureAdapterObserver()
    let active = true

    return () => {
      if (!active) {
        return
      }
      active = false
      this.bindingOwners--
      this.stopAdapterObserverIfIdle()
    }
  }

  /**
   * Reserves the observed batch before a transaction mutates the queue, allowing the
   * true `tx:start` and `binding:set` events to carry the same batch as enqueue/flush.
   * Returns `undefined` without retaining transaction metadata when debug is disarmed.
   *
   * @internal
   */
  reserveDebugBatch(transactionId: number): DebugEmissionContext | undefined {
    if (!isDebugArmed(this.debug)) {
      return undefined
    }

    return this.contextFor(this.ensureDebugBatch(transactionId), [transactionId])
  }

  /**
   * Records a write in the overlay and schedules the coalesced navigation.
   *
   * @param deltas - Raw pending writes keyed by query path (`null` removes a path).
   * @param options - The resolved navigation options for this write.
   * @param throttleMs - Coalesce within this many ms; `0` flushes on a microtask.
   * @param transactionId - The transaction this write belongs to, for correlation.
   */
  push(deltas: Overlay, options: NavigateOptions, throttleMs: number, transactionId?: number): void {
    const armed = isDebugArmed(this.debug)
    const batch = armed ? this.ensureDebugBatch(transactionId) : undefined
    const entries = Object.entries(deltas)
    if (entries.length > 0) {
      // Direct queue consumers may not own an engine binding. Pending overlay state
      // still needs observation until it commits.
      this.ensureAdapterObserver()
    }
    // Keep one canonical object and notify once after the whole transaction is applied.
    // Re-spreading an overlay that grows one path at a time makes a burst of T writes
    // copy O(T²) keys. `triggerRef` preserves the same atomic reactive boundary without
    // copying paths that this write did not touch.
    for (const [path, delta] of entries) {
      if (!Object.hasOwn(this.overlay.value, path)) {
        this.overlaySize++
      }
      this.overlay.value[path] = delta
      this.overlayVersions.set(path, this.nextOverlayVersion++)

      if (batch !== undefined) {
        const existing = this.overlayDebugOwners.get(path)
        const transactionIds = existing?.batchId === batch.id
          ? existing.transactionIds
          : new Set<number>()
        if (transactionId !== undefined) {
          transactionIds.add(transactionId)
        }
        this.overlayDebugOwners.set(path, { batchId: batch.id, transactionIds })
      }
    }
    if (entries.length > 0) {
      triggerRef(this.overlay)
    }

    if (batch !== undefined) {
      emitDebug(
        this.debug,
        'gtq:enqueue',
        { deltas: { ...deltas }, pendingPathCount: this.overlaySize },
        this.contextFor(batch, transactionId === undefined ? [] : [transactionId]),
      )
    }

    const previous = this.options
    const resolved = mergeOptions(previous, options)
    this.options = resolved

    if (batch !== undefined) {
      batch.writeCount++
      if (batch.writeCount > 1) {
        emitDebug(this.debug, 'gtq:coalesce', {
          previous: { ...previous },
          incoming: { ...options },
          resolved: { ...resolved },
          writeCount: batch.writeCount,
        }, this.contextFor(batch))
      }
    }

    this.scheduleFlush(throttleMs, batch)
  }

  /**
   * Drops paths from the overlay once the URL reflects them.
   *
   * @remarks
   * Called by the queue's adapter-scoped observer after a navigation commits, so the
   * committed model holds: an entry is kept until the URL catches up, then removed so
   * the URL becomes the source of truth again.
   *
   * @param paths - The query paths the URL has caught up to.
   */
  settle(paths: string[]): void {
    if (paths.length === 0) {
      return
    }

    const dropped: string[] = []
    const groups = new Map<number, { paths: string[], transactionIds: Set<number> }>()
    const armed = isDebugArmed(this.debug)
    const current = this.overlay.value

    for (const path of paths) {
      if (Object.hasOwn(current, path)) {
        delete current[path]
        this.overlayVersions.delete(path)
        this.overlaySize--
        dropped.push(path)

        const owner = this.overlayDebugOwners.get(path)
        this.overlayDebugOwners.delete(path)
        if (armed && owner !== undefined) {
          let group = groups.get(owner.batchId)
          if (group === undefined) {
            group = { paths: [], transactionIds: new Set<number>() }
            groups.set(owner.batchId, group)
          }
          group.paths.push(path)
          for (const id of owner.transactionIds) {
            group.transactionIds.add(id)
          }
        }
      }
    }

    if (dropped.length > 0) {
      triggerRef(this.overlay)

      if (groups.size === 0) {
        emitDebug(this.debug, 'gtq:settle', { dropped })
      }
      else {
        for (const [batchId, group] of groups) {
          emitDebug(this.debug, 'gtq:settle', { dropped: group.paths }, {
            batchId,
            transactionIds: [...group.transactionIds].sort((a, b) => a - b),
          })
        }
      }
    }
    this.stopAdapterObserverIfIdle()
  }

  /** Clears the overlay and pending navigation; used for test and SSR isolation. */
  reset(): void {
    const paths = Object.keys(this.overlay.value)
    for (const path of paths) {
      delete this.overlay.value[path]
    }
    if (paths.length > 0) {
      triggerRef(this.overlay)
    }
    this.overlaySize = 0
    this.overlayVersions.clear()
    this.stopAdapterObserverIfIdle()
    this.options = {}
    this.scheduled = false
    this.flushAfterNavigation = false
    this.expectedCommit = undefined
    this.debugBatch = undefined
    this.overlayDebugOwners.clear()
    // Invalidate any flush already scheduled, so it cannot fire against a later push.
    this.generation++
    emitDebug(this.debug, 'gtq:reset')
  }

  private handleAdapterCommit(query: ParsedQuery, previous: ParsedQuery): void {
    const pendingPathCount = this.overlaySize
    const expected = this.expectedCommit
    const managed = expected !== undefined && reflectsAttempt(query, expected.attempt)
    if (managed) {
      expected.observed = true
    }

    if (isDebugArmed(this.debug)) {
      const paths = managed
        ? [...expected.attempt.keys()]
        : changedQueryPaths(previous, query)
      emitDebug(this.debug, 'adapter:commit', {
        query: cloneQuery(query),
        paths,
        pendingPathCount,
        source: managed ? 'write' : 'external',
      }, managed ? expected.context : undefined)
    }

    if (pendingPathCount === 0) {
      return
    }

    this.reconcile(query)
  }

  private ensureAdapterObserver(): void {
    if (this.adapterObserver !== undefined) {
      return
    }

    const scope = effectScope(true)
    this.adapterObserver = scope
    scope.run(() => {
      watch(
        () => toValue(this.adapter.query),
        (query, previous) => this.handleAdapterCommit(query, previous),
        { flush: 'sync' },
      )
    })
  }

  private stopAdapterObserverIfIdle(): void {
    if (this.bindingOwners > 0 || this.overlaySize > 0) {
      return
    }

    this.adapterObserver?.stop()
    this.adapterObserver = undefined
  }

  private reconcile(query: ParsedQuery): void {
    if (this.overlaySize === 0) {
      return
    }

    const reflected: string[] = []

    for (const [path, delta] of Object.entries(this.overlay.value)) {
      const urlValue = getPath(query, path)
      const settled = delta === null ? urlValue === undefined : structuralEq(urlValue, delta)

      if (settled) {
        reflected.push(path)
      }
    }

    this.settle(reflected)
  }

  private ensureDebugBatch(transactionId?: number): DebugBatch {
    let batch = this.debugBatch

    if (batch === undefined) {
      batch = { id: this.nextDebugBatchId++, transactionIds: new Set<number>(), writeCount: 0 }
      this.debugBatch = batch
    }

    if (transactionId !== undefined) {
      batch.transactionIds.add(transactionId)
    }

    return batch
  }

  private contextFor(batch: DebugBatch, transactionIds: readonly number[] = [...batch.transactionIds]): DebugEmissionContext {
    return {
      batchId: batch.id,
      ...(transactionIds.length === 0 ? {} : { transactionIds: [...transactionIds].sort((a, b) => a - b) }),
    }
  }

  private scheduleFlush(timeMs: number, batch?: DebugBatch): void {
    if (this.scheduled || this.flushAfterNavigation) {
      return
    }

    this.scheduled = true
    emitDebug(
      this.debug,
      'gtq:schedule',
      { delayMs: timeMs, mechanism: timeMs > 0 ? 'timer' : 'microtask' },
      batch === undefined ? undefined : this.contextFor(batch),
    )

    const generation = this.generation
    const run = (): void => {
      if (generation === this.generation) {
        this.flush()
      }
    }

    if (timeMs > 0) {
      setTimeout(run, timeMs)
    }
    else {
      queueMicrotask(run)
    }
  }

  private flush(): void {
    this.scheduled = false

    // A router is allowed to complete asynchronously. Serializing navigations prevents
    // an older commit from landing after a newer one and regressing the URL. Writes made
    // while a navigation is pending stay optimistic in the overlay and flush as soon as
    // that navigation settles.
    if (this.navigationPending) {
      this.flushAfterNavigation = true
      return
    }

    const armed = isDebugArmed(this.debug)
    const batch = armed ? (this.debugBatch ?? this.ensureDebugBatch()) : undefined
    this.debugBatch = undefined

    const paths = Object.keys(this.overlay.value)
    const options = this.options
    this.options = {}

    if (paths.length === 0) {
      emitDebug(
        this.debug,
        'gtq:flush-skip',
        { reason: 'no paths' },
        batch === undefined ? undefined : this.contextFor(batch),
      )
      return
    }

    const attempt = new Map<string, AttemptedDelta>()
    for (const path of paths) {
      attempt.set(path, {
        delta: this.overlay.value[path],
        version: this.overlayVersions.get(path)!,
      })
    }

    // A new navigation reapplies every still-pending path, including paths from an
    // earlier in-flight navigation. Attribute their eventual settlement to this latest
    // batch and carry every contributing transaction forward.
    if (batch !== undefined) {
      for (const path of paths) {
        const owner = this.overlayDebugOwners.get(path)
        if (owner !== undefined) {
          for (const id of owner.transactionIds) {
            batch.transactionIds.add(id)
          }
        }
      }
      const ownership = { batchId: batch.id, transactionIds: new Set(batch.transactionIds) }
      for (const path of paths) {
        this.overlayDebugOwners.set(path, ownership)
      }
    }
    else {
      this.overlayDebugOwners.clear()
    }

    const current = toValue(this.adapter.query)
    const next = cloneQuery(current)

    for (const path of paths) {
      const delta = this.overlay.value[path]

      if (delta === null) {
        deletePath(next, path)
        pruneEmptyAncestors(next, path)
      }
      else {
        setPath(next, path, delta)
      }
    }

    if (armed) {
      emitDebug(
        this.debug,
        'gtq:flush',
        { paths: changedQueryPaths(current, next), query: cloneQuery(next), options: { ...options } },
        this.contextFor(batch!),
      )
    }

    const context = batch === undefined ? undefined : this.contextFor(batch)
    if (armed) {
      emitDebug(this.debug, 'adapter:navigate', {
        adapter: this.adapter.debugName ?? 'custom',
        mode: options.history === 'push' ? 'push' : 'replace',
        query: cloneQuery(next),
      }, this.contextFor(batch!))
    }

    const expectedCommit: ExpectedCommit = { attempt, context, observed: false }
    this.expectedCommit = expectedCommit
    const navigationGeneration = this.generation

    try {
      const navigation = runManagedNavigation(this.adapter, () => this.adapter.navigate(next, options))
      if (navigation !== undefined) {
        this.navigationPending = true
        void navigation
          .then(() => {
            if (navigationGeneration === this.generation) {
              this.completeNavigation(expectedCommit)
            }
          })
          .catch((error) => {
            if (navigationGeneration === this.generation) {
              this.reportNavigationError(error, attempt, context)
            }
          })
          .finally(() => {
            this.expectedCommit = undefined
            this.navigationPending = false
            if (this.flushAfterNavigation) {
              this.flushAfterNavigation = false
              this.scheduleFlush(0, this.debugBatch)
            }
          })
      }
      else {
        // A successful no-op navigation may not replace/notify `adapter.query` (the URL
        // already matched). Reconcile explicitly so its optimistic delta cannot survive
        // indefinitely and shadow a later external change.
        this.completeNavigation(expectedCommit)
        this.expectedCommit = undefined
      }
    }
    catch (error) {
      this.expectedCommit = undefined
      this.reportNavigationError(error, attempt, context)
    }
  }

  private completeNavigation(expected: ExpectedCommit): void {
    const query = toValue(this.adapter.query)

    // A valid adapter may expose a non-reactive query or keep the same ref for a no-op.
    // Publish the successful commit once even when the watcher did not observe it.
    if (!expected.observed && isDebugArmed(this.debug)) {
      emitDebug(this.debug, 'adapter:commit', {
        query: cloneQuery(query),
        paths: [...expected.attempt.keys()],
        pendingPathCount: this.overlaySize,
        source: 'write',
      }, expected.context)
      expected.observed = true
    }

    this.reconcile(query)
  }

  private reportNavigationError(
    error: unknown,
    attempt: ReadonlyMap<string, AttemptedDelta>,
    context?: DebugEmissionContext,
  ): void {
    const rolledBack = this.rollback(attempt)
    emitWarn(this.debug, 'adapter:error', {
      adapter: this.adapter.debugName ?? 'custom',
      error,
      rolledBack,
    }, context)
  }

  private rollback(attempt: ReadonlyMap<string, AttemptedDelta>): string[] {
    const dropped: string[] = []

    for (const [path, failed] of attempt) {
      if (
        this.overlayVersions.get(path) === failed.version
      ) {
        delete this.overlay.value[path]
        this.overlayVersions.delete(path)
        this.overlayDebugOwners.delete(path)
        this.overlaySize--
        dropped.push(path)
      }
    }

    if (dropped.length > 0) {
      triggerRef(this.overlay)
      this.stopAdapterObserverIfIdle()
    }

    return dropped
  }
}

function changedQueryPaths(previous: ParsedQuery, query: ParsedQuery): string[] {
  const candidates = new Set([
    ...collectLeafPaths(previous),
    ...collectLeafPaths(query),
  ])

  return [...candidates].filter(path => !structuralEq(getPath(previous, path), getPath(query, path)))
}

function reflectsAttempt(query: ParsedQuery, attempt: ReadonlyMap<string, AttemptedDelta>): boolean {
  for (const [path, { delta }] of attempt) {
    const committed = getPath(query, path)
    if (delta === null ? committed !== undefined : !structuralEq(committed, delta)) {
      return false
    }
  }

  return true
}
