import type { ComputedRef, ShallowRef } from 'vue'
import type { QueryCore } from '../core/query-core'
import type { QueryStateSchema } from '../core/schema'
import type { ParsedQueryRaw } from '../core/types'
import { computed, getCurrentInstance, onMounted, onScopeDispose, shallowRef, watch } from 'vue'
import { emitDebug, emitWarn } from '../core/debug/bus'
import { registerSnapshotSource } from '../core/debug/snapshot'
import { parseRawQuerySelection } from '../core/engine'
import { structuralEq } from '../core/equality'
import { defineQueryModule } from '../core/module'
import { getPath } from '../core/path'
import { cloneQuery } from '../core/query-object'
import { getManagedKeys, serializeQueryStates } from '../core/schema'

/** A value returned immediately or through a promise-like operation. */
export type Awaitable<T> = T | PromiseLike<T>

/** The versioned raw-query envelope persisted by {@link withStorage}. */
export interface StoredQuerySnapshot {
  /** Snapshot format version owned by vuqs. */
  format: 1
  /** Optional application version used to invalidate incompatible snapshots. */
  version?: string
  /** Unix timestamp in milliseconds for diagnostics and future policies. */
  savedAt: number
  /** Explicit selected state encoded through the schema params. */
  query: ParsedQueryRaw
}

