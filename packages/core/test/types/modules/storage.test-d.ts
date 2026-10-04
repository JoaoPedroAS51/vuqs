import type { ParsedQueryRaw } from '../../../src/core/query/types'
import type { StoredQuerySnapshot } from '../../../src/modules/storage/snapshot'
import type { QueryStorage, StorageStatus } from '../../../src/modules/storage/storage'
import { describe, expectTypeOf, it } from 'vitest'
import { useQueryState } from '../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { withStorage } from '../../../src/modules/storage/storage'
import { createWebStorage } from '../../../src/modules/storage/web-storage'

const schema = {
  q: queryParam('q', codecs.string),
  category: queryParam('category', codecs.literal(['cpu', 'gpu'] as const)),
}

describe('withStorage inference', () => {
  it('types storage options and controls on both facades', () => {
    const storage: QueryStorage = {
      load: async (): Promise<StoredQuerySnapshot | undefined> => undefined,
      save: async (_key, snapshot): Promise<void> => {
        expectTypeOf(snapshot.query).toEqualTypeOf<ParsedQueryRaw>()
      },
      remove: () => undefined,
    }
    const grouped = useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage,
      restore: 'if-empty',
      version: 'v2',
    }))
    const single = useQueryState('q').use(withStorage({ key: 'q', storage }))

    expectTypeOf(grouped.storage.status.value).toEqualTypeOf<StorageStatus>()
    expectTypeOf(grouped.storage.error.value).toEqualTypeOf<unknown>()
    expectTypeOf(grouped.storage.ready).toEqualTypeOf<Promise<void>>()
    expectTypeOf(grouped.storage.flush()).toEqualTypeOf<Promise<void>>()
    expectTypeOf(single.storage.status.value).toEqualTypeOf<StorageStatus>()
    expectTypeOf(createWebStorage(() => window.localStorage)).toEqualTypeOf<QueryStorage>()

    // @ts-expect-error key is required
    useQueryStates(schema).use(withStorage({ storage }))
    // @ts-expect-error storage must implement the complete async-first contract
    useQueryStates(schema).use(withStorage({ key: 'filters', storage: { load: () => undefined } }))
    // @ts-expect-error restore is a closed policy union
    useQueryStates(schema).use(withStorage({ key: 'filters', storage, restore: 'always' }))
  })
})
