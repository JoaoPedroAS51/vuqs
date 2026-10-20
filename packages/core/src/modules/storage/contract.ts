import type { ComputedRef, ShallowRef } from 'vue'
import type { StoredQuerySnapshot } from './snapshot'

/** A value returned immediately or through a promise-like operation. */
export type Awaitable<T> = T | PromiseLike<T>

/** Async-first persistence boundary consumed by {@link withStorage}. */
export interface QueryStorage {
  /**
   * Loads a stored snapshot.
   *
   * @returns The snapshot, or `undefined` when the key is absent,
   * directly or through a promise-like operation.
   */
  load: (key: string) => Awaitable<StoredQuerySnapshot | undefined>
  /** Saves one non-empty snapshot. */
  save: (key: string, snapshot: StoredQuerySnapshot) => Awaitable<void>
  /** Removes the snapshot stored under `key`. */
  remove: (key: string) => Awaitable<void>
}

/** Restore policy applied when storage initialization begins. */
export type StorageRestorePolicy = 'if-empty' | 'never'

/** Options for {@link withStorage}. */
export interface StorageOptions {
  /** Stable storage key for this query-state mirror. */
  key: string
  /** Sync or async persistence implementation. */
  storage: QueryStorage
  /**
   * Restores only into an empty state, or skips restoration.
   *
   * @default 'if-empty'
   */
  restore?: StorageRestorePolicy
  /** Application version that must match a stored snapshot before restore. */
  version?: string
}

/** Lifecycle state exposed by {@link StorageControls}. */
export type StorageStatus = 'restoring' | 'ready' | 'error'

/** Persistence lifecycle controls contributed by {@link withStorage}. */
export interface StorageControls {
  /** Current restoration or operational-error state. */
  status: ComputedRef<StorageStatus>
  /** Latest operational error; contract errors throw synchronously instead. */
  error: ShallowRef<unknown | undefined>
  /** Resolves when the restoration attempt settles, including on operational failure. */
  ready: Promise<void>
  /** Waits for the write boundary captured at call time. Operational failures never reject. */
  flush: () => Promise<void>
}

/** API contributed to grouped and single-param query state. */
export interface StorageApi {
  /** Storage lifecycle and flush controls. */
  storage: StorageControls
}
