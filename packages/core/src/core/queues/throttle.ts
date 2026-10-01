import type { EffectScope, Ref, ShallowRef } from 'vue'
import type { QueryAdapter } from '../adapter'
import type { DebugChannel, DebugEmissionContext } from '../debug/bus'
import type { QueryReadLayer } from '../query-read-layer'
import type { NavigateOptions, ParsedQuery, ParsedQueryValue } from '../types'
import { computed, effectScope, shallowRef, toValue, triggerRef, watch } from 'vue'
import { debugChannelForAdapter, emitDebug, emitWarn, isDebugArmed } from '../debug/bus'
import { normalizeForHistory } from '../debug/normalize'
import { registerSnapshotSource } from '../debug/snapshot'
import { structuralEq } from '../equality'
import { runManagedNavigation } from '../managed-navigation'
import { collectLeafPaths, deletePath, getPath, pruneEmptyAncestors, setPath } from '../path'
import { cloneQuery } from '../query-object'
import { getQueryReadLayer } from '../query-read-layer'

/**
 * One pending write for a single query path: a raw value to set, or `null` to
 * remove the path from the URL.
 */
export type OverlayDelta = ParsedQueryValue | null

/**
 * The optimistic overlay: raw pending writes keyed by query path.
 *
 * @remarks
 * A path present here overrides the committed query until its navigation attempt
 * completes. Values are raw (already serialized), so the overlay is the one
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

interface CommitObservation {
  readonly query: ParsedQuery
  readonly paths: readonly string[]
  readonly pendingPathCount: number
}

interface NavigationAttempt {
  readonly writes: ReadonlyMap<string, AttemptedDelta>
  readonly generation: number
  readonly context?: DebugEmissionContext
  observation?: CommitObservation
}

/**
 * The adapter-scoped queue that coalesces writes into a single navigation.
 *
 * @remarks
 * One instance backs one adapter identity. Writes from any engine merge into
 * {@link ThrottledQueue.overlay | overlay}: one canonical object
 * behind a `shallowRef`, notified atomically after each transaction without copying
 * all previously pending paths. Navigation completion owns write settlement;
 * one adapter-scoped observer tracks external query changes independently of
 * binding lifetimes. Flushes serialize navigations, so an older router commit
 * cannot complete after and overwrite a newer batch.
 */
export class ThrottledQueue {
  /** The single optimistic overlay shared by every engine using this adapter. */
  readonly overlay: ShallowRef<Overlay> = shallowRef<Overlay>(Object.create(null) as Overlay)

  /** Completed read-layer values with pending writes applied above them. @internal */
  readonly readOverlay: Readonly<Ref<Readonly<Overlay>>>

  private readonly debug: DebugChannel
  private readonly readLayer: QueryReadLayer | undefined
  private options: NavigateOptions = {}
  private scheduled = false
  private navigationPending = false
  private flushAfterNavigation = false
  private activeAttempt: NavigationAttempt | undefined
  private generation = 0
  private overlaySize = 0
  private nextOverlayVersion = 1
  private readonly overlayVersions = new Map<string, number>()
  private adapterObserver: EffectScope | undefined
  private bindingOwners = 0
  private nextDebugBatchId = 1
  private debugBatch: DebugBatch | undefined
  // Debug-only ownership survives the flush until each pending write settles. It is
  // populated only while observed, preserving the disarmed path's zero-retention goal.
  private readonly overlayDebugOwners = new Map<string, OverlayDebugOwner>()

