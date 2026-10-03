import type { StoredQuerySnapshot } from './snapshot'
import type { QueryStorage } from './storage'

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
