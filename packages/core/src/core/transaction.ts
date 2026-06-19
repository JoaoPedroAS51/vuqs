import type { QueryStateSchema, QueryStateValues, QueryStateWriteValues } from './schema'
import type { NavigateOptions } from './types'

/** Identifies the producer of a query transaction. */
export type QueryTransactionOrigin = symbol

/** Controls whether an explicit value equal to its default remains in the URL. */
export type QueryTransactionDefaultPolicy = 'binding' | 'preserve-explicit'

interface QueryTransactionBase {
  /** Per-transaction navigation overrides. */
  navigation?: NavigateOptions
  /** Optional producer identity, used to ignore self-originated writes. */
  origin?: QueryTransactionOrigin
  /** Uses the binding's default elision by default; exact replays can preserve presence. */
  defaultPolicy?: QueryTransactionDefaultPolicy
}

/** A partial or exhaustive query-state write. */
export type QueryTransactionRequest<TSchema extends QueryStateSchema>
  = | (QueryTransactionBase & {
    /** Writes only explicitly defined values; `undefined` entries are skipped. */
    mode: 'patch'
    values: QueryStateWriteValues<TSchema>
  })
  | (QueryTransactionBase & {
    /** Replaces the complete schema selection; absent or `undefined` entries clear. */
    mode: 'replace'
    values: QueryStateValues<TSchema>
  })

/** The immutable start snapshot delivered to a transaction observer. */
export interface QueryTransaction<TSchema extends QueryStateSchema> {
  /** Monotonic identifier inside one adapter runtime. */
  readonly id: number
  /** The originating write mode. */
  readonly mode: QueryTransactionRequest<TSchema>['mode']
  /** Local schema keys affected by the intersecting raw paths. */
  readonly keys: readonly (keyof TSchema & string)[]
  /** Raw query paths shared with the observing schema. */
  readonly paths: readonly string[]
  /** Optional producer identity. */
  readonly origin?: QueryTransactionOrigin
}

/** Receives transaction lifecycle notifications. */
export interface QueryTransactionObserver<TSchema extends QueryStateSchema> {
  /** Runs synchronously after overlay application, in causal transaction id order. */
  start: (transaction: QueryTransaction<TSchema>) => void
}

/** The transaction notification boundary exposed to query modules. */
export interface QueryTransactionBus<TSchema extends QueryStateSchema> {
  /** Observes starts that overlap this binding's raw query paths. */
  observe: (observer: QueryTransactionObserver<TSchema>) => () => void
}

/** Internal adapter-scoped transaction before projection to an observer schema. */
export interface RawQueryTransaction {
  readonly id: number
  readonly mode: 'patch' | 'replace'
  readonly paths: readonly string[]
  readonly origin?: QueryTransactionOrigin
}