/** Async-first persistence boundary consumed by {@link withStorage}. */
export interface QueryStorage {
  /** Loads one snapshot, or `undefined` when the key is absent. */
  load: (key: string) => Awaitable<StoredQuerySnapshot | undefined>
  /** Saves one non-empty snapshot. */
  save: (key: string, snapshot: StoredQuerySnapshot) => Awaitable<void>
  /** Removes an empty snapshot. */
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
  /** Restore only into an empty selection, or never restore. Defaults to `if-empty`. */
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

declare module '../core/module' {
  // eslint-disable-next-line unused-imports/no-unused-vars -- TParam must match the base registry signature
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TParam extends string> {
    'vuqs:storage': {
      states: { options: StorageOptions, api: StorageApi }
      state: { options: StorageOptions, api: StorageApi }
    }
  }
}

/**
 * Creates a lazy Web Storage adapter without reading browser globals at module load.
 *
 * @param resolveStorage - Returns the Web Storage instance when an operation runs.
 * @returns A structured {@link QueryStorage} backed by JSON values.
 * @throws {TypeError} When the resolver is not a function. Operation-time access
 * and JSON failures throw from the adapter; {@link withStorage} captures them as
 * operational failures in {@link StorageControls}.
 */
export function createWebStorage(resolveStorage: () => Storage | undefined): QueryStorage {
  if (typeof resolveStorage !== 'function') {
    throw new TypeError('[vuqs] createWebStorage: expected a storage resolver function')
  }

  function resolve(): Storage {
    const storage = resolveStorage()

    if (storage === undefined) {
      throw new Error('[vuqs] web storage is unavailable')
    }

    return storage
  }

  return {
    load: (key) => {
      const raw = resolve().getItem(key)
      return raw === null ? undefined : JSON.parse(raw) as StoredQuerySnapshot
    },
    save: (key, snapshot) => {
      resolve().setItem(key, JSON.stringify(snapshot))
    },
    remove: (key) => {
      resolve().removeItem(key)
    },
  }
}

/**
 * Mirrors explicit query selection into sync or async storage.
 *
 * @remarks
 * Storage is an exact mirror of `core.state.selected`, never a default layer.
 * With `restore: 'if-empty'`, a non-empty URL or any write intent observed while
 * loading wins over storage. Restored values are materialized back into the URL
 * through one `replace` transaction. Runtime defaults are never persisted.
 *
 * Restoration starts after component mount to preserve SSR hydration. Outside a
 * component it starts on a microtask, after synchronous module composition. The
 * transaction observer is registered immediately so an early no-op write still
 * prevents stale restoration.
 *
 * Operational failures never reject `ready` or `flush`; inspect
 * `storage.status` and `storage.error`. Invalid options throw synchronously when
 * the module is composed.
 *
 * @param options - Storage key, implementation, restore policy, and optional version.
 * @returns A dual module that contributes {@link StorageApi}.
 */
export const withStorage = /* @__PURE__ */ defineQueryModule({
  name: 'vuqs:storage',
  queryStates: <TSchema extends QueryStateSchema>(
    core: QueryCore<TSchema>,
    options: StorageOptions,
  ): StorageApi => createStorageApi(core, options),
  queryState: <TSchema extends QueryStateSchema>(
    core: QueryCore<TSchema>,
    _key: keyof TSchema & string,
    options: StorageOptions,
  ): StorageApi => createStorageApi(core, options),
})

interface PendingStorageWrite {
  revision: number
  snapshot?: StoredQuerySnapshot
}

type SnapshotResult
  = | { snapshot: StoredQuerySnapshot, error?: never }
    | { snapshot?: never, error: Error }

type StorageFailureOperation = 'load' | 'snapshot' | 'restore' | 'serialize' | 'save' | 'remove'

function createStorageApi<TSchema extends QueryStateSchema>(
  core: QueryCore<TSchema>,
  options: StorageOptions | undefined,
): StorageApi {
  assertStorageOptions(options)

  const storageOptions = options
  const restore = storageOptions.restore ?? 'if-empty'
  const origin = Symbol('vuqs:storage')
  const statusState = shallowRef<StorageStatus>('restoring')
  const error = shallowRef<unknown>()

  let resolveReady!: () => void
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })

  let readyResolved = false
  let disposed = false
  let loadStarted = false
  let restorationSettled = false
  let changedDuringRestore = false
  let sourceRevision = 0
  let persistRequested = false
  let persistMicrotaskQueued = false
  let requestedRevision = 0
  let outcomeRevision = -1
  let desiredQuery: ParsedQueryRaw | undefined
  let pendingWrite: PendingStorageWrite | undefined
  let pumpPromise: Promise<void> | undefined
  const unsettledRevisions = new Set<number>()
  const settlementWaiters = new Set<() => void>()

  function notifySettlement(): void {
    for (const resolve of settlementWaiters) {
      resolve()
    }

    settlementWaiters.clear()
  }

  function settleRevision(revision: number): void {
    if (unsettledRevisions.delete(revision)) {
      notifySettlement()
    }
  }

  function recordError(cause: unknown, operation: StorageFailureOperation, revision = 0): void {
    if (disposed) {
      return
    }

    emitWarn(core.debug, 'storage:error', { key: storageOptions.key, operation, error: cause })

    if (revision < outcomeRevision) {
      return
    }

    outcomeRevision = revision
    error.value = cause
    statusState.value = 'error'
  }

  function recordSuccess(revision: number): void {
    if (disposed || revision < outcomeRevision) {
      return
    }

    outcomeRevision = revision
    error.value = undefined

    if (restorationSettled) {
      statusState.value = 'ready'
    }
  }

  function settleReady(): void {
    if (readyResolved) {
      return
    }

    readyResolved = true
    resolveReady()
  }

  async function pumpWrites(): Promise<void> {
    try {
      while (pendingWrite !== undefined) {
        const write = pendingWrite
        pendingWrite = undefined
        const operation = write.snapshot === undefined ? 'remove' : 'save'

        emitDebug(core.debug, 'storage:write', {
          key: storageOptions.key,
          revision: write.revision,
          operation,
          query: write.snapshot?.query ?? {},
        })

        try {
          if (write.snapshot === undefined) {
            await storageOptions.storage.remove(storageOptions.key)
          }
          else {
            await storageOptions.storage.save(storageOptions.key, write.snapshot)
          }

          recordSuccess(write.revision)
        }
        catch (cause) {
          recordError(cause, operation, write.revision)
        }

        settleRevision(write.revision)
      }
    }
    finally {
      pumpPromise = undefined
    }
  }

  function ensurePump(): Promise<void> {
    if (pumpPromise !== undefined) {
      return pumpPromise
    }

    pumpPromise = pumpWrites()

    return pumpPromise
  }

  function materializePersistRequest(): void {
    if (!persistRequested || disposed) {
      return
    }

    persistRequested = false
    try {
      const query = serializeQueryStates(core.schema, core.state.selected.value)

      if (desiredQuery !== undefined && structuralEq(query, desiredQuery)) {
        return
      }

      const revision = ++requestedRevision
      desiredQuery = cloneQuery(query)

      if (pendingWrite !== undefined) {
        emitDebug(core.debug, 'storage:coalesce', { key: storageOptions.key, from: pendingWrite.revision, to: revision })
        settleRevision(pendingWrite.revision)
      }

      unsettledRevisions.add(revision)
      pendingWrite = {
        revision,
        snapshot: Object.keys(query).length === 0
          ? undefined
          : {
              format: 1,
              ...(storageOptions.version === undefined ? {} : { version: storageOptions.version }),
              savedAt: Date.now(),
              query,
            },
      }

      void ensurePump()
    }
    catch (cause) {
      const revision = ++requestedRevision
      desiredQuery = undefined
      recordError(cause, 'serialize', revision)
    }
  }

  function requestPersist(): void {
    persistRequested = true

    if (persistMicrotaskQueued) {
      return
    }

    persistMicrotaskQueued = true
    queueMicrotask(() => {
      persistMicrotaskQueued = false
      materializePersistRequest()
    })
  }

  async function waitForRevision(revision: number): Promise<void> {
    for (;;) {
      const pending = [...unsettledRevisions].some(item => item <= revision)

      if (disposed || !pending) {
        return
      }

      await new Promise<void>((resolve) => {
        settlementWaiters.add(resolve)
      })
    }
  }

  async function flushWrites(): Promise<void> {
    materializePersistRequest()
    const revision = requestedRevision
    await waitForRevision(revision)
  }

  async function flush(): Promise<void> {
    let revision = requestedRevision

    if (readyResolved && !disposed) {
      materializePersistRequest()
      revision = requestedRevision
    }

    if (!readyResolved) {
      await ready
    }

    if (disposed) {
      return
    }

    await waitForRevision(revision)
  }

  function handleSourceChange(markBeforeLoad = false): void {
    sourceRevision++

    if (!restorationSettled) {
      if (loadStarted || markBeforeLoad) {
        changedDuringRestore = true
      }

      return
    }

    requestPersist()
  }

  function beginMirroring(): void {
    restorationSettled = true

    if (statusState.value === 'restoring') {
      statusState.value = 'ready'
    }
  }

  async function persistCurrentBeforeReady(): Promise<void> {
    // A source change can arrive while the initial save/remove is in flight. Retry
    // until one persisted revision spans a stable source interval, then switch to
    // normal mirroring synchronously so no change can fall between the two phases.
    for (;;) {
      const revision = sourceRevision
      requestPersist()
      await flushWrites()

      if (disposed) {
        return
      }

      if (revision === sourceRevision) {
        beginMirroring()
        return
      }
    }
  }

  async function restoreFromStorage(): Promise<void> {
    if (disposed) {
      return
    }

    loadStarted = true
    emitDebug(core.debug, 'storage:restore-start', { key: storageOptions.key, policy: restore })

    try {
      if (restore === 'never') {
        await persistCurrentBeforeReady()
        emitDebug(core.debug, 'storage:restore', { key: storageOptions.key, outcome: 'mirror-only' })
        return
      }

      let loaded: StoredQuerySnapshot | undefined

      try {
        loaded = await storageOptions.storage.load(storageOptions.key)
      }
      catch (cause) {
        recordError(cause, 'load')
        emitDebug(core.debug, 'storage:restore', { key: storageOptions.key, outcome: 'load-error' })
        return
      }

      if (disposed) {
        return
      }

      if (changedDuringRestore || Object.keys(core.state.selected.value).length > 0) {
        await persistCurrentBeforeReady()
        emitDebug(core.debug, 'storage:restore', { key: storageOptions.key, outcome: 'url-won' })
        return
      }

      if (loaded === undefined) {
        desiredQuery = {}
        emitDebug(core.debug, 'storage:restore', { key: storageOptions.key, outcome: 'empty' })
        return
      }

      const result = validateSnapshot(loaded, storageOptions.version)

      if (result.error !== undefined) {
        recordError(result.error, 'snapshot')
        emitDebug(core.debug, 'storage:restore', { key: storageOptions.key, outcome: 'invalid' })
        return
      }

      const values = parseRawQuerySelection(core.schema, result.snapshot.query)
      core.query.transact({
        mode: 'replace',
        values,
        // Storage mirrors explicit selection, including presence equal to a default.
        defaultPolicy: 'preserve-explicit',
        navigation: { history: 'replace' },
        origin,
      })
      await persistCurrentBeforeReady()
      emitDebug(core.debug, 'storage:restore', { key: storageOptions.key, outcome: 'restored' })
    }
    catch (cause) {
      recordError(cause, 'restore')
      emitDebug(core.debug, 'storage:restore', { key: storageOptions.key, outcome: 'failed' })
    }
    finally {
      if (!disposed) {
        beginMirroring()
      }

      settleReady()
    }
  }

  const status = computed(() => statusState.value)
  const controls: StorageControls = { status, error, ready, flush }

  // Describe this storage instance for a devtools snapshot. Registered before the SSR
  // branch so it exists on both the server and the client, and removed on scope dispose
  // so it does not accumulate on the long-lived per-adapter channel.
  const stopSnapshot = registerSnapshotSource(core.debug, 'storage', () => ({
    key: storageOptions.key,
    status: statusState.value,
    revision: requestedRevision,
  }))
  onScopeDispose(stopSnapshot)

  if (typeof window === 'undefined') {
    beginMirroring()
    settleReady()
    emitDebug(core.debug, 'storage:restore', { key: storageOptions.key, outcome: 'server-skip' })
    return { storage: controls }
  }

  const stopTransactions = core.query.transactions.observe({
    start: (transaction) => {
      if (transaction.origin === origin) {
        return
      }

      if (!restorationSettled) {
        sourceRevision++
        changedDuringRestore = true
      }
      else if (statusState.value === 'error') {
        desiredQuery = undefined
        requestPersist()
      }
    },
  })

  const stopSelected = watch(
    core.state.selected,
    () => handleSourceChange(),
    { deep: true, flush: 'sync' },
  )
  const managedPaths = getManagedKeys(core.schema)
  const stopQuery = watch(
    () => managedPaths.map(path => getPath(core.query.current(), path)),
    () => handleSourceChange(true),
    { deep: true, flush: 'sync' },
  )

  onScopeDispose(() => {
    if (!restorationSettled) {
      emitDebug(core.debug, 'storage:restore', { key: storageOptions.key, outcome: 'disposed' })
    }

    disposed = true
    pendingWrite = undefined
    persistRequested = false
    unsettledRevisions.clear()
    notifySettlement()
    stopTransactions()
    stopSelected()
    stopQuery()

    if (statusState.value === 'restoring') {
      statusState.value = 'ready'
    }

    settleReady()
  })

  if (getCurrentInstance() === null) {
    queueMicrotask(() => {
      void restoreFromStorage()
    })
  }
  else {
    onMounted(() => {
      void restoreFromStorage()
    })
  }

  return { storage: controls }
}

