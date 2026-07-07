import type { ShallowRef } from 'vue'
import type { QueryAdapter } from '../adapter'
import type { NavigateOptions, ParsedQueryValue } from '../types'
import { shallowRef, toValue } from 'vue'
import { debug } from '../debug/sink'
import { deletePath, pruneEmptyAncestors, setPath } from '../path'
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
 * A path present here overrides the live URL until a navigation lands and the URL
 * catches up. Values are raw (already serialized), so the overlay is the one
 * namespace every engine shares regardless of its schema or codecs.
 */
export type Overlay = Record<string, OverlayDelta>

/** The slice of a {@link QueryAdapter} the queue needs to read and write the URL. */
export type UpdateQueueAdapterContext = Pick<QueryAdapter, 'query' | 'navigate'>

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

  debug('gtq:coalesce', { ...result })

  return result
}

/**
 * The shared queue that coalesces every write into a single navigation.
 *
 * @remarks
 * One instance backs the whole app ({@link globalThrottleQueue}). Writes from any
 * engine land in {@link ThrottledQueue.overlay | overlay}: a reactive
 * `shallowRef` replaced wholesale on each write, so every engine reading it
 * re-derives its values (cross-engine sync without an event bus). A flush reads
 * the URL once, applies the whole overlay, and navigates once, so concurrent
 * writes can never clobber one another.
 */
export class ThrottledQueue {
  /** The single optimistic overlay shared by every engine. */
  readonly overlay: ShallowRef<Overlay> = shallowRef<Overlay>({})

  private currentAdapter: UpdateQueueAdapterContext | undefined
  private options: NavigateOptions = {}
  private scheduled = false
  private generation = 0

  /**
   * Records a write in the overlay and schedules the coalesced navigation.
   *
   * @param deltas - Raw pending writes keyed by query path (`null` removes a path).
   * @param options - The resolved navigation options for this write.
   * @param adapter - The query source and navigate function to flush through.
   * @param throttleMs - Coalesce within this many ms; `0` flushes on a microtask.
   */
  push(deltas: Overlay, options: NavigateOptions, adapter: UpdateQueueAdapterContext, throttleMs: number): void {
    this.currentAdapter = adapter
    this.overlay.value = { ...this.overlay.value, ...deltas }
    debug('gtq:enqueue', { ...deltas }, { ...this.overlay.value })
    this.options = mergeOptions(this.options, options)
    this.scheduleFlush(throttleMs)
  }

  /**
   * Drops paths from the overlay once the URL reflects them.
   *
   * @remarks
   * Called by an engine's reconciliation after a navigation lands, so the
   * committed model holds: an entry is kept until the URL catches up, then removed
   * so the URL becomes the source of truth again.
   *
   * @param paths - The query paths the URL has caught up to.
   */
  settle(paths: string[]): void {
    if (paths.length === 0) {
      return
    }

    const dropped: string[] = []
    const next = { ...this.overlay.value }

    for (const path of paths) {
      if (path in next) {
        delete next[path]
        dropped.push(path)
      }
    }

    if (dropped.length > 0) {
      this.overlay.value = next
    }

    debug('gtq:settle', dropped)
  }

  /** Clears the overlay and pending navigation; used for test and SSR isolation. */
  reset(): void {
    this.overlay.value = {}
    this.options = {}
    this.scheduled = false
    this.currentAdapter = undefined
    // Invalidate any flush already scheduled, so it cannot fire against a later push.
    this.generation++
    debug('gtq:reset')
  }

  private scheduleFlush(timeMs: number): void {
    if (this.scheduled) {
      return
    }

    this.scheduled = true
    debug('gtq:schedule', timeMs)

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

    // A flush is only ever scheduled from push(), which sets currentAdapter first,
    // and the generation guard in scheduleFlush() invalidates any flush left over
    // from before a reset(), so currentAdapter is always set by the time we get here.
    const adapter = this.currentAdapter!

    const paths = Object.keys(this.overlay.value)

    if (paths.length === 0) {
      debug('gtq:flush-skip', 'no paths')
      return
    }

    const next = cloneQuery(toValue(adapter.query))

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

    const options = this.options
    this.options = {}

    debug('gtq:flush', paths.length, cloneQuery(next), { ...options })
    void adapter.navigate(next, options)
  }
}

/**
 * The app-wide queue every engine pushes to.
 *
 * @internal
 */
export const globalThrottleQueue: ThrottledQueue = new ThrottledQueue()

/**
 * Clears the shared queue.
 *
 * @remarks
 * The queue is a module-level singleton, so a test (or a fresh app) resets it to
 * avoid leaking optimistic writes across boundaries.
 */
export function resetQueues(): void {
  globalThrottleQueue.reset()
}