  constructor(private readonly adapter: QueryAdapter) {
    this.debug = debugChannelForAdapter(adapter)
    const readLayer = getQueryReadLayer(adapter)
    this.readLayer = readLayer
    this.readOverlay = readLayer === undefined
      ? this.overlay
      : computed(() => Object.assign(Object.create(null) as Overlay, toValue(readLayer.values), this.overlay.value))

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
   * Removes the pending writes at the given query paths.
   *
   * @remarks
   * Completed navigation attempts remove their current versions. External query
   * changes may also remove pending values they reflect exactly.
   *
   * @param paths - The query paths whose pending writes should be removed.
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

  /**
   * Clears pending writes, registered read layers, and scheduled flushes.
   *
   * @remarks
   * An in-flight navigation keeps its serialization slot until its promise ends.
   * Its outcome does not settle or roll back writes made after the reset.
   */
  reset(): void {
    this.readLayer?.reset()
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
    if (this.activeAttempt !== undefined) {
      this.activeAttempt.observation = undefined
    }
    this.activeAttempt = undefined
    this.debugBatch = undefined
    this.overlayDebugOwners.clear()
    // Invalidate any flush already scheduled, so it cannot fire against a later push.
    this.generation++
    emitDebug(this.debug, 'gtq:reset')
  }

  private handleAdapterCommit(query: ParsedQuery, previous: ParsedQuery): void {
    const expected = this.activeAttempt

    if (expected !== undefined) {
      // Query changes can precede promise resolution, so attribute the last one
      // only after the adapter confirms its outcome.
      if (isDebugArmed(this.debug)) {
        this.reportExternalObservation(expected)
        expected.observation = {
          query: cloneQuery(query),
          paths: changedQueryPaths(previous, query),
          pendingPathCount: this.overlaySize,
        }
      }
      else {
        expected.observation = undefined
      }
      return
    }

    if (isDebugArmed(this.debug)) {
      emitDebug(this.debug, 'adapter:commit', {
        query: cloneQuery(query),
        paths: changedQueryPaths(previous, query),
        pendingPathCount: this.overlaySize,
        source: 'external',
      })
    }

    if (!this.navigationPending) {
      this.reconcile(query)
    }
  }

  private reportExternalObservation(expected: NavigationAttempt): void {
    const observation = expected.observation
    expected.observation = undefined

    if (observation !== undefined && isDebugArmed(this.debug)) {
      emitDebug(this.debug, 'adapter:commit', { ...observation, source: 'external' })
    }
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

    const activeAttempt: NavigationAttempt = { writes: attempt, generation: this.generation, context }
    this.activeAttempt = activeAttempt

    this.navigationPending = true
    void this.runNavigation(next, options, activeAttempt)
  }

  private async runNavigation(
    query: ParsedQuery,
    options: NavigateOptions,
    expected: NavigationAttempt,
  ): Promise<void> {
    try {
      const navigation = runManagedNavigation(this.adapter, () => this.adapter.navigate(query, options))
      if (navigation !== undefined) {
        await navigation
      }

      if (expected.generation !== this.generation) {
        return
      }

      this.activeAttempt = undefined
      this.completeNavigation(expected)
    }
    catch (error) {
      if (expected.generation !== this.generation) {
        return
      }
      this.activeAttempt = undefined
      this.reportExternalObservation(expected)
      if (expected.generation === this.generation) {
        this.reportNavigationError(error, expected.writes, expected.context)
      }
    }
    finally {
      this.activeAttempt = undefined
      this.navigationPending = false
      if (this.flushAfterNavigation) {
        this.flushAfterNavigation = false
        this.scheduleFlush(0, this.debugBatch)
      }
    }
  }

  private completeNavigation(expected: NavigationAttempt): void {
    if (this.readLayer !== undefined) {
      this.reportExternalObservation(expected)
      if (expected.generation !== this.generation) {
        return
      }
      const deltas: Overlay = Object.create(null)
      for (const [path, { delta }] of expected.writes) {
        deltas[path] = delta
      }
      this.readLayer.apply(cloneQuery(deltas))
    }
    else {
      expected.observation = undefined
      if (isDebugArmed(this.debug)) {
        emitDebug(this.debug, 'adapter:commit', {
          query: cloneQuery(toValue(this.adapter.query)),
          paths: [...expected.writes.keys()],
          pendingPathCount: this.overlaySize,
          source: 'write',
        }, expected.context)
      }
    }

    const committed: string[] = []
    for (const [path, attempted] of expected.writes) {
      if (this.overlayVersions.get(path) === attempted.version) {
        committed.push(path)
      }
    }
    this.settle(committed)
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
