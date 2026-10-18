import type { ComputedRef } from 'vue'
import type { DebugChannelHandle } from '../diagnostics/bus'
import type { ParsedQuery } from '../query/types'
import type { QueryStateReads, ResolvedQueryStateOptions } from '../runtime/engine'
import type { QueryHookBus } from '../runtime/hooks'
import type { QueryPipelineBus } from '../runtime/pipeline/contract'
import type { QueryTransactionBus, QueryTransactionRequest } from '../runtime/transaction'
import type { QueryStateContributions, QueryStateSchema } from '../schema/schema'

/**
 * The shared core passed to query modules.
 *
 * @typeParam TSchema - The schema being managed.
 */
export interface QueryCore<TSchema extends QueryStateSchema> {
  /** The schema topology being managed. */
  readonly schema: Readonly<TSchema>
  /** The explicit and default-resolved reactive reads. */
  state: QueryStateReads<TSchema>
  /** The composed default candidates, with the `defaults` read projections applied. */
  defaults: {
    /** Composed static and runtime defaults after projection. Presence gates do not hide candidates. */
    readonly candidates: ComputedRef<QueryStateContributions<TSchema>>
  }
  /** The resolved per-instance behavior baseline. */
  readonly options: Readonly<ResolvedQueryStateOptions>
  /** Declares pipeline descriptors for the module to return from setup. */
  pipeline: QueryPipelineBus<TSchema>
  /** The notification bus: one module emits an event, others react. */
  hooks: QueryHookBus
  /** The adapter runtime's observation channel, attributed to this binding. */
  debug: DebugChannelHandle
  /** The query I/O boundary: read the current query or transact atomically. */
  query: {
    /**
     * Reads the current query.
     *
     * @returns The committed query without pending optimistic writes.
     */
    current: () => ParsedQuery
    /** Atomically applies a partial or exhaustive query-state write. */
    transact: (request: QueryTransactionRequest<TSchema>) => void
    /** Observes starts whose raw paths overlap this schema. */
    transactions: QueryTransactionBus<TSchema>
  }
}
