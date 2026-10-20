import type { DebugChannelHandle } from '../../core/diagnostics/bus'
import type { ParsedQueryRaw } from '../../core/query/types'
import type { StorageOptions } from './contract'
import type { StoredQuerySnapshot } from './snapshot'
import { emitDebug } from '../../core/diagnostics/bus'
import { cloneQuery } from '../../core/query/object'
import { structuralEq } from '../../shared/utils/object'

/** @internal */
export type StorageWriteOperation = 'serialize' | 'save' | 'remove'

/** @internal */
export interface StorageWriterOptions {
  /** Backend, key and version, read each time a request is materialized or written. */
  target: StorageOptions
  debug: DebugChannelHandle
  /** Reads the query to persist when a request is materialized. */
  serialize: () => ParsedQueryRaw
  /** Called when the write of `revision` succeeds. */
  onSuccess: (revision: number) => void
  /** Called when serialization or the write of `revision` fails. */
  onError: (cause: unknown, operation: StorageWriteOperation, revision: number) => void
}

/**
 * Revisioned persistence behind `withStorage`.
 *
 * Requests are materialized in a microtask, deduplicated against the last requested
 * or known stored query, coalesced while a write is in flight, and written one at a time.
 *
 * @internal
 */
export interface StorageWriter {
  /** Latest revision allocated by a materialized request or a serialization failure. */
  readonly revision: number
  /** Schedules the current query to be persisted. */
  request: () => void
  /** Materializes a scheduled request, then settles once every write up to the resulting revision has settled. */
  flush: () => Promise<void>
  /** Settles once every write up to `revision` has settled, or immediately after disposal. */
  waitFor: (revision: number) => Promise<void>
  /** Records `query` as the known stored state so an identical request is skipped. */
  markPersisted: (query: ParsedQueryRaw) => void
  /** Forgets the known stored state so the next request writes. */
  invalidate: () => void
  /** Discards pending work and releases waiters. A write already in flight is not cancelled. */
  dispose: () => void
}

interface PendingStorageWrite {
  revision: number
  snapshot?: StoredQuerySnapshot
}

/**
 * Creates the persistence writer for one `withStorage` instance.
 *
 * @param options - Storage target and the serialization and outcome callbacks.
 * @returns A {@link StorageWriter} that stops accepting work after `dispose()`.
 *
 * @internal
 */
export function createStorageWriter(options: StorageWriterOptions): StorageWriter {
  const { target, debug, serialize, onSuccess, onError } = options

  let closed = false
  let persistRequested = false
  let persistMicrotaskQueued = false
  let requestedRevision = 0
  let desiredQuery: ParsedQueryRaw | undefined
  let pendingWrite: PendingStorageWrite | undefined
  let pumpPromise: Promise<void> | undefined
  const unsettledRevisions = new Set<number>()
  const settlementWaiters = new Set<() => void>()

  const request = (): void => {
    persistRequested = true

    if (persistMicrotaskQueued) {
      return
    }

    persistMicrotaskQueued = true
    queueMicrotask(() => {
      persistMicrotaskQueued = false
      materialize()
    })
  }

  const waitFor = async (revision: number): Promise<void> => {
    for (;;) {
      const pending = [...unsettledRevisions].some(item => item <= revision)

      if (closed || !pending) {
        return
      }

      await new Promise<void>((resolve) => {
        settlementWaiters.add(resolve)
      })
    }
  }

  const flush = (): Promise<void> => {
    materialize()

    return waitFor(requestedRevision)
  }

  const markPersisted = (query: ParsedQueryRaw): void => {
    desiredQuery = query
  }

  const invalidate = (): void => {
    desiredQuery = undefined
  }

  const dispose = (): void => {
    closed = true
    pendingWrite = undefined
    persistRequested = false
    unsettledRevisions.clear()
    notifySettlement()
  }

  return {
    get revision() {
      return requestedRevision
    },
    request,
    flush,
    waitFor,
    markPersisted,
    invalidate,
    dispose,
  }

  function materialize(): void {
    if (!persistRequested || closed) {
      return
    }

    persistRequested = false
    try {
      const query = serialize()

      if (desiredQuery !== undefined && structuralEq(query, desiredQuery)) {
        return
      }

      const revision = ++requestedRevision
      desiredQuery = cloneQuery(query)

      if (pendingWrite !== undefined) {
        emitDebug(debug, 'storage:coalesce', { key: target.key, from: pendingWrite.revision, to: revision })
        settleRevision(pendingWrite.revision)
      }

      unsettledRevisions.add(revision)
      pendingWrite = {
        revision,
        snapshot: Object.keys(query).length === 0
          ? undefined
          : {
              format: 1,
              ...(target.version === undefined ? {} : { version: target.version }),
              savedAt: Date.now(),
              query,
            },
      }

      void ensurePump()
    }
    catch (cause) {
      const revision = ++requestedRevision
      desiredQuery = undefined
      onError(cause, 'serialize', revision)
    }
  }

  function ensurePump(): Promise<void> {
    if (pumpPromise !== undefined) {
      return pumpPromise
    }

    pumpPromise = pumpWrites()

    return pumpPromise
  }

  async function pumpWrites(): Promise<void> {
    try {
      while (pendingWrite !== undefined) {
        const write = pendingWrite
        pendingWrite = undefined
        const operation = write.snapshot === undefined ? 'remove' : 'save'

        emitDebug(debug, 'storage:write', {
          key: target.key,
          revision: write.revision,
          operation,
          query: write.snapshot?.query ?? {},
        })

        try {
          if (write.snapshot === undefined) {
            await target.storage.remove(target.key)
          }
          else {
            await target.storage.save(target.key, write.snapshot)
          }

          onSuccess(write.revision)
        }
        catch (cause) {
          onError(cause, operation, write.revision)
        }

        settleRevision(write.revision)
      }
    }
    finally {
      pumpPromise = undefined
    }
  }

  function settleRevision(revision: number): void {
    if (unsettledRevisions.delete(revision)) {
      notifySettlement()
    }
  }

  function notifySettlement(): void {
    for (const resolve of settlementWaiters) {
      resolve()
    }

    settlementWaiters.clear()
  }
}
