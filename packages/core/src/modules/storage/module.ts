import type { QueryCore } from '../../core/module-system/query-core'
import type { ModuleOptions } from '../../core/module-system/registry'
import type { QueryStateSchema } from '../../core/schema/schema'
// Anchor the registry augmentation to the core entry
import type {} from '../../index'
import type { QueryStorage, StorageApi, StorageControls, StorageOptions, StorageStatus } from './contract'
import type { StoredQuerySnapshot } from './snapshot'
import { computed, getCurrentInstance, onMounted, onScopeDispose, shallowRef, watch } from 'vue'
import { emitDebug, emitWarn } from '../../core/diagnostics/bus'
import { registerSnapshotSource } from '../../core/diagnostics/snapshot'
import { defineQueryModule } from '../../core/module-system/define-query-module'
import { getPath } from '../../core/query/path'
import { parseQueryStates, serializeQueryStates } from '../../core/schema/operations'
import { getManagedKeys } from '../../core/schema/schema'
import { validateSnapshot } from './snapshot'
import { createStorageWriter } from './writer'

declare module '@vuqs/core' {
  // eslint-disable-next-line unused-imports/no-unused-vars -- the params must match the base registry signature
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TOptions, TInference = unknown> {
    'vuqs:storage': {
      states: (options: ModuleOptions<TOptions, StorageOptions>) => typeof withStorage.definition.states<TSchema>
      state: (options: ModuleOptions<TOptions, StorageOptions>) => typeof withStorage.definition.state<TSchema>
    }
  }
}

/**
 * Mirrors explicit query state into sync or async storage.
 *
 * @param options - Storage key, implementation, restore policy, and optional version.
 * @returns A dual module that contributes {@link StorageApi}.
 *
 * @see https://vuqs.dev/modules/storage
 */
export const withStorage = /* @__PURE__ */ defineQueryModule({
  name: 'vuqs:storage',
  states: <TSchema extends QueryStateSchema>(
    core: QueryCore<TSchema>,
    options: StorageOptions,
  ): { api: StorageApi } => ({ api: createStorageApi(core, options) }),
  state: <TSchema extends QueryStateSchema>(
    core: QueryCore<TSchema>,
    _key: keyof TSchema & string,
    options: StorageOptions,
  ): { api: StorageApi } => ({ api: createStorageApi(core, options) }),
})

type StorageFailureOperation = 'load' | 'snapshot' | 'restore' | 'serialize' | 'save' | 'remove'

type StoragePhase = 'pending' | 'initializing' | 'mirroring' | 'disposed'

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

  let phase: StoragePhase = 'pending'
  let readyResolved = false
  let changedDuringRestore = false
  let sourceRevision = 0
  let outcomeRevision = -1

  const isDisposed = (): boolean => phase === 'disposed'

  const isBeforeMirroring = (): boolean => phase === 'pending' || phase === 'initializing'

  const recordError = (cause: unknown, operation: StorageFailureOperation, revision = 0): void => {
    if (isDisposed()) {
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

  const recordSuccess = (revision: number): void => {
    if (isDisposed() || revision < outcomeRevision) {
      return
    }

    outcomeRevision = revision
    error.value = undefined

    if (phase === 'mirroring') {
      statusState.value = 'ready'
    }
  }

  const settleReady = (): void => {
    if (readyResolved) {
      return
    }

    readyResolved = true
    resolveReady()
  }

  const writer = createStorageWriter({
    target: storageOptions,
    debug: core.debug,
    serialize: () => serializeQueryStates(core.schema, core.state.explicitValues.value),
    onSuccess: recordSuccess,
    onError: recordError,
  })

  const flush = async (): Promise<void> => {
    if (readyResolved && !isDisposed()) {
      const waiting = writer.flush()

      if (isDisposed()) {
        return
      }

      await waiting
      return
    }

    const revision = writer.revision

    if (!readyResolved) {
      await ready
    }

    if (isDisposed()) {
      return
    }

    await writer.waitFor(revision)
  }

  const handleSourceChange = (markBeforeLoad = false): void => {
    sourceRevision++

    if (isBeforeMirroring()) {
      if (phase === 'initializing' || markBeforeLoad) {
        changedDuringRestore = true
      }

      return
    }

    writer.request()
  }

  const beginMirroring = (): void => {
    phase = 'mirroring'

    if (statusState.value === 'restoring') {
      statusState.value = 'ready'
    }
  }

  const persistCurrentBeforeReady = async (): Promise<void> => {
    // A source change can arrive while the initial save/remove is in flight. Retry
    // until one persisted revision spans a stable source interval, then switch to
    // normal mirroring synchronously so no change can fall between the two phases.
    for (;;) {
      const revision = sourceRevision
      writer.request()
      await writer.flush()

      if (isDisposed()) {
        return
      }

      if (revision === sourceRevision) {
        beginMirroring()
        return
      }
    }
  }

  const restoreFromStorage = async (): Promise<void> => {
    if (isDisposed()) {
      return
    }

    phase = 'initializing'
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

      if (isDisposed()) {
        return
      }

      if (changedDuringRestore || Object.keys(core.state.explicitValues.value).length > 0) {
        await persistCurrentBeforeReady()
        emitDebug(core.debug, 'storage:restore', { key: storageOptions.key, outcome: 'url-won' })
        return
      }

      if (loaded === undefined) {
        writer.markPersisted({})
        emitDebug(core.debug, 'storage:restore', { key: storageOptions.key, outcome: 'empty' })
        return
      }

      const result = validateSnapshot(loaded, storageOptions.version)

      if (result.error !== undefined) {
        recordError(result.error, 'snapshot')
        emitDebug(core.debug, 'storage:restore', { key: storageOptions.key, outcome: 'invalid' })
        return
      }

      const values = parseQueryStates(core.schema, result.snapshot.query)
      core.query.transact({
        mode: 'replace',
        values,
        // Storage mirrors explicit state, including presence equal to a default.
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
      if (!isDisposed()) {
        beginMirroring()
      }

      settleReady()
    }
  }

  const status = computed(() => statusState.value)
  const controls: StorageControls = { status, error, ready, flush }

  // SSR instances also need snapshots.
  // Scope cleanup prevents retaining disposed instances on the adapter channel.
  const stopSnapshot = registerSnapshotSource(core.debug, 'storage', () => ({
    key: storageOptions.key,
    status: statusState.value,
    revision: writer.revision,
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

      if (isBeforeMirroring()) {
        sourceRevision++
        changedDuringRestore = true
      }
      else if (statusState.value === 'error') {
        writer.invalidate()
        writer.request()
      }
    },
  })

  const stopExplicitValues = watch(
    core.state.explicitValues,
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
    if (isBeforeMirroring()) {
      emitDebug(core.debug, 'storage:restore', { key: storageOptions.key, outcome: 'disposed' })
    }

    phase = 'disposed'
    writer.dispose()
    stopTransactions()
    stopExplicitValues()
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