function assertStorageOptions(options: unknown): asserts options is StorageOptions {
  if (options === undefined || typeof options !== 'object' || options === null) {
    throw new TypeError('[vuqs] withStorage: options are required')
  }

  const candidate = options as Partial<StorageOptions>

  if (typeof candidate.key !== 'string' || candidate.key.trim().length === 0) {
    throw new TypeError('[vuqs] withStorage: `key` must be a non-empty string')
  }

  if (candidate.restore !== undefined && candidate.restore !== 'if-empty' && candidate.restore !== 'never') {
    throw new TypeError('[vuqs] withStorage: `restore` must be "if-empty" or "never"')
  }

  if (candidate.version !== undefined && typeof candidate.version !== 'string') {
    throw new TypeError('[vuqs] withStorage: `version` must be a string')
  }

  const storage = candidate.storage as Partial<QueryStorage> | null | undefined

  if (
    storage === undefined
    || storage === null
    || typeof storage !== 'object'
    || typeof storage.load !== 'function'
    || typeof storage.save !== 'function'
    || typeof storage.remove !== 'function'
  ) {
    throw new TypeError('[vuqs] withStorage: `storage` must implement load(), save(), and remove()')
  }
}

function validateSnapshot(value: unknown, version: string | undefined): SnapshotResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { error: new Error('[vuqs] withStorage: stored snapshot is invalid') }
  }

  const snapshot = value as Partial<StoredQuerySnapshot>

  if (
    snapshot.format !== 1
    || typeof snapshot.savedAt !== 'number'
    || !Number.isFinite(snapshot.savedAt)
    || typeof snapshot.query !== 'object'
    || snapshot.query === null
    || Array.isArray(snapshot.query)
    || (snapshot.version !== undefined && typeof snapshot.version !== 'string')
  ) {
    return { error: new Error('[vuqs] withStorage: stored snapshot is invalid') }
  }

  if (version !== undefined && snapshot.version !== version) {
    return { error: new Error('[vuqs] withStorage: stored snapshot version is incompatible') }
  }

  return { snapshot: snapshot as StoredQuerySnapshot }
}
