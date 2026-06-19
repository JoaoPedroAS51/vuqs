import type { DebugChannelHandle } from './debug/bus'
import type { QueryDefaultsBus, QueryStateReads, ResolvedQueryStateOptions } from './engine'
import type { QueryHookBus } from './hooks'
import type { QueryPipelineBus } from './pipeline'
import type { QueryStateSchema } from './schema'
import type { QueryTransactionBus, QueryTransactionRequest } from './transaction'
import type { ParsedQuery } from './types'

/**
 * The shared core passed to query modules.
 *
 * @remarks
 * Modules use this object to derive state from the current URL selection,
 * contribute pipeline transforms, write params through `query.transact`, and coordinate
 * with other modules through `hooks`. Treat it as an implementation surface for
 * module authors, not as app-facing state.
 *
 * @typeParam TSchema - The schema being managed.
 */
export interface QueryCore<TSchema extends QueryStateSchema> {
  /** The schema being managed. */
  schema: TSchema
  /** The resolved reactive reads: `selected` (no defaults) and `values` (resolved). */
  state: QueryStateReads<TSchema>
  /** The defaults subsystem: read the merge or register a layer. */
  defaults: QueryDefaultsBus<TSchema>
  /** The resolved per-instance behavior baseline (`history`/`scroll`/`throttleMs`/`clearOnDefault`). */
  options: ResolvedQueryStateOptions
  /** The transform pipeline: `tap` to contribute, `run` to shape a derived value map. */
  pipeline: QueryPipelineBus
  /** The notification bus: one module emits an event, others react. */
  hooks: QueryHookBus
  /** The observation channel for this adapter's runtime; attach reporters or retain history. */
  debug: DebugChannelHandle
  /** The query I/O boundary: read the current query or transact atomically. */
  query: {
    /** Reads the current committed query, without the optimistic overlay. */
    current: () => ParsedQuery
    /** Atomically applies a partial or exhaustive query-state write. */
    transact: (request: QueryTransactionRequest<TSchema>) => void
    /** Observes starts whose raw paths overlap this schema. */
    transactions: QueryTransactionBus<TSchema>
  }
}
