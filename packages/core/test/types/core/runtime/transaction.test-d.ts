import type { QueryCore } from '../../../../src/core/module-system/query-core'
import { describe, expectTypeOf, it } from 'vitest'
import { useQueryStates } from '../../../../src/core/bindings/use-query-states'
import { codecs } from '../../../../src/core/codecs/catalog'
import { queryParam } from '../../../../src/core/schema/params/query-param'

const schema = {
  q: queryParam('q', codecs.string),
  category: queryParam('category', codecs.literal(['cpu', 'gpu'] as const)),
}

describe('query transaction types', () => {
  it('types atomic transactions and schema-projected starts', () => {
    const withTransactions = (core: QueryCore<typeof schema>): { stop: () => void } => {
      const stop = core.query.transactions.observe({
        start: (transaction) => {
          expectTypeOf(transaction.keys).toEqualTypeOf<readonly ('q' | 'category')[]>()
          expectTypeOf(transaction.paths).toEqualTypeOf<readonly string[]>()
          expectTypeOf(transaction.origin).toEqualTypeOf<symbol | undefined>()
        },
      })

      core.query.transact({ mode: 'patch', values: { q: 'sale', category: undefined } })
      core.query.transact({ mode: 'replace', values: { category: 'cpu' } })
      core.query.transact({
        mode: 'replace',
        values: { q: 'sale' },
        defaultPolicy: 'preserve-explicit',
      })

      type Transaction = Parameters<typeof core.query.transact>[0]
      expectTypeOf<{ mode: 'patch', values: { category: 'memory' } }>().not.toExtend<Transaction>()
      expectTypeOf<'preserve'>().not.toExtend<NonNullable<Transaction['defaultPolicy']>>()

      return { stop }
    }

    const query = useQueryStates(schema).use(withTransactions)
    expectTypeOf(query.stop).toEqualTypeOf<() => void>()
  })
})
