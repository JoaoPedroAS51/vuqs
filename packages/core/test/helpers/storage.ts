import type { QueryStorage, StoredQuerySnapshot } from '../../src/modules/storage'
import { vi } from 'vitest'

export interface MemoryStorage {
  storage: QueryStorage
  load: ReturnType<typeof vi.fn<QueryStorage['load']>>
  save: ReturnType<typeof vi.fn<QueryStorage['save']>>
  remove: ReturnType<typeof vi.fn<QueryStorage['remove']>>
  current: () => unknown
}

export function snapshot(
  query: StoredQuerySnapshot['query'],
  version?: string,
): StoredQuerySnapshot {
  return {
    format: 1,
    ...(version === undefined ? {} : { version }),
    savedAt: 1,
    query,
  }
}

export function createMemoryStorage(initial?: unknown): MemoryStorage {
  let current = initial
  const load = vi.fn<QueryStorage['load']>(() => current as StoredQuerySnapshot | undefined)
  const save = vi.fn<QueryStorage['save']>((_key, next) => {
    current = next
  })
  const remove = vi.fn<QueryStorage['remove']>(() => {
    current = undefined
  })

  return { storage: { load, save, remove }, load, save, remove, current: () => current }
}
