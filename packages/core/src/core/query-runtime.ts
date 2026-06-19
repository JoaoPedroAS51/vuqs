import type { QueryAdapter } from './adapter'
import type { DebugChannel, DebugEmissionContext } from './debug/bus'
import type { QueryStateSchema } from './schema'
import type {
  QueryTransaction,
  QueryTransactionBus,
  QueryTransactionObserver,
  RawQueryTransaction,
} from './transaction'
import { debugChannelForAdapter, emitDebug } from './debug/bus'
import { ThrottledQueue } from './queues/throttle'

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

/** Adapter-scoped query coordination state. */
export class QueryRuntime {
  readonly queue: ThrottledQueue
  readonly transactions = new QueryTransactionStartRegistry()
  readonly debug: DebugChannel

  private applyingTransactions = 0
  private dispatchingStarts = false
  private nextTransactionId = 1
  private readonly pendingStarts: RawQueryTransaction[] = []

  constructor(adapter: QueryAdapter) {
    this.queue = new ThrottledQueue(adapter)
    this.debug = debugChannelForAdapter(adapter)
  }

  /** Applies one overlay mutation and publishes its start in causal id order. */
  applyTransaction(
    transaction: Omit<RawQueryTransaction, 'id'>,
    apply: (transaction: RawQueryTransaction, debugContext?: DebugEmissionContext) => void,
  ): void {
    const raw: RawQueryTransaction = Object.freeze({
      ...transaction,
      id: this.nextTransactionId++,
      paths: Object.freeze([...transaction.paths]),
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
      apply(raw, debugContext)
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

/** Returns the stable runtime owned by an adapter identity. */
export function getQueryRuntime(adapter: QueryAdapter): QueryRuntime {
  const existing = runtimes.get(adapter)

  if (existing !== undefined) {
    return existing
  }

  const runtime = new QueryRuntime(adapter)

  runtimes.set(adapter, runtime)
  return runtime
}

/** Creates the schema-projected transaction bus for one binding. */
export function createQueryTransactionBus<TSchema extends QueryStateSchema>(
  runtime: QueryRuntime,
  schema: TSchema,
): QueryTransactionBus<TSchema> {
  return {
    observe: observer => runtime.transactions.observe(schema, observer),
  }
}

/** Resets one adapter runtime without affecting any other adapter. */
export function resetQueryRuntime(adapter: QueryAdapter): void {
  runtimes.get(adapter)?.queue.reset()
}
