import type { DebugChannel, DebugEmissionContext } from '../diagnostics/bus'
import type { QueryStateSchema } from '../schema/schema'
import type { NavigateOptions, QueryAdapter } from './adapter'
import type { Overlay } from './overlay'
import type { QueryTransaction, QueryTransactionBus, QueryTransactionObserver, RawQueryTransaction } from './transaction'
import { debugChannelForAdapter, emitDebug } from '../diagnostics/bus'
import { ThrottledQueue } from './navigation-queue'

type RawObserver = (transaction: RawQueryTransaction) => void

/** Minimal transaction-start registry shared by bindings using one adapter. */
export class QueryTransactionStartRegistry {
  private readonly observers = new Set<RawObserver>()

  emit(transaction: RawQueryTransaction): void {
    for (const observer of [...this.observers]) {
      try {
        observer(transaction)
      }
      catch (error) {
        console.error('[vuqs] query transaction observer failed', error)
      }
    }
  }

  observe<TSchema extends QueryStateSchema>(
    schema: TSchema,
    observer: QueryTransactionObserver<TSchema>,
  ): () => void {
    const entries = Object.entries(schema) as Array<[
      keyof TSchema & string,
      TSchema[keyof TSchema & string],
    ]>

    const rawObserver: RawObserver = (raw) => {
      const paths = raw.paths.filter(path => entries.some(([, definition]) => definition.paths.includes(path)))

      if (paths.length === 0) {
        return
      }

      const intersectingPaths = new Set(paths)
      const keys: Array<keyof TSchema & string> = []

      for (const [key, definition] of entries) {
        if (definition.paths.some(path => intersectingPaths.has(path))) {
          keys.push(key)
        }
      }

      const transaction = Object.freeze({
        id: raw.id,
        mode: raw.mode,
        keys: Object.freeze(keys),
        paths: Object.freeze(paths),
        origin: raw.origin,
      }) as QueryTransaction<TSchema>

      observer.start(transaction)
    }

    this.observers.add(rawObserver)

    return () => {
      this.observers.delete(rawObserver)
    }
  }
}

/** A prepared write published by {@link QueryRuntime.applyTransaction}. */
export interface QueryRuntimeWrite extends Omit<RawQueryTransaction, 'id' | 'paths'> {
  /** Raw pending writes keyed by query path (`null` removes a path). */
  readonly deltas: Overlay
  /** The resolved navigation options for this write. */
  readonly options: NavigateOptions
  /** Coalesce within this many ms; `0` flushes on a microtask. */
  readonly throttleMs: number
}

/** Adapter-scoped query coordination state. */
export class QueryRuntime {
  /** Completed read-layer values with pending writes applied above them. */
  readonly readOverlay: ThrottledQueue['readOverlay']
  readonly transactions = new QueryTransactionStartRegistry()
  readonly debug: DebugChannel

  private readonly queue: ThrottledQueue
  private applyingTransactions = 0
  private dispatchingStarts = false
  private nextTransactionId = 1
  private readonly pendingStarts: RawQueryTransaction[] = []

  constructor(adapter: QueryAdapter) {
    this.queue = new ThrottledQueue(adapter)
    this.readOverlay = this.queue.readOverlay
    this.debug = debugChannelForAdapter(adapter)
  }

  /**
   * Keeps committed-query observation alive for one engine binding.
   *
   * @returns An idempotent function that releases the binding's observation ownership.
   */
  retainBinding(): () => void {
    return this.queue.retainBinding()
  }

  /** Clears pending writes, read-layer values, and scheduled flushes. */
  reset(): void {
    this.queue.reset()
  }

  /**
   * Applies one prepared write and publishes its start in causal id order.
   *
   * @param write - The prepared deltas, navigation options and throttle. The transaction's
   * paths are the delta keys.
   * @param announce - Called with the assigned transaction before the write enqueues and
   * before start observers run. The debug context is `undefined` when debug is disarmed.
   */
  applyTransaction(
    write: QueryRuntimeWrite,
    announce: (transaction: RawQueryTransaction, debugContext?: DebugEmissionContext) => void,
  ): void {
    const { deltas, options, throttleMs, ...transaction } = write
    const raw: RawQueryTransaction = Object.freeze({
      ...transaction,
      id: this.nextTransactionId++,
      paths: Object.freeze(Object.keys(deltas)),
    })

    const debugContext = this.queue.reserveDebugBatch(raw.id)

    // Publish the diagnostic before the write can enqueue or schedule queue work.
    // Transaction observers still drain after the mutation below, preserving their
    // reentrancy and rollback semantics.
    if (debugContext !== undefined) {
      emitDebug(this.debug, 'tx:start', {
        id: raw.id,
        mode: raw.mode,
        paths: raw.paths,
        origin: raw.origin?.description,
      }, debugContext)
    }

    this.applyingTransactions++

    try {
      announce(raw, debugContext)
      this.queue.push(deltas, options, throttleMs, raw.id)
      this.pendingStarts.push(raw)
    }
    finally {
      this.applyingTransactions--
      this.drainStarts()
    }
  }

  private drainStarts(): void {
    if (this.applyingTransactions > 0 || this.dispatchingStarts) {
      return
    }

    this.pendingStarts.sort((a, b) => a.id - b.id)
    this.dispatchingStarts = true

    try {
      let transaction = this.pendingStarts.shift()

      while (transaction !== undefined) {
        this.transactions.emit(transaction)
        transaction = this.pendingStarts.shift()
      }
    }
    finally {
      this.dispatchingStarts = false
    }
  }
}

const runtimes = new WeakMap<QueryAdapter, QueryRuntime>()

/**
 * Gets or creates an adapter's runtime.
 *
 * @returns The same runtime for subsequent calls with the same adapter identity.
 *
 * @internal
 */
export function getQueryRuntime(adapter: QueryAdapter): QueryRuntime {
  const existing = runtimes.get(adapter)

  if (existing !== undefined) {
    return existing
  }

  const runtime = new QueryRuntime(adapter)

  runtimes.set(adapter, runtime)
  return runtime
}

/**
 * Creates the schema-projected transaction bus for one binding.
 *
 * @internal
 */
export function createQueryTransactionBus<TSchema extends QueryStateSchema>(
  runtime: QueryRuntime,
  schema: TSchema,
): QueryTransactionBus<TSchema> {
  return {
    observe: observer => runtime.transactions.observe(schema, observer),
  }
}

/**
 * Resets one adapter runtime without affecting any other adapter.
 *
 * @internal
 */
export function resetQueryRuntime(adapter: QueryAdapter): void {
  runtimes.get(adapter)?.reset()
}
